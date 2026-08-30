import type { IncomingMessage, ServerResponse } from "node:http";
import {
  remoteBrowserCommandSchema,
  remotePortEnterRequestSchema,
  remotePortEnterResultSchema,
  remotePortForwardRequestSchema,
  remotePortForwardResultSchema,
  remotePortUnforwardRequestSchema,
  remotePortsStateSchema,
  remoteProjectCommandSchema,
  remoteProjectSettingsSchema,
  remotePushRegistrationSchema,
  remotePushUnregisterSchema,
  remoteRuntimeItemsPageRequestSchema,
  remoteTimelineEntryCountSchema,
  remoteSettingsPatchSchema,
  remoteScheduleCommandSchema,
  remoteTokenExchangePayloadSchema,
  REMOTE_COMMAND_ID_HEADER,
  type RemoteAccessScope,
} from "@/shared/remote";
import {
  closeThreadPayloadSchema,
  clearPendingSteerPayloadSchema,
  controlThreadGoalPayloadSchema,
  interruptThreadPayloadSchema,
  prWatchInputSchema,
  prWatchKeySchema,
  profileIdentitySchema,
  profileStatsRequestSchema,
  projectNotesSchema,
  emptyMcpLaunchSnapshot,
  type McpServer,
  remoteThreadCommandSchema,
  resizeTerminalPayloadSchema,
  resolveThreadServerRequestPayloadSchema,
  scheduledTaskIdPayloadSchema,
  sendThreadInputPayloadSchema,
  setPendingSteerPayloadSchema,
  startShellPayloadSchema,
  startThreadPayloadSchema,
  writeTerminalPayloadSchema,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { dbTruncateRuntimeItemsPayloadSchema } from "@/shared/ipc/schemas";
import { projectNotesWriteBodySchema } from "@/shared/remote/contract/routeBodies";
import {
  remoteMcpSettingsCommandSchema,
  remoteMcpSettingsOperationSchema,
} from "@/shared/remote/contract/routeSchemas";
import {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
  dbGetProject,
  dbGetProjectNotes,
  dbGetThread,
  dbSetProjectNotes,
  dbTruncateThreadRuntimeAfter,
} from "../../db";
import {
  getProfileCoreStats,
  getProfileDevicesResponse,
  getProfileTokenStats,
  setProfileIdentityResponse,
} from "../../profile";
import { parseBearerAuthorizationHeader, RemoteHttpError } from "../auth";
import {
  assertRemoteThreadCommandExperimentSafe,
  assertRemoteThreadStartExperimentSafe,
} from "../experimentOwnership";
import {
  buildForwardEnterErrorPageHtml,
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
import {
  writeError,
  writeHtml,
  writeJson,
  writeNegotiatedJsonResponse,
  writeText,
} from "./httpResponses";
import { writeLocalImageFile } from "./localImageFile";
import { parseImageRefPath, resolveImageRef } from "./imageRefProjection";
import {
  buildForwardSessionCookieHeader,
  isReservedForwardProxyPath,
  proxyForwardedHttpRequest,
} from "./portForwardProxy";
import { readAttachmentBody, readJsonBody } from "./requestBody";
import { DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT } from "./security";
import {
  buildAgentStatuses,
  buildShellSnapshot,
  buildThreadSnapshot,
  buildThreadRuntimeItemsPage,
  descriptor,
} from "./snapshots";
import { applyRemoteThreadCommand, runProjectCommand, runRemoteProcedure } from "./threadCommands";
import type { RemoteAccessServerOptions } from "../RemoteAccessServer";

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

function projectIdFromPath(pathname: string, suffix: string): string | null {
  const match = new RegExp(`^/api/projects/([^/]+)/${suffix}$`).exec(pathname);
  if (!match?.[1]) return null;
  try {
    const projectId = decodeURIComponent(match[1]);
    return projectId.includes("/") ? null : projectId;
  } catch {
    return null;
  }
}

function mcpEndpointUrl(server: McpServer): string | null {
  switch (server.transport.type) {
    case "http":
    case "sse":
      return server.transport.url;
    case "stdio":
      return null;
  }
}

/**
 * POST /api/threads/:threadId<suffix> endpoints that validate the body (merged
 * with the path's threadId) and forward it to a supervisor procedure.
 */
const THREAD_POST_ROUTES: ReadonlyArray<{
  readonly suffix: string;
  readonly scope: RemoteAccessScope;
  readonly idempotent?: boolean;
  dispatch(
    call: RemoteAccessServerOptions["callSupervisor"],
    body: Record<string, unknown>,
  ): Promise<unknown>;
}> = [
  {
    suffix: "/send",
    scope: "session:operate",
    idempotent: true,
    dispatch: (call, body) => call("sendThreadInput", sendThreadInputPayloadSchema.parse(body)),
  },
  {
    suffix: "/interrupt",
    scope: "session:operate",
    dispatch: (call, body) => call("interruptThread", interruptThreadPayloadSchema.parse(body)),
  },
  {
    suffix: "/goal",
    scope: "session:operate",
    dispatch: (call, body) => call("controlThreadGoal", controlThreadGoalPayloadSchema.parse(body)),
  },
  {
    suffix: "/close",
    scope: "session:operate",
    dispatch: (call, body) => call("closeThread", closeThreadPayloadSchema.parse(body)),
  },
  {
    suffix: "/steer/set",
    scope: "session:operate",
    dispatch: (call, body) => call("setPendingSteer", setPendingSteerPayloadSchema.parse(body)),
  },
  {
    suffix: "/steer/clear",
    scope: "session:operate",
    dispatch: (call, body) => call("clearPendingSteer", clearPendingSteerPayloadSchema.parse(body)),
  },
  {
    suffix: "/terminal/write",
    scope: "terminal:operate",
    dispatch: (call, body) => call("writeTerminal", writeTerminalPayloadSchema.parse(body)),
  },
  {
    suffix: "/terminal/resize",
    scope: "terminal:operate",
    dispatch: (call, body) => call("resizeTerminal", resizeTerminalPayloadSchema.parse(body)),
  },
  {
    // Closes a terminal by id. `closeThread` is shell-aware on the supervisor,
    // so this tears down a dev shell or a CLI thread's PTY alike.
    suffix: "/terminal/close",
    scope: "terminal:operate",
    dispatch: (call, body) => call("closeThread", closeThreadPayloadSchema.parse(body)),
  },
  {
    suffix: "/requests/resolve",
    scope: "requests:resolve",
    dispatch: (call, body) =>
      call("resolveThreadServerRequest", resolveThreadServerRequestPayloadSchema.parse(body)),
  },
];

function remoteCommandId(req: IncomingMessage): string | null {
  const raw = req.headers[REMOTE_COMMAND_ID_HEADER];
  const commandId = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!commandId) return null;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(commandId)) {
    throw new RemoteHttpError("invalid_command_id", "Remote command id is invalid.", 400);
  }
  return commandId;
}

async function runIdempotentRemoteMutation<T>(
  req: IncomingMessage,
  route: string,
  operation: () => Promise<T>,
): Promise<T> {
  const commandId = remoteCommandId(req);
  if (!commandId) return operation();

  const claim = dbClaimRemoteCommand(commandId, route);
  if (claim.state === "completed") return claim.response as T;
  if (claim.state === "conflict") {
    throw new RemoteHttpError(
      "command_id_conflict",
      "Remote command id was already used for another operation.",
      409,
    );
  }
  if (claim.state === "in_progress") {
    throw new RemoteHttpError("command_in_progress", "Remote command is already in progress.", 409);
  }
  if (claim.state === "failed") {
    throw new RemoteHttpError(
      "command_failed",
      "Remote command already failed and was not repeated.",
      409,
    );
  }

  try {
    const response = await operation();
    dbCompleteRemoteCommand(commandId, response);
    return response;
  } catch (error) {
    dbFailRemoteCommand(commandId);
    throw error;
  }
}

export async function handleHttp(
  ctx: RemoteServerContext,
  req: IncomingMessage,
  res: ServerResponse,
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
    // Lazily resolve the forward session at most once per request, and only for
    // the two branches that consume it (the static-asset branch and the reverse-
    // proxy fallthrough) — the vast majority of requests hit an explicit app
    // route above and never touch it. Memoized (not `??=`) because `null` is a
    // real "no session" result that must not trigger a re-resolve, and because
    // `resolveSession` slides the session's TTL, so it must run at most once.
    let sessionResolved = false;
    let sessionPort: number | null = null;
    const forwardTargetPort = (): number | null => {
      if (!sessionResolved) {
        sessionResolved = true;
        sessionPort = ctx.options.portProxy?.resolveSession(req.headers.cookie) ?? null;
      }
      return sessionPort;
    };
    if (
      req.method === "GET" &&
      (url.pathname === "/.well-known/poracode/environment" ||
        url.pathname === "/.well-known/lightcode/environment")
    ) {
      writeJson(res, 200, descriptor(ctx));
      return;
    }
    if (req.method === "GET" && isLegacyClientPath(url.pathname)) {
      res.writeHead(308, { location: `/${url.search}` });
      res.end();
      return;
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      // A forwarded development server owns `/` while its HttpOnly session is
      // active. Without a valid forward session, `/` is the canonical Poracode
      // app entry below.
      if (url.pathname === "/") {
        const targetPort = forwardTargetPort();
        if (targetPort) {
          proxyForwardedHttpRequest(req, res, targetPort);
          return;
        }
      }
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
      // An active forward session wins over the bundled canonical client: a
      // forwarded dev server's own `/assets/*` and `/icons/*` files must
      // stay reachable rather than being shadowed by this reservation. No
      // session (or no `portProxy` wired up) falls through to the client lookup
      // exactly as before this feature existed.
      const targetPort = forwardTargetPort();
      if (targetPort) {
        proxyForwardedHttpRequest(req, res, targetPort);
        return;
      }
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
    // Plain browser navigation (no bearer header available to a top-level
    // GET), so this is deliberately not scope-gated: the capability is the
    // one-time-ish `fwt` token itself, minted server-side by a bearer-gated
    // route (`POST /api/ports/forward` or `POST /api/ports/enter`).
    const forwardEnterMatch =
      req.method === "GET" ? /^\/forward\/([^/]+)\/enter$/.exec(url.pathname) : null;
    if (forwardEnterMatch) {
      const forwardId = decodeURIComponent(forwardEnterMatch[1] ?? "");
      const token = url.searchParams.get("fwt") ?? "";
      const consumed = ctx.options.portProxy?.consumeEnterToken(forwardId, token) ?? null;
      if (!consumed) {
        writeHtml(res, 400, buildForwardEnterErrorPageHtml());
        return;
      }
      res.writeHead(302, {
        location: "/",
        "set-cookie": buildForwardSessionCookieHeader(consumed.sessionId, consumed.maxAgeMs),
      });
      res.end();
      return;
    }
    if (req.method === "POST" && url.pathname === "/oauth/token") {
      ctx.security.enforceRateLimit(
        req,
        "oauth-token",
        ctx.options.tokenExchangeRateLimit ?? DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT,
      );
      const payload = remoteTokenExchangePayloadSchema.parse(await readJsonBody(req));
      writeJson(
        res,
        200,
        ctx.exchangePairingCredential({
          credential: payload.credential,
          ...(payload.scopes ? { scopes: payload.scopes } : {}),
          ...(payload.client ? { client: payload.client } : {}),
        }),
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/auth/websocket-ticket") {
      const token = ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, ctx.auth.issueWebSocketTicket({ accessToken: token }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/snapshot") {
      ctx.security.requireBearer(req, ["session:read"]);
      await writeNegotiatedJsonResponse(req, res, 200, buildShellSnapshot(ctx));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/agent-statuses") {
      ctx.security.requireBearer(req, ["session:read"]);
      await writeNegotiatedJsonResponse(req, res, 200, await buildAgentStatuses(ctx));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/host-update") {
      ctx.security.requireBearer(req, ["projects:manage"]);
      const updates = ctx.options.updates;
      if (!updates) {
        throw new RemoteHttpError(
          "host_update_unavailable",
          "This host cannot update itself remotely.",
          503,
        );
      }
      writeJson(res, 200, {
        currentVersion: updates.currentVersion(),
        status: updates.status(),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/host-update/check") {
      ctx.security.requireBearer(req, ["projects:manage"]);
      const updates = ctx.options.updates;
      if (!updates) {
        throw new RemoteHttpError(
          "host_update_unavailable",
          "This host cannot update itself remotely.",
          503,
        );
      }
      if (updates.status()?.type !== "downloaded") {
        await updates.check();
      }
      writeJson(res, 200, {
        currentVersion: updates.currentVersion(),
        status: updates.status(),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/host-update/install") {
      ctx.security.requireBearer(req, ["projects:manage"]);
      const updates = ctx.options.updates;
      if (!updates) {
        throw new RemoteHttpError(
          "host_update_unavailable",
          "This host cannot update itself remotely.",
          503,
        );
      }
      if (updates.status()?.type !== "downloaded") {
        throw new RemoteHttpError(
          "host_update_not_ready",
          "No host update is ready to install.",
          409,
        );
      }
      writeJson(res, 202, {});
      setImmediate(() => updates.install());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/provider-usage") {
      ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, await ctx.options.callSupervisor("getProviderUsage", {}));
      return;
    }
    const notesProjectId = projectIdFromPath(url.pathname, "notes");
    if (notesProjectId && req.method === "GET") {
      ctx.security.requireBearer(req, ["session:read"]);
      if (!dbGetProject(notesProjectId)) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      writeJson(res, 200, { notes: dbGetProjectNotes(notesProjectId) });
      return;
    }
    if (notesProjectId && req.method === "POST") {
      ctx.security.requireBearer(req, ["session:operate"]);
      if (!dbGetProject(notesProjectId)) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      const notes = projectNotesWriteBodySchema.parse(await readJsonBody(req));
      dbSetProjectNotes(projectNotesSchema.parse({ ...notes, projectId: notesProjectId }));
      writeJson(res, 200, {});
      return;
    }
    // Serves local images (chat attachments, markdown images) to paired
    // devices, standing in for the desktop-only `poracode-local` protocol.
    // <img> tags can't send Authorization headers, so this endpoint uniquely
    // also accepts the access token as an `access_token` query param; the
    // serving helper restricts reads to image file extensions.
    if (req.method === "GET" && url.pathname === "/api/files/image") {
      const header = Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization;
      const token = parseBearerAuthorizationHeader(header) ?? url.searchParams.get("access_token");
      if (!token) {
        throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
      }
      ctx.auth.authenticateBearerToken(token, ["session:read"]);
      await writeLocalImageFile(res, url.searchParams.get("path"));
      return;
    }
    // Resolves a host-minted image reference back to bytes. Unlike
    // `/api/files/image` this takes NO caller-supplied filesystem path: it
    // addresses a location inside the thread's own persisted runtime payload and
    // re-verifies that the addressed value really is an inline image, so a
    // prompt-injected tool result cannot steer it at the filesystem or network.
    // Shares the `access_token` query-param affordance because <img> tags cannot
    // send an Authorization header.
    const refImageMatch = /^\/api\/threads\/([^/]+)\/items\/([^/]+)\/image$/.exec(url.pathname);
    if (req.method === "GET" && refImageMatch) {
      const header = Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization;
      const token = parseBearerAuthorizationHeader(header) ?? url.searchParams.get("access_token");
      if (!token) {
        throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
      }
      ctx.auth.authenticateBearerToken(token, ["session:read"]);
      const path = parseImageRefPath(url.searchParams.get("path"));
      if (!path) {
        throw new RemoteHttpError("invalid_path", "An image reference path is required.", 400);
      }
      const resolved = resolveImageRef(
        decodeURIComponent(refImageMatch[1]!),
        decodeURIComponent(refImageMatch[2]!),
        path,
      );
      if (!resolved) {
        throw new RemoteHttpError("image_not_found", "No inline image at that reference.", 404);
      }
      res.writeHead(200, {
        "content-type": resolved.mime,
        "content-length": resolved.data.length,
        // Immutable: a runtime item's image bytes never change under the same
        // id, so the client can reuse it for the life of the transcript.
        "cache-control": "private, max-age=31536000, immutable",
      });
      res.end(resolved.data);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/files/attachment") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const threadId = url.searchParams.get("threadId")?.trim();
      const fileName = url.searchParams.get("name")?.trim();
      if (!threadId || !fileName || fileName.length > 255) {
        throw new RemoteHttpError(
          "invalid_attachment",
          "An attachment thread id and file name are required.",
          400,
        );
      }
      const attachments = ctx.options.attachments;
      if (!attachments) {
        throw new RemoteHttpError(
          "attachments_unavailable",
          "Remote attachment uploads are unavailable.",
          503,
        );
      }
      const data = await readAttachmentBody(req);
      if (data.length === 0) {
        throw new RemoteHttpError("empty_attachment", "The attachment is empty.", 400);
      }
      writeJson(res, 200, {
        path: attachments.save({ threadId, fileName, data }),
      });
      return;
    }
    // Profile: identity + local usage stats, computed straight from this
    // desktop's SQLite store (no supervisor round-trip, unlike git/provider
    // calls). Reads mirror the provider-usage/agent-statuses read scope;
    // the identity write mirrors the settings write scope.
    if (req.method === "GET" && url.pathname === "/api/profile/devices") {
      ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, getProfileDevicesResponse());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/profile/core-stats") {
      ctx.security.requireBearer(req, ["session:read"]);
      const payload = profileStatsRequestSchema.parse(await readJsonBody(req));
      writeJson(res, 200, getProfileCoreStats(payload));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/profile/token-stats") {
      ctx.security.requireBearer(req, ["session:read"]);
      const payload = profileStatsRequestSchema.parse(await readJsonBody(req));
      writeJson(res, 200, getProfileTokenStats(payload));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/profile/identity") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const identity = profileIdentitySchema.parse(await readJsonBody(req));
      writeJson(res, 200, setProfileIdentityResponse(identity));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/settings") {
      ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, { settings: ctx.requireSettingsGateway().read() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/settings") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const patch = remoteSettingsPatchSchema.parse(await readJsonBody(req));
      writeJson(res, 200, { settings: ctx.requireSettingsGateway().update(patch) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/settings/mcp-servers") {
      ctx.security.requireBearer(req, ["projects:manage"]);
      writeJson(res, 200, ctx.requireSettingsGateway().readMcpServers());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/settings/mcp-servers/command") {
      ctx.security.requireBearer(req, ["projects:manage"]);
      const command = remoteMcpSettingsCommandSchema.parse(await readJsonBody(req));
      writeJson(res, 200, ctx.requireSettingsGateway().commandMcpServers(command));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/settings/mcp-servers/operation") {
      ctx.security.requireBearer(req, ["projects:manage"]);
      const operation = remoteMcpSettingsOperationSchema.parse(await readJsonBody(req));
      const gateway = ctx.requireSettingsGateway();
      switch (operation.kind) {
        case "probe": {
          const resolved = gateway.resolveServer(operation.scope, operation.serverId);
          const result = await ctx.options.callSupervisor("probeMcpServer", resolved);
          writeJson(res, 200, { kind: "probe", result });
          return;
        }
        case "oauth-status": {
          const resolved = gateway.resolveScope(operation.scope);
          const status = await ctx.options.callSupervisor("getMcpOauthStatus", {
            ...(resolved.projectLocation ? { projectLocation: resolved.projectLocation } : {}),
          });
          const authenticated = new Set(status.authenticatedUrls);
          writeJson(res, 200, {
            kind: "oauth-status",
            authenticatedServerIds: resolved.servers
              .filter((server) => {
                const endpoint = mcpEndpointUrl(server);
                return endpoint !== null && authenticated.has(endpoint);
              })
              .map((server) => server.id),
          });
          return;
        }
        case "oauth-begin": {
          const resolved = gateway.resolveServer(operation.scope, operation.serverId);
          const result = await ctx.options.callSupervisor("beginMcpServerOauth", resolved);
          writeJson(res, 200, { kind: "oauth-begin", result });
          return;
        }
        case "oauth-wait": {
          const resolved = gateway.resolveScope(operation.scope);
          const result = await ctx.options.callSupervisor("waitMcpServerOauth", {
            flowId: operation.flowId,
            ...(resolved.projectLocation ? { projectLocation: resolved.projectLocation } : {}),
          });
          writeJson(res, 200, { kind: "oauth-wait", result });
          return;
        }
        case "oauth-clear": {
          const resolved = gateway.resolveServer(operation.scope, operation.serverId);
          const endpoint = mcpEndpointUrl(resolved.server);
          if (!endpoint) {
            throw new RemoteHttpError(
              "mcp_oauth_transport_unsupported",
              "This MCP server does not support OAuth.",
              400,
            );
          }
          await ctx.options.callSupervisor("clearMcpServerOauth", {
            url: endpoint,
            ...(resolved.projectLocation ? { projectLocation: resolved.projectLocation } : {}),
          });
          writeJson(res, 200, { kind: "oauth-clear" });
          return;
        }
      }
    }
    if (req.method === "GET" && url.pathname === "/api/schedules") {
      ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, { schedules: ctx.requireSchedulesGateway().list() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/schedules/runs") {
      ctx.security.requireBearer(req, ["session:read"]);
      const { id } = scheduledTaskIdPayloadSchema.parse({ id: url.searchParams.get("id") });
      writeJson(res, 200, { runs: ctx.requireSchedulesGateway().runs(id) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/schedules/command") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const command = remoteScheduleCommandSchema.parse(await readJsonBody(req));
      const schedules = ctx.requireSchedulesGateway();
      if (command.kind === "delete") {
        schedules.delete(command.id);
        writeJson(res, 200, { schedules: schedules.list() });
        return;
      }
      const schedule =
        command.kind === "create"
          ? schedules.create(command.task)
          : command.kind === "update"
            ? schedules.update(command.id, command.task)
            : schedules.runNow(command.id);
      writeJson(res, 200, { schedule, schedules: schedules.list() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/pr-watches") {
      ctx.security.requireBearer(req, ["session:read"]);
      const key = prWatchKeySchema.parse({
        projectId: url.searchParams.get("projectId"),
        prNumber: Number(url.searchParams.get("prNumber")),
      });
      writeJson(res, 200, {
        watch: ctx.requirePrWatchesGateway().get(key.projectId, key.prNumber),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/pr-watches/check") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const key = prWatchKeySchema.parse(await readJsonBody(req));
      ctx.requirePrWatchesGateway().requestCheck(key.projectId, key.prNumber);
      writeJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/pr-watches") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const input = prWatchInputSchema.parse(await readJsonBody(req));
      writeJson(res, 200, { watch: ctx.requirePrWatchesGateway().upsert(input) });
      return;
    }
    if (req.method === "DELETE" && url.pathname === "/api/pr-watches") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const key = prWatchKeySchema.parse(await readJsonBody(req));
      ctx.requirePrWatchesGateway().delete(key.projectId, key.prNumber);
      writeJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/browser/state") {
      ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, { state: await ctx.requireBrowserGateway().state() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/browser/command") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const command = remoteBrowserCommandSchema.parse(await readJsonBody(req));
      writeJson(res, 200, { state: await ctx.requireBrowserGateway().command(command) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/ports") {
      ctx.security.requireBearer(req, ["ports:forward"]);
      const gateway = ctx.requirePortForwardGateway();
      const detected = await gateway.scanPorts();
      writeJson(
        res,
        200,
        remotePortsStateSchema.parse({ detected, forwards: gateway.listForwards() }),
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ports/forward") {
      ctx.security.requireBearer(req, ["ports:forward"]);
      const { targetPort } = remotePortForwardRequestSchema.parse(await readJsonBody(req));
      const forward = await ctx.requirePortForwardGateway().startForward(targetPort);
      // `portProxy` is absent on a host that only has the raw-TCP gateway
      // wired up (e.g. an older build mid-rollout); `enterPath` is then
      // omitted rather than the whole response failing.
      const enterPath = ctx.options.portProxy?.issueEnterToken(forward.id).path;
      writeJson(
        res,
        200,
        remotePortForwardResultSchema.parse({
          forward,
          ...(enterPath ? { enterPath } : {}),
        }),
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ports/enter") {
      ctx.security.requireBearer(req, ["ports:forward"]);
      const { id } = remotePortEnterRequestSchema.parse(await readJsonBody(req));
      if (ctx.requirePortForwardGateway().getForward(id) === null) {
        throw new RemoteHttpError("forward_not_found", "Port forward not found.", 404);
      }
      const { path } = ctx.requirePortProxy().issueEnterToken(id);
      writeJson(res, 200, remotePortEnterResultSchema.parse({ enterPath: path }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ports/unforward") {
      ctx.security.requireBearer(req, ["ports:forward"]);
      const { id } = remotePortUnforwardRequestSchema.parse(await readJsonBody(req));
      await ctx.requirePortForwardGateway().stopForward(id);
      writeJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/git/call") {
      writeJson(res, 200, { result: await runRemoteProcedure(ctx, req) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/projects/command") {
      ctx.security.requireBearer(req, ["projects:manage"]);
      const command = remoteProjectCommandSchema.parse(await readJsonBody(req));
      const result = await runProjectCommand(ctx, command);
      // Tell every connected client to refresh its shell snapshot.
      ctx.publishSupervisorEvent({
        type: "remote-projects-changed",
        projects: result.response.projects,
      });
      // Remote responses deliberately omit sensitive project settings such as
      // MCP server definitions. The host renderer persists this internal
      // notification, so give it the authoritative rows rather than the
      // redacted response or it would write the omitted settings back as null.
      ctx.options.onProjectsChanged?.(result.projects);
      writeJson(res, 200, result.response);
      return;
    }
    const projectSettingsId = projectIdFromPath(url.pathname, "settings");
    if (req.method === "GET" && projectSettingsId) {
      ctx.security.requireBearer(req, ["projects:manage"]);
      const project = dbGetProject(projectSettingsId);
      if (!project) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      writeJson(
        res,
        200,
        remoteProjectSettingsSchema.parse({
          ...(project.mcpServers ? { mcpServers: project.mcpServers } : {}),
        }),
      );
      return;
    }
    // Push config/registration is gated on session:operate (no separate push scope),
    // so already-paired devices register without re-pairing. POST (not
    // DELETE) for both, matching the existing endpoint conventions.
    if (req.method === "GET" && url.pathname === "/api/push/config") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const publicKey = await ctx.requirePushRegistrations().webPublicKey();
      writeJson(res, 200, { publicKey });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/push/register") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const registration = remotePushRegistrationSchema.parse(await readJsonBody(req));
      if (
        registration.routing &&
        registration.routing.desktopId !== ctx.options.identity.desktopId
      ) {
        throw new RemoteHttpError(
          "push_routing_desktop_mismatch",
          "Push registration targets a different desktop.",
          409,
        );
      }
      ctx.requirePushRegistrations().upsert(registration);
      writeJson(res, 200, {
        ok: true,
        ...(registration.routing ? { routing: { version: registration.routing.version } } : {}),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/push/unregister") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const { deviceId, routing } = remotePushUnregisterSchema.parse(await readJsonBody(req));
      if (routing && routing.desktopId !== ctx.options.identity.desktopId) {
        throw new RemoteHttpError(
          "push_routing_desktop_mismatch",
          "Push unregistration targets a different desktop.",
          409,
        );
      }
      ctx.requirePushRegistrations().remove(deviceId, routing);
      writeJson(res, 200, { ok: true });
      return;
    }
    const historyItemsThreadId = threadIdFromPath(url.pathname, "/history/items");
    if (req.method === "GET" && historyItemsThreadId) {
      ctx.security.requireBearer(req, ["session:read"]);
      const beforePosition = url.searchParams.get("beforePosition");
      const targetTimelineEntryCount = url.searchParams.get("targetTimelineEntryCount");
      const input = remoteRuntimeItemsPageRequestSchema.parse({
        threadId: historyItemsThreadId,
        limit: Number(url.searchParams.get("limit")),
        ...(beforePosition !== null ? { beforePosition: Number(beforePosition) } : {}),
        ...(targetTimelineEntryCount !== null
          ? { targetTimelineEntryCount: Number(targetTimelineEntryCount) }
          : {}),
      });
      await writeNegotiatedJsonResponse(req, res, 200, buildThreadRuntimeItemsPage(input));
      return;
    }
    const historyThreadId = threadIdFromPath(url.pathname, "/history");
    if (req.method === "GET" && historyThreadId) {
      ctx.security.requireBearer(req, ["session:read"]);
      const targetTimelineEntryCount = url.searchParams.get("targetTimelineEntryCount");
      await writeNegotiatedJsonResponse(
        req,
        res,
        200,
        await buildThreadSnapshot(ctx, historyThreadId, {
          runtimePage: url.searchParams.get("runtimePage") === "1",
          ...(targetTimelineEntryCount !== null
            ? {
                targetTimelineEntryCount: remoteTimelineEntryCountSchema.parse(
                  Number(targetTimelineEntryCount),
                ),
              }
            : {}),
        }),
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/threads/start") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const payload = startThreadPayloadSchema.parse(await readJsonBody(req));
      if (!payload.threadId) {
        throw new RemoteHttpError(
          "thread_id_required",
          "Remote thread start requires an existing thread id.",
          400,
        );
      }
      const thread = dbGetThread(payload.threadId);
      if (!thread) {
        throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
      }
      assertRemoteThreadStartExperimentSafe(payload.threadId);
      const mcpSnapshot =
        ctx.options.resolveMcpLaunchSnapshot?.(thread.projectId) ?? emptyMcpLaunchSnapshot();
      const result = await runIdempotentRemoteMutation(req, url.pathname, () =>
        ctx.options.callSupervisor("startThread", { ...payload, ...mcpSnapshot }),
      );
      writeJson(res, 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/terminal/start") {
      // Spawns a dev shell. The id is carried in the body (`shellId`), not the
      // path, since this isn't scoped to a thread.
      ctx.security.requireBearer(req, ["terminal:operate"]);
      const payload = startShellPayloadSchema.parse(await readJsonBody(req));
      await ctx.options.callSupervisor("startShell", payload);
      writeJson(res, 200, { ok: true });
      return;
    }
    const commandThreadId = threadIdFromPath(url.pathname, "/command");
    const truncateThreadId = threadIdFromPath(url.pathname, "/runtime/truncate");
    if (req.method === "POST" && truncateThreadId) {
      ctx.security.requireBearer(req, ["session:operate"]);
      const body = await readJsonBody(req);
      const payload = dbTruncateRuntimeItemsPayloadSchema.parse({
        ...(typeof body === "object" && body !== null ? body : {}),
        threadId: truncateThreadId,
      });
      dbTruncateThreadRuntimeAfter(payload.threadId, payload.itemId);
      ctx.publishThreadsChanged([payload.threadId]);
      writeJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && commandThreadId) {
      ctx.security.requireBearer(req, ["session:operate"]);
      const body = await readJsonBody(req);
      const command = remoteThreadCommandSchema.parse({
        ...(typeof body === "object" && body !== null ? body : {}),
        threadId: commandThreadId,
      });
      assertRemoteThreadCommandExperimentSafe(command);
      const dispatch = async () => {
        if (command.kind === "start" && command.isNewWorktree && command.worktreePath) {
          await applyRemoteThreadCommand(ctx, {
            kind: "prepare-worktree",
            threadId: command.threadId,
            projectId: command.projectId,
            worktreePath: command.worktreePath,
          });
          await ctx.options.dispatchThreadCommand?.({
            kind: "prepare-worktree",
            threadId: command.threadId,
            projectId: command.projectId,
            worktreePath: command.worktreePath,
          });
        }
        const requiresRenderer = await applyRemoteThreadCommand(ctx, command);
        if (requiresRenderer && (await ctx.options.dispatchThreadCommand?.(command)) !== true) {
          throw new RemoteHttpError(
            "desktop_unavailable",
            "The desktop app is not available to apply this change.",
            503,
          );
        }
        if (!requiresRenderer) {
          const rendererCommand = (() => {
            if (command.kind !== "start") return command;
            const { isNewWorktree: _isNewWorktree, ...startCommand } = command;
            return { ...startCommand, launchRuntime: false };
          })();
          await ctx.options.dispatchThreadCommand?.(rendererCommand);
          if (command.kind === "acknowledge") {
            ctx.publishSupervisorEvent({
              type: "remote-threads-changed",
              threadIds: [command.threadId],
              viewedThreadIds: [command.threadId],
            });
          } else {
            ctx.publishThreadsChanged([command.threadId]);
          }
        }
        return { ok: true };
      };
      const result =
        command.kind === "start"
          ? await runIdempotentRemoteMutation(req, url.pathname, dispatch)
          : await dispatch();
      writeJson(res, 200, result);
      return;
    }
    if (req.method === "POST") {
      for (const route of THREAD_POST_ROUTES) {
        const threadId = threadIdFromPath(url.pathname, route.suffix);
        if (!threadId) continue;
        ctx.security.requireBearer(req, [route.scope]);
        const body = await readJsonBody(req);
        const dispatch = async () => {
          await route.dispatch(ctx.options.callSupervisor, {
            ...(typeof body === "object" && body !== null ? body : {}),
            threadId,
          });
          return { ok: true };
        };
        const result = route.idempotent
          ? await runIdempotentRemoteMutation(req, url.pathname, dispatch)
          : await dispatch();
        writeJson(res, 200, result);
        return;
      }
    }
    // Reverse-proxy fallthrough: anything above is a reserved app route (see
    // `isReservedForwardProxyPath`), so only reachable here for a path a
    // forwarded dev server itself owns. An `lc_forward` session cookie
    // resolves it straight to that dev server; no session (or no `portProxy`
    // wired up on this host) 404s exactly as before this feature existed.
    if (!isReservedForwardProxyPath(url.pathname)) {
      const targetPort = forwardTargetPort();
      if (targetPort) {
        proxyForwardedHttpRequest(req, res, targetPort);
        return;
      }
    }
    writeError(res, new RemoteHttpError("not_found", "Remote endpoint not found.", 404));
  } catch (error) {
    writeError(res, error);
  }
}
