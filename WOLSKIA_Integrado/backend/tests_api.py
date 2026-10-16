"""Pruebas de la API /api/ai/* sin red (los proveedores se simulan).
Ejecutar:  python tests_api.py
"""
import json
import unittest
from unittest import mock

import app as A
import services.ai_service as S

H = {"X-Forwarded-For": "127.0.0.1"}


class Resp:
    def __init__(self, code, js=None, text=""):
        self.status_code, self.ok, self._j, self.text = code, code < 400, js or {}, text

    def json(self):
        return self._j


class ApiTests(unittest.TestCase):
    def setUp(self):
        import os
        for v in ("GEMINI_API_KEY", "GROQ_API_KEY", "XAI_API_KEY"):
            os.environ.pop(v, None)
        S.clear_runtime_keys()
        self.c = A.app.test_client()

    def test_sin_claves(self):
        self.assertFalse(self.c.get("/api/ai/status", headers=H).get_json()["configured"])
        r = self.c.post("/api/ai/chat", json={"message": "hola"}, headers=H).get_json()
        self.assertEqual(r["status"], "no_key")

    def test_solo_local(self):
        self.assertEqual(self.c.get("/api/ai/status", headers={"X-Forwarded-For": "192.168.0.9"}).status_code, 403)
        # un cliente remoto no puede falsear la IP: manda la última entrada (la del proxy)
        self.assertEqual(self.c.get("/api/ai/status", headers={"X-Forwarded-For": "127.0.0.1, 192.168.0.9"}).status_code, 403)

    def test_claves_solo_en_servidor(self):
        # POST/DELETE de claves están deshabilitados: se configuran en .env
        self.assertEqual(self.c.post("/api/ai/keys", json={"gemini": "AIzaSyFAKEKEY1234567890"}, headers=H).status_code, 403)
        self.assertEqual(self.c.delete("/api/ai/keys", headers=H).status_code, 403)

    def test_enmascarar(self):
        S.set_runtime_keys(gemini="AIzaSyFAKEKEY1234567890", grok="xai-ABCDEFGH12345678")
        r = self.c.get("/api/ai/status", headers=H)
        self.assertNotIn("FAKEKEY123", json.dumps(r.get_json()))
        ids = {p["id"]: p["configured"] for p in r.get_json()["providers"]}
        self.assertEqual(ids, {"gemini": True, "groq": False, "xai": True})

    def test_autodeteccion_groq(self):
        S.set_runtime_keys(grok="gsk_ABCDEFGH12345678")
        r = self.c.get("/api/ai/status", headers=H).get_json()
        self.assertTrue(next(p for p in r["providers"] if p["id"] == "groq")["configured"])

    def test_test_keys_y_chat(self):
        S.set_runtime_keys(gemini="AIzaSyFAKEKEY1234567890", grok="gsk_ABCDEFGH12345678")

        def fake_get(url, **kw):
            return Resp(400) if "googleapis" in url else Resp(200)

        def fake_post(url, **kw):
            if "groq.com" in url:
                return Resp(200, {"choices": [{"message": {"content": "Hola desde Groq"}}]})
            return Resp(200, {"candidates": [{"content": {"parts": [{"text": "Hola desde Gemini"}]}}]})

        with mock.patch.object(S.requests, "get", fake_get), mock.patch.object(S.requests, "post", fake_post):
            t = self.c.post("/api/ai/test-keys", headers=H).get_json()["results"]
            self.assertFalse(t["gemini"]["ok"])
            self.assertTrue(t["groq"]["ok"])
            auto = self.c.post("/api/ai/chat", json={"message": "hola"}, headers=H).get_json()
            self.assertIn("Gemini", auto["provider"])
            groq = self.c.post("/api/ai/chat", json={"message": "hola", "provider": "groq"}, headers=H).get_json()
            self.assertEqual(groq["reply"], "Hola desde Groq")

    def test_gemini_clave_invalida_no_dice_modelo(self):
        S.set_runtime_keys(gemini="AIzaSyFAKEKEY1234567890")
        bad = Resp(400, text='{"error":{"message":"API key not valid. Please pass a valid API key."}}')
        with mock.patch.object(S.requests, "post", lambda *a, **k: bad):
            r = self.c.post("/api/ai/chat", json={"message": "hola"}, headers=H).get_json()
        self.assertIn("Clave rechazada", r["reply"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
