"""Recorrido offline reanudable. No copia ni sube los archivos originales."""
import hashlib
import json
import os
from .store import redact
from .media import EXTENSIONS, ingest_media_file, source_id
from .documents import pdf_chunks, docx_chunks, DependencyMissing

VERSION = 1

def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            value.update(block)
    return value.hexdigest()

def prepare(store):
    store.db.executescript("""
    CREATE TABLE IF NOT EXISTS ingestion_files (
      source TEXT PRIMARY KEY, digest TEXT, options TEXT, status TEXT,
      canonical TEXT, chunks INTEGER, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS ingestion_issues (
      source TEXT, page INTEGER, kind TEXT, detail TEXT);
    """)

def ingest_folder(root, store, ocr=False, log=print, ocr_images=False, transcribe=False):
    root = root.resolve()
    if not root.is_dir(): raise ValueError('La carpeta de origen no existe.')
    prepare(store)
    options = json.dumps({'version':VERSION,'ocr':bool(ocr)},sort_keys=True)
    stats = dict(indexados=0,reanudados=0,duplicados=0,omitidos=0,fragmentos=0)
    def walk_error(error):
        stats['omitidos'] += 1
        log('OMITIDO: no se pudo leer una carpeta ('+type(error).__name__+').')
    for directory, dirs, files in os.walk(root,followlinks=False,onerror=walk_error):
        dirs[:] = sorted(d for d in dirs if not (type(root)(directory)/d).is_symlink())
        for name in sorted(files):
            path = type(root)(directory)/name
            if path.is_symlink(): continue
            relative = path.relative_to(root).as_posix()
            source = source_id(root.name+'/'+relative)
            if path.suffix.lower() in EXTENSIONS:
                try:
                    kind,count = ingest_media_file(path,source,store,ocr_images,transcribe,log)
                    stats[kind] += 1; stats['fragmentos'] += count
                    log(f'{kind}: {relative} ({count} fragmentos).')
                except Exception as exc:
                    stats['omitidos'] += 1
                    log(f'OMITIDO: {relative} ({type(exc).__name__}).')
                continue
            if path.suffix.lower() not in ('.pdf','.docx'):
                stats['omitidos'] += 1
                log('OMITIDO: '+relative+' (tipo pendiente de otra fase).')
                continue
            log('Procesando: '+relative)
            issues = []
            try:
                checksum = digest(path)
                prior = store.db.execute('SELECT * FROM ingestion_files WHERE source=?',(source,)).fetchone()
                if prior and prior['digest']==checksum and prior['options']==options and prior['status'] in ('completo', 'requiere_ocr') and not (ocr and prior['status']=='requiere_ocr'):
                    stats['reanudados'] += 1
                    log('  Ya indexado; se conserva sin reprocesar.')
                    continue
                duplicate = store.db.execute("SELECT source FROM ingestion_files WHERE digest=? AND options=? AND status IN ('completo','requiere_ocr') AND source!=? LIMIT 1",(checksum,options,source)).fetchone()
                canonical = duplicate['source'] if duplicate else source
                count = 0
                with store.db:
                    # Si cambia una fuente antes canónica, invalidá sus alias para reintentar.
                    store.db.execute("UPDATE ingestion_files SET status='pendiente' WHERE canonical=? AND source!=?",(source,source))
                    store.clear_source(source)
                    store.db.execute('DELETE FROM ingestion_issues WHERE source=?',(source,))
                    if not duplicate:
                        chunks = pdf_chunks(path,source,issues,ocr) if path.suffix.lower()=='.pdf' else docx_chunks(path,source,issues)
                        count = store.add_chunks(chunks)
                        if digest(path)!=checksum: raise ValueError('El archivo cambió durante la lectura; reintentá.')
                    status = 'duplicado' if duplicate else ('parcial' if any(i[1]=='error_pagina' for i in issues) else 'requiere_ocr' if issues else 'completo')
                    store.db.execute('INSERT OR REPLACE INTO ingestion_files(source,digest,options,status,canonical,chunks) VALUES (?,?,?,?,?,?)',(source,checksum,options,status,canonical,count))
                    store.db.executemany('INSERT INTO ingestion_issues(source,page,kind,detail) VALUES (?,?,?,?)',[(source,*i) for i in issues])
                stats['duplicados' if duplicate else 'indexados'] += 1
                stats['fragmentos'] += count
                log(f'  {status}: {count} fragmentos.')
                for page,kind,detail in issues: log(f'  Página {page}: {kind} — {detail}')
            except Exception as exc:
                # La transacción revierte el archivo actual; los anteriores quedan listos.
                stats['omitidos'] += 1
                detail = str(exc) if isinstance(exc,DependencyMissing) else type(exc).__name__
                with store.db:
                    store.db.execute("DELETE FROM ingestion_issues WHERE source=? AND kind='error_archivo'",(source,))
                    store.db.execute('INSERT INTO ingestion_issues(source,page,kind,detail) VALUES (?,NULL,?,?)',(source,'error_archivo',detail))
                log('  OMITIDO: '+detail)
    return stats
