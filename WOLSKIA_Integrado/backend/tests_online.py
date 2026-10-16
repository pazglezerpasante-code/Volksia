"""Pruebas del modo ONLINE (secreto + limites). Ejecutar: python tests_online.py"""
import os, unittest
os.environ["WOLSKIA_ALLOW_REMOTE"] = "1"
os.environ["WOLSKIA_PROXY_SECRET"] = "s3cret"
os.environ["WOLSKIA_RATE_PER_MIN"] = "5"
os.environ["WOLSKIA_DAILY_CAP"] = "3"
import app as A

H = {"X-Wolskia-Secret": "s3cret", "X-Wolskia-Client-IP": "1.2.3.4"}

class Online(unittest.TestCase):
    def setUp(self):
        self.c = A.app.test_client()
        A._hits.clear(); A._day.update(d="", n=0)

    def test_sin_secreto_403(self):
        for path in ("/api/ai/status", "/api/space", "/api/tools"):
            self.assertEqual(self.c.get(path).status_code, 403, path)
        self.assertEqual(self.c.post("/api/ai/chat", json={"message": "hola"}).status_code, 403)

    def test_secreto_incorrecto_403(self):
        self.assertEqual(self.c.get("/api/space", headers={**H, "X-Wolskia-Secret": "x"}).status_code, 403)

    def test_con_secreto_ok(self):
        self.assertEqual(self.c.get("/api/space?user=u1", headers=H).status_code, 200)

    def test_rate_limit_por_ip(self):
        codes = [self.c.get("/api/space?user=u1", headers=H).status_code for _ in range(7)]
        self.assertEqual(codes[:5], [200] * 5)
        self.assertEqual(codes[5], 429)

    def test_tope_diario_chat(self):
        A._day.update(d=__import__("time").strftime("%Y-%m-%d"), n=3)
        r = self.c.post("/api/ai/chat", json={"message": "hola"}, headers=H)
        self.assertEqual(r.status_code, 429)

    def test_rol_admin_ignorado(self):
        seen = {}
        import services.ai_service as S
        orig = S.chat
        S.chat = lambda **kw: seen.update(kw) or {"reply": "ok", "status": "ok"}
        try:
            self.c.post("/api/ai/chat", json={"message": "x", "role": "admin"}, headers=H)
        finally:
            S.chat = orig
        self.assertEqual(seen.get("role"), "worker")

if __name__ == "__main__":
    unittest.main()
