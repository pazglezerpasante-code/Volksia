"""
Motor del agente: bucle de function calling con Gemini y APIs estilo OpenAI (Groq/xAI).

Flujo por mensaje:
  1. Primera vuelta: si la intención es una acción clara sobre Tu espacio/archivos
     se FUERZA la llamada a herramienta (Gemini mode=ANY, OpenAI tool_choice=required).
  2. Se ejecutan las herramientas en el servidor y se devuelven los resultados al modelo.
  3. El modelo redacta la confirmación. Máx. MAX_ROUNDS vueltas.
  4. Red de seguridad: si el modelo afirma haber hecho algo sin llamar a ninguna
     herramienta, se reintenta una vez forzando la llamada; si sigue sin hacerlo,
     se descarta la afirmación falsa.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

import requests

from . import agent_tools as T

logger = logging.getLogger("wolskia.agent")

MAX_ROUNDS = 6
MAX_CALLS_PER_TURN = 8
TIMEOUT = 60

CLAIM_RE = re.compile(
    r"(\b(agregu[eé]|a[ñn]ad[ií]|anot[eé]|cre[eé]|elimin[eé]|borr[eé]|quit[eé]|modifiqu[eé]|actualic[eé]|"
    r"edit[eé]|guard[eé]|marqu[eé]|reprogram[eé]|mov[ií]|ya (?:est[aá]|qued[oó]))\b)", re.I)

NO_ACTION_REPLY = ("No pude ejecutar esa acción (no se llamó a la herramienta correspondiente), "
                   "así que no se modificó nada. ¿Me lo repetís con un poco más de detalle?")


@dataclass
class Call:
    id: str
    name: str
    args: Any


@dataclass
class Turn:
    raw: Any                      # mensaje nativo del proveedor, para reenviarlo tal cual
    text: str
    calls: list[Call] = field(default_factory=list)


@dataclass
class AgentResult:
    reply: str | None
    status: str
    actions: list[dict[str, Any]]
    model: str = ""


# ─── Adaptador Gemini ──────────────────────────────────────────────────────

class GeminiAdapter:
    id = "gemini"

    def __init__(self, key: str, models: list[str]):
        self.key, self.models, self.model = key, list(models), ""

    def new_conversation(self, history: list[dict], message: str, hist_turns: int, hist_chars: int, msg_chars: int):
        contents = []
        for it in history[-hist_turns:]:
            role = "model" if it.get("role") == "assistant" else "user"
            txt = str(it.get("content", ""))[:hist_chars]
            if txt:
                contents.append({"role": role, "parts": [{"text": txt}]})
        contents.append({"role": "user", "parts": [{"text": message[:msg_chars]}]})
        return contents

    def step(self, conv: list, system: str, tools: list[T.Tool], mode: str) -> tuple[str, Turn | None]:
        headers = {"Content-Type": "application/json", "x-goog-api-key": self.key}
        payload: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": conv,
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 4096, "topP": 0.95},
        }
        if tools and mode != "none":
            payload["tools"] = T.to_gemini(tools)
            payload["toolConfig"] = {"functionCallingConfig": {"mode": "ANY" if mode == "force" else "AUTO"}}
        models = [self.model] if self.model else self.models
        last = "error"
        for model in models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            try:
                resp = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
                if resp.status_code == 400 and mode == "force" and "api key not valid" not in resp.text.lower():
                    # algunos modelos no admiten mode=ANY → reintento en AUTO
                    p2 = {**payload, "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}}}
                    resp = requests.post(url, json=p2, headers=headers, timeout=TIMEOUT)
                if resp.status_code == 429:
                    last = "rate_limit"; continue
                if resp.status_code == 400 and "api key not valid" in resp.text.lower():
                    return "error:401", None
                if resp.status_code in (401, 403):
                    return f"error:{resp.status_code}", None
                if resp.status_code in (400, 404):
                    logger.warning("Gemini %s HTTP %s", model, resp.status_code)
                    last = f"error:{resp.status_code}"; continue
                if not resp.ok:
                    last = f"error:{resp.status_code}"; continue
                cands = resp.json().get("candidates") or []
                content = (cands[0].get("content") if cands else None) or {}
                parts = content.get("parts") or []
                if not parts:
                    last = "error"; continue
                text = "\n".join(p.get("text", "") for p in parts if p.get("text") and not p.get("thought")).strip()
                calls = [Call(id=p["functionCall"].get("id") or f"call_{i}", name=p["functionCall"].get("name", ""),
                              args=p["functionCall"].get("args") or {})
                         for i, p in enumerate(parts) if p.get("functionCall")]
                self.model = model
                return "ok", Turn(raw={"role": "model", "parts": parts}, text=text, calls=calls)
            except requests.Timeout:
                last = "error"
            except Exception as exc:  # noqa: BLE001
                logger.exception("Gemini %s: %s", model, exc)
                last = "error"
        return last, None

    def add_turn(self, conv: list, turn: Turn, results: list[tuple[Call, dict]]) -> None:
        conv.append(turn.raw)
        conv.append({"role": "user", "parts": [
            {"functionResponse": {"name": c.name, "response": res}} for c, res in results]})


# ─── Adaptador OpenAI-compatible (Groq, xAI) ───────────────────────────────

class OpenAIAdapter:
    def __init__(self, provider_id: str, url: str, key: str, models: list[str]):
        self.id, self.url, self.key, self.models, self.model = provider_id, url, key, list(models), ""

    def new_conversation(self, history: list[dict], message: str, hist_turns: int, hist_chars: int, msg_chars: int):
        msgs: list[dict] = []
        for it in history[-hist_turns:]:
            role = "assistant" if it.get("role") == "assistant" else "user"
            txt = str(it.get("content", ""))[:hist_chars]
            if txt:
                msgs.append({"role": role, "content": txt})
        msgs.append({"role": "user", "content": message[:msg_chars]})
        return msgs

    def step(self, conv: list, system: str, tools: list[T.Tool], mode: str) -> tuple[str, Turn | None]:
        body: dict[str, Any] = {"messages": [{"role": "system", "content": system}, *conv],
                                "temperature": 0.4, "max_tokens": 4096}
        if tools and mode != "none":
            body["tools"] = T.to_openai(tools)
            body["tool_choice"] = "required" if mode == "force" else "auto"
        models = [self.model] if self.model else self.models
        hdr = {"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        last = "error"
        for model in models:
            try:
                resp = requests.post(self.url, headers=hdr, json={**body, "model": model}, timeout=TIMEOUT)
                if resp.status_code == 400 and mode == "force":
                    b2 = {**body, "tool_choice": "auto", "model": model}
                    resp = requests.post(self.url, headers=hdr, json=b2, timeout=TIMEOUT)
                if resp.status_code == 429:
                    return "rate_limit", None
                if resp.status_code in (401, 403):
                    return f"error:{resp.status_code}", None
                if resp.status_code in (400, 404) or not resp.ok:
                    last = f"error:{resp.status_code}"; continue
                choices = resp.json().get("choices") or []
                msg = (choices[0].get("message") if choices else None) or {}
                text = (msg.get("content") or "").strip()
                calls: list[Call] = []
                for i, tc in enumerate(msg.get("tool_calls") or []):
                    fn = tc.get("function") or {}
                    raw_args = fn.get("arguments") or "{}"
                    try:
                        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    except ValueError:
                        args = None
                    calls.append(Call(id=tc.get("id") or f"call_{i}", name=fn.get("name", ""), args=args))
                if not text and not calls:
                    last = "error"; continue
                self.model = model
                raw = {"role": "assistant", "content": msg.get("content"), "tool_calls": msg.get("tool_calls")} \
                    if calls else {"role": "assistant", "content": text}
                return "ok", Turn(raw=raw, text=text, calls=calls)
            except requests.Timeout:
                last = "error"
            except Exception as exc:  # noqa: BLE001
                logger.exception("%s %s: %s", self.id, model, exc)
                last = "error"
        return last, None

    def add_turn(self, conv: list, turn: Turn, results: list[tuple[Call, dict]]) -> None:
        conv.append(turn.raw)
        for c, res in results:
            conv.append({"role": "tool", "tool_call_id": c.id, "content": json.dumps(res, ensure_ascii=False)[:20000]})


# ─── Bucle principal ───────────────────────────────────────────────────────

def _summary_from_actions(actions: list[dict]) -> str:
    done = [a["summary"] for a in actions if a.get("ok") and a.get("op") not in ("list", "read", None)]
    failed = [a["summary"] for a in actions if not a.get("ok")]
    lines = []
    if done:
        lines.append("Hecho:\n" + "\n".join(f"- {s}" for s in done))
    if failed:
        lines.append("No se pudo:\n" + "\n".join(f"- {s}" for s in failed))
    return "\n\n".join(lines) or "Listo."


def run_agent(
    adapter,
    *,
    system: str,
    history: list[dict],
    message: str,
    tool_ctx: T.ToolContext,
    tools: list[T.Tool],
    force_first: bool,
    force_tool_names: list[str] | None,
    guard_claims: bool,
    guard_tool_names: list[str] | None = None,
    limits: tuple[int, int, int] = (16, 4500, 12000),
) -> AgentResult:
    conv = adapter.new_conversation(history, message, *limits)
    actions: list[dict[str, Any]] = []
    executed = 0
    rounds = 0
    guard_used = False

    def subset(names: list[str] | None) -> list[T.Tool]:
        return [t for t in tools if names and t.name in names] or tools

    step_tools = subset(force_tool_names) if force_first else tools
    mode = "force" if force_first else "auto"
    while True:
        status, turn = adapter.step(conv, system, step_tools, mode if rounds < MAX_ROUNDS else "none")
        if status != "ok" or turn is None:
            if actions:  # ya se hicieron cosas: no mostrar un error engañoso
                return AgentResult(_summary_from_actions(actions), "ok", actions, adapter.model)
            return AgentResult(None, status, actions, adapter.model)

        if turn.calls and rounds < MAX_ROUNDS:
            results: list[tuple[Call, dict]] = []
            for call in turn.calls[:MAX_CALLS_PER_TURN]:
                res, act = T.execute(tool_ctx, call.name, call.args if call.args is not None else "bad")
                actions.append(act)
                executed += 1
                results.append((call, res))
            adapter.add_turn(conv, turn, results)
            rounds += 1
            mode, step_tools = "auto", tools
            continue

        text = turn.text
        if not text:
            if actions:
                return AgentResult(_summary_from_actions(actions), "ok", actions, adapter.model)
            return AgentResult(None, "error", actions, adapter.model)

        if guard_claims and executed == 0 and not guard_used and CLAIM_RE.search(text):
            guard_used = True
            mode, step_tools = "force", subset(guard_tool_names)   # reintento forzado; la afirmación falsa se descarta
            logger.info("Guard: afirmación sin herramienta → reintento forzado")
            continue
        if guard_claims and executed == 0 and guard_used and CLAIM_RE.search(text):
            return AgentResult(NO_ACTION_REPLY, "ok", actions, adapter.model)
        return AgentResult(text, "ok", actions, adapter.model)
