"""
Almacén de «Tu espacio» (Tareas, Notas, Eventos).

- Fuente de verdad en el servidor: data/espacio.json (un bloque por usuario).
- Escritura atómica (tmp + os.replace) y lock de hilo: seguro con Flask multihilo.
- Cada ítem tiene un id estable (t_xxxx / n_xxxx / e_xxxx) que la IA usa para
  editar o eliminar sin ambigüedad.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import threading
from contextvars import ContextVar
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parent.parent
DATA_FILE = Path(os.getenv("WOLSKIA_SPACE_FILE", str(BASE / "data" / "espacio.json")))
_LOCK = threading.RLock()
_DEVICE_DATA: ContextVar[dict | None] = ContextVar('device_space', default=None)


@contextmanager
def device_session(user: str, snapshot: dict):
    """Request-local scratch space. Never writes the browser's data to disk/Supabase."""
    bucket = _empty()
    for kind, col in COLLECTION.items():
        items = snapshot.get(col, [])
        if not isinstance(items, list) or len(items) > MAX_ITEMS_PER_KIND:
            raise SpaceError('Demasiados elementos o formato local inválido.')
        seen = set()
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get('id'), str) or item['id'] in seen:
                raise SpaceError('Identificador local inválido o repetido.')
            seen.add(item['id'])
            # Old undated calendar entries remain readable after migration.
            fields = dict(item)
            if kind == 'event' and not fields.get('date'):
                fields['date'] = '1970-01-01'
            clean = _normalize(kind, fields, partial=False)
            if kind == 'event' and not item.get('date'):
                clean['date'] = None
            bucket[col].append({**_defaults(kind), **clean, 'id': item['id']})
    state = {'users': {clean_user(user): bucket}}
    token = _DEVICE_DATA.set(state)
    try:
        yield
    finally:
        _DEVICE_DATA.reset(token)

KINDS = ("task", "note", "event")
COLLECTION = {"task": "tasks", "note": "notes", "event": "events"}
PREFIX = {"task": "t", "note": "n", "event": "e"}
KIND_LABEL = {"task": "Tarea", "note": "Nota", "event": "Evento"}

PRIORITIES = ("low", "normal", "high")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_USER_RE = re.compile(r"[^a-z0-9_-]+")

MAX_TITLE = 200
MAX_TEXT = 8000
MAX_ITEMS_PER_KIND = 2000


class SpaceError(ValueError):
    """Error de validación legible para el usuario / la IA."""


def clean_user(user: Any) -> str:
    u = _USER_RE.sub("", str(user or "").strip().lower())[:32]
    return u or "default"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _empty() -> dict[str, list]:
    return {"tasks": [], "notes": [], "events": []}


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_TABLE = os.getenv("SUPABASE_SPACE_TABLE", "wolskia_space")


def _use_supabase() -> bool:
    """Con SUPABASE_URL + SUPABASE_SERVICE_KEY, «Tu espacio» se guarda en Supabase
    (sobrevive a reinicios del hosting). Sin ellas, se usa el archivo JSON local."""
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _sb_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
    h.update(extra or {})
    return h


def _load(user: str | None = None) -> dict[str, Any]:
    if _DEVICE_DATA.get() is not None:
        return _DEVICE_DATA.get()
    if _use_supabase() and user:
        import requests
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}",
            params={"user_id": f"eq.{user}", "select": "data"},
            headers=_sb_headers(), timeout=10,
        )
        r.raise_for_status()
        rows = r.json()
        bucket = rows[0].get("data") if rows else None
        return {"users": {user: bucket} if isinstance(bucket, dict) else {}}
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("users"), dict):
            return data
    except (OSError, ValueError):
        pass
    return {"users": {}}


def _save(data: dict[str, Any], user: str | None = None) -> None:
    if _DEVICE_DATA.get() is not None:
        return
    if _use_supabase() and user:
        import requests
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}",
            params={"on_conflict": "user_id"},
            json={"user_id": user, "data": data["users"].get(user, _empty()), "updated_at": _now()},
            headers=_sb_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
            timeout=10,
        )
        r.raise_for_status()
        return
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, DATA_FILE)


def _bucket(data: dict[str, Any], user: str) -> dict[str, list]:
    b = data["users"].setdefault(user, _empty())
    for col in COLLECTION.values():
        b.setdefault(col, [])
    return b


# ─── Validación ────────────────────────────────────────────────────────────

def _text(v: Any, field: str, limit: int, required: bool = False) -> str | None:
    if v is None:
        if required:
            raise SpaceError(f"Falta «{field}».")
        return None
    s = str(v).strip()
    if required and not s:
        raise SpaceError(f"«{field}» no puede estar vacío.")
    return s[:limit]


def _date(v: Any, field: str = "date", required: bool = False) -> str | None:
    if v in (None, ""):
        if required:
            raise SpaceError(f"Falta «{field}» (formato AAAA-MM-DD).")
        return None
    s = str(v).strip()
    if not _DATE_RE.match(s):
        raise SpaceError(f"«{field}» debe tener formato AAAA-MM-DD (recibí «{s}»).")
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise SpaceError(f"«{field}» no es una fecha real: {s}.")
    return s


def _time(v: Any) -> str | None:
    if v in (None, ""):
        return None
    s = str(v).strip()
    if not _TIME_RE.match(s):
        raise SpaceError(f"«time» debe tener formato HH:MM de 24 h (recibí «{s}»).")
    return s


def _normalize(kind: str, fields: dict[str, Any], partial: bool) -> dict[str, Any]:
    """Valida y normaliza. partial=True (update): solo procesa las claves presentes."""
    out: dict[str, Any] = {}
    has = lambda k: k in fields  # noqa: E731

    if kind == "task":
        if has("title") or not partial:
            out["title"] = _text(fields.get("title"), "title", MAX_TITLE, required=True)
        if has("done"):
            d = fields["done"]
            out["done"] = d if isinstance(d, bool) else str(d).strip().lower() in ("1", "true", "si", "sí", "yes")
        if has("due"):
            out["due"] = _date(fields.get("due"), "due")
        if has("priority"):
            p = str(fields.get("priority") or "normal").strip().lower()
            if p not in PRIORITIES:
                raise SpaceError("«priority» debe ser low, normal o high.")
            out["priority"] = p
        if has("detail"):
            out["detail"] = _text(fields.get("detail"), "detail", MAX_TEXT) or ""
    elif kind == "note":
        if has("title") or not partial:
            out["title"] = _text(fields.get("title"), "title", MAX_TITLE, required=True)
        if has("content"):
            out["content"] = _text(fields.get("content"), "content", MAX_TEXT) or ""
    elif kind == "event":
        if has("title") or not partial:
            out["title"] = _text(fields.get("title"), "title", MAX_TITLE, required=True)
        if has("date") or not partial:
            out["date"] = _date(fields.get("date"), "date", required=True)
        if has("time"):
            out["time"] = _time(fields.get("time"))
        if has("location"):
            out["location"] = _text(fields.get("location"), "location", MAX_TITLE) or ""
        if has("detail"):
            out["detail"] = _text(fields.get("detail"), "detail", MAX_TEXT) or ""
    else:
        raise SpaceError(f"Tipo desconocido: {kind}.")
    return out


def _defaults(kind: str) -> dict[str, Any]:
    if kind == "task":
        return {"done": False, "due": None, "priority": "normal", "detail": ""}
    if kind == "note":
        return {"content": ""}
    return {"time": None, "location": "", "detail": ""}


# ─── API pública ───────────────────────────────────────────────────────────

def list_all(user: str) -> dict[str, list]:
    with _LOCK:
        return json.loads(json.dumps(_bucket(_load(clean_user(user)), clean_user(user))))


def list_kind(user: str, kind: str) -> list[dict]:
    return list_all(user)[COLLECTION[kind]]


def add(user: str, kind: str, fields: dict[str, Any]) -> dict[str, Any]:
    clean = _normalize(kind, fields, partial=False)
    with _LOCK:
        data = _load(clean_user(user))
        items = _bucket(data, clean_user(user))[COLLECTION[kind]]
        if len(items) >= MAX_ITEMS_PER_KIND:
            raise SpaceError("Se alcanzó el máximo de elementos permitido.")
        item = {"id": f"{PREFIX[kind]}_{secrets.token_hex(3)}", **_defaults(kind), **clean,
                "created": _now(), "updated": _now()}
        items.insert(0, item)
        _save(data, clean_user(user))
        return dict(item)


def find(user: str, kind: str, item_id: str) -> dict[str, Any] | None:
    for it in list_kind(user, kind):
        if it["id"] == item_id:
            return it
    return None


def update(user: str, kind: str, item_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    clean = _normalize(kind, fields, partial=True)
    if not clean:
        raise SpaceError("No indicaste ningún campo para modificar.")
    with _LOCK:
        data = _load(clean_user(user))
        items = _bucket(data, clean_user(user))[COLLECTION[kind]]
        for it in items:
            if it["id"] == item_id:
                it.update(clean)
                it["updated"] = _now()
                _save(data, clean_user(user))
                return dict(it)
    raise SpaceError(f"No existe {KIND_LABEL[kind].lower()} con id «{item_id}».")


def delete(user: str, kind: str, item_id: str) -> dict[str, Any]:
    with _LOCK:
        data = _load(clean_user(user))
        items = _bucket(data, clean_user(user))[COLLECTION[kind]]
        for i, it in enumerate(items):
            if it["id"] == item_id:
                removed = items.pop(i)
                _save(data, clean_user(user))
                return removed
    raise SpaceError(f"No existe {KIND_LABEL[kind].lower()} con id «{item_id}».")


def import_legacy(user: str, tasks: list, notes: list, events: list) -> dict[str, int]:
    """Migra los datos que antes vivían en localStorage (listas de strings).
    Solo importa si el usuario no tiene nada en el servidor (idempotente)."""
    with _LOCK:
        data = _load(clean_user(user))
        b = _bucket(data, clean_user(user))
        if any(b[c] for c in COLLECTION.values()):
            return {"tasks": 0, "notes": 0, "events": 0}
        counts = {"tasks": 0, "notes": 0, "events": 0}
        for s in (tasks or [])[:500]:
            if isinstance(s, str) and s.strip():
                b["tasks"].append({"id": f"t_{secrets.token_hex(3)}", **_defaults("task"),
                                   "title": s.strip()[:MAX_TITLE], "created": _now(), "updated": _now()})
                counts["tasks"] += 1
        for s in (notes or [])[:500]:
            if isinstance(s, str) and s.strip():
                b["notes"].append({"id": f"n_{secrets.token_hex(3)}", **_defaults("note"),
                                   "title": s.strip()[:MAX_TITLE], "created": _now(), "updated": _now()})
                counts["notes"] += 1
        for s in (events or [])[:500]:
            if not isinstance(s, str) or not s.strip():
                continue
            m = re.match(r"^(\d{4}-\d{2}-\d{2})\s*[—-]\s*(.+)$", s.strip())
            date = m.group(1) if m else None
            title = (m.group(2) if m else re.sub(r"^Sin fecha\s*[—-]\s*", "", s.strip()))[:MAX_TITLE]
            b["events"].append({"id": f"e_{secrets.token_hex(3)}", **_defaults("event"),
                                "title": title, "date": date, "created": _now(), "updated": _now()})
            counts["events"] += 1
        _save(data, clean_user(user))
        return counts


# ─── Resumen compacto para el prompt ───────────────────────────────────────

def snapshot_for_prompt(user: str, per_kind: int = 40) -> str:
    """Lista compacta con ids para que la IA edite/elimine sin llamadas extra."""
    d = list_all(user)
    lines: list[str] = []

    tasks = d["tasks"][:per_kind]
    lines.append(f"TAREAS ({len(d['tasks'])}):" + ("" if tasks else " (vacío)"))
    for t in tasks:
        extra = []
        if t.get("due"):
            extra.append(f"vence {t['due']}")
        if t.get("priority") not in (None, "normal"):
            extra.append(f"prioridad {t['priority']}")
        lines.append(f"  [{t['id']}] {'[x]' if t.get('done') else '[ ]'} {t['title']}"
                     + (f" ({', '.join(extra)})" if extra else ""))

    notes = d["notes"][:per_kind]
    lines.append(f"NOTAS ({len(d['notes'])}):" + ("" if notes else " (vacío)"))
    for n in notes:
        body = (n.get("content") or "").replace("\n", " ")[:60]
        lines.append(f"  [{n['id']}] {n['title']}" + (f" — {body}…" if body else ""))

    events = sorted(d["events"], key=lambda e: (e.get("date") or "9999", e.get("time") or ""))[:per_kind]
    lines.append(f"EVENTOS ({len(d['events'])}):" + ("" if events else " (vacío)"))
    for e in events:
        when = (e.get("date") or "sin fecha") + (f" {e['time']}" if e.get("time") else "")
        lines.append(f"  [{e['id']}] {when} — {e['title']}" + (f" @ {e['location']}" if e.get("location") else ""))
    return "\n".join(lines)
