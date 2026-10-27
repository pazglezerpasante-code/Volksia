# -*- coding: utf-8 -*-
"""Prueba las claves de Gemini y Groq. Ejecutar: python probar_claves.py"""
import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

try:
    import requests
except ImportError:
    print("Falta 'requests'. Ejecuta: pip install requests")
    input("Enter para salir...")
    sys.exit(1)

print()
print("=" * 50)
print("  PRUEBA DE CLAVES SURI")
print("=" * 50)
print()

gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
groq_key = os.getenv("GROQ_API_KEY", "").strip()
groq_model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant").strip() or "llama-3.1-8b-instant"

print("GEMINI_API_KEY :", "SI (" + gemini_key[:12] + "...)" if gemini_key else "NO")
print("GEMINI_MODEL   :", gemini_model)
print("GROQ_API_KEY   :", "SI (" + groq_key[:12] + "...)" if groq_key else "NO")
print("GROQ_MODEL     :", groq_model)
print()

# --- Gemini ---
if gemini_key:
    print("--- Probando Gemini ---")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent"
    headers = {"Content-Type": "application/json", "x-goog-api-key": gemini_key}
    body = {"contents": [{"parts": [{"text": "Deci hola en una sola palabra"}]}]}
    try:
        r = requests.post(url, headers=headers, json=body, timeout=40)
        print("HTTP:", r.status_code)
        txt = r.text[:500]
        print("Respuesta:", txt)
        if r.status_code == 200:
            print(">>> GEMINI OK")
        else:
            print(">>> GEMINI FALLO")
    except Exception as e:
        print("Error de conexion Gemini:", e)
        print(">>> GEMINI FALLO")
else:
    print("--- Sin clave Gemini ---")
print()

# --- Groq ---
if groq_key:
    print("--- Probando Groq ---")
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": "Bearer " + groq_key, "Content-Type": "application/json"}
    body = {
        "model": groq_model,
        "messages": [{"role": "user", "content": "Deci hola en una sola palabra"}],
        "max_tokens": 30,
    }
    try:
        r = requests.post(url, headers=headers, json=body, timeout=40)
        print("HTTP:", r.status_code)
        txt = r.text[:500]
        print("Respuesta:", txt)
        if r.status_code == 200:
            print(">>> GROQ OK")
        else:
            print(">>> GROQ FALLO")
    except Exception as e:
        print("Error de conexion Groq:", e)
        print(">>> GROQ FALLO")
else:
    print("--- Sin clave Groq ---")

print()
print("=" * 50)
input("Presiona Enter para cerrar...")
