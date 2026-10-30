"""
Detección de intención para «Tu espacio» y archivos (reglas rápidas, sin gastar cuota).

Sirve para dos cosas:
  1) Decidir si se FUERZA el function calling en la primera vuelta (intención clara).
  2) Activar la red de seguridad: si el modelo dice «listo, lo agregué» sin haber
     llamado a ninguna herramienta, se reintenta forzando la llamada.
Solo se analizan los primeros 400 caracteres (el resto suele ser texto adjunto).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_F = re.I | re.U

ENTITY = re.compile(
    r"\b(tareas?|pendientes?|to-?dos?|notas?|apuntes?|eventos?|reuni[oó]n(?:es)?|citas?|turnos?|"
    r"calendario|agenda|recordatorios?|vencimientos?|cumplea[nñ]os)\b", _F)
V_ADD = re.compile(
    r"\b(agreg\w*|a[ñn]ad\w*|anot\w*|cre[aá]\w*|crear\w*|sum[aá]\w*|pon[eé]\w*|ponelo|agend\w*|program[aá]\w*|"
    r"apunt\w*|guard[aá]\w*|nuev[oa]s?|registr\w*|record\w*)\b", _F)
V_EDIT = re.compile(
    r"\b(edit\w*|cambi\w*|modific\w*|actualiz\w*|renombr\w*|mov[eé]\w*|reprogram\w*|corrig\w*|corr[ie]g\w*|"
    r"complet\w*|marc[aá]\w*|termin\w*|finaliz\w*|tild\w*|destild\w*|reagend\w*|posterg\w*|adelant\w*|"
    r"ya (?:hice|termin[eé]|est[aá]|lo hice))\b", _F)
V_DEL = re.compile(r"\b(elimin\w*|borr\w*|quit\w*|sac[aá]\w*|descart\w*|cancel\w*|remov\w*)\b", _F)
SELF_ACTION = re.compile(r"\b(record[aá]me|record[aá]rme|agend[aá]me|anot[aá]me|avis[aá]me)\b", _F)
READ_Q = re.compile(
    r"(qu[eé] (?:\w+ )?(?:tengo|hay)|mostr\w+|list\w+|ver |cu[aá]ntas?|cu[aá]les|mis (?:tareas|notas|eventos)|"
    r"pendientes de|tengo (?:algo|reuni|turno))", _F)
HOWTO = re.compile(r"^\s*(?:¿\s*)?(c[oó]mo|qu[eé] es|explic\w*|por qu[eé]|para qu[eé]|cu[aá]l es la diferencia)\b", _F)

FILE_NOUN = re.compile(
    r"\b(archivos?|ficheros?|carpetas?|script|readme|plantilla|c[oó]digo fuente)\b|"
    r"[\w\-./]+\.(?:html?|py|js|css|json|csv|txt|md|ts|tsx|jsx|sql|xml|ya?ml)\b", _F)
F_WRITE = re.compile(
    r"\b(cre[aá]\w*|gener[aá]\w*|escrib[ií]\w*|modific\w*|edit\w*|cambi\w*|agreg\w*|a[ñn]ad\w*|actualiz\w*|"
    r"reemplaz\w*|corrig\w*|arregl\w*|sac[aá]\w*|elimin\w*|borr\w*|renombr\w*|hac[eé]\w*|guard[aá]\w*)\b", _F)


@dataclass(frozen=True)
class Intent:
    space: str | None      # "mutate" (alta confianza) | "maybe" (ambigua) | "read" | None
    files: str | None      # "write" | "read" | None

    @property
    def force_space(self) -> bool:
        return self.space == "mutate"

    @property
    def force_files(self) -> bool:
        return self.files == "write"


def analyze(message: str) -> Intent:
    m = (message or "")[:400]
    if not m.strip():
        return Intent(None, None)
    howto = bool(HOWTO.search(m))

    space = None
    has_entity = bool(ENTITY.search(m))
    verb = bool(V_ADD.search(m) or V_EDIT.search(m) or V_DEL.search(m))
    if not howto:
        if SELF_ACTION.search(m) or (has_entity and verb):
            space = "mutate"
        elif has_entity and READ_Q.search(m):
            space = "read"
        elif V_ADD.search(m) and re.search(r"\b(anot\w*|apunt\w*|record\w*)\b", m, _F):
            space = "maybe"
        elif has_entity:
            space = "maybe"
    elif has_entity and READ_Q.search(m):
        space = "read"

    files = None
    if FILE_NOUN.search(m) and not howto and not re.search(r"adjunt", m, _F):
        files = "write" if F_WRITE.search(m) else "read"
    # «archivo» + entidad de espacio sin verbo de archivo → es de Tu espacio
    if space == "mutate" and files == "write" and re.search(r"\b(tarea|nota|evento|recordatorio)s?\b", m, _F) \
            and not re.search(r"\.\w{2,4}\b|\barchivos?\b", m, _F):
        files = None
    return Intent(space, files)


MANUAL = re.compile(
    r"\b(?:manual|instructivo|libro|pasos?\s+(?:numero\s+)?\d+|procedimiento|proceso de trabajo|seg[uú]n el manual|"
    r"paso a paso de|qui[eé]n (?:es )?(?:responsable|se encarga)|"
    r"qu[eé] (?:hace|debe hacer) (?:el |la )?(?:asesor|jefe|t[eé]cnico|cajero)|"
    r"c[oó]mo (?:se realiza|se hace|atender|recibir|entregar|agendar))\b", _F)

def is_manual_question(message: str) -> bool:
    """Solo enruta consultas de proceso; las intenciones de espacio/archivos ganan."""
    m = (message or "")[:1000]
    analyzed = analyze(m)
    if analyzed.space == "mutate" or analyzed.files:
        return False
    if analyzed.space == "read" and re.search(r"\b(tareas?|notas?|eventos?|recordatorios?|calendario|mis turnos|mis citas)\b",m,_F):
        return False
    return bool(MANUAL.search(m) or re.search(r"\b(repuestos?|stock|ventaniller[oa]|dealer care|orden de reparaci[oó]n|asesor de servicio|recepci[oó]n|entrega de (?:la )?unidad|garant[ií]a|agendamiento|ejecuci[oó]n|entrega|asesor de citas|jefe de taller|cajero|facturaci[oó]n|factura|mantenimiento|control final|POC)\b", m, _F))
