import type { IncomingMessage, ServerResponse } from "node:http";
import type { RemoteHttpRouteContract, RemoteHttpRouteId } from "@/shared/remote/contract";
import { REMOTE_HTTP_ROUTES } from "@/shared/remote/contract";
import { RemoteHttpError, type AuthenticatedRemoteSession } from "../auth";
import type { IngressReadClass, IngressWorkClass } from "../remoteAccessServerTypes";
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
import { isSpaNavigationRequest } from "../bundledWebClient";
import type { RemoteServerContext } from "./context";
import { writeError, writeHtml, writeText } from "./httpResponses";
import type { HttpRouteCall, HttpRouteHandler } from "./httpRouteHandlers";
import { auditRouteEvent, ROUTE_HANDLERS } from "./httpRouteHandlers";

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
  workClass: IngressWorkClass = "bulk",
  readClass: IngressReadClass = "normal",
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
    // D2: the bundled web client is the entry whenever the install layout
    // ships it; the pairing page is the truthful API-only fallback when it does
    // not. Static reads accept HEAD too (headers-only); the pairing fallbacks
    // below stay GET-only, exactly as before.
    const staticRead = req.method === "GET" || req.method === "HEAD";
    if (staticRead && (url.pathname === "/" || url.pathname === "/index.html")) {
      // The canonical Poracode app entry. Forwarded development servers are no
      // longer reachable on this (PWA/API) origin at all — they live on their
      // own isolated child origins, dispatched before this router runs.
      if (req.method === "GET" && ctx.options.devWebAppUrl) {
        const target = new URL(ctx.options.devWebAppUrl);
        target.pathname = "/";
        for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
        target.searchParams.set("host", ctx.requireInfo().httpBaseUrl);
        res.writeHead(302, { location: target.toString() });
        res.end();
        return;
      }
      if (await tryServeBuiltClientApp(url.pathname, req, res)) {
        return;
      }
      if (req.method === "GET") {
        writeHtml(
          res,
          200,
          buildLocalPairingPageHtml({
            httpBaseUrl: ctx.requireInfo().httpBaseUrl,
            ...(ctx.options.tls?.fingerprint
              ? { certFingerprint: ctx.options.tls.fingerprint }
              : {}),
          }),
        );
        return;
      }
    }
    if (staticRead && isBuiltClientAssetPath(url.pathname)) {
      if (await tryServeBuiltClientApp(url.pathname, req, res)) {
        return;
      }
    }
    // Bundled build first, pairing artifact only when the install has no web
    // client. A bundled build must never be shadowed by the fallback pairing
    // manifest/service worker/icon.
    if (req.method === "GET" && url.pathname === "/manifest.webmanifest") {
      if (await tryServeBuiltClientApp(url.pathname, req, res)) {
        return;
      }
      writeText(res, 200, buildLocalPairingManifestJson(), "application/manifest+json");
      return;
    }
    if (req.method === "GET" && url.pathname === "/service-worker.js") {
      if (await tryServeBuiltClientApp(url.pathname, req, res)) {
        return;
      }
      writeText(
        res,
        200,
        buildLocalPairingServiceWorkerJs(ctx.options.appVersion),
        "application/javascript; charset=utf-8",
      );
      return;
    }
    if (req.method === "GET" && url.pathname === "/app-icon.svg") {
      if (await tryServeBuiltClientApp(url.pathname, req, res)) {
        return;
      }
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
      // B3: the authenticated principal whose post-auth budgets cover this
      // request. Procedure-defined routes keep their handler-owned scope
      // resolution but still resolve the session for principal accounting;
      // ticket-only callers stay bounded by the transport semaphore alone.
      let principalId: string | null = null;
      if (route.auth === "bearer" && route.scopeResolution !== "procedure-defined") {
        const authenticated = ctx.security.requireBearerSession(req, [...route.scopes]);
        bearerToken = authenticated.token;
        session = authenticated.session;
        principalId = session.sessionId;
      } else if (route.auth === "bearer") {
        try {
          principalId = ctx.security.requireBearerSession(req, []).session.sessionId;
        } catch {
          // The handler owns authentication for this route; no principal
          // budget is reserved when it cannot be attributed.
        }
      } else if (route.auth === "bearer-or-query") {
        // Ticket-only callers authenticate in the handler; a bearer header is
        // attributed here so dispatcher audit lines carry the session.
        try {
          const authenticated = ctx.security.requireBearerSession(req, [...route.scopes]);
          bearerToken = authenticated.token;
          session = authenticated.session;
          principalId = session.sessionId;
        } catch {
          // Missing or ticket-only credentials are not a dispatcher failure.
        }
      }
      const call: HttpRouteCall = {
        ctx,
        req,
        res,
        url,
        forwardOrigin,
        bearerToken,
        session,
        readClass,
        params,
      };
      if (route.audit.kind !== false) {
        auditRouteEvent({ ctx, session }, route.audit.kind, {
          route: route.id,
          method: route.method,
          path: route.path,
        });
      }
      // B3: non-waiting per-principal admission after authentication. The
      // lease is released only when the handler settles, so a client that
      // disconnects mid-request cannot free its quota while the work runs.
      const lease = principalId
        ? ctx.principalAdmission.tryAdmitWork(principalId, workClass)
        : null;
      try {
        await handler(call);
      } finally {
        lease?.release();
      }
      return;
    }
    // D2: an unmatched navigation request gets the bundled app shell so a
    // deep-link refresh (including a push-notification URL) still boots the
    // app. The classifier excludes API/auth namespaces, static paths and
    // non-navigation requests, so this can never shadow an API error, an auth
    // flow or a missing file.
    if (
      isSpaNavigationRequest(req, url.pathname) &&
      (await tryServeBuiltClientApp("/", req, res))
    ) {
      return;
    }
    writeError(res, new RemoteHttpError("not_found", "Remote endpoint not found.", 404));
  } catch (error) {
    writeError(res, error);
  }
}
