import type { IncomingMessage, ServerResponse } from "node:http";
import type { RemoteHttpRouteContract, RemoteHttpRouteId } from "@/shared/remote/contract";
import { REMOTE_HTTP_ROUTES } from "@/shared/remote/contract";
import { RemoteHttpError, type AuthenticatedRemoteSession } from "../auth";
import type { ForwardOriginIdentity } from "../portForward/forwardOriginIdentity";
import {
  buildLocalPairingIconSvg,
  buildLocalPairingManifestJson,
  buildLocalPairingPageHtml,
  buildLocalPairingServiceWorkerJs,
} from "../pairingPage";
import {
  isBuiltClientAssetPath,
  isLegacyClientPath,
  tryServeBuiltClientApp,
} from "../staticClientApp";
import type { RemoteServerContext } from "./context";
import { writeError, writeHtml, writeText } from "./httpResponses";
import type { HttpRouteCall, HttpRouteHandler } from "./httpRouteHandlers";
import { ROUTE_HANDLERS } from "./httpRouteHandlers";

export { mapCheckpointRevertCompletedResponse } from "./httpRouteHandlers";

export function threadIdFromPath(pathname: string, suffix: string): string | null {
  if (!pathname.startsWith("/api/threads/") || !pathname.endsWith(suffix)) {
    return null;
  }
  const raw = pathname.slice("/api/threads/".length, pathname.length - suffix.length);
  if (!raw) return null;
  if (raw.includes("/")) return null;
  try {
    const threadId = decodeURIComponent(raw);
    return threadId.includes("/") ? null : threadId;
  } catch {
    return null;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles a registry path template (`/api/threads/{threadId}/history`) into
 * an anchored matcher. `{param}` segments match exactly one raw (still
 * percent-encoded) path segment; decoding is each handler's own concern so
 * the historical per-route decode semantics are preserved verbatim.
 */
function compileRoutePath(path: string): { pattern: RegExp; paramNames: readonly string[] } {
  const paramNames: string[] = [];
  const source = path
    .split("/")
    .map((segment) => {
      const param = /^\{([A-Za-z][A-Za-z0-9]*)\}$/.exec(segment);
      if (!param) return escapeRegExp(segment);
      paramNames.push(param[1]!);
      return `(?<${param[1]!}>[^/]+)`;
    })
    .join("/");
  return { pattern: new RegExp(`^${source}$`), paramNames };
}

/**
 * The dispatch table: the registry's route contracts (path, method, auth,
 * scopes) compiled for matching, paired with the handler keyed by the same
 * route id. Both sides come from the ONE registry table
 * (`REMOTE_HTTP_ROUTES` + the exhaustively-typed `ROUTE_HANDLERS`), so a route
 * that is not registered has no handler, and a registered route without a
 * handler fails typecheck — manifest↔router drift is structurally impossible.
 */
const COMPILED_ROUTES: readonly {
  readonly route: RemoteHttpRouteContract;
  readonly pattern: RegExp;
  readonly paramNames: readonly string[];
  readonly handler: HttpRouteHandler;
}[] = REMOTE_HTTP_ROUTES.map((route) => ({
  route,
  ...compileRoutePath(route.path),
  // `route.id` is one of the registry's closed id union by construction
  // (routes/index.ts builds it from the same literal id list).
  handler: ROUTE_HANDLERS[route.id as RemoteHttpRouteId],
}));

export async function handleHttp(
  ctx: RemoteServerContext,
  req: IncomingMessage,
  res: ServerResponse,
  forwardOrigin: ForwardOriginIdentity | null = ctx.options.forwardOrigin ?? null,
): Promise<void> {
  const corsAllowed = ctx.security.applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(corsAllowed ? 204 : 403);
    res.end();
    return;
  }
  if (!corsAllowed) {
    writeError(
      res,
      new RemoteHttpError("origin_not_allowed", "Remote origin is not allowed.", 403),
    );
    return;
  }

  try {
    const url = new URL(req.url ?? "/", ctx.requireInfo().httpBaseUrl);
    // Gate 6 item 4.7 (S7): DNS-rebinding defense — only the server's own
    // advertised host/port forms are admitted on the API/PWA path. Runs after
    // the OPTIONS short-circuit (preflights need no origin decision beyond
    // CORS) and before any routing or authentication.
    ctx.security.enforceHostHeader(req);
    if (req.method === "GET" && isLegacyClientPath(url.pathname)) {
      res.writeHead(308, { location: `/${url.search}` });
      res.end();
      return;
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      // The canonical Poracode app entry. Forwarded development servers are no
      // longer reachable on this (PWA/API) origin at all — they live on their
      // own isolated child origins, dispatched before this router runs.
      if (ctx.options.devWebAppUrl) {
        const target = new URL(ctx.options.devWebAppUrl);
        target.pathname = "/";
        for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
        target.searchParams.set("host", ctx.requireInfo().httpBaseUrl);
        res.writeHead(302, { location: target.toString() });
        res.end();
        return;
      }
      if (tryServeBuiltClientApp(url.pathname, res)) {
        return;
      }
      writeHtml(
        res,
        200,
        buildLocalPairingPageHtml({ httpBaseUrl: ctx.requireInfo().httpBaseUrl }),
      );
      return;
    }
    if (req.method === "GET" && isBuiltClientAssetPath(url.pathname)) {
      if (tryServeBuiltClientApp(url.pathname, res)) {
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/manifest.webmanifest") {
      writeText(res, 200, buildLocalPairingManifestJson(), "application/manifest+json");
      return;
    }
    if (req.method === "GET" && url.pathname === "/service-worker.js") {
      writeText(
        res,
        200,
        buildLocalPairingServiceWorkerJs(ctx.options.appVersion),
        "application/javascript; charset=utf-8",
      );
      return;
    }
    if (req.method === "GET" && url.pathname === "/app-icon.svg") {
      writeText(res, 200, buildLocalPairingIconSvg(), "image/svg+xml; charset=utf-8");
      return;
    }

    // Registry-driven dispatch. Every /api, /oauth, and /.well-known route is
    // a registry contract; bearer routes get their registry scopes enforced
    // here, once, before the handler runs.
    for (const { route, pattern, paramNames, handler } of COMPILED_ROUTES) {
      if (req.method !== route.method) continue;
      const match = pattern.exec(url.pathname);
      if (!match) continue;
      const params: Record<string, string> = {};
      for (const name of paramNames) params[name] = match.groups?.[name] ?? "";
      let bearerToken: string | null = null;
      let session: AuthenticatedRemoteSession | null = null;
      if (route.auth === "bearer" && route.scopeResolution !== "procedure-defined") {
        const authenticated = ctx.security.requireBearerSession(req, [...route.scopes]);
        bearerToken = authenticated.token;
        session = authenticated.session;
      }
      const call: HttpRouteCall = {
        ctx,
        req,
        res,
        url,
        forwardOrigin,
        bearerToken,
        session,
        params,
      };
      await handler(call);
      return;
    }
    writeError(res, new RemoteHttpError("not_found", "Remote endpoint not found.", 404));
  } catch (error) {
    writeError(res, error);
  }
}
