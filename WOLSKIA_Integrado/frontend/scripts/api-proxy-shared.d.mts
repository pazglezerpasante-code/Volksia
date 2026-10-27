export function isProxiedPath(pathname: string): boolean;
export function normalizeUpstream(raw: unknown): string | null;
export function clientIp(headers: Headers): string;
export function buildUpstreamHeaders(
  incoming: Headers,
  opts: { secret?: string; ip?: string },
): Headers;
export function filterResponseHeaders(upstream: Headers): Headers;
