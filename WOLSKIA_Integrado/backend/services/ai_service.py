"""
WOLSKIA AI Service — asistente profesional de máximo nivel (costo cero).

Arquitectura:
- Gemini (principal) + Groq (fallback) vía variables de entorno
- Clasificación ligera de intención
- Búsqueda web gratuita (dólar, clima, noticias, Wikipedia)
- Conocimiento de herramientas desde el catálogo + README locales
- Historial acotado + resumen cuando crece
- Rate limits locales, validación, manejo de errores
- AGENTE con function calling: gestiona «Tu espacio» (tareas, notas, eventos) y
  lee / modifica / crea archivos dentro de un sandbox (ver services/agent*.py)
"""
from __future__ import annotations

import os
import re
import time
import logging
import urllib.parse
from collections import defaultdict
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

import requests

from . import agent as agent_mod
from . import agent_tools as agent_tools
from . import file_tools as file_tools
from . import space_store as space_store
from .intents import analyze as analyze_intent
from .prompts import build_system_prompt as _build_prompt

logger = logging.getLogger("wolskia.ai")

MAX_MSG_CHARS = 12000
MAX_HISTORY_TURNS = 16
MAX_HISTORY_CHARS_PER_MSG = 4500
LOCAL_RPM_PER_IP = 30
LOCAL_RPD_PER_IP = 300

# Modelos Gemini a intentar en orden (el primero del .env tiene prioridad)
GEMINI_FALLBACK_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-2.5-flash-lite",
]

_rpm_bucket: dict[str, list[float]] = defaultdict(list)
_rpd_bucket: dict[str, list[float]] = defaultdict(list)
UA = {"User-Agent": "WOLSKIA/1.0 (local AI assistant; +https://localhost)"}

# ─── Claves en tiempo de ejecución ─────────────────────────────────────────
# Se cargan desde la UI (POST /api/ai/keys) y viven SOLO en la memoria del
# proceso: nunca se escriben a disco ni se registran en logs. Si no hay clave
# cargada desde la UI, se usa la del .env (comportamiento original).
RUNTIME_KEYS: dict[str, str] = {"gemini": "", "groq": "", "xai": ""}
ENV_NAMES = {"gemini": "GEMINI_API_KEY", "groq": "GROQ_API_KEY", "xai": "XAI_API_KEY"}
LABELS = {"gemini": "Gemini", "groq": "Groq", "xai": "Grok (xAI)"}
_KEY_RE = re.compile(r"^[A-Za-z0-9._\-]{8,300}$")


def _key(name: str) -> str:
    return RUNTIME_KEYS.get(name, "") or os.getenv(ENV_NAMES[name], "").strip()


def _key_source(name: str) -> str:
    if RUNTIME_KEYS.get(name):
        return "ui"
    return "env" if os.getenv(ENV_NAMES[name], "").strip() else "none"


def mask_key(key: str) -> str:
    if not key:
        return ""
    return key[:4] + "…" + key[-4:] if len(key) > 12 else "••••"


def clean_key(raw: Any) -> str:
    """Normaliza una clave pegada por el usuario (espacios, comillas)."""
    return str(raw or "").strip().strip("\"'` ")


def detect_grok_provider(key: str) -> str:
    """Las claves de xAI empiezan con 'xai-'; las de Groq con 'gsk_'."""
    return "xai" if key.startswith("xai-") else "groq"


def set_runtime_keys(gemini: Any = None, grok: Any = None) -> dict[str, str]:
    """None = no tocar; '' = borrar; otro valor = guardar. Devuelve errores."""
    errors: dict[str, str] = {}
    if gemini is not None:
        k = clean_key(gemini)
        if k and not _KEY_RE.match(k):
            errors["gemini"] = "La clave de Gemini tiene un formato inválido."
        else:
            RUNTIME_KEYS["gemini"] = k
    if grok is not None:
        k = clean_key(grok)
        if k and not _KEY_RE.match(k):
            errors["grok"] = "La clave de Grok/Groq tiene un formato inválido."
        else:
            RUNTIME_KEYS["groq"] = ""
            RUNTIME_KEYS["xai"] = ""
            if k:
                RUNTIME_KEYS[detect_grok_provider(k)] = k
    return errors


def clear_runtime_keys() -> None:
    for name in RUNTIME_KEYS:
        RUNTIME_KEYS[name] = ""


def keys_status() -> dict[str, Any]:
    providers = []
    for name in ("gemini", "groq", "xai"):
        k = _key(name)
        providers.append({
            "id": name,
            "label": LABELS[name],
            "configured": bool(k),
            "source": _key_source(name),
            "masked": mask_key(k),
        })
    return {"providers": providers, "configured": any(p["configured"] for p in providers)}


def test_keys() -> dict[str, Any]:
    """Valida cada clave cargada listando modelos (no consume cuota de generación)."""
    checks = {
        "gemini": ("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
                   lambda k: {"x-goog-api-key": k}),
        "groq": ("https://api.groq.com/openai/v1/models",
                 lambda k: {"Authorization": f"Bearer {k}"}),
        "xai": ("https://api.x.ai/v1/models",
                lambda k: {"Authorization": f"Bearer {k}"}),
    }
    out: dict[str, Any] = {}
    for name, (url, hdr) in checks.items():
        k = _key(name)
        if not k:
            continue
        try:
            r = requests.get(url, headers={**UA, **hdr(k)}, timeout=15)
            if r.ok:
                out[name] = {"ok": True, "status": "ok", "message": "Clave válida."}
            elif r.status_code in (400, 401, 403):
                out[name] = {"ok": False, "status": "invalid",
                             "message": f"Clave rechazada por {LABELS[name]} (HTTP {r.status_code})."}
            elif r.status_code == 429:
                out[name] = {"ok": True, "status": "rate_limit",
                             "message": "Clave válida, pero el proveedor está limitando peticiones."}
            else:
                out[name] = {"ok": False, "status": "error",
                             "message": f"{LABELS[name]} respondió HTTP {r.status_code}."}
        except requests.RequestException:
            out[name] = {"ok": False, "status": "network",
                         "message": f"No se pudo contactar a {LABELS[name]} (¿sin internet?)."}
    return out


def _clean_bucket(bucket: list[float], window_sec: float) -> list[float]:
    now = time.time()
    return [t for t in bucket if now - t < window_sec]


_global_day: list[float] = []
GLOBAL_RPD = int(os.getenv("WOLSKIA_GLOBAL_DAILY_LIMIT", "0") or 0)  # 0 = sin tope global


def check_local_rate_limit(client_ip: str) -> tuple[bool, str]:
    now = time.time()
    if GLOBAL_RPD > 0:
        # Tope global diario: protege tus claves/cuota de IA aunque alguien rote de IP.
        _global_day[:] = _clean_bucket(_global_day, 86400.0)
        if len(_global_day) >= GLOBAL_RPD:
            return False, "Wolskia alcanzó su límite diario de consultas. Volvé a intentar mañana."
    times = _clean_bucket(_rpm_bucket[client_ip], 60.0)
    if len(times) >= LOCAL_RPM_PER_IP:
        return False, "Límite local por minuto alcanzado. Esperá un momento e intentá de nuevo."
    day = _clean_bucket(_rpd_bucket[client_ip], 86400.0)
    if len(day) >= LOCAL_RPD_PER_IP:
        return False, "Límite diario de esta instancia alcanzado. El catálogo de Herramientas sigue disponible."
    times.append(now)
    day.append(now)
    if GLOBAL_RPD > 0:
        _global_day.append(now)
    _rpm_bucket[client_ip] = times
    _rpd_bucket[client_ip] = day
    return True, ""


# ─── Intención ─────────────────────────────────────────────────────────────

INTENT_TOOL = "tool"
INTENT_LIVE = "live"
INTENT_CODE = "code"
INTENT_REASON = "reason"
INTENT_GENERAL = "general"
INTENT_SPACE = "space"   # Tareas / Notas / Eventos
INTENT_FILE = "file"     # leer / modificar / crear archivos


def classify_intent(message: str) -> str:
    m = (message or "").lower()
    ia = analyze_intent(message)
    if ia.space in ("mutate", "read", "maybe"):
        return INTENT_SPACE
    if ia.files:
        return INTENT_FILE
    if any(k in m for k in (
        "herramienta", "turnero", "encuesta", "certificado", "descargar zip",
        "catálogo", "catalogo", "proyecto local", "mis herramientas",
    )):
        return INTENT_TOOL
    if any(k in m for k in (
        "dolar", "dólar", "clima", "tiempo", "temperatura", "partido", "juega",
        "noticia", "cotizacion", "cotización", "hoy", "mañana", "fixture",
        "resultado", "lluvia", "blue", "horario del",
    )):
        return INTENT_LIVE
    if any(k in m for k in (
        "código", "codigo", "python", "javascript", "html", "css", "sql",
        "función", "funcion", "bug", "error", "debug", "script", "api",
        "programa", "algoritmo", "regex", "json", "flask",
    )):
        return INTENT_CODE
    if any(k in m for k in (
        "por qué", "porque", "explicá", "explica", "compará", "compara",
        "analizá", "analiza", "paso a paso", "cómo funciona", "como funciona",
        "ventajas", "desventajas", "diferencia entre",
    )):
        return INTENT_REASON
    return INTENT_GENERAL


# ─── Búsqueda web ──────────────────────────────────────────────────────────

def free_web_search(query: str, max_results: int = 10) -> str:
    results: list[str] = []
    qlow = (query or "").lower()

    def _clean(s: str) -> str:
        s = re.sub(r"<[^>]+>", "", s or "")
        return re.sub(r"\s+", " ", s).strip()

    if any(k in qlow for k in ("dolar", "dólar", "dollar", "blue", "cotizacion", "cotización", "cambio", "mep", "ccl")):
        try:
            r = requests.get("https://dolarapi.com/v1/dolares", headers=UA, timeout=10)
            if r.ok:
                lines = ["Cotizaciones del dólar en Argentina (tiempo real):"]
                for item in r.json():
                    casa = item.get("nombre") or item.get("casa") or "?"
                    lines.append(
                        f"  • {casa}: compra ${item.get('compra')} / venta ${item.get('venta')} "
                        f"(act. {(item.get('fechaActualizacion') or '')[:16]})"
                    )
                results.append("\n".join(lines))
        except Exception as exc:
            logger.warning("dolarapi: %s", exc)

    if any(k in qlow for k in ("clima", "tiempo", "temperatura", "lluvia", "pronostico", "pronóstico", "grados", "viento")):
        try:
            lugar = "Buenos Aires"
            lugar_q = re.sub(
                r"\b(clima|tiempo|temperatura|lluvia|pron[oó]stico|grados|viento|hace|hoy|mañana|"
                r"en|de|el|la|los|las|qué|que|cómo|como|está|esta|hay|me|decis|decís)\b",
                " ", qlow, flags=re.I,
            )
            lugar_q = re.sub(r"\s+", " ", lugar_q).strip(" ?¿¡!,.")
            if len(lugar_q) >= 3:
                lugar = lugar_q
            if "argentina" not in lugar.lower():
                lugar = lugar + ", Argentina"
            r = requests.get(
                f"https://wttr.in/{urllib.parse.quote(lugar)}?format=j1&lang=es",
                headers=UA, timeout=12,
            )
            if r.ok:
                j = r.json()
                cur = j["current_condition"][0]
                area = j["nearest_area"][0]["areaName"][0]["value"]
                region = j["nearest_area"][0].get("region", [{}])[0].get("value", "")
                desc = ""
                if cur.get("lang_es"):
                    desc = cur["lang_es"][0].get("value", "")
                elif cur.get("weatherDesc"):
                    desc = cur["weatherDesc"][0].get("value", "")
                lines = [
                    f"Clima actual en {area}" + (f", {region}" if region else "") + ":",
                    f"  • {desc}, {cur.get('temp_C')}°C (sensación {cur.get('FeelsLikeC')}°C), "
                    f"humedad {cur.get('humidity')}%, viento {cur.get('windspeedKmph')} km/h",
                ]
                for i, day in enumerate(j.get("weather", [])[:3]):
                    label = ("Hoy", "Mañana", "Pasado")[i]
                    lines.append(f"  • {label}: máx {day.get('maxtempC')}°C / mín {day.get('mintempC')}°C")
                results.append("\n".join(lines))
        except Exception as exc:
            logger.warning("wttr.in: %s", exc)

    try:
        url = (
            "https://news.google.com/rss/search?q="
            + urllib.parse.quote(query[:160])
            + "&hl=es-419&gl=AR&ceid=AR:es-419"
        )
        r = requests.get(url, headers=UA, timeout=12)
        if r.ok:
            root = ET.fromstring(r.content)
            for item in root.findall(".//item")[:max_results]:
                title = _clean(item.findtext("title") or "")
                pub = _clean(item.findtext("pubDate") or "")
                if title:
                    results.append(title + (f" ({pub[:16]})" if pub else ""))
    except Exception as exc:
        logger.warning("News RSS: %s", exc)

    try:
        r = requests.get(
            "https://es.wikipedia.org/w/api.php?action=opensearch&search="
            + urllib.parse.quote(query[:120]) + "&limit=2&format=json",
            headers=UA, timeout=8,
        )
        if r.ok:
            data = r.json()
            titles = data[1] if len(data) > 1 else []
            if titles:
                tq = urllib.parse.quote(titles[0].replace(" ", "_"))
                r2 = requests.get(
                    f"https://es.wikipedia.org/api/rest_v1/page/summary/{tq}",
                    headers=UA, timeout=8,
                )
                if r2.ok:
                    extract = (r2.json().get("extract") or "")[:500]
                    if extract:
                        results.append(f"Wikipedia — {titles[0]}: {extract}")
    except Exception as exc:
        logger.warning("Wikipedia: %s", exc)

    clean, seen = [], set()
    for item in results:
        item = item.strip()
        key = item[:55].lower()
        if item and key not in seen:
            seen.add(key)
            clean.append(item)
        if len(clean) >= max_results + 3:
            break
    return "\n".join(f"- {c}" for c in clean) if clean else ""


def looks_like_needs_web(message: str) -> bool:
    if classify_intent(message) in (INTENT_SPACE, INTENT_FILE):
        return False  # «agregá una tarea para mañana» no necesita internet
    return classify_intent(message) == INTENT_LIVE or any(
        k in (message or "").lower()
        for k in (
            "hoy", "mañana", "actual", "última", "ultima", "precio", "vale",
            "quién ganó", "quien gano", "qué pasó", "que paso",
        )
    )


# ─── Conocimiento de proyectos (RAG liviano) ───────────────────────────────

def _read_tool_docs(project: dict, max_chars: int = 1200) -> str:
    """Lee README / .txt / .md del proyecto para enriquecer el conocimiento."""
    path = project.get("path")
    if not path:
        return ""
    root = Path(path)
    if not root.is_dir():
        return ""
    chunks = []
    candidates = []
    for name in ("README.md", "README.txt", "readme.md", "INSTRUCCIONES.txt", "docs.md"):
        p = root / name
        if p.is_file():
            candidates.append(p)
    for p in root.glob("*.txt"):
        if p not in candidates and p.stat().st_size < 50_000:
            candidates.append(p)
    for p in candidates[:3]:
        try:
            text = p.read_text(encoding="utf-8", errors="ignore").strip()
            if text:
                chunks.append(f"[{p.name}]\n{text[:max_chars]}")
        except OSError:
            continue
    return "\n\n".join(chunks)


def build_tools_knowledge(projects: list[dict], focus_query: str = "") -> str:
    if not projects:
        return (
            "No hay herramientas en el catálogo. "
            "El usuario puede agregar rutas en config.json y reiniciar."
        )
    # Ranking simple si hay query
    ranked = projects
    if focus_query:
        q = focus_query.lower()
        terms = [t for t in re.findall(r"[a-záéíóúñ0-9]+", q) if len(t) > 2]
        scored = []
        for p in projects:
            blob = (p.get("searchable") or p.get("title", "") + " " + p.get("folder", "")).lower()
            score = sum(3 if t in (p.get("title") or "").lower() else 1 for t in terms if t in blob)
            scored.append((score, p))
        scored.sort(key=lambda x: x[0], reverse=True)
        ranked = [p for s, p in scored if s > 0][:8] or projects[:8]
    else:
        ranked = projects[:20]

    lines = [f"Catálogo WOLSKIA ({len(projects)} herramienta(s)). Resumen relevante:", ""]
    for p in ranked[:12]:
        title = p.get("title", "Sin título")
        folder = p.get("folder", "")
        count = p.get("count", 0)
        files = p.get("files", [])[:8]
        lines.append(f"• **{title}** — carpeta «{folder}», {count} archivos")
        if files:
            lines.append(f"  Archivos: {', '.join(files)}")
        docs = _read_tool_docs(p)
        if docs:
            lines.append(f"  Documentación:\n{docs[:800]}")
    lines.append("")
    lines.append(
        "Reglas: usá solo esta información para describir herramientas. "
        "Orientá a la pestaña Herramientas para buscar/descargar ZIP. "
        "Solo afirmá que creaste o modificaste archivos si una herramienta de archivos lo confirmó."
    )
    return "\n".join(lines)


def summarize_history(history: list[dict], max_chars: int = 900) -> str:
    """Resumen extractivo simple del historial antiguo para no perder contexto."""
    if len(history) < 8:
        return ""
    old = history[:-6]
    bits = []
    for item in old:
        role = "Usuario" if item.get("role") == "user" else "WOLSKIA"
        content = str(item.get("content", ""))[:180].replace("\n", " ")
        if content:
            bits.append(f"{role}: {content}")
    text = " | ".join(bits)
    return text[:max_chars]


def build_system_prompt(tools_knowledge: str, intent: str, **ctx: Any) -> str:
    """Compatibilidad: el prompt real vive en services/prompts.py."""
    return _build_prompt(tools_knowledge, intent, **ctx)


# ─── Proveedores ───────────────────────────────────────────────────────────

class BaseProvider:
    id = "base"
    name = "base"

    def generate(self, message: str, history: list[dict], system: str) -> tuple[str | None, str]:
        raise NotImplementedError


class GeminiProvider(BaseProvider):
    id = "gemini"
    name = "Gemini"

    def __init__(self):
        self.key = _key("gemini")
        preferred = os.getenv("GEMINI_MODEL", "").strip()
        models = []
        if preferred:
            models.append(preferred)
        for m in GEMINI_FALLBACK_MODELS:
            if m not in models:
                models.append(m)
        self.models = models

    def is_configured(self) -> bool:
        return bool(self.key)

    def generate(self, message: str, history: list[dict], system: str) -> tuple[str | None, str]:
        if not self.key:
            return None, "no_key"

        contents = []
        for item in history[-MAX_HISTORY_TURNS:]:
            role = "model" if item.get("role") == "assistant" else "user"
            txt = str(item.get("content", ""))[:MAX_HISTORY_CHARS_PER_MSG]
            if txt:
                contents.append({"role": role, "parts": [{"text": txt}]})
        contents.append({"role": "user", "parts": [{"text": message[:MAX_MSG_CHARS]}]})

        headers = {"Content-Type": "application/json", "x-goog-api-key": self.key}
        base_payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": {
                "temperature": 0.5,
                "maxOutputTokens": 4096,
                "topP": 0.95,
            },
        }

        def _extract(data: dict) -> str | None:
            candidates = data.get("candidates") or []
            if not candidates:
                return None
            parts = candidates[0].get("content", {}).get("parts") or []
            bits = [p.get("text", "") for p in parts if p.get("text")]
            return "\n".join(bits).strip() or None

        last_status = "error"
        for model in self.models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            try:
                # Con grounding
                payload = {**base_payload, "tools": [{"google_search": {}}]}
                resp = requests.post(url, json=payload, headers=headers, timeout=60)
                if not resp.ok:
                    resp = requests.post(url, json=base_payload, headers=headers, timeout=55)

                if resp.status_code == 429:
                    last_status = "rate_limit"
                    continue
                if resp.status_code == 503:
                    last_status = "error:503"
                    continue
                if resp.status_code == 400 and "api key not valid" in resp.text.lower():
                    return None, "error:401"  # Gemini responde 400 (no 401) a claves inválidas
                if resp.status_code in (400, 404):
                    logger.warning("Gemini model %s HTTP %s", model, resp.status_code)
                    last_status = f"error:{resp.status_code}"
                    continue
                if resp.status_code in (401, 403):
                    return None, f"error:{resp.status_code}"
                if not resp.ok:
                    last_status = f"error:{resp.status_code}"
                    continue

                text = _extract(resp.json())
                if text:
                    self.name = f"Gemini/{model}"
                    return text, "ok"
                last_status = "error"
            except requests.Timeout:
                last_status = "error"
            except Exception as exc:
                logger.exception("Gemini %s: %s", model, exc)
                last_status = "error"
        return None, last_status


class OpenAICompatProvider(BaseProvider):
    """Base para APIs estilo OpenAI (Groq, xAI)."""
    url = ""
    key_name = ""

    def __init__(self):
        self.key = _key(self.key_name)
        self.models: list[str] = []

    def is_configured(self) -> bool:
        return bool(self.key)

    def generate(self, message: str, history: list[dict], system: str) -> tuple[str | None, str]:
        if not self.key:
            return None, "no_key"
        messages = [{"role": "system", "content": system}]
        for item in history[-MAX_HISTORY_TURNS:]:
            role = "assistant" if item.get("role") == "assistant" else "user"
            txt = str(item.get("content", ""))[:MAX_HISTORY_CHARS_PER_MSG]
            if txt:
                messages.append({"role": role, "content": txt})
        messages.append({"role": "user", "content": message[:MAX_MSG_CHARS]})

        last_status = "error"
        for model in self.models:
            try:
                resp = requests.post(
                    self.url,
                    headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
                    json={"model": model, "messages": messages, "temperature": 0.5, "max_tokens": 4096},
                    timeout=60,
                )
                if resp.status_code == 429:
                    return None, "rate_limit"
                if resp.status_code in (401, 403):
                    return None, f"error:{resp.status_code}"
                if resp.status_code in (400, 404):
                    last_status = f"error:{resp.status_code}"
                    continue  # modelo no disponible → probar el siguiente
                if not resp.ok:
                    last_status = f"error:{resp.status_code}"
                    continue
                choices = resp.json().get("choices") or []
                text = ((choices[0].get("message") or {}).get("content") or "").strip() if choices else ""
                if text:
                    self.name = f"{LABELS[self.id]}/{model}"
                    return text, "ok"
                last_status = "error"
            except Exception as exc:
                logger.exception("%s: %s", self.id, exc)
                last_status = "error"
        return None, last_status


class GroqProvider(OpenAICompatProvider):
    id = "groq"
    name = "Groq"
    key_name = "groq"
    url = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self):
        super().__init__()
        self.models = [os.getenv("GROQ_MODEL", "").strip() or "openai/gpt-oss-20b"]


class XAIProvider(OpenAICompatProvider):
    id = "xai"
    name = "Grok (xAI)"
    key_name = "xai"
    url = "https://api.x.ai/v1/chat/completions"

    def __init__(self):
        super().__init__()
        preferred = os.getenv("XAI_MODEL", "").strip()
        self.models = [m for m in (preferred, "grok-4", "grok-3", "grok-3-mini") if m]
        self.models = list(dict.fromkeys(self.models))


def get_providers(prefer: str = "auto") -> list[BaseProvider]:
    """Proveedores configurados, en orden de prioridad. prefer filtra por id."""
    out: list[BaseProvider] = []
    for cls in (GeminiProvider, GroqProvider, XAIProvider):
        p = cls()
        if p.is_configured() and (prefer in ("auto", "", None) or p.id == prefer):
            out.append(p)
    return out


# ─── API principal ─────────────────────────────────────────────────────────

def get_adapter(provider: BaseProvider):
    """Adaptador de function calling para cada proveedor."""
    if isinstance(provider, GeminiProvider):
        return agent_mod.GeminiAdapter(provider.key, provider.models)
    return agent_mod.OpenAIAdapter(provider.id, provider.url, provider.key, provider.models)


def _can_write_files(role: str) -> bool:
    """Solo administración escribe archivos (WOLSKIA_WORKERS_CAN_WRITE=1 lo abre a todos).
    En modo público (WOLSKIA_PUBLIC_MODE=1) nadie puede escribir archivos en el servidor."""
    if os.getenv("WOLSKIA_PUBLIC_MODE") == "1":
        return False
    return role == "admin" or os.getenv("WOLSKIA_WORKERS_CAN_WRITE") == "1"


def _file_context(workspace: dict | None, can_write: bool) -> file_tools.FileContext:
    ws = workspace or {}
    return file_tools.FileContext(
        roots=[Path(r) for r in ws.get("roots", [])],
        exclude_dirs=set(ws.get("exclude_dirs") or file_tools.DENY_DIRS),
        protected=[Path(p) for p in ws.get("protected", [])],
        can_write=can_write,
    )


def chat(
    message: str,
    history: list[dict] | None,
    projects: list[dict],
    client_ip: str = "127.0.0.1",
    prefer: str = "auto",
    user: str = "default",
    role: str = "worker",
    workspace: dict | None = None,
    use_tools: bool = True,
) -> dict[str, Any]:
    message = (message or "").strip()
    if not message:
        return {"reply": "Escribime qué necesitás y lo vemos.", "provider": "local", "status": "ok"}
    if len(message) > MAX_MSG_CHARS:
        return {
            "reply": f"Mensaje demasiado largo (máx. {MAX_MSG_CHARS} caracteres).",
            "provider": "local",
            "status": "validation",
        }

    ok, err = check_local_rate_limit(client_ip)
    if not ok:
        return {"reply": err, "provider": "local", "status": "rate_limit"}

    clean_history: list[dict] = []
    for item in history or []:
        if not isinstance(item, dict):
            continue
        r = item.get("role")
        content = str(item.get("content", ""))[:MAX_HISTORY_CHARS_PER_MSG]
        if r in ("user", "assistant") and content:
            clean_history.append({"role": r, "content": content})

    user = space_store.clean_user(user)
    role = role if role in ("admin", "worker") else "worker"
    can_write = _can_write_files(role)
    ia = analyze_intent(message)
    intent = classify_intent(message)

    tool_ctx = agent_tools.ToolContext(user=user, files=_file_context(workspace, can_write), can_write_files=can_write)
    tools = agent_tools.tool_definitions(allow_file_writes=can_write) if use_tools else []

    tools_knowledge = build_tools_knowledge(
        projects,
        focus_query=message if intent == INTENT_TOOL else "",
    )
    system = build_system_prompt(
        tools_knowledge, intent,
        user=user, role=role, can_write_files=can_write,
        space_snapshot=space_store.snapshot_for_prompt(user) if use_tools else "",
        file_roots=list(tool_ctx.files.labels().keys()),
    )

    # Resumen de historial largo inyectado al system
    summary = summarize_history(clean_history)
    if summary:
        system += f"\n\n## Resumen de mensajes anteriores\n{summary}\n"

    enriched = message
    if looks_like_needs_web(message) or intent == INTENT_LIVE:
        web = free_web_search(message)
        if web:
            enriched = (
                f"{message}\n\n==========\n"
                "Datos actualizados de internet (USÁ ESTA INFORMACIÓN; "
                "no digas que no tenés acceso a internet):\n"
                f"{web}\n==========\n"
                "Respondé con datos concretos cuando apliquen."
            )
            logger.info("Web search (%d chars) intent=%s", len(web), intent)

    prefer = prefer if prefer in ("auto", "gemini", "groq", "xai") else "auto"
    providers = get_providers(prefer)
    if not providers:
        if prefer != "auto":
            reply = f"No hay clave cargada para {LABELS[prefer]}. Configurala en el servidor (.env)."
        else:
            reply = (
                "No hay modelo de IA configurado. "
                "Configurá GEMINI_API_KEY (o GROQ_API_KEY / XAI_API_KEY) en backend/.env y reiniciá."
            )
        return {"reply": reply, "provider": "local", "status": "no_key"}

    # Qué herramientas se fuerzan en la primera vuelta (solo acciones claras de escritura)
    force_first, force_names = False, None
    guard_names: list[str] | None = None
    if use_tools and ia.force_space:
        force_first, force_names = True, agent_tools.space_mutators()
        guard_names = force_names
    elif use_tools and ia.force_files and can_write:
        force_first, force_names = True, ["files_list", "file_read", "file_create", "file_edit"]
        guard_names = ["file_create", "file_edit"]
    guard = use_tools and (ia.force_space or (ia.force_files and can_write))

    last_status = "error"
    for provider in providers:
        result = agent_mod.run_agent(
            get_adapter(provider),
            system=system, history=clean_history, message=enriched,
            tool_ctx=tool_ctx, tools=tools,
            force_first=force_first, force_tool_names=force_names,
            guard_claims=guard, guard_tool_names=guard_names,
            limits=(MAX_HISTORY_TURNS, MAX_HISTORY_CHARS_PER_MSG, MAX_MSG_CHARS),
        )
        last_status = result.status
        if result.status == "ok" and result.reply:
            if result.model:
                provider.name = f"{LABELS[provider.id]}/{result.model}"
            return {
                "reply": result.reply,
                "provider": provider.name,
                "provider_id": provider.id,
                "status": "ok",
                "intent": intent,
                "actions": result.actions,
                "space_changed": any(
                    a.get("domain") == "space" and a.get("ok") and a.get("op") in ("add", "update", "delete")
                    for a in result.actions),
            }
        if result.actions:  # hubo cambios reales aunque el proveedor falló después: no reintentar con otro
            break

    detail = ""
    if last_status and last_status.startswith("error:"):
        code = last_status.split(":", 1)[1]
        tips = {
            "400": " Modelo no disponible o petición inválida. Revisá GEMINI_MODEL / GROQ_MODEL / XAI_MODEL.",
            "404": " Modelo no disponible. Revisá GEMINI_MODEL / GROQ_MODEL / XAI_MODEL.",
            "401": " Clave rechazada. Regenerá la API key en el panel del proveedor.",
            "403": " Clave rechazada. Regenerá la API key en el panel del proveedor.",
            "503": " Modelo saturado. Reintentá en unos minutos.",
        }
        detail = tips.get(code, f" (HTTP {code})")

    if last_status == "rate_limit":
        return {
            "reply": "Límite gratuito del proveedor alcanzado. Probá más tarde. El catálogo sigue disponible.",
            "provider": "local",
            "status": "rate_limit",
        }

    return {
        "reply": "No pude obtener respuesta del proveedor." + detail,
        "provider": "local",
        "status": "error",
    }
