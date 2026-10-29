import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUpstreamHeaders,
  clientIp,
  filterResponseHeaders,
  isProxiedPath,
  normalizeUpstream,
} from "./api-proxy-shared.mjs";

test("solo se reenvían las rutas del backend", () => {
  for (const p of ["/api/ai/chat", "/api/ai/status", "/api/space", "/api/space/tasks/t_1", "/api/health", "/api/tools"]) {
    assert.equal(isProxiedPath(p), true, p);
  }
  for (const p of ["/api/auth/sign-in", "/api/rtc", "/api/aimeta", "/", "/api", "/apix/ai/chat"]) {
    assert.equal(isProxiedPath(p), false, p);
  }
});

test("normalizeUpstream agrega esquema y quita la barra final", () => {
  assert.equal(normalizeUpstream("wolskia-api.onrender.com"), "https://wolskia-api.onrender.com");
  assert.equal(normalizeUpstream("https://x.onrender.com/"), "https://x.onrender.com");
  assert.equal(normalizeUpstream("127.0.0.1:5050"), "http://127.0.0.1:5050");
  assert.equal(normalizeUpstream(""), null);
  assert.equal(normalizeUpstream(undefined), null);
});

test("clientIp prefiere x-real-ip y cae a la primera de x-forwarded-for", () => {
  assert.equal(clientIp(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" })), "5.6.7.8");
  assert.equal(clientIp(new Headers()), "");
});

test("las cabeceras al backend llevan la clave y NO las cookies del visitante", () => {
  const h = buildUpstreamHeaders(
    new Headers({ "content-type": "application/json", cookie: "sesion=1", authorization: "Bearer x", "x-wolskia-proxy-key": "falsa" }),
    { secret: "s3", ip: "1.2.3.4" },
  );
  assert.equal(h.get("x-wolskia-proxy-key"), "s3");
  assert.equal(h.get("x-wolskia-client-ip"), "1.2.3.4");
  assert.equal(h.get("content-type"), "application/json");
  assert.equal(h.get("cookie"), null);
  assert.equal(h.get("authorization"), null);
});

test("la respuesta se limpia de cabeceras que rompen el streaming", () => {
  const h = filterResponseHeaders(
    new Headers({ "content-type": "application/json", "content-encoding": "gzip", "content-length": "12", "set-cookie": "a=b" }),
  );
  assert.equal(h.get("content-type"), "application/json");
  assert.equal(h.get("content-encoding"), null);
  assert.equal(h.get("content-length"), null);
  assert.equal(h.get("set-cookie"), null);
  assert.equal(h.get("cache-control"), "no-store");
});
