import { onRequestGet as getPublicDealRoom } from "./functions/deal-room/[[slug]].js";
import { onRequestGet as getPublicCreator } from "./functions/creator/[[slug]].js";

function isPublicRoute(pathname, prefix) {
  if (pathname === prefix) return true;
  if (!pathname.startsWith(`${prefix}/`)) return false;

  const remainder = pathname.slice(prefix.length + 1);
  return remainder.length > 0 && !remainder.includes("/") && !remainder.includes(".");
}

function assetShell(request, env, prefix) {
  const assetUrl = new URL(`${prefix}/index.html`, request.url);
  return env.ASSETS.fetch(new Request(assetUrl));
}

function routeContext(request, env, prefix) {
  return {
    request,
    env,
    next: () => assetShell(request, env, prefix),
  };
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);

    if (request.method === "GET" && isPublicRoute(requestUrl.pathname, "/deal-room")) {
      return getPublicDealRoom(routeContext(request, env, "/deal-room"));
    }

    if (request.method === "GET" && isPublicRoute(requestUrl.pathname, "/creator")) {
      return getPublicCreator(routeContext(request, env, "/creator"));
    }

    return env.ASSETS.fetch(request);
  },
};
