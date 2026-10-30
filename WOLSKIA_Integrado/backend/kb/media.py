"""Referencias privadas a medios. No sirve, copia ni sube archivos binarios."""
import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import PurePosixPath
from .documents import optional, fragments, DependencyMissing
from .store import redact

IMAGES = {'.jpg','.jpeg','.png','.webp','.bmp','.tif','.tiff','.gif','.ico'}
VIDEOS = {'.mp4','.mov','.avi','.mkv','.webm','.m4v','.wmv','.mpeg','.mpg'}
EXTENSIONS = IMAGES | VIDEOS

def source_id(value):
    cleaned = redact(value)
    # La redacción de números en nombres no debe fusionar fuentes diferentes.
    return cleaned if cleaned == value else cleaned+'#id-'+hashlib.sha256(value.encode()).hexdigest()[:16]

def date_label(value, zone):
    months = ('enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre')
    return f'{value.day} de {months[value.month-1]} de {value.year}, {value.hour}h {value.minute}min {value.second}s ({zone})'

def reference(source, size, modified, archived=False):
    path = PurePosixPath(source)
    kind = 'imagen' if path.suffix.lower() in IMAGES else 'video'
    location = 'dentro del ZIP' if archived else 'en la carpeta local'
    text = (f'Referencia de {kind}. Archivo: {path.name}. Carpeta: {path.parent}. '
            f'Extensión: {path.suffix.lower()}. Tamaño: {size:,} bytes. Fecha: {modified}. '
            f'Ver {kind} {path.name} {location} {path.parent}. '
            'Solo metadatos: el contenido visual o audiovisual no fue analizado.')
    return dict(source_file=source,source_type='referencia_'+kind,etapa=str(path.parent),
                text=text,path_relativo=source,sensible=0,sin_asociar=0)

def image_text(path):
    image_module = optional('PIL.Image')
    tess = optional('pytesseract')
    if image_module is None or tess is None:
        raise DependencyMissing('OCR de fotos requiere Pillow, pytesseract y Tesseract con spa.')
    with image_module.open(path) as image:
        if image.width * image.height > 16000000:
            raise ValueError('La imagen supera 16 millones de píxeles.')
        return tess.image_to_string(image,lang='spa',timeout=120)

def video_text(path):
    whisper = optional('faster_whisper')
    if whisper is None:
        raise DependencyMissing('Transcripción requiere faster-whisper y el modelo tiny local.')
    # Nunca descarga pesos desde la ingesta: el usuario prepara el modelo aparte.
    model = whisper.WhisperModel('tiny',device='cpu',compute_type='int8',local_files_only=True)
    segments, _ = model.transcribe(str(path),language='es',vad_filter=False)
    for segment in segments:
        yield segment.start, segment.end, segment.text

def save_reference(store, source, fingerprint, options, chunk, extras=None, verify=None, log=print):
    prior = store.db.execute('SELECT * FROM ingestion_files WHERE source=?',(source,)).fetchone()
    if prior and prior['digest']==fingerprint and prior['options']==options and prior['status']=='completo':
        return 'reanudados',0
    issues = []
    with store.db:
        store.clear_source(source)
        store.db.execute('DELETE FROM ingestion_issues WHERE source=?',(source,))
        count = store.add_chunks([chunk])
        if extras:
            # Si falla un extra, preservá siempre la referencia básica; reintentá después.
            store.db.execute('SAVEPOINT media_extra')
            try:
                count += store.add_chunks(extras())
                store.db.execute('RELEASE media_extra')
            except Exception as exc:
                store.db.execute('ROLLBACK TO media_extra')
                store.db.execute('RELEASE media_extra')
                count = 1
                detail = str(exc) if isinstance(exc,DependencyMissing) else type(exc).__name__
                issues.append(('extra_pendiente',detail))
        if verify and not verify(): raise ValueError('El medio cambió durante la lectura; reintentá.')
        status = 'parcial' if issues else 'completo'
        store.db.execute('INSERT OR REPLACE INTO ingestion_files(source,digest,options,status,canonical,chunks) VALUES (?,?,?,?,?,?)',
                         (source,fingerprint,options,status,source,count))
        store.db.executemany('INSERT INTO ingestion_issues(source,page,kind,detail) VALUES (?,NULL,?,?)',[(source,*i) for i in issues])
    for kind,detail in issues: log(f'  {kind}: {detail}')
    return 'indexados',count

def ingest_media_file(path, source, store, ocr_images=False, transcribe=False, log=print):
    image = path.suffix.lower() in IMAGES
    enabled = ocr_images if image else transcribe
    def signature():
        stat = path.stat()
        # No abre ni decodifica el binario para una referencia básica.
        return f'{stat.st_size}:{stat.st_mtime_ns}'
    stat = path.stat()
    fingerprint = signature()
    if enabled:
        from .folder import digest
        fingerprint = digest(path)
    options = json.dumps({'media_version':1,'extra':bool(enabled),'type':'imagen' if image else 'video'},sort_keys=True)
    modified = date_label(datetime.fromtimestamp(stat.st_mtime,timezone.utc), 'UTC')
    chunk = reference(source,stat.st_size,modified)
    def extras():
        if image:
            text = image_text(path)
            yield from fragments('Texto OCR (no validado): '+text,source,'ocr_imagen',str(PurePosixPath(source).parent))
        else:
            for start,end,text in video_text(path):
                yield from fragments(f'Transcripción automática (no validada), segundos {start:.1f}–{end:.1f}: '+text,
                                     source,'transcripcion_video',str(PurePosixPath(source).parent))
    def verify():
        if enabled:
            from .folder import digest
            return digest(path)==fingerprint
        return signature()==fingerprint
    return save_reference(store,source,fingerprint,options,chunk,extras if enabled else None,verify,log)

def ingest_media_zip(path, store, log=print):
    from .folder import prepare
    prepare(store)
    stats = dict(indexados=0,reanudados=0,omitidos=0,fragmentos=0)
    options = json.dumps({'media_version':1,'archive':True},sort_keys=True)
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            member = PurePosixPath(info.filename)
            if info.is_dir() or member.suffix.lower() not in EXTENSIONS: continue
            if member.is_absolute() or '..' in member.parts or '\\' in info.filename:
                stats['omitidos'] += 1
                log('OMITIDO: ruta interna del ZIP no válida.')
                continue
            source = source_id(path.name+'/'+info.filename)
            # CRC y tamaño vienen del directorio central; no se lee el contenido.
            fingerprint = f'{info.CRC}:{info.file_size}:{info.date_time}'
            modified = date_label(datetime(*info.date_time), 'hora ZIP, zona no indicada')
            kind,count = save_reference(store,source,fingerprint,options,reference(source,info.file_size,modified,True))
            stats[kind] += 1; stats['fragmentos'] += count
            log(f'{kind}: {source}')
    return stats
