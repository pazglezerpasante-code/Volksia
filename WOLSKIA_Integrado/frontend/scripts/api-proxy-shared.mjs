/**
 * Proxy servidor -> backend (Render). El navegador solo habla con el sitio;
 * el sitio agrega el secreto compartido y la IP real del visitante.
 * Sin WOLSKIA_API / WOLSKIA_PROXY_SECRET responde 503 (nunca reenvia sin candado).
 */
const DROP = new Set(["host", "cookie", "connection", "content-length", "x-wolskia-secret", "x-wolskia-client-ip", "x-forwarded-for"]);

export function clientIp(headers) {
  const v = headers.get("x-vercel-forwarded-for") || headers.get("x-real-ip") || (headers.get("x-forwarded-for") || "").split(",")[0] || "";
  return v.trim() || "0.0.0.0";
}

export function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function proxyApi(request, { target, secret, fetchImpl = fetch, timeoutMs = 90000 }) {
  if (!target || !secret) {
    return json(503, { error: "not_configured", message: "Falta configurar WOLSKIA_API y WOLSKIA_PROXY_SECRET en el sitio." });
  }
  const url = new URL(request.url);
  const dest = target.replace(/\/+$/, "") + url.pathname + url.search;
  const headers = new Headers();
  for (const [k, v] of request.headers) if (!DROP.has(k.toLowerCase()) && !k.toLowerCase().startsWith("x-vercel")) headers.set(k, v);
  headers.set("X-Wolskia-Secret", secret);
  headers.set("X-Wolskia-Client-IP", clientIp(request.headers));
  const hasBody = !["GET", "HEAD"].includes(request.method.toUpperCase());
  try {
    const res = await fetchImpl(dest, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const out = new Headers();
    for (const h of ["content-type", "content-disposition"]) if (res.headers.get(h)) out.set(h, res.headers.get(h));
    return new Response(await res.arrayBuffer(), { status: res.status, headers: out });
  } catch {
    return json(502, { error: "backend_down", message: "El backend no responde (si recién despertó, esperá 30-60 segundos y reintentá)." });
  }
}
