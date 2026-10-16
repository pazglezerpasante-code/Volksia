/**
 * Lógica pura del proxy /api → backend Flask (sin tocar red), para poder probarla.
 * La usa server/middleware/api-proxy.ts (el servidor del sitio online).
 *
 * Por qué existe: online no hay login, así que el backend solo atiende pedidos que
 * traen una clave secreta (WOLSKIA_PROXY_SECRET). Esa clave vive solo en el servidor
 * del frontend; el navegador nunca la ve. Quien entre directo a la URL del backend
 * recibe 403.
 */

/** Solo se reenvían estas rutas. /api/auth y /api/rtc NO pasan por acá. */
const PROXIED = /^\/api\/(ai|space|tools|search|project|health)(\/|$)/;

export function isProxiedPath(pathname) {
  return PROXIED.test(pathname);
}

/** "mi-api.onrender.com" → "https://mi-api.onrender.com"; vacío → null. */
export function normalizeUpstream(raw) {
  const value = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(value);
  return `${local ? "http" : "https"}://${value}`;
}

/** IP real del visitante según la plataforma (Vercel la pone en x-real-ip / x-forwarded-for). */
export function clientIp(headers) {
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "";
}

/** Cabeceras que viajan al backend: solo lo necesario + la clave secreta + la IP. */
export function buildUpstreamHeaders(incoming, { secret, ip }) {
  const out = new Headers();
  for (const name of ["content-type", "accept", "accept-language"]) {
    const v = incoming.get(name);
    if (v) out.set(name, v);
  }
  if (secret) out.set("x-wolskia-proxy-key", secret);
  if (ip) out.set("x-wolskia-client-ip", ip);
  return out;
}

const DROP_RESPONSE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "set-cookie",
]);

/** Cabeceras de la respuesta del backend que sí se devuelven al navegador. */
export function filterResponseHeaders(upstream) {
  const out = new Headers();
  upstream.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key.toLowerCase())) out.set(key, value);
  });
  out.set("cache-control", "no-store");
  return out;
}
