import test from "node:test";
import assert from "node:assert/strict";
import { proxyApi, isApiPath, clientIp } from "./api-proxy-shared.mjs";

const mk = (path, init = {}) => new Request("https://sitio.vercel.app" + path, init);

test("sin configurar -> 503 y no reenvia", async () => {
  let called = false;
  const r = await proxyApi(mk("/api/space"), { target: "", secret: "", fetchImpl: () => (called = true) });
  assert.equal(r.status, 503);
  assert.equal(called, false);
});

test("agrega secreto e IP, y pisa los que mande el navegador", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }); };
  const r = await proxyApi(
    mk("/api/ai/chat?x=1", { method: "POST", body: '{"a":1}', headers: { "x-wolskia-secret": "falso", "x-wolskia-client-ip": "6.6.6.6", "x-real-ip": "9.9.9.9", cookie: "a=b", "content-type": "application/json" } }),
    { target: "https://api.onrender.com/", secret: "S", fetchImpl },
  );
  assert.equal(r.status, 200);
  assert.equal(seen.url, "https://api.onrender.com/api/ai/chat?x=1");
  assert.equal(seen.init.headers.get("x-wolskia-secret"), "S");
  assert.equal(seen.init.headers.get("x-wolskia-client-ip"), "9.9.9.9");
  assert.equal(seen.init.headers.get("cookie"), null);
  assert.equal(seen.init.body, '{"a":1}');
});

test("backend caido -> 502 JSON", async () => {
  const r = await proxyApi(mk("/api/space"), { target: "https://x", secret: "S", fetchImpl: async () => { throw new Error("x"); } });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, "backend_down");
});

test("helpers", () => {
  assert.ok(isApiPath("/api/space") && !isApiPath("/apix") && !isApiPath("/"));
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "1.1.1.1");
});
