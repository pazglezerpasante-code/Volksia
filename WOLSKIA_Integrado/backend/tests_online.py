"""Online security and quota tests, isolated from other test modules."""
import unittest
from unittest import mock
import app as A
import services.ai_service as S

H = {"X-Wolskia-Proxy-Key": "s3cret", "X-Wolskia-Client-IP": "1.2.3.4"}

class Online(unittest.TestCase):
    def setUp(self):
        for name, value in (("PUBLIC_MODE", True), ("PROXY_SECRET", "s3cret")):
            patch = mock.patch.object(A, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        self.c = A.app.test_client()
        S._rpm_bucket.clear()
        S._rpd_bucket.clear()
        S._global_day.clear()

    def test_sin_secreto_403(self):
        for path in ("/api/ai/status", "/api/space", "/api/tools", "/api/ai/sheets"):
            self.assertEqual(self.c.get(path).status_code, 403)

    def test_secreto_incorrecto_403(self):
        self.assertEqual(self.c.get("/api/space", headers={**H, "X-Wolskia-Proxy-Key": "x"}).status_code, 403)

    def test_con_secreto_ok(self):
        self.assertEqual(self.c.get("/api/ai/status", headers=H).status_code, 200)

    def test_rate_limit_por_ip(self):
        with mock.patch.object(S, "LOCAL_RPM_PER_IP", 5):
            self.assertEqual([S.check_local_rate_limit("test-ip")[0] for _ in range(7)], [True]*5 + [False]*2)

    def test_tope_diario_chat(self):
        with mock.patch.object(S, "GLOBAL_RPD", 3):
            self.assertEqual([S.check_local_rate_limit(str(i))[0] for i in range(4)], [True]*3 + [False])

    def test_rol_admin_ignorado(self):
        with mock.patch.object(S, "chat", return_value={"reply": "ok", "status": "ok"}) as chat:
            self.c.post("/api/ai/chat", json={"message": "x", "role": "admin", "user": "perfil-de-prueba-seguro"}, headers=H)
            self.assertEqual(chat.call_args.kwargs["role"], "worker")

if __name__ == "__main__":
    unittest.main()
