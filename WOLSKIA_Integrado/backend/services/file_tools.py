"""
Herramientas de archivos para la IA — SIEMPRE dentro de un sandbox.

Reglas de seguridad (todas se aplican en el servidor, el modelo no puede saltearlas):
  * Solo se opera dentro de las raíces de config.json (tool_roots).
  * Se resuelven symlinks; cualquier ruta que escape de la raíz se rechaza.
  * Archivos protegidos (.env, claves, app.py, services/, data/, config.json) → bloqueados.
  * Solo archivos de texto (extensiones permitidas), con límites de tamaño.
  * Antes de modificar o sobrescribir se guarda un respaldo en data/backups/.
  * Escritura atómica. Crear no pisa archivos existentes salvo overwrite=true.
"""
from __future__ import annotations

import difflib
import os
import re
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parent.parent
BACKUP_DIR = BASE / "data" / "backups"

TEXT_EXTS = {".html", ".htm", ".py", ".js", ".css", ".json", ".csv", ".txt", ".md",
             ".xml", ".yaml", ".yml", ".ts", ".tsx", ".jsx", ".sql", ".log", ".ini"}
MAX_READ_CHARS = 60_000
MAX_WRITE_BYTES = 500_000
MAX_LIST = 200
KEEP_BACKUPS = 20
DENY_NAME = re.compile(r"(^\.env)|(\.(pem|key|pfx|p12|crt)$)|(^id_rsa)|(secret)|(credential)", re.I)
DENY_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build"}


class FileToolError(Exception):
    """Error legible que se devuelve al modelo (no es un fallo del servidor)."""


@dataclass
class FileContext:
    roots: list[Path]
    exclude_dirs: set[str] = field(default_factory=lambda: set(DENY_DIRS))
    protected: list[Path] = field(default_factory=list)
    can_write: bool = True

    def labels(self) -> dict[str, Path]:
        out: dict[str, Path] = {}
        for r in self.roots:
            label, n = r.name or "raiz", 2
            base = label
            while label in out:
                label, n = f"{base}-{n}", n + 1
            out[label] = r
        return out


def _is_protected(p: Path, ctx: FileContext) -> bool:
    for prot in ctx.protected:
        try:
            p.relative_to(prot.resolve())
            return True
        except ValueError:
            continue
    return False


def resolve(ctx: FileContext, virtual_path: str, *, must_exist: bool, for_write: bool = False) -> tuple[Path, Path, str]:
    """'raiz/ruta/relativa' → (ruta_real, raiz, ruta_relativa). Lanza FileToolError."""
    labels = ctx.labels()
    if not labels:
        raise FileToolError("No hay carpetas de trabajo configuradas (tool_roots en config.json).")
    raw = str(virtual_path or "").strip().replace("\\", "/").lstrip("/")
    if not raw:
        raise FileToolError("Falta la ruta. Usá el formato «raiz/carpeta/archivo.ext» (ver files_list).")
    parts = [p for p in raw.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts) or re.match(r"^[A-Za-z]:", raw):
        raise FileToolError("Ruta inválida: no se permiten «..» ni rutas absolutas.")
    if parts[0] in labels:
        label, rel_parts = parts[0], parts[1:]
    elif len(labels) == 1:
        label, rel_parts = next(iter(labels)), parts
    else:
        raise FileToolError(f"La ruta debe empezar con una de las raíces: {', '.join(labels)}.")
    root = labels[label].resolve()
    target = root.joinpath(*rel_parts).resolve() if rel_parts else root
    try:
        rel = target.relative_to(root)
    except ValueError:
        raise FileToolError("Ruta fuera de la carpeta de trabajo: acceso denegado.")
    if any(x in ctx.exclude_dirs for x in rel.parts):
        raise FileToolError("Esa carpeta está excluida del espacio de trabajo.")
    if rel.parts and DENY_NAME.search(rel.parts[-1]):
        raise FileToolError("Archivo protegido (posibles credenciales): acceso denegado.")
    if _is_protected(target, ctx):
        raise FileToolError("Archivo del sistema de Suri: acceso denegado.")
    if must_exist and not target.exists():
        raise FileToolError(f"No existe: {label}/{rel.as_posix()}. Usá files_list para ver qué hay.")
    return target, root, f"{label}/{rel.as_posix()}" if rel.parts else label


def _check_ext(p: Path) -> None:
    if p.suffix.lower() not in TEXT_EXTS:
        raise FileToolError(
            f"Extensión «{p.suffix or '(sin extensión)'}» no permitida. "
            f"Solo texto: {', '.join(sorted(TEXT_EXTS))}.")


def _read_text(p: Path) -> str:
    if p.stat().st_size > 2_000_000:
        raise FileToolError("El archivo es demasiado grande para leerlo (> 2 MB).")
    data = p.read_bytes()
    if b"\x00" in data[:4096]:
        raise FileToolError("Es un archivo binario; solo puedo leer texto.")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1")


def _backup(ctx_label_path: str, p: Path) -> str | None:
    if not p.exists():
        return None
    dest_dir = BACKUP_DIR / Path(ctx_label_path).parent
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{p.name}.{time.strftime('%Y%m%d-%H%M%S')}.bak"
    shutil.copy2(p, dest)
    olds = sorted(dest_dir.glob(f"{p.name}.*.bak"))
    for old in olds[:-KEEP_BACKUPS]:
        try:
            old.unlink()
        except OSError:
            pass
    return "backups/" + dest.relative_to(BACKUP_DIR).as_posix()


def _write_atomic(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".wtmp")
    tmp.write_text(text, encoding="utf-8", newline="")
    os.replace(tmp, p)


def _diff(old: str, new: str, name: str, max_lines: int = 40) -> str:
    d = list(difflib.unified_diff(old.splitlines(), new.splitlines(), f"a/{name}", f"b/{name}", lineterm="", n=1))
    if len(d) > max_lines:
        d = d[:max_lines] + [f"… (+{len(d) - max_lines} líneas de diff omitidas)"]
    return "\n".join(d)


# ─── Herramientas ──────────────────────────────────────────────────────────

def files_list(ctx: FileContext, path: str = "", pattern: str = "") -> dict[str, Any]:
    labels = ctx.labels()
    if not labels:
        raise FileToolError("No hay carpetas de trabajo configuradas.")
    pat = (pattern or "").strip().lower()
    if not str(path or "").strip():
        entries = [{"path": lab, "type": "root"} for lab in labels]
        return {"roots": entries, "note": "Pasá una raíz como «path» para ver su contenido."}
    base, root, vpath = resolve(ctx, path, must_exist=True)
    if base.is_file():
        return {"path": vpath, "type": "file", "size": base.stat().st_size}
    label = vpath.split("/")[0]
    out, truncated = [], False
    for p in sorted(base.rglob("*")):
        rel_root = p.relative_to(root)
        if any(x in ctx.exclude_dirs for x in rel_root.parts) or DENY_NAME.search(p.name) or _is_protected(p, ctx):
            continue
        if p.is_dir():
            continue
        if p.suffix.lower() not in TEXT_EXTS and p.suffix.lower() not in {".xlsx", ".xls", ".pdf", ".docx", ".zip"}:
            continue
        v = f"{label}/{rel_root.as_posix()}"
        if pat and pat not in v.lower():
            continue
        out.append({"path": v, "size": p.stat().st_size, "text": p.suffix.lower() in TEXT_EXTS})
        if len(out) >= MAX_LIST:
            truncated = True
            break
    return {"base": vpath, "count": len(out), "truncated": truncated, "files": out}


def file_read(ctx: FileContext, path: str, start_line: int | None = None, end_line: int | None = None) -> dict[str, Any]:
    p, _root, vpath = resolve(ctx, path, must_exist=True)
    if not p.is_file():
        raise FileToolError(f"«{vpath}» es una carpeta; usá files_list.")
    _check_ext(p)
    text = _read_text(p)
    lines = text.splitlines()
    total = len(lines)
    s = max(1, int(start_line or 1))
    e = min(total, int(end_line or total))
    chunk = "\n".join(lines[s - 1:e]) if (start_line or end_line) else text
    truncated = len(chunk) > MAX_READ_CHARS
    if truncated:
        chunk = chunk[:MAX_READ_CHARS]
    return {"path": vpath, "total_lines": total, "from_line": s, "to_line": e,
            "truncated": truncated,
            "hint": "Truncado: pedí un rango con start_line/end_line." if truncated else "",
            "content": chunk}


def file_create(ctx: FileContext, path: str, content: str, overwrite: bool = False) -> dict[str, Any]:
    if not ctx.can_write:
        raise FileToolError("No tenés permiso para crear o modificar archivos con esta cuenta.")
    p, _root, vpath = resolve(ctx, path, must_exist=False, for_write=True)
    _check_ext(p)
    if p.is_dir():
        raise FileToolError(f"«{vpath}» es una carpeta.")
    content = "" if content is None else str(content)
    if len(content.encode("utf-8")) > MAX_WRITE_BYTES:
        raise FileToolError("El contenido supera el máximo permitido (500 KB).")
    existed = p.exists()
    if existed and not overwrite:
        raise FileToolError(f"«{vpath}» ya existe. Para cambiarlo usá file_edit; para reemplazarlo todo, overwrite=true.")
    backup = _backup(vpath, p) if existed else None
    _write_atomic(p, content)
    return {"path": vpath, "created": not existed, "overwritten": existed,
            "bytes": len(content.encode("utf-8")), "lines": len(content.splitlines()), "backup": backup}


def file_edit(ctx: FileContext, path: str, old_text: str, new_text: str, replace_all: bool = False) -> dict[str, Any]:
    if not ctx.can_write:
        raise FileToolError("No tenés permiso para crear o modificar archivos con esta cuenta.")
    p, _root, vpath = resolve(ctx, path, must_exist=True, for_write=True)
    if not p.is_file():
        raise FileToolError(f"«{vpath}» es una carpeta.")
    _check_ext(p)
    if not old_text:
        raise FileToolError("old_text no puede estar vacío (copiá el fragmento exacto a reemplazar).")
    if old_text == new_text:
        raise FileToolError("old_text y new_text son idénticos: no hay nada que cambiar.")
    original = _read_text(p)
    crlf = "\r\n" in original
    work = original.replace("\r\n", "\n") if crlf else original
    old = old_text.replace("\r\n", "\n")
    new = (new_text or "").replace("\r\n", "\n")
    count = work.count(old)
    if count == 0:
        raise FileToolError("No encontré old_text en el archivo (debe coincidir exacto, con espacios e indentación). "
                            "Volvé a leer el archivo con file_read y copiá el fragmento tal cual.")
    if count > 1 and not replace_all:
        raise FileToolError(f"old_text aparece {count} veces. Agregá más contexto para que sea único, o usá replace_all=true.")
    updated = work.replace(old, new) if replace_all else work.replace(old, new, 1)
    if crlf:
        updated = updated.replace("\n", "\r\n")
    if len(updated.encode("utf-8")) > MAX_WRITE_BYTES:
        raise FileToolError("El resultado supera el máximo permitido (500 KB).")
    backup = _backup(vpath, p)
    _write_atomic(p, updated)
    return {"path": vpath, "replacements": count if replace_all else 1, "backup": backup,
            "diff": _diff(original, updated, vpath.split("/")[-1])}
