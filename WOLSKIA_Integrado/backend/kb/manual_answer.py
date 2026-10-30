"""Respuestas extractivas: todos los procedimientos mostrados salen del libro."""
import re
import unicodedata
from .store import Store, DEFAULT_DB, terms

FILLER = set('manual instructivo libro segun que hacer hago debo cuando hay tiene tienen tengo falta faltan realizar trabajo reparacion cliente realizar servicio pasos paso procedimiento explica explicame como porque por favor caso dice sobre'.split())

def retrieve(store, query):
    normalized = ''.join(c for c in unicodedata.normalize('NFD',query.lower()) if not unicodedata.combining(c))
    stages = [name for name in ('AGENDAMIENTO','RECEPCION','EJECUCION','ENTREGA') if name.lower() in normalized]
    requested = re.findall(r'paso\s*(?:numero\s*)?(\d+)(?:\s*(?:al|a|hasta|-)\s*(\d+))?',normalized)
    all_steps = bool(re.search(r'todos? (?:los )?pasos|instructivo completo|libro completo|paso a paso',normalized))
    stage_only = bool(stages) and not requested and (all_steps or normalized.strip(' ¿?.!') in [x.lower() for x in stages])
    if requested or all_steps or stage_only:
        clauses = ["source_type='xlsm'", 'paso IS NOT NULL']; args=[]
        if stages:
            clauses.append('etapa IN ('+','.join('?' for _ in stages)+')'); args.extend(stages)
        if requested:
            first,last = requested[-1]
            clauses.append('paso BETWEEN ? AND ?');args.extend([int(first),int(last or first)])
        sql = 'SELECT id,source_file AS source,etapa,paso,responsable,text FROM chunks WHERE '+' AND '.join(clauses)+' ORDER BY source_file,etapa,paso,id'
        return [dict(r) for r in store.db.execute(sql,args)]
    tokens = list(dict.fromkeys(t for t in terms(query) if t not in FILLER and len(t)>2))
    if not tokens: return []
    match = ' OR '.join('"'+t+'"*' for t in tokens)
    rows = [dict(r) for r in store.db.execute("""SELECT c.id,c.source_file AS source,c.etapa,c.paso,c.responsable,c.text,
        bm25(chunks_fts) AS score FROM chunks_fts JOIN chunks c ON c.id=chunks_fts.rowid
        WHERE chunks_fts MATCH ? AND c.source_type='xlsm' AND c.paso IS NOT NULL
        ORDER BY score LIMIT 4""",(match,))]
    # Añadí el paso anterior como contexto documentado, sin inferir una conexión SI/NO.
    expanded = {r['id']:r for r in rows}
    for row in rows:
        for r in store.db.execute("SELECT id,source_file AS source,etapa,paso,responsable,text FROM chunks WHERE source_file=? AND etapa=? AND paso=?",(row['source'],row['etapa'],row['paso']-1)):
            expanded.setdefault(r['id'],dict(r))
    selected = {(r['source'],r['etapa'],r['paso']) for r in expanded.values()}
    complete=[]
    for source,stage,step in sorted(selected):
        complete.extend(dict(r) for r in store.db.execute('SELECT id,source_file AS source,etapa,paso,responsable,text FROM chunks WHERE source_file=? AND etapa=? AND paso=? ORDER BY id',(source,stage,step)))
    return complete

def answer_manual(query):
    response = dict(provider='Libro local',status='ok',intent='manual',actions=[],space_changed=False)
    if not DEFAULT_DB.is_file():
        return dict(response,reply='El libro no está disponible en este servidor. No puedo responder el procedimiento sin consultar esa fuente.')
    store = Store(DEFAULT_DB,readonly=True)
    try: rows = retrieve(store,query)
    finally: store.close()
    if not rows:
        return dict(response,reply='No encontré esa información en el libro. Probá indicando la etapa o el nombre del paso; no voy a completar el procedimiento con recomendaciones externas.')
    lines = ['Estos son los pasos del libro que coinciden con tu consulta. Los textos se reproducen como referencia; no se infieren conexiones del diagrama.']
    for row in rows:
        citation = f"{row['source']} — {row['etapa']}, paso {row['paso']}"
        lines += ['',f"**{row['etapa']} · Paso {row['paso']} · Responsable: {row['responsable'] or 'no indicado'}**",'']
        lines.extend('> '+line for line in row['text'].splitlines())
        lines += ['', 'Fuente: '+citation]
    return dict(response,reply='\n'.join(lines))
