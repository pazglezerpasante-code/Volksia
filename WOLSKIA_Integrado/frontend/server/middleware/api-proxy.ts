/** Reenvia /api/* al backend de Render agregando el secreto. Ver DEPLOY_ONLINE.md */
import { isApiPath, proxyApi } from "../../scripts/api-proxy-shared.mjs";

interface Ev {
  url: URL;
  req: Request;
}

export default async function apiProxy(event: Ev, next: () => unknown | Promise<unknown>) {
  if (!isApiPath(event.url.pathname)) return next();
  return proxyApi(event.req, {
    target: process.env.WOLSKIA_API,
    secret: process.env.WOLSKIA_PROXY_SECRET,
  });
}
