import os, json, re, hmac, zipfile, mimetypes, logging
from pathlib import Path
from io import BytesIO
from functools import wraps
from flask import Flask, render_template, request, jsonify, send_file, abort
from flask_cors import CORS
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent
load_dotenv(BASE / ".env")
app = Flask(__name__)
from services.sheets import sheets
app.register_blueprint(sheets)

@app.errorhandler(413)
def upload_too_large(_error):
    return jsonify(error="upload_too_large", message="El archivo supera el límite del servidor. SURI admite actualmente hasta 8 MB por planilla."), 413


# ─── CORS ──────────────────────────────────────────────────────────────────
# Con el proxy de Vite (/api → Flask) el navegador ve un solo origen y CORS ni
# se usa; queda configurado igual por si abrís el backend desde otro puerto.
DEFAULT_ORIGINS = [
    "http://127.0.0.1:8080", "http://localhost:8080",   # Studio (vite dev)
    "http://127.0.0.1:8081", "http://localhost:8081",   # Studio (vite preview)
    "http://127.0.0.1:5173", "http://localhost:5173",   # Vite por defecto
]
EXTRA_ORIGINS = [o.strip() for o in os.getenv("WOLSKIA_CORS_ORIGINS", "").split(",") if o.strip()]
CORS(app, resources={r"/api/*": {"origins": DEFAULT_ORIGINS + EXTRA_ORIGINS}})

CONFIG_FILE = BASE / "config.json"

# ─── Modo público (sitio online SIN login) ─────────────────────────────────
# WOLSKIA_PUBLIC_MODE=1 es para el despliegue online. Sin login, la defensa es:
#  1) Candado de proxy: el backend solo atiende pedidos que traen la clave
#     secreta WOLSKIA_PROXY_SECRET, que solo conoce el frontend (servidor a servidor).
#     Si alguien entra directo a la URL del backend, recibe 403.
#  2) Sin escritura de archivos y sin rol "admin" elegido por el navegador.
#  3) Límites por IP y tope global diario (WOLSKIA_GLOBAL_DAILY_LIMIT).
#  4) El identificador de «Tu espacio» debe ser largo (los nombres cortos como
#     "default" o "admin" quedan bloqueados).
PUBLIC_MODE = os.getenv("WOLSKIA_PUBLIC_MODE") == "1"
PROXY_SECRET = os.getenv("WOLSKIA_PROXY_SECRET", "")
MIN_PUBLIC_USER_LEN = 12
GATED_PREFIXES = ("/api/ai/", "/api/space", "/api/chat", "/api/tools", "/api/search", "/api/project")


@app.before_request
def public_gate():
    if not PUBLIC_MODE:
        return None
    path = request.path
    if path == "/api/health":
        return None
    if not PROXY_SECRET:
        return jsonify({"error": "misconfigured", "message": "Falta WOLSKIA_PROXY_SECRET en el servidor."}), 503
    if path.startswith(GATED_PREFIXES):
        sent = request.headers.get("X-Wolskia-Proxy-Key", "")
        if not hmac.compare_digest(sent.encode(), PROXY_SECRET.encode()):
            return jsonify({"error": "forbidden", "message": "Acceso directo no permitido."}), 403
    return None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("wolskia")

DEFAULT = {
    "tool_roots": ["./herramientas"],
    "exclude_dirs": [".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build"],
    "extensions": [".html", ".htm", ".py", ".js", ".css", ".json", ".xlsx", ".xls", ".csv", ".pdf", ".docx", ".txt", ".md", ".zip"]
}

def config():
    if not CONFIG_FILE.exists():
        CONFIG_FILE.write_text(json.dumps(DEFAULT, indent=2, ensure_ascii=False), encoding="utf-8")
    try:
        c = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        c = DEFAULT.copy()
    for k, v in DEFAULT.items():
        c.setdefault(k, v)
    return c

def roots():
    out = []
    for r in config()["tool_roots"]:
        p = Path(r)
        if not p.is_absolute():
            p = (BASE / p).resolve()
        else:
            p = p.resolve()
        if p.exists() and p.is_dir():
            out.append(p)
    return out

def workspace():
    """Sandbox de archivos de la IA: solo las raíces de config.json; el código del
    backend, sus datos y las claves quedan protegidos aunque una raíz los contenga."""
    c = config()
    return {
        "roots": [str(r) for r in roots()],
        "exclude_dirs": c["exclude_dirs"],
        "protected": [str(BASE / n) for n in ("services", "data", ".env", "app.py", "config.json", "templates", "tests_api.py", "tests_ai.py")],
    }

def inside(p, root):
    try:
        p.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False

def scan():
    c = config()
    projects = []
    seen = set()
    for root in roots():
        dirs = [p for p in root.iterdir() if p.is_dir() and p.name not in c["exclude_dirs"]]
        rootfiles = [p for p in root.iterdir() if p.is_file() and p.suffix.lower() in c["extensions"]]
        if rootfiles:
            dirs.append(root)
        for folder in dirs:
            if str(folder.resolve()) in seen:
                continue
            seen.add(str(folder.resolve()))
            files = []
            try:
                for p in folder.rglob("*"):
                    if not p.is_file():
                        continue
                    rel = p.relative_to(folder)
                    if any(x in c["exclude_dirs"] for x in rel.parts):
                        continue
                    if p.suffix.lower() in c["extensions"] or p.name.lower() in ("readme.md", "requirements.txt", "package.json"):
                        files.append(p)
                    if len(files) >= 800:
                        break
            except OSError:
                continue
            if not files:
                continue
            names = [p.name for p in files]
            name = folder.name if folder != root else root.name + " (archivos sueltos)"
            low = " ".join([name] + names).lower()
            title = name.replace("_", " ").replace("-", " ").title()
            if any("turnero" in x or "turno" in x for x in [low]):
                title = "Turnero"
            elif "encuesta" in low:
                title = "Generador de encuestas"
            elif "certificado" in low:
                title = "Gestor de certificados"
            elif "organizacion de sur" in low or "organización de sur" in low:
                title = "Organización de Sur"
            projects.append({
                "id": str(len(projects)),
                "title": title,
                "folder": name,
                "path": str(folder),
                "root": str(root),
                "count": len(files),
                "files": [str(p.relative_to(folder)) for p in files[:40]],
                "searchable": (title + " " + name + " " + " ".join(names)).lower(),
            })
    return projects

def match_score(q, p):
    ql = q.lower()
    terms = [x for x in re.findall(r"[a-záéíóúñ0-9]+", ql) if len(x) > 1]
    score = sum(3 if t in p["title"].lower() else 1 for t in terms if t in p["searchable"])
    groups = {
        "turnero": ["turnero", "turno", "turnos", "agenda", "citas"],
        "encuesta": ["encuesta", "encuestas", "survey"],
        "certificado": ["certificado", "certificados", "medico", "médico"],
        "excel": ["excel", "xlsx", "xls", "planilla", "hoja de calculo"],
        "sur": ["organizacion de sur", "organización de sur", "adtr"],
    }
    for _, words in groups.items():
        if any(w in ql for w in words) and any(w in p["searchable"] for w in words):
            score += 5
    return score

def get_project(pid):
    ps = scan()
    try:
        i = int(pid)
    except Exception:
        abort(404)
    if i < 0 or i >= len(ps):
        abort(404)
    return ps[i]

@app.get("/")
def home():
    if PUBLIC_MODE:
        return jsonify({"service": "wolskia-api", "ok": True})
    return render_template("index.html")

@app.get("/api/tools")
def tools():
    ps = scan()
    return jsonify({
        "tools": [{k: v for k, v in p.items() if k not in ("path", "root", "searchable")} for p in ps],
        "count": len(ps),
    })

@app.post("/api/search")
def search():
    q = str((request.json or {}).get("query", "")).strip()
    if not q:
        return jsonify({"message": "Escribí qué herramienta buscás.", "results": []})
    ps = scan()
    ranked = sorted([(match_score(q, p), p) for p in ps], key=lambda x: x[0], reverse=True)
    found = [p for score, p in ranked if score > 0][:8]
    return jsonify({
        "message": (
            f"Encontré {len(found)} posible(s) coincidencia(s)."
            if found
            else "No encontré una coincidencia clara. Probá con otra descripción o mirá el catálogo completo."
        ),
        "results": [{k: v for k, v in p.items() if k not in ("path", "root", "searchable")} for p in found],
    })

@app.get("/api/project/<pid>/download")
def download(pid):
    p = get_project(pid)
    folder = Path(p["path"])
    root = Path(p["root"])
    if not inside(folder, root):
        abort(403)
    mem = BytesIO()
    c = config()
    with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as z:
        for f in folder.rglob("*"):
            if not f.is_file() or not inside(f, folder):
                continue
            if any(x in c["exclude_dirs"] for x in f.relative_to(folder).parts):
                continue
            if f.suffix.lower() not in c["extensions"] and f.name not in ("README.md", "requirements.txt", "package.json"):
                continue
            try:
                z.write(f, arcname=Path(p["folder"]) / f.relative_to(folder))
            except OSError:
                pass
    mem.seek(0)
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", p["title"])
    return send_file(mem, mimetype="application/zip", as_attachment=True, download_name=f"{safe}.zip")

@app.post("/api/chat")
def chat():
    """Endpoint de chat: delega al servicio modular de IA."""
    if PUBLIC_MODE:
        abort(404)  # endpoint legacy de la UI vieja; online solo se usa /api/ai/chat
    from services.ai_service import chat as ai_chat

    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()
    history = data.get("history", [])

    projects = scan()
    result = ai_chat(message=message, history=history, projects=projects, client_ip=client_ip())
    return jsonify(result)

# ─── API de IA (consumida por WOLSKIA Studio) ──────────────────────────────

LOOPBACK = {"127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"}


def client_ip() -> str:
    """IP real del cliente. Detrás del proxy de Vite (xfwd) se toma la ÚLTIMA
    entrada de X-Forwarded-For, la que agregó el proxy y no se puede falsear."""
    if PUBLIC_MODE:
        # Ya validamos la clave de proxy: el frontend manda la IP real del visitante.
        real = request.headers.get("X-Wolskia-Client-IP", "").strip()
        return real[:64] or "unknown"
    xff = request.headers.get("X-Forwarded-For", "")
    if xff and request.remote_addr in LOOPBACK:
        return xff.split(",")[-1].strip()
    return request.remote_addr or "127.0.0.1"


def local_only(fn):
    """Los endpoints /api/ai/* gastan tu cuota y manejan tus claves:
    solo se atienden desde esta misma máquina (WOLSKIA_ALLOW_REMOTE=1 lo desactiva)."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not PUBLIC_MODE and os.getenv("WOLSKIA_ALLOW_REMOTE") != "1" and client_ip() not in LOOPBACK:
            return jsonify({"error": "forbidden", "message": "Solo se permite acceso desde esta computadora."}), 403
        return fn(*args, **kwargs)
    return wrapper


app.view_functions['sheets.process'] = local_only(app.view_functions['sheets.process'])

@app.post('/api/ai/sheets/chat')
@local_only
def spreadsheet_chat_endpoint():
    from services.spreadsheet_chat import process_chat
    return process_chat(client_ip())

@app.get("/api/ai/status")
@local_only
def ai_status():
    from services.ai_service import keys_status
    return jsonify(keys_status())


@app.post("/api/ai/keys")
def ai_set_keys():
    """Deshabilitado: las claves solo se configuran en el servidor (.env)."""
    return jsonify({
        "ok": False,
        "message": "Las claves API se configuran solo en el servidor (archivo .env). No se aceptan desde el navegador.",
    }), 403

@app.delete("/api/ai/keys")
def ai_clear_keys():
    return jsonify({
        "ok": False,
        "message": "Las claves se gestionan solo en el servidor (.env).",
    }), 403

@app.post("/api/ai/test-keys")
@local_only
def ai_test_keys():
    from services.ai_service import test_keys
    return jsonify({"results": test_keys()})


@app.post("/api/ai/chat")
@local_only
def ai_chat_endpoint():
    """Body: {"message", "history":[{role,content}], "provider":"auto|gemini|groq|xai",
              "user": "admin", "role": "admin|worker"}
    Respuesta: {reply, provider, status, actions:[...], space_changed:bool}"""
    from services.ai_service import chat as ai_chat
    data = request.get_json(silent=True) or {}
    from services import space_store as st
    from contextlib import nullcontext
    local = data.get("device_space")
    if local is not None and not isinstance(local, dict):
        return jsonify({"message": "Datos del dispositivo inválidos."}), 400
    try:
        with st.device_session(_public_user(str(data.get("user", "default"))), local) if local is not None else nullcontext():
            result = ai_chat(
                message=str(data.get("message", "")).strip(),
                history=data.get("history") if isinstance(data.get("history"), list) else [],
                projects=scan(),
                client_ip=client_ip(),
                prefer=str(data.get("provider", "auto")),
                user=_public_user(str(data.get("user", "default"))),
                role="worker" if PUBLIC_MODE else str(data.get("role", "worker")),
                workspace=workspace(),
            )
            if local is not None:
                result["device_space"] = st.list_all(str(data.get("user", "default")))
    except st.SpaceError as exc:
        return jsonify({"message": str(exc)}), 400
    return jsonify(result)


# ─── «Tu espacio»: Tareas / Notas / Eventos (la UI y la IA usan el mismo almacén) ──

SPACE_KINDS = {"tasks": "task", "notes": "note", "events": "event"}


def _public_user(user: str) -> str:
    """En modo público exige un identificador largo; si no, aborta con 400."""
    if PUBLIC_MODE:
        from services import space_store as st
        if len(st.clean_user(user)) < MIN_PUBLIC_USER_LEN or st.clean_user(user) == "default":
            resp = jsonify({"ok": False, "error": "bad_user", "message": "Identificador de usuario inválido."})
            resp.status_code = 400
            abort(resp)
    return user


def _space_user():
    return _public_user(request.args.get("user") or (request.get_json(silent=True) or {}).get("user") or "default")


def _space_err(exc):
    return jsonify({"ok": False, "message": str(exc)}), 400


@app.get("/api/space")
@local_only
def space_all():
    from services import space_store as st
    return jsonify(st.list_all(_space_user()))


@app.post("/api/space/import")
@local_only
def space_import():
    """Migra las listas viejas de localStorage (solo si el usuario no tiene datos)."""
    from services import space_store as st
    d = request.get_json(silent=True) or {}
    n = st.import_legacy(_space_user(), d.get("tasks") or [], d.get("notes") or [], d.get("events") or [])
    return jsonify({"ok": True, "imported": n, **st.list_all(_space_user())})


@app.post("/api/space/<col>")
@local_only
def space_add(col):
    from services import space_store as st
    if col not in SPACE_KINDS:
        abort(404)
    body = request.get_json(silent=True) or {}
    try:
        item = st.add(_space_user(), SPACE_KINDS[col], body)
    except st.SpaceError as exc:
        return _space_err(exc)
    return jsonify({"ok": True, "item": item}), 201


@app.patch("/api/space/<col>/<item_id>")
@local_only
def space_update(col, item_id):
    from services import space_store as st
    if col not in SPACE_KINDS:
        abort(404)
    body = {k: v for k, v in (request.get_json(silent=True) or {}).items() if k != "user"}
    try:
        item = st.update(_space_user(), SPACE_KINDS[col], item_id, body)
    except st.SpaceError as exc:
        return _space_err(exc)
    return jsonify({"ok": True, "item": item})


@app.delete("/api/space/<col>/<item_id>")
@local_only
def space_delete(col, item_id):
    from services import space_store as st
    if col not in SPACE_KINDS:
        abort(404)
    try:
        st.delete(_space_user(), SPACE_KINDS[col], item_id)
    except st.SpaceError as exc:
        return _space_err(exc)
    return jsonify({"ok": True})


@app.get("/api/health")
def health():
    from services.ai_service import get_providers
    from services.sheets import MAX_CELLS, MAX_COLUMNS
    providers = get_providers()
    return jsonify({
        "ok": True,
        "ai_configured": len(providers) > 0,
        "providers": [p.name for p in providers],
        "tools": len(scan()),
        "release": "excel-empresa-20261026",
        "spreadsheet_limits": {"cells": MAX_CELLS, "columns": MAX_COLUMNS, "sheets": 256, "actions": 200},
    })

if __name__ == "__main__":
    # En local escucha solo en 127.0.0.1. Online se usa gunicorn (ver render.yaml).
    app.run(host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "5050")), debug=False)
