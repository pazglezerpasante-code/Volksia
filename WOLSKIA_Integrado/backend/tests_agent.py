# -*- coding: utf-8 -*-
"""Pruebas del agente (function calling) SIN red: los proveedores se simulan.
Ejecutar:  python tests_agent.py
"""
import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

TMP = Path(tempfile.mkdtemp(prefix="wolskia_test_"))
os.environ["WOLSKIA_SPACE_FILE"] = str(TMP / "espacio.json")
for v in ("GEMINI_API_KEY", "GROQ_API_KEY", "XAI_API_KEY"):
    os.environ.pop(v, None)

import services.agent as agent_mod
import services.ai_service as S
import services.file_tools as F
import services.space_store as store
from services.intents import analyze

F.BACKUP_DIR = TMP / "backups"
ROOT = TMP / "herramientas"
ROOT.mkdir()
(ROOT / "demo.html").write_text("<h1>Hola</h1>\n<p>mundo</p>\n", encoding="utf-8")
WS = {"roots": [str(ROOT)], "exclude_dirs": [".git"], "protected": [str(TMP / "protegido")]}


class R:
    def __init__(self, js, code=200):
        self.status_code, self.ok, self._js, self.text = code, code < 400, js, json.dumps(js)

    def json(self):
        return self._js


def gem_text(t):
    return R({"candidates": [{"content": {"role": "model", "parts": [{"text": t}]}}]})


def gem_call(name, args):
    return R({"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"name": name, "args": args}}]}}]})


def oai_text(t):
    return R({"choices": [{"message": {"role": "assistant", "content": t}}]})


def oai_call(name, args, cid="c1"):
    return R({"choices": [{"message": {"role": "assistant", "content": None, "tool_calls": [
        {"id": cid, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}}]})


class Script:
    """requests.post simulado: devuelve respuestas en orden y guarda los payloads."""
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    def __call__(self, url, **kw):
        self.calls.append(copy.deepcopy(kw.get("json")))
        return self.responses.pop(0)


def run(msg, script, *, provider="gemini", role="admin", user="u1", history=None):
    S.clear_runtime_keys()
    S.RUNTIME_KEYS["gemini" if provider == "gemini" else "groq"] = "KEY_FAKE_12345678"
    S._rpm_bucket.clear(); S._rpd_bucket.clear()
    with mock.patch.object(agent_mod.requests, "post", script):
        return S.chat(msg, history or [], [], "127.0.0.1", prefer=provider, user=user, role=role, workspace=WS)


class IntentTests(unittest.TestCase):
    def test_clasificacion(self):
        casos = {
            "agregá una tarea: llamar al proveedor mañana": ("mutate", None),
            "borrá la nota de la reunión": ("mutate", None),
            "recordame pagar la luz el viernes": ("mutate", None),
            "marcá como hecha la tarea de la yerba": ("mutate", None),
            "qué tareas tengo para hoy": ("read", None),
            "cómo creo una nota en Word": (None, None),
            "cuánto está el dólar hoy": (None, None),
            "creá un archivo turnero.html con un formulario": (None, "write"),
            "leé el archivo demo.html": (None, "read"),
            "Analizá los archivos adjuntos y ayudame con su contenido.": (None, None),
        }
        for msg, (sp, fi) in casos.items():
            i = analyze(msg)
            self.assertEqual((i.space, i.files), (sp, fi), msg)

    def test_space_no_dispara_busqueda_web(self):
        self.assertFalse(S.looks_like_needs_web("agregá una tarea para mañana"))
        self.assertEqual(S.classify_intent("agregá una tarea para mañana"), S.INTENT_SPACE)


class SpaceToolTests(unittest.TestCase):
    def test_alta_forzada_gemini(self):
        sc = Script(gem_call("task_add", {"title": "Llamar al proveedor", "due": "2026-10-16"}),
                    gem_text("Listo: tarea «Llamar al proveedor» para mañana (2026-10-16)."))
        r = run("agregá una tarea: llamar al proveedor mañana", sc)
        self.assertEqual(r["status"], "ok")
        first = sc.calls[0]
        self.assertEqual(first["toolConfig"]["functionCallingConfig"]["mode"], "ANY")
        names = {d["name"] for d in first["tools"][0]["functionDeclarations"]}
        self.assertIn("task_add", names)
        self.assertNotIn("file_edit", names)           # forzado solo a herramientas de Tu espacio
        self.assertEqual(sc.calls[1]["toolConfig"]["functionCallingConfig"]["mode"], "AUTO")
        tasks = store.list_kind("u1", "task")
        self.assertEqual(tasks[0]["title"], "Llamar al proveedor")
        self.assertEqual(tasks[0]["due"], "2026-10-16")
        self.assertTrue(r["space_changed"])
        self.assertEqual(r["actions"][0]["tool"], "task_add")
        # el system prompt lleva fecha de hoy y el espacio actual
        sysmsg = first["systemInstruction"]["parts"][0]["text"]
        self.assertIn("Fecha ISO de hoy", sysmsg)
        self.assertIn("Tu espacio actual", sysmsg)

    def test_editar_y_eliminar_por_id(self):
        n = store.add("u2", "note", {"title": "Reunión de planta", "content": "temas"})
        sc = Script(gem_call("note_update", {"id": n["id"], "content": "temas + seguridad"}),
                    gem_text("Nota actualizada."))
        r = run("editá la nota de la reunión de planta y agregale seguridad", sc, user="u2")
        self.assertEqual(store.find("u2", "note", n["id"])["content"], "temas + seguridad")
        self.assertIn(n["id"], sc.calls[0]["systemInstruction"]["parts"][0]["text"])  # ids en el prompt
        sc = Script(gem_call("note_delete", {"id": n["id"]}), gem_text("Nota eliminada."))
        r = run("borrá la nota de la reunión de planta", sc, user="u2")
        self.assertIsNone(store.find("u2", "note", n["id"]))
        self.assertTrue(r["space_changed"])

    def test_error_de_validacion_se_autocorrige(self):
        sc = Script(gem_call("event_add", {"title": "Reunión", "date": "mañana"}),
                    gem_call("event_add", {"title": "Reunión", "date": "2026-10-16", "time": "15:00"}),
                    gem_text("Evento creado."))
        r = run("agendá una reunión mañana a las 15", sc, user="u3")
        self.assertFalse(r["actions"][0]["ok"])
        self.assertTrue(r["actions"][1]["ok"])
        ev = store.list_kind("u3", "event")
        self.assertEqual((ev[0]["date"], ev[0]["time"]), ("2026-10-16", "15:00"))
        err = sc.calls[1]["contents"][-1]["parts"][0]["functionResponse"]["response"]
        self.assertFalse(err["ok"])  # el modelo recibió el error y pudo corregir

    def test_guard_afirmacion_sin_herramienta(self):
        n = store.add("u4", "note", {"title": "Dato viejo"})
        sc = Script(gem_text("Listo, ya la borré."),           # miente: no llamó a la herramienta
                    gem_call("note_delete", {"id": n["id"]}),   # reintento forzado
                    gem_text("Nota eliminada."))
        r = run("eliminá la nota dato viejo", sc, user="u4", provider="gemini")
        # la primera vuelta ya era forzada (acción clara) y aun así el modelo mintió → se reintenta
        self.assertIsNone(store.find("u4", "note", n["id"]))
        self.assertEqual(sc.calls[1]["toolConfig"]["functionCallingConfig"]["mode"], "ANY")
        self.assertNotIn("Listo, ya la borré", json.dumps(sc.calls[1]))

    def test_guard_doble_fallo_no_miente(self):
        sc = Script(gem_text("Hecho, lo agregué."), gem_text("Hecho, lo agregué."))
        r = run("agregá una tarea comprar café", sc, user="u5")
        self.assertEqual(r["reply"], agent_mod.NO_ACTION_REPLY)
        self.assertEqual(store.list_kind("u5", "task"), [])

    def test_consulta_no_fuerza_herramienta(self):
        store.add("u6", "task", {"title": "Pagar luz"})
        sc = Script(gem_text("Tenés 1 tarea: Pagar luz."))
        r = run("qué tareas tengo", sc, user="u6")
        self.assertEqual(sc.calls[0]["toolConfig"]["functionCallingConfig"]["mode"], "AUTO")
        self.assertIn("Pagar luz", sc.calls[0]["systemInstruction"]["parts"][0]["text"])
        self.assertFalse(r["space_changed"])

    def test_fallo_del_proveedor_despues_de_actuar(self):
        sc = Script(gem_call("task_add", {"title": "Imprimir actas"}), R({}, 500), R({}, 500), R({}, 500), R({}, 500))
        r = run("agregá la tarea imprimir actas", sc, user="u7")
        self.assertEqual(r["status"], "ok")                   # no se muestra un error engañoso
        self.assertIn("Imprimir actas", r["reply"])
        self.assertEqual(len(store.list_kind("u7", "task")), 1)

    def test_openai_compatible_groq(self):
        sc = Script(oai_call("task_add", {"title": "Revisar stock"}), oai_text("Tarea agregada."))
        r = run("anotá una tarea: revisar stock", sc, provider="groq", user="u8")
        self.assertEqual(sc.calls[0]["tool_choice"], "required")
        self.assertEqual(sc.calls[1]["tool_choice"], "auto")
        tool_msg = sc.calls[1]["messages"][-1]
        self.assertEqual((tool_msg["role"], tool_msg["tool_call_id"]), ("tool", "c1"))
        self.assertEqual(store.list_kind("u8", "task")[0]["title"], "Revisar stock")
        self.assertEqual(r["reply"], "Tarea agregada.")

    def test_aislamiento_entre_usuarios(self):
        store.add("ana", "task", {"title": "Solo de Ana"})
        self.assertEqual(store.list_kind("beto", "task"), [])


class FileToolTests(unittest.TestCase):
    def test_crear_leer_editar(self):
        sc = Script(gem_call("file_create", {"path": "herramientas/nuevo/info.md", "content": "# Info\nv1\n"}),
                    gem_text("Creé el archivo."))
        r = run("creá un archivo info.md en la carpeta nuevo", sc, role="admin")
        self.assertEqual((ROOT / "nuevo" / "info.md").read_text(encoding="utf-8"), "# Info\nv1\n")
        self.assertFalse(r["space_changed"])
        sc = Script(gem_call("file_read", {"path": "herramientas/demo.html"}),
                    gem_call("file_edit", {"path": "herramientas/demo.html", "old_text": "<p>mundo</p>", "new_text": "<p>WOLSKIA</p>"}),
                    gem_text("Cambié el párrafo."))
        run("modificá el archivo demo.html: cambiá mundo por WOLSKIA", sc, role="admin")
        self.assertIn("<p>WOLSKIA</p>", (ROOT / "demo.html").read_text(encoding="utf-8"))
        self.assertIn("<h1>Hola</h1>", (ROOT / "demo.html").read_text(encoding="utf-8"))   # resto intacto
        self.assertTrue(list((TMP / "backups").rglob("demo.html.*.bak")))                  # respaldo

    def test_trabajador_no_escribe(self):
        sc = Script(gem_text("No tengo permiso para modificar archivos con tu cuenta."))
        run("modificá el archivo demo.html", sc, role="worker")
        names = {d["name"] for d in sc.calls[0]["tools"][0]["functionDeclarations"]}
        self.assertNotIn("file_edit", names)
        self.assertNotIn("file_create", names)
        self.assertIn("file_read", names)
        # aunque el modelo "alucine" la llamada, el servidor la bloquea
        ctx = agent_mod.T.ToolContext("x", F.FileContext(roots=[ROOT], can_write=False), False)
        res, act = agent_mod.T.execute(ctx, "file_edit", {"path": "herramientas/demo.html", "old_text": "Hola", "new_text": "X"})
        self.assertFalse(res["ok"])

    def test_sandbox_y_protegidos(self):
        ctx = F.FileContext(roots=[ROOT], protected=[TMP / "protegido"], can_write=True)
        for bad in ("../fuera.txt", "herramientas/../x.txt", "C:/Windows/x.txt", "herramientas/.env"):
            with self.assertRaises(F.FileToolError):
                F.file_read(ctx, bad)
        with self.assertRaises(F.FileToolError):
            F.file_create(ctx, "herramientas/virus.exe", "x")
        with self.assertRaises(F.FileToolError):
            F.file_create(ctx, "herramientas/demo.html", "pisa")           # no pisa sin overwrite
        link = ROOT / "escape"
        try:
            os.symlink(TMP, link)
            with self.assertRaises(F.FileToolError):
                F.file_read(ctx, "herramientas/escape/espacio.json")        # symlink hacia afuera
        except OSError:
            pass

    def test_edit_exige_coincidencia_unica(self):
        (ROOT / "dup.txt").write_text("a\na\n", encoding="utf-8")
        ctx = F.FileContext(roots=[ROOT], can_write=True)
        with self.assertRaises(F.FileToolError):
            F.file_edit(ctx, "herramientas/dup.txt", "a", "b")
        self.assertEqual(F.file_edit(ctx, "herramientas/dup.txt", "a", "b", replace_all=True)["replacements"], 2)


class ApiSpaceTests(unittest.TestCase):
    def test_rest(self):
        import app as A
        c = A.app.test_client()
        H = {"X-Forwarded-For": "127.0.0.1"}
        r = c.post("/api/space/tasks?user=rest", json={"title": "Desde UI"}, headers=H)
        self.assertEqual(r.status_code, 201)
        iid = r.get_json()["item"]["id"]
        self.assertEqual(c.patch(f"/api/space/tasks/{iid}?user=rest", json={"done": True}, headers=H).get_json()["item"]["done"], True)
        self.assertEqual(c.post("/api/space/events?user=rest", json={"title": "x", "date": "mal"}, headers=H).status_code, 400)
        self.assertEqual(len(c.get("/api/space?user=rest", headers=H).get_json()["tasks"]), 1)
        self.assertEqual(c.delete(f"/api/space/tasks/{iid}?user=rest", headers=H).status_code, 200)
        self.assertEqual(c.get("/api/space?user=rest", headers={"X-Forwarded-For": "8.8.8.8"}).status_code, 403)
        imp = c.post("/api/space/import?user=old", json={"tasks": ["a"], "notes": ["n"], "events": ["2026-10-20 — Turno", "Sin fecha — X"]}, headers=H).get_json()
        self.assertEqual(imp["imported"], {"tasks": 1, "notes": 1, "events": 2})
        again = c.post("/api/space/import?user=old", json={"tasks": ["b"]}, headers=H).get_json()
        self.assertEqual(again["imported"]["tasks"], 0)    # idempotente


if __name__ == "__main__":
    unittest.main(verbosity=2)
