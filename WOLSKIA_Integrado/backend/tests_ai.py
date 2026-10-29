# -*- coding: utf-8 -*-
"""Pruebas locales de la capa de IA (sin requerir clave para la mayoría)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from services.ai_service import (
    classify_intent,
    looks_like_needs_web,
    build_tools_knowledge,
    summarize_history,
    chat,
    INTENT_TOOL,
    INTENT_LIVE,
    INTENT_CODE,
)


def test_intent():
    assert classify_intent("buscá mi turnero") == INTENT_TOOL
    assert classify_intent("cuanto esta el dolar") == INTENT_LIVE
    assert classify_intent("escribí una función en python") == INTENT_CODE
    print("OK intent")


def test_web_heuristic():
    assert looks_like_needs_web("clima en lanus")
    assert looks_like_needs_web("cuando juega boca")
    print("OK web heuristic")


def test_tools_knowledge():
    projects = [{
        "title": "Turnero",
        "folder": "Ejemplo_Turnero",
        "count": 2,
        "files": ["README.txt", "turnero_demo.html"],
        "searchable": "turnero ejemplo",
        "path": str(Path(__file__).parent / "herramientas" / "Ejemplo_Turnero"),
    }]
    k = build_tools_knowledge(projects, focus_query="turnero")
    assert "Turnero" in k
    print("OK tools knowledge")


def test_summary():
    hist = [{"role": "user", "content": f"msg {i}"} for i in range(12)]
    s = summarize_history(hist)
    assert s
    print("OK summary")


def test_chat_no_key():
    r = chat("hola", [], [], "127.0.0.1")
    assert r["status"] in ("no_key", "ok")
    assert r["reply"]
    r2 = chat("", [], [], "127.0.0.1")
    assert "Escribime" in r2["reply"]
    r3 = chat("x" * 13000, [], [], "127.0.0.1")
    assert r3["status"] == "validation"
    print("OK chat validation")


if __name__ == "__main__":
    test_intent()
    test_web_heuristic()
    test_tools_knowledge()
    test_summary()
    test_chat_no_key()
    print("\nTodas las pruebas locales pasaron.")
