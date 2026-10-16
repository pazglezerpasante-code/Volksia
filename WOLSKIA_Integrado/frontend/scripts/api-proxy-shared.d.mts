export function clientIp(headers: Headers): string;
export function isApiPath(pathname: string): boolean;
export function proxyApi(
  request: Request,
  opts: { target?: string; secret?: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<Response>;
