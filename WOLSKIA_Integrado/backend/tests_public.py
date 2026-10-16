"""Pruebas del modo público (online, sin login) y de la persistencia en Supabase.
Ejecutar:  python tests_public.py
"""
import importlib
import os
import tempfile
import unittest
from unittest import mock


def load_app(**env):
    base = {"WOLSKIA_PUBLIC_MODE": "1", "WOLSKIA_PROXY_SECRET": "secreto-de-prueba",
            "WOLSKIA_SPACE_FILE": os.path.join(tempfile.mkdtemp(), "espacio.json")}
    base.update(env)
    for k in ("GEMINI_API_KEY", "GROQ_API_KEY", "XAI_API_KEY"):
        os.environ.pop(k, None)
    os.environ.update(base)
    import services.space_store as st
    importlib.reload(st)
    import app as A
    importlib.reload(A)
    return A


UID = "perfil-abcdef123456xyz"
OK = {"X-Wolskia-Proxy-Key": "secreto-de-prueba", "X-Wolskia-Client-IP": "203.0.113.7"}


class PublicModeTests(unittest.TestCase):
    def setUp(self):
        self.A = load_app()
        self.c = self.A.app.test_client()

    def test_health_es_libre(self):
        self.assertEqual(self.c.get("/api/health").status_code, 200)

    def test_sin_clave_de_proxy_403(self):
        for path in ("/api/ai/status", f"/api/space?user={UID}", "/api/tools"):
            self.assertEqual(self.c.get(path).status_code, 403, path)
        self.assertEqual(self.c.get("/api/ai/status", headers={"X-Wolskia-Proxy-Key": "mala"}).status_code, 403)

    def test_sin_secreto_configurado_falla_cerrado(self):
        A = load_app(WOLSKIA_PROXY_SECRET="")
        self.assertEqual(A.app.test_client().get("/api/space").status_code, 503)

    def test_con_clave_funciona_desde_ip_remota(self):
        self.assertEqual(self.c.get("/api/ai/status", headers=OK).status_code, 200)

    def test_usuario_corto_o_default_rechazado(self):
        for u in ("default", "admin", "abc"):
            self.assertEqual(self.c.get(f"/api/space?user={u}", headers=OK).status_code, 400, u)

    def test_espacio_crud_y_aislamiento(self):
        r = self.c.post(f"/api/space/tasks?user={UID}", json={"title": "Revisar informe"}, headers=OK)
        self.assertEqual(r.status_code, 201)
        mine = self.c.get(f"/api/space?user={UID}", headers=OK).get_json()
        self.assertEqual(len(mine["tasks"]), 1)
        other = self.c.get("/api/space?user=perfil-otrapersona999", headers=OK).get_json()
        self.assertEqual(other["tasks"], [])

    def test_chat_legacy_apagado(self):
        self.assertEqual(self.c.post("/api/chat", json={"message": "hola"}, headers=OK).status_code, 404)

    def test_nadie_escribe_archivos_ni_es_admin(self):
        import services.ai_service as S
        self.assertFalse(S._can_write_files("admin"))
        captured = {}

        def fake_chat(**kw):
            captured.update(kw)
            return {"reply": "ok", "provider": "x", "status": "ok"}

        with mock.patch("services.ai_service.chat", fake_chat):
            r = self.c.post("/api/ai/chat", json={"message": "hola", "user": UID, "role": "admin"}, headers=OK)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(captured["role"], "worker")
        self.assertEqual(captured["client_ip"], "203.0.113.7")

    def test_tope_global_diario(self):
        import services.ai_service as S
        with mock.patch.object(S, "GLOBAL_RPD", 2):
            S._global_day.clear()
            S._rpm_bucket.clear(); S._rpd_bucket.clear()
            self.assertTrue(S.check_local_rate_limit("1.1.1.1")[0])
            self.assertTrue(S.check_local_rate_limit("2.2.2.2")[0])
            ok, msg = S.check_local_rate_limit("3.3.3.3")
            self.assertFalse(ok)
            self.assertIn("límite diario", msg)
        S._global_day.clear()


class FakeResp:
    def __init__(self, js=None):
        self._j = js if js is not None else []

    def raise_for_status(self):
        pass

    def json(self):
        return self._j


class SupabaseStoreTests(unittest.TestCase):
    def test_guarda_y_lee_desde_supabase(self):
        load_app(SUPABASE_URL="https://x.supabase.co", SUPABASE_SERVICE_KEY="sk")
        import services.space_store as st
        db = {}

        def fake_get(url, params=None, headers=None, timeout=None):
            uid = params["user_id"].removeprefix("eq.")
            return FakeResp([{"data": db[uid]}] if uid in db else [])

        def fake_post(url, params=None, json=None, headers=None, timeout=None):
            assert headers["apikey"] == "sk" and params == {"on_conflict": "user_id"}
            assert "merge-duplicates" in headers["Prefer"]
            db[json["user_id"]] = json["data"]
            return FakeResp()

        with mock.patch("requests.get", fake_get), mock.patch("requests.post", fake_post):
            item = st.add(UID, "task", {"title": "Llamar al proveedor"})
            self.assertIn(UID, db)
            self.assertEqual(db[UID]["tasks"][0]["title"], "Llamar al proveedor")
            st.update(UID, "task", item["id"], {"done": True})
            self.assertTrue(st.list_all(UID)["tasks"][0]["done"])
            st.delete(UID, "task", item["id"])
            self.assertEqual(st.list_all(UID)["tasks"], [])
        self.assertFalse(os.path.exists(st.DATA_FILE))  # no tocó el disco


if __name__ == "__main__":
    unittest.main()
