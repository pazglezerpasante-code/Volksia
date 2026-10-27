"""
Definición de herramientas (function calling) + ejecutor.

El esquema es JSON Schema «neutro» (type/properties/required/enum/items/description)
que sirve tal cual para Gemini (functionDeclarations) y para APIs estilo OpenAI
(Groq, xAI). Cada herramienta devuelve (resultado_para_el_modelo, acción_para_la_UI).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable

from . import file_tools as F
from . import space_store as S

logger = logging.getLogger("wolskia.tools")

KIND_OF_TOOL = {"task": "Tarea", "note": "Nota", "event": "Evento"}


@dataclass
class ToolContext:
    user: str
    files: F.FileContext
    can_write_files: bool = True


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[[ToolContext, dict[str, Any]], tuple[dict[str, Any], dict[str, Any]]]
    group: str                # "space" | "files"
    mutates: bool = False


def _obj(props: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required or []}


_S = lambda d: {"type": "string", "description": d}  # noqa: E731
_B = lambda d: {"type": "boolean", "description": d}  # noqa: E731
_I = lambda d: {"type": "integer", "description": d}  # noqa: E731

ID = lambda k, p: _S(f"ID exacto del elemento (empieza con «{p}_»), tomado del bloque «Tu espacio» o de space_list.")  # noqa: E731
DATE = "Fecha AAAA-MM-DD ya resuelta (convertí «mañana», «el viernes», etc. usando la fecha de hoy del contexto)."
TIME = "Hora HH:MM en formato 24 h."


# ─── Tu espacio ────────────────────────────────────────────────────────────

def _act(kind: str, op: str, summary: str, item: dict | None = None, ok: bool = True) -> dict[str, Any]:
    return {"tool": f"{kind}_{op}", "domain": "space", "kind": kind, "op": op, "ok": ok,
            "summary": summary, "item": item}


def _fail(domain: str, tool: str, msg: str, kind: str | None = None) -> tuple[dict, dict]:
    return ({"ok": False, "error": msg},
            {"tool": tool, "domain": domain, "kind": kind, "op": None, "ok": False, "summary": msg, "item": None})


def _add(kind: str):
    def h(ctx: ToolContext, a: dict[str, Any]):
        item = S.add(ctx.user, kind, a)
        return ({"ok": True, "item": item},
                _act(kind, "add", f"{KIND_OF_TOOL[kind]} agregada: {item['title']}", item))
    return h


def _update(kind: str):
    def h(ctx: ToolContext, a: dict[str, Any]):
        iid = str(a.get("id", "")).strip()
        if not iid:
            raise S.SpaceError("Falta «id».")
        fields = {k: v for k, v in a.items() if k != "id"}
        item = S.update(ctx.user, kind, iid, fields)
        return ({"ok": True, "item": item},
                _act(kind, "update", f"{KIND_OF_TOOL[kind]} actualizada: {item['title']}", item))
    return h


def _delete(kind: str):
    def h(ctx: ToolContext, a: dict[str, Any]):
        iid = str(a.get("id", "")).strip()
        if not iid:
            raise S.SpaceError("Falta «id».")
        item = S.delete(ctx.user, kind, iid)
        return ({"ok": True, "deleted": {"id": item["id"], "title": item["title"]}},
                _act(kind, "delete", f"{KIND_OF_TOOL[kind]} eliminada: {item['title']}", item))
    return h


def _space_list(ctx: ToolContext, a: dict[str, Any]):
    kind = str(a.get("kind", "all")).lower()
    q = str(a.get("query", "") or "").strip().lower()
    data = S.list_all(ctx.user)
    out: dict[str, Any] = {}
    for k, col in S.COLLECTION.items():
        if kind in ("all", k, col):
            items = data[col]
            if q:
                items = [i for i in items if q in " ".join(str(v) for v in i.values()).lower()]
            out[col] = items[:100]
    return ({"ok": True, **out}, {"tool": "space_list", "domain": "space", "kind": None, "op": "list",
                                  "ok": True, "summary": "Consulté Tu espacio", "item": None})


# ─── Archivos ──────────────────────────────────────────────────────────────

def _fact(op: str, summary: str, path: str | None = None, ok: bool = True) -> dict[str, Any]:
    return {"tool": f"file_{op}", "domain": "files", "kind": "file", "op": op, "ok": ok,
            "summary": summary, "item": {"path": path} if path else None}


def _files_list(ctx: ToolContext, a: dict[str, Any]):
    r = F.files_list(ctx.files, a.get("path", ""), a.get("pattern", ""))
    return ({"ok": True, **r}, _fact("list", "Listé archivos", a.get("path") or None))


def _file_read(ctx: ToolContext, a: dict[str, Any]):
    r = F.file_read(ctx.files, a.get("path", ""), a.get("start_line"), a.get("end_line"))
    return ({"ok": True, **r}, _fact("read", f"Leí {r['path']}", r["path"]))


def _file_create(ctx: ToolContext, a: dict[str, Any]):
    r = F.file_create(ctx.files, a.get("path", ""), a.get("content", ""), bool(a.get("overwrite", False)))
    verb = "Reemplacé" if r["overwritten"] else "Creé"
    return ({"ok": True, **r}, _fact("create", f"{verb} {r['path']}", r["path"]))


def _file_edit(ctx: ToolContext, a: dict[str, Any]):
    r = F.file_edit(ctx.files, a.get("path", ""), a.get("old_text", ""), a.get("new_text", ""),
                    bool(a.get("replace_all", False)))
    return ({"ok": True, **r}, _fact("edit", f"Modifiqué {r['path']}", r["path"]))


# ─── Registro ──────────────────────────────────────────────────────────────

def _build_registry() -> dict[str, Tool]:
    reg: dict[str, Tool] = {}

    def add(t: Tool):
        reg[t.name] = t

    # TAREAS
    add(Tool("task_add",
             "Agrega una TAREA (pendiente/to-do) a «Tu espacio». Usala cuando el usuario pida crear, anotar o recordar algo que hay que HACER.",
             _obj({"title": _S("Qué hay que hacer. Breve y accionable."),
                   "due": _S(f"Fecha límite opcional. {DATE}"),
                   "priority": {"type": "string", "enum": list(S.PRIORITIES), "description": "Prioridad. Por defecto normal."},
                   "detail": _S("Detalle opcional.")}, ["title"]),
             _add("task"), "space", True))
    add(Tool("task_update",
             "Modifica una TAREA existente: cambiar título, fecha, prioridad o marcarla hecha/pendiente (done). Solo enviá los campos que cambian.",
             _obj({"id": ID("task", "t"), "title": _S("Nuevo título."), "done": _B("true = completada, false = pendiente."),
                   "due": _S(f"Nueva fecha límite (vacío = quitarla). {DATE}"),
                   "priority": {"type": "string", "enum": list(S.PRIORITIES), "description": "Nueva prioridad."},
                   "detail": _S("Nuevo detalle.")}, ["id"]),
             _update("task"), "space", True))
    add(Tool("task_delete", "Elimina definitivamente una TAREA por su id.",
             _obj({"id": ID("task", "t")}, ["id"]), _delete("task"), "space", True))
    # NOTAS
    add(Tool("note_add",
             "Agrega una NOTA a «Tu espacio» (apunte, idea, dato para guardar; no es algo con fecha ni algo que hacer).",
             _obj({"title": _S("Título corto de la nota."), "content": _S("Cuerpo de la nota (texto libre).")}, ["title"]),
             _add("note"), "space", True))
    add(Tool("note_update", "Modifica una NOTA existente (título y/o contenido). Solo enviá lo que cambia.",
             _obj({"id": ID("note", "n"), "title": _S("Nuevo título."), "content": _S("Nuevo contenido completo.")}, ["id"]),
             _update("note"), "space", True))
    add(Tool("note_delete", "Elimina definitivamente una NOTA por su id.",
             _obj({"id": ID("note", "n")}, ["id"]), _delete("note"), "space", True))
    # EVENTOS
    add(Tool("event_add",
             "Agrega un EVENTO al calendario (reunión, cita, turno, vencimiento: algo que OCURRE en una fecha). La fecha es obligatoria.",
             _obj({"title": _S("Nombre del evento."), "date": _S(DATE), "time": _S(TIME),
                   "location": _S("Lugar opcional."), "detail": _S("Detalle opcional.")}, ["title", "date"]),
             _add("event"), "space", True))
    add(Tool("event_update", "Modifica un EVENTO existente (título, fecha, hora, lugar). Solo enviá lo que cambia.",
             _obj({"id": ID("event", "e"), "title": _S("Nuevo título."), "date": _S(DATE), "time": _S(TIME),
                   "location": _S("Nuevo lugar."), "detail": _S("Nuevo detalle.")}, ["id"]),
             _update("event"), "space", True))
    add(Tool("event_delete", "Elimina definitivamente un EVENTO por su id.",
             _obj({"id": ID("event", "e")}, ["id"]), _delete("event"), "space", True))
    add(Tool("space_list",
             "Consulta Tareas, Notas y/o Eventos con todos sus campos (útil si el bloque «Tu espacio» está recortado o necesitás el contenido completo de una nota).",
             _obj({"kind": {"type": "string", "enum": ["all", "task", "note", "event"], "description": "Qué consultar."},
                   "query": _S("Texto a buscar (opcional).")}),
             _space_list, "space", False))
    # ARCHIVOS
    add(Tool("files_list",
             "Lista las carpetas/archivos del espacio de trabajo. Sin «path» devuelve las raíces disponibles.",
             _obj({"path": _S("Raíz o subcarpeta, p. ej. «herramientas» o «herramientas/Turnero»."),
                   "pattern": _S("Filtro opcional por texto en la ruta (p. ej. «.html»).")}),
             _files_list, "files", False))
    add(Tool("file_read",
             "Lee un archivo de texto del espacio de trabajo. SIEMPRE leé antes de modificar. Para archivos largos usá start_line/end_line.",
             _obj({"path": _S("Ruta «raiz/carpeta/archivo.ext»."), "start_line": _I("Primera línea (1 = inicio)."),
                   "end_line": _I("Última línea.")}, ["path"]),
             _file_read, "files", False))
    add(Tool("file_create",
             "Crea un archivo NUEVO de texto con el contenido completo. Falla si ya existe (salvo overwrite=true, que guarda respaldo).",
             _obj({"path": _S("Ruta «raiz/carpeta/archivo.ext»."), "content": _S("Contenido COMPLETO y funcional del archivo."),
                   "overwrite": _B("Solo true si el usuario pidió reemplazar el archivo entero.")}, ["path", "content"]),
             _file_create, "files", True))
    add(Tool("file_edit",
             "Modifica un archivo existente reemplazando un fragmento EXACTO (old_text) por otro (new_text). Cambios mínimos y precisos; no reescribas el archivo completo.",
             _obj({"path": _S("Ruta del archivo."),
                   "old_text": _S("Fragmento exacto actual (copiado de file_read), con contexto suficiente para ser único."),
                   "new_text": _S("Texto nuevo que lo reemplaza."),
                   "replace_all": _B("true para reemplazar todas las apariciones.")}, ["path", "old_text", "new_text"]),
             _file_edit, "files", True))
    return reg


REGISTRY: dict[str, Tool] = _build_registry()


def tool_definitions(*, allow_file_writes: bool = True) -> list[Tool]:
    """Herramientas expuestas al modelo. Si la cuenta no puede escribir, no ve las de escritura."""
    return [t for t in REGISTRY.values()
            if not (t.group == "files" and t.mutates and not allow_file_writes)]


def space_mutators() -> list[str]:
    return [t.name for t in REGISTRY.values() if t.group == "space" and t.mutates]


def execute(ctx: ToolContext, name: str, args: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    """Ejecuta una herramienta. Nunca lanza: los errores vuelven al modelo para que se corrija."""
    tool = REGISTRY.get(name)
    if not tool:
        return _fail("system", name, f"Herramienta desconocida: {name}.")
    if not isinstance(args, dict):
        return _fail(tool.group, name, "Los argumentos deben ser un objeto JSON.")
    try:
        return tool.handler(ctx, args)
    except (S.SpaceError, F.FileToolError) as exc:
        return _fail(tool.group, name, str(exc), None)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Fallo en herramienta %s", name)
        return _fail(tool.group, name, f"Error interno en {name}: {type(exc).__name__}.")


# ─── Conversión de esquemas por proveedor ──────────────────────────────────

def to_gemini(tools: list[Tool]) -> list[dict[str, Any]]:
    return [{"functionDeclarations": [
        {"name": t.name, "description": t.description, "parameters": t.parameters} for t in tools]}]


def to_openai(tools: list[Tool]) -> list[dict[str, Any]]:
    return [{"type": "function",
             "function": {"name": t.name, "description": t.description, "parameters": t.parameters}} for t in tools]
