"""Almacenamiento privado y búsqueda de texto, sin proveedores de IA."""
import re
import sqlite3
import unicodedata
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parents[1] / 'data' / 'kb.sqlite'
STOPWORDS = set('el la los las un una de del en y o que como cuando para por al se es con hace segun'.split())
CONTACT = re.compile(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|(?<!\w)\+?\d[\d ()./-]{6,}\d(?!\w)')

def redact(text):
    return CONTACT.sub('[contacto reservado]', str(text))

def terms(query):
    plain = ''.join(c for c in unicodedata.normalize('NFD', query.lower()) if not unicodedata.combining(c))
    return [t for t in re.findall(r'[^\W_]+', plain) if t not in STOPWORDS][:24]

class Store:
    def __init__(self, path=DEFAULT_DB, readonly=False):
        self.path = Path(path)
        if not readonly: self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path.resolve().as_uri() + "?mode=ro", uri=True) if readonly else sqlite3.connect(self.path)
        self.db.row_factory = sqlite3.Row
        if readonly: return
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS chunks (
          id INTEGER PRIMARY KEY, source_file TEXT NOT NULL, source_type TEXT,
          etapa TEXT, hoja TEXT, paso INTEGER, page INTEGER, responsable TEXT,
          text TEXT NOT NULL, path_relativo TEXT, sensible INTEGER DEFAULT 0,
          sin_asociar INTEGER DEFAULT 0);
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
          text, etapa, responsable, tokenize='unicode61 remove_diacritics 2');
        """)
    def close(self):
        self.db.close()
    def clear_source(self, source):
        self.db.execute('DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE source_file=?)', (source,))
        self.db.execute('DELETE FROM chunks WHERE source_file=?', (source,))
    def add_chunks(self, chunks):
        count = 0
        for item in chunks:
            c = dict(item)
            # Segunda barrera: ni el texto ni los metadatos guardan contactos.
            c['sensible'] = int(bool(c.get('sensible') or any(CONTACT.search(str(v)) for v in c.values())))
            for key, value in list(c.items()):
                if isinstance(value, str): c[key] = redact(value)
            keys = ['source_file','source_type','etapa','hoja','paso','page','responsable','text','path_relativo','sensible','sin_asociar']
            cur = self.db.execute('INSERT INTO chunks (' + ','.join(keys) + ') VALUES (' + ','.join('?' for _ in keys) + ')', [c.get(k) for k in keys])
            self.db.execute('INSERT INTO chunks_fts(rowid,text,etapa,responsable) VALUES (?,?,?,?)', (cur.lastrowid,c['text'],c.get('etapa',''),c.get('responsable','')))
            count += 1
        return count
    def replace_source(self, source, chunks):
        with self.db:
            self.clear_source(source)
            return self.add_chunks(chunks)
    def search(self, query, k=6, filters=None):
        tokens = terms(query)
        if not tokens: return []
        match = ' OR '.join('"' + t + '"' for t in tokens)
        clauses = ['chunks_fts MATCH ?']; args = [match]
        for key, value in (filters or {}).items():
            if key not in ('etapa','hoja','paso','page','source_file'): raise ValueError('Filtro no válido.')
            clauses.append('c.' + key + '=?'); args.append(value)
        args.append(max(1,min(int(k),8)))
        sql = """SELECT c.source_file AS source,c.etapa,c.paso,c.responsable,c.page,c.path_relativo,
          snippet(chunks_fts,0,'','', ' … ',64) AS snippet, bm25(chunks_fts) AS score
          FROM chunks_fts JOIN chunks c ON c.id=chunks_fts.rowid WHERE """ + ' AND '.join(clauses) + ' ORDER BY score,c.paso LIMIT ?'
        return [dict(r) for r in self.db.execute(sql,args)]
