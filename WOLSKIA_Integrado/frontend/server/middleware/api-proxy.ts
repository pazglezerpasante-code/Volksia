/**
 * Proxy /api/* → backend Flask (WOLSKIA). Se registra solo, igual que grok-pwa.ts
 * (Nitro escanea ./server por `serverDir` en vite.config.ts).
 *
 * Online no hay login: este proxy agrega la clave secreta WOLSKIA_PROXY_SECRET y la IP
 * real del visitante, y el backend rechaza todo lo que no la traiga. Variables
 * (se cargan en el hosting del frontend, nunca en GitHub):
 *   WOLSKIA_API           URL del backend, ej. https://wolskia-api.onrender.com
 *   WOLSKIA_PROXY_SECRET  el mismo valor que en el backend
 *
 * Los endpoints que no son de WOLSKIA (/api/auth, /api/rtc) y las páginas pasan de largo.
 */
import {
  buildUpstreamHeaders,
  clientIp,
  filterResponseHeaders,
  isProxiedPath,
  normalizeUpstream,
} from "../../scripts/api-proxy-shared.mjs";

interface ProxyEvent {
  url: URL;
  req: {
    method: string;
    headers: Headers;
    arrayBuffer: () => Promise<ArrayBuffer>;
  };
}

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const UPSTREAM_TIMEOUT_MS = 55_000;

function json(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default async function apiProxyMiddleware(
  event: ProxyEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const path = event.url.pathname;
  if (!isProxiedPath(path)) return next();

  const upstream = normalizeUpstream(env.WOLSKIA_API);
  if (!upstream) {
    return json(502, "backend_not_configured", "Falta configurar WOLSKIA_API en el hosting del sitio.");
  }

  const method = (event.req.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const headers = buildUpstreamHeaders(event.req.headers, {
    secret: env.WOLSKIA_PROXY_SECRET ?? "",
    ip: clientIp(event.req.headers),
  });

  try {
    const res = await fetch(upstream + path + event.url.search, {
      method,
      headers,
      body: hasBody ? await event.req.arrayBuffer() : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: filterResponseHeaders(res.headers),
    });
  } catch {
    return json(
      502,
      "backend_down",
      "El servidor de Wolskia está despertando o no responde. Esperá unos segundos y probá de nuevo.",
    );
  }
}
