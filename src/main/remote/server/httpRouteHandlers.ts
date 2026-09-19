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
} from "@/shared/remote";
import {
  checkpointRevertPayloadSchema,
  closeThreadPayloadSchema,
  clearPendingSteerPayloadSchema,
  controlThreadGoalPayloadSchema,
  interruptThreadPayloadSchema,
  prWatchAgentSyncSchema,
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
import { SettingsWriteRefusedError } from "@/backend/settings/settingsCompatWrites";
import { dbTruncateRuntimeItemsPayloadSchema } from "@/shared/ipc/schemas";
import type { RemoteHttpRouteId } from "@/shared/remote/contract";
import {
  projectNotesWriteBodySchema,
  startExistingThreadBodySchema,
} from "@/shared/remote/contract/routeBodies";
import {
  remoteMcpSettingsCommandSchema,
  remoteMcpSettingsOperationSchema,
} from "@/shared/remote/contract/routeSchemas";
import {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
  dbResetRemoteCommand,
  dbGetCheckpointRevertOperation,
  dbGetProject,
  dbGetProjectNotes,
  dbGetThread,
  dbGetThreads,
  dbSetProjectNotes,
} from "../../db";
import { redactMcpServer } from "../../app-controls/mcp/tools/settings";
import {
  getProfileCoreStats,
  getProfileDevicesResponse,
  getProfileTokenStats,
  setProfileIdentityResponse,
} from "../../profile";
import {
  parseBearerAuthorizationHeader,
  RemoteHttpError,
  type AuthenticatedRemoteSession,
} from "../auth";
import {
  REMOTE_AUDIT_LOG_VERSION,
  type RemoteAuditEvent,
  type RemoteAuditEventDetail,
} from "./auditLog";
import {
  assertRemoteThreadCommandExperimentSafe,
  assertRemoteThreadStartExperimentSafe,
} from "../experimentOwnership";
import {
  FORWARD_ORIGIN_UNAVAILABLE,
  type ForwardOriginIdentity,
} from "../portForward/forwardOriginIdentity";
import { buildForwardEnterErrorPageHtml } from "../pairingPage";
import type { RemoteAccessServerOptions } from "../RemoteAccessServer";
import type { RemoteServerContext } from "./context";
import {
  writeHardenedImageResponse,
  writeHtml,
  writeJson,
  writeNegotiatedJsonResponse,
} from "./httpResponses";
import { writeLocalImageFile } from "./localImageFile";
import {
  IMAGE_TICKET_QUERY_PARAM,
  imageTicketRequestBodySchema,
  imageTickets,
} from "./imageTickets";
import { parseImageRefPath, resolveImageRef } from "./imageRefProjection";
import { readAttachmentBody, readJsonBody } from "./requestBody";
import { DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT } from "./security";
import {
  buildAgentStatuses,
  buildAgentSlashCommands,
  buildShellSnapshot,
  buildThreadListPage,
  buildThreadSnapshot,
  buildThreadRuntimeItemsPage,
  descriptor,
} from "./snapshots";
import {
  applyRemoteThreadCommand,
  applyRemoteThreadSwitch,
  ensureRemoteThreadRunning,
  runProjectCommand,
  runRemoteProcedure,
} from "./threadCommands";

/**
 * Per-route arguments handed to {@link HttpRouteHandler}s.
 *
 * `params` holds the RAW (still percent-encoded) values captured by the route's
 * `{param}` path template; each handler decodes them with exactly the
 * semantics its pre-registry implementation used.
 *
 * `bearerToken` is the authenticated access token when the dispatcher enforced
 * the route's registry scopes (`auth: "bearer"` without procedure-defined
 * scope resolution), and null for every route that owns its own
 * authentication flow. `session` is the authenticated session for the same
 * routes (null otherwise) — the audit trail uses its id to attribute events.
 */
export interface HttpRouteCall {
  readonly ctx: RemoteServerContext;
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly forwardOrigin: ForwardOriginIdentity | null;
  readonly bearerToken: string | null;
  readonly session: AuthenticatedRemoteSession | null;
  readonly params: Readonly<Record<string, string>>;
}

export type HttpRouteHandler = (call: HttpRouteCall) => Promise<void> | void;

/**
 * Gate 6 item 4.7 (S7): appends one audit line for a security-relevant route
 * event. The sink is optional (hosts opt in via `RemoteAccessServerOptions
 * .audit`); events are attributed to the authenticated session when the
 * dispatcher enforced one. Recorded before the operation runs, so an append
 * for an event that later fails still reflects the authenticated attempt.
 */
export function auditRouteEvent(
  call: Pick<HttpRouteCall, "ctx" | "session">,
  kind: RemoteAuditEvent["kind"],
  detail?: RemoteAuditEventDetail,
): void {
  call.ctx.options.audit?.record({
    v: REMOTE_AUDIT_LOG_VERSION,
    at: new Date().toISOString(),
    kind,
    ...(call.session ? { sessionId: call.session.sessionId } : {}),
    ...(detail ? { detail } : {}),
  });
}

/**
 * The complete HTTP handler table, keyed by the registry's CLOSED route-id
 * union. This is the structural drift gate: a registry route without a handler
 * here fails typecheck (missing property), and a handler for a route that is
 * not in the registry fails typecheck (excess property). Dispatch iterates the
 * registry's route contracts and looks handlers up by id, so an HTTP path that
 * is not registered can never reach a handler.
 */
export type HttpRouteHandlerTable = {
  readonly [RouteId in RemoteHttpRouteId]: HttpRouteHandler;
};

/**
 * Decodes a matched `{param}` value with the historical thread/project path
 * helpers' semantics: a malformed escape or an encoded "/" produces the same
 * canonical 404 the unmatched-path fallback always produced.
 */
export function requirePathParam(params: Readonly<Record<string, string>>, name: string): string {
  const raw = params[name];
  if (raw) {
    try {
      const decoded = decodeURIComponent(raw);
      if (!decoded.includes("/")) return decoded;
    } catch {
      // Fall through to the canonical not_found below.
    }
  }
  throw new RemoteHttpError("not_found", "Remote endpoint not found.", 404);
}

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
  options: {
    readonly isRetryableResult?: (response: T) => boolean;
    /**
     * Validates (and may adjust) a completed outer receipt before it is
     * replayed. Throw to conflict instead of replaying a stale receipt for a
     * different explicit request. Used by checkpoint-revert so an outer cache
     * hit can never bypass the canonical target check.
     */
    readonly mapCompletedResponse?: (cached: T) => T;
  } = {},
): Promise<T> {
  const commandId = remoteCommandId(req);
  if (!commandId) return operation();

  const claim = dbClaimRemoteCommand(commandId, route, {
    ...(options.isRetryableResult
      ? { isCompletedResponseRetryable: (response) => options.isRetryableResult!(response as T) }
      : {}),
  });
  if (claim.state === "completed") {
    const cached = claim.response as T;
    return options.mapCompletedResponse ? options.mapCompletedResponse(cached) : cached;
  }
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
    if (options.isRetryableResult?.(response)) {
      // The operation journal owns retryable application phases. Release the
      // transport receipt so the same command ID can explicitly resume it.
      dbResetRemoteCommand(commandId);
    } else {
      dbCompleteRemoteCommand(commandId, response);
    }
    return response;
  } catch (error) {
    dbFailRemoteCommand(commandId);
    throw error;
  }
}

/**
 * Canonical target validation for a checkpoint-revert outer-receipt hit.
 * The outer `remote_command_receipts` row is keyed by
 * `checkpoint-revert:${operationKey}` and routed by thread path; it does not
 * store the checkpoint item. Before replaying it, bind to the inner journal's
 * frozen target: a same-ID request for a different checkpoint (or thread)
 * conflicts exactly like the journal's hard conflict, with zero side effects.
 * A missing inner row (retention-aged or pre-journal legacy receipt) replays
 * the outer frozen result rather than starting a new mutation. The replay
 * marks `replayed:true` so HTTP agrees with local-direct replay semantics.
 */
export function mapCheckpointRevertCompletedResponse<T>(
  payload: { threadId: string; checkpointItemId: string; operationKey: string },
  cached: T,
): T {
  const inner = dbGetCheckpointRevertOperation(payload.operationKey);
  if (inner) {
    if (
      inner.threadId !== payload.threadId ||
      inner.checkpointItemId !== payload.checkpointItemId
    ) {
      throw new RemoteHttpError(
        "command_id_conflict",
        "Remote command id was already used for another operation.",
        409,
      );
    }
  }
  if (cached !== null && typeof cached === "object" && "replayed" in cached) {
    return { ...(cached as Record<string, unknown>), replayed: true } as T;
  }
  return cached;
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
 * POST /api/threads/{threadId}<suffix> endpoints that validate the body (merged
 * with the path's threadId) and forward it to a supervisor procedure. Scope
 * enforcement comes from the route's registry contract, applied by the
 * dispatcher.
 */
async function forwardThreadBodyPost(
  call: HttpRouteCall,
  dispatch: (
    callSupervisor: RemoteAccessServerOptions["callSupervisor"],
    body: Record<string, unknown>,
  ) => Promise<unknown>,
  options: { readonly idempotent?: boolean } = {},
): Promise<void> {
  const { ctx, req, res, url, params } = call;
  const threadId = requirePathParam(params, "threadId");
  const body = await readJsonBody(req);
  const run = async () => {
    await dispatch(ctx.options.callSupervisor, {
      ...(typeof body === "object" && body !== null ? body : {}),
      threadId,
    });
    return { ok: true };
  };
  const result = options.idempotent
    ? await runIdempotentRemoteMutation(req, url.pathname, run)
    : await run();
  writeJson(res, 200, result);
}

export const ROUTE_HANDLERS: HttpRouteHandlerTable = {
  environment: ({ ctx, res }) => {
    writeJson(res, 200, descriptor(ctx));
  },

  "environment-legacy": ({ ctx, res }) => {
    writeJson(res, 200, descriptor(ctx));
  },

  "forward-enter": async ({ ctx, res, url, params, forwardOrigin }) => {
    // Plain browser navigation (no bearer header available to a top-level
    // GET), so this is deliberately not scope-gated: the capability is the
    // one-time-ish `fwt` token itself, minted server-side by a bearer-gated
    // route (`POST /api/ports/forward` or `POST /api/ports/enter`).
    //
    // Two-hop entry into the forward's ISOLATED child origin: this API-origin
    // route validates the token and redirects (no-store, no referrer) to the
    // child origin's one-use exchange, which is what mints the `__Host-`
    // session cookie there. No cookie is ever minted on the API origin.
    const availability =
      ctx.options.portProxy?.forwardOriginAvailability(forwardOrigin) ?? FORWARD_ORIGIN_UNAVAILABLE;
    if (!availability.available) {
      throw new RemoteHttpError(
        "forward_browser_unavailable",
        "Browser forwarding requires a configured forward origin on this host.",
        503,
      );
    }
    const forwardId = decodeURIComponent(params.forwardId ?? "");
    const token = url.searchParams.get("fwt") ?? "";
    const exchange = ctx.requirePortProxy().beginExchange(forwardId, token);
    if (!exchange) {
      writeHtml(res, 400, buildForwardEnterErrorPageHtml());
      return;
    }
    res.writeHead(302, {
      location: exchange.exchangeUrl,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
    res.end();
  },

  "token-exchange": async ({ ctx, req, res }) => {
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
  },

  "websocket-ticket": ({ ctx, res, bearerToken }) => {
    // The dispatcher already enforced the route's registry scopes; the token
    // is exchanged for a short-lived WebSocket ticket here.
    if (!bearerToken) {
      throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
    }
    writeJson(res, 200, ctx.auth.issueWebSocketTicket({ accessToken: bearerToken }));
  },

  "shell-snapshot": async ({ ctx, req, res, url }) => {
    // Gate 4 hazard #3: `threadLimit` opts the client into a bounded thread
    // list (head page + threadsNextCursor); absent keeps the full list for
    // clients that have not opted in.
    const threadLimitRaw = url.searchParams.get("threadLimit");
    let threadListLimit: number | undefined;
    if (threadLimitRaw !== null) {
      threadListLimit = Number(threadLimitRaw);
      if (
        threadLimitRaw === "" ||
        !Number.isSafeInteger(threadListLimit) ||
        threadListLimit < 1 ||
        threadListLimit > 200
      ) {
        throw new RemoteHttpError(
          "invalid_thread_limit",
          "threadLimit must be an integer between 1 and 200.",
          400,
        );
      }
    }
    await writeNegotiatedJsonResponse(
      req,
      res,
      200,
      buildShellSnapshot(ctx, threadListLimit !== undefined ? { threadListLimit } : {}),
    );
  },

  "thread-list": async ({ ctx, req, res, url }) => {
    const limitRaw = url.searchParams.get("limit");
    const limit = Number(limitRaw);
    if (limitRaw === null || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new RemoteHttpError(
        "invalid_thread_limit",
        "limit must be an integer between 1 and 200.",
        400,
      );
    }
    const cursor = url.searchParams.get("cursor");
    await writeNegotiatedJsonResponse(
      req,
      res,
      200,
      buildThreadListPage(ctx, { limit, ...(cursor !== null ? { cursor } : {}) }),
    );
  },

  "agent-statuses": async ({ ctx, req, res, url }) => {
    const omitSlashCommands = url.searchParams.get("slashCommands") === "0";
    await writeNegotiatedJsonResponse(
      req,
      res,
      200,
      await buildAgentStatuses(ctx, { omitSlashCommands }),
    );
  },

  "agent-slash-commands": async ({ ctx, req, res, params }) => {
    const kind = decodeURIComponent(params.kind ?? "");
    await writeNegotiatedJsonResponse(req, res, 200, await buildAgentSlashCommands(ctx, kind));
  },

  "host-update": async ({ ctx, res }) => {
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
  },

  "host-update-check": async ({ ctx, res }) => {
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
  },

  "host-update-install": async ({ ctx, res }) => {
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
    await new Promise<void>((resolve) => setImmediate(resolve));
    updates.install();
  },

  "provider-usage": async ({ ctx, res }) => {
    writeJson(res, 200, await ctx.options.callSupervisor("getProviderUsage", {}));
  },

  "project-notes-read": ({ res, params }) => {
    const notesProjectId = requirePathParam(params, "projectId");
    if (!dbGetProject(notesProjectId)) {
      throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
    }
    writeJson(res, 200, { notes: dbGetProjectNotes(notesProjectId) });
  },

  "project-notes-write": async ({ req, res, params }) => {
    const notesProjectId = requirePathParam(params, "projectId");
    if (!dbGetProject(notesProjectId)) {
      throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
    }
    const notes = projectNotesWriteBodySchema.parse(await readJsonBody(req));
    dbSetProjectNotes(projectNotesSchema.parse({ ...notes, projectId: notesProjectId }));
    writeJson(res, 200, {});
  },

  "local-image": async ({ ctx, req, res, url }) => {
    // Serves local images (chat attachments, markdown images) to paired
    // devices, standing in for the desktop-only `poracode-local` protocol.
    //
    // Path scope (B5b decision — justified, not aligned with
    // `readAbsoluteFile`'s projects:manage): this route is the paired-device
    // stand-in for the desktop `poracode-local` handler, and chat content
    // legitimately references images anywhere on the host (workspace-external
    // markdown included), so a projects:manage gate would break rendering of
    // content a session:read client is already allowed to display. The
    // absolute-path power stays bounded by the image-extension allowlist and
    // the 20 MiB cap in `writeLocalImageFile`, and standard pairing grants all
    // scopes anyway — while a deliberately scoped-down read-only device would
    // lose chat images under the stronger scope.
    //
    // Transport: the Authorization header is primary. <img> tags use the
    // one-time `ticket` query param minted above. The raw `access_token`
    // query param is DEPRECATED — it is kept only until the hosted PWA client
    // migrates to tickets and must never be copied into new clients.
    const header = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const bearerToken = parseBearerAuthorizationHeader(header);
    const imageTicket = url.searchParams.get(IMAGE_TICKET_QUERY_PARAM);
    const legacyQueryParamToken = url.searchParams.get("access_token");
    const imagePath = url.searchParams.get("path");
    let imageSession: AuthenticatedRemoteSession | null = null;
    if (bearerToken) {
      imageSession = ctx.auth.authenticateBearerToken(bearerToken, ["session:read"]);
    } else if (imageTicket) {
      imageTickets.consume(imageTicket, imagePath ?? "");
    } else if (legacyQueryParamToken) {
      imageSession = ctx.auth.authenticateBearerToken(legacyQueryParamToken, ["session:read"]);
    } else {
      throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
    }
    // Gate 6 item 4.7 (S7): image reads are audited file reads. The requested
    // path is client-influenced (the allowlist bounds it to image extensions),
    // so it is recorded as-is for traceability.
    auditRouteEvent({ ctx, session: imageSession }, "file_read", {
      ...(imagePath ? { path: imagePath } : {}),
    });
    await writeLocalImageFile(res, imagePath);
  },

  "local-image-ticket": async ({ req, res }) => {
    // Mints a short-lived, one-time, path-scoped ticket for
    // `GET /api/files/image` (B5b): <img> consumers cannot send an
    // Authorization header, and a long-lived bearer token in the query string
    // leaks into proxy/relay access logs — the ticket expires in 30 seconds,
    // works for exactly one request, and serves exactly the minted path.
    const body = imageTicketRequestBodySchema.parse(await readJsonBody(req));
    writeJson(res, 200, imageTickets.issue(body.path));
  },

  "runtime-image": async ({ ctx, req, res, url, params }) => {
    // Resolves a host-minted image reference back to bytes. Unlike
    // `/api/files/image` this takes NO caller-supplied filesystem path: it
    // addresses a location inside the thread's own persisted runtime payload and
    // re-verifies that the addressed value really is an inline image, so a
    // prompt-injected tool result cannot steer it at the filesystem or network.
    // Shares the `access_token` query-param affordance because <img> tags cannot
    // send an Authorization header.
    const header = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const token = parseBearerAuthorizationHeader(header) ?? url.searchParams.get("access_token");
    if (!token) {
      throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
    }
    const imageSession = ctx.auth.authenticateBearerToken(token, ["session:read"]);
    const threadId = decodeURIComponent(params.threadId ?? "");
    const itemId = decodeURIComponent(params.itemId ?? "");
    const path = parseImageRefPath(url.searchParams.get("path"));
    if (!path) {
      throw new RemoteHttpError("invalid_path", "An image reference path is required.", 400);
    }
    const resolved = resolveImageRef(threadId, itemId, path);
    if (!resolved) {
      throw new RemoteHttpError("image_not_found", "No inline image at that reference.", 404);
    }
    auditRouteEvent({ ctx, session: imageSession }, "file_read", { threadId, itemId });
    // Gate 6 item 4.4 (S4): client-origin image bytes get the hardened header
    // set; SVG is forced to attachment.
    writeHardenedImageResponse(res, {
      contentType: resolved.mime,
      data: resolved.data,
      // Immutable: a runtime item's image bytes never change under the same
      // id, so the client can reuse it for the life of the transcript.
      cacheControl: "private, max-age=31536000, immutable",
    });
  },

  "attachment-upload": async ({ ctx, req, res, url, session }) => {
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
    auditRouteEvent({ ctx, session }, "file_write", { threadId, name: fileName });
    writeJson(res, 200, {
      path: attachments.save({ threadId, fileName, data }),
    });
  },

  "profile-devices": ({ res }) => {
    writeJson(res, 200, getProfileDevicesResponse());
  },

  "profile-core-stats": async ({ req, res }) => {
    const payload = profileStatsRequestSchema.parse(await readJsonBody(req));
    writeJson(res, 200, getProfileCoreStats(payload));
  },

  "profile-token-stats": async ({ req, res }) => {
    const payload = profileStatsRequestSchema.parse(await readJsonBody(req));
    writeJson(res, 200, getProfileTokenStats(payload));
  },

  "profile-identity": async ({ req, res }) => {
    const identity = profileIdentitySchema.parse(await readJsonBody(req));
    writeJson(res, 200, setProfileIdentityResponse(identity));
  },

  "settings-read": ({ ctx, res }) => {
    writeJson(res, 200, { settings: ctx.requireSettingsGateway().read() });
  },

  "settings-write": async ({ ctx, req, res }) => {
    const patch = remoteSettingsPatchSchema.parse(await readJsonBody(req));
    try {
      writeJson(res, 200, { settings: await ctx.requireSettingsGateway().update(patch) });
    } catch (error) {
      // Authority conflict/overload is conflict-explicit on the wire, never a
      // 500: the write did not commit and the client may retry it as-is.
      if (error instanceof SettingsWriteRefusedError) {
        if (error.kind === "conflict") {
          throw new RemoteHttpError("settings_conflict", error.message, 409);
        }
        throw new RemoteHttpError("settings_overloaded", error.message, 429);
      }
      throw error;
    }
  },

  "mcp-settings-read": ({ ctx, res }) => {
    writeJson(res, 200, ctx.requireSettingsGateway().readMcpServers());
  },

  "mcp-settings-command": async ({ ctx, req, res }) => {
    const command = remoteMcpSettingsCommandSchema.parse(await readJsonBody(req));
    writeJson(res, 200, ctx.requireSettingsGateway().commandMcpServers(command));
  },

  "mcp-settings-operation": async ({ ctx, req, res }) => {
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
  },

  "schedules-read": ({ ctx, res }) => {
    writeJson(res, 200, { schedules: ctx.requireSchedulesGateway().list() });
  },

  "schedule-runs-read": ({ ctx, res, url }) => {
    const { id } = scheduledTaskIdPayloadSchema.parse({ id: url.searchParams.get("id") });
    writeJson(res, 200, { runs: ctx.requireSchedulesGateway().runs(id) });
  },

  "schedules-command": async ({ ctx, req, res }) => {
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
  },

  "pr-watch-read": ({ ctx, res, url }) => {
    const key = prWatchKeySchema.parse({
      projectId: url.searchParams.get("projectId"),
      prNumber: Number(url.searchParams.get("prNumber")),
    });
    writeJson(res, 200, {
      watch: ctx.requirePrWatchesGateway().get(key.projectId, key.prNumber),
    });
  },

  "pr-watch-check": async ({ ctx, req, res }) => {
    const key = prWatchKeySchema.parse(await readJsonBody(req));
    ctx.requirePrWatchesGateway().requestCheck(key.projectId, key.prNumber);
    writeJson(res, 200, { ok: true });
  },

  "pr-watch-agent-sync": async ({ ctx, req, res }) => {
    const agent = prWatchAgentSyncSchema.parse(await readJsonBody(req));
    ctx.requirePrWatchesGateway().syncAgent(agent);
    writeJson(res, 200, { ok: true });
  },

  "pr-watch-upsert": async ({ ctx, req, res }) => {
    const input = prWatchInputSchema.parse(await readJsonBody(req));
    writeJson(res, 200, { watch: ctx.requirePrWatchesGateway().upsert(input) });
  },

  "pr-watch-delete": async ({ ctx, req, res }) => {
    const key = prWatchKeySchema.parse(await readJsonBody(req));
    ctx.requirePrWatchesGateway().delete(key.projectId, key.prNumber);
    writeJson(res, 200, { ok: true });
  },

  "browser-state": async ({ ctx, res }) => {
    writeJson(res, 200, { state: await ctx.requireBrowserGateway().state() });
  },

  "browser-command": async ({ ctx, req, res }) => {
    const command = remoteBrowserCommandSchema.parse(await readJsonBody(req));
    writeJson(res, 200, { state: await ctx.requireBrowserGateway().command(command) });
  },

  "ports-read": async ({ ctx, res }) => {
    const gateway = ctx.requirePortForwardGateway();
    const detected = await gateway.scanPorts();
    writeJson(
      res,
      200,
      remotePortsStateSchema.parse({ detected, forwards: gateway.listForwards() }),
    );
  },

  "port-forward": async ({ ctx, req, res, forwardOrigin, session }) => {
    const { targetPort } = remotePortForwardRequestSchema.parse(await readJsonBody(req));
    const gateway = ctx.requirePortForwardGateway();
    // Gate 6 item 4.7 (S7): forward opens are audited.
    auditRouteEvent({ ctx, session }, "forward_open", { targetPort });
    const forward = await gateway.startForward(targetPort);
    // Raw-TCP connect credential, minted at forward creation (Gate 6): the
    // forwarded listener refuses any connection that does not present a live
    // ticket (or a validator-authorized bearer) as its first LF-terminated
    // line. Browser-origin entry keeps `enterPath` with session auth.
    const connectTicket = gateway.mintConnectTicket(forward.id);
    // Browser-origin entry needs a configured forward origin; the raw TCP
    // forward is returned either way. `portProxy` absent (host without the
    // proxy wired up) also omits `enterPath` rather than failing.
    const enterPath =
      (ctx.options.portProxy?.forwardOriginAvailability(forwardOrigin).available ?? false)
        ? ctx.requirePortProxy().issueEnterToken(forward.id, forwardOrigin).path
        : undefined;
    writeJson(
      res,
      200,
      remotePortForwardResultSchema.parse({
        forward,
        connectTicket,
        ...(enterPath ? { enterPath } : {}),
      }),
    );
  },

  "port-enter": async ({ ctx, req, res, forwardOrigin }) => {
    const { id } = remotePortEnterRequestSchema.parse(await readJsonBody(req));
    if (ctx.requirePortForwardGateway().getForward(id) === null) {
      throw new RemoteHttpError("forward_not_found", "Port forward not found.", 404);
    }
    const availability =
      ctx.options.portProxy?.forwardOriginAvailability(forwardOrigin) ?? FORWARD_ORIGIN_UNAVAILABLE;
    if (!availability.available) {
      throw new RemoteHttpError(
        "forward_browser_unavailable",
        "Browser forwarding requires a configured forward origin on this host.",
        503,
      );
    }
    const { path } = ctx.requirePortProxy().issueEnterToken(id, forwardOrigin);
    writeJson(res, 200, remotePortEnterResultSchema.parse({ enterPath: path }));
  },

  "port-unforward": async ({ ctx, req, res }) => {
    const { id } = remotePortUnforwardRequestSchema.parse(await readJsonBody(req));
    await ctx.requirePortForwardGateway().stopForward(id);
    writeJson(res, 200, { ok: true });
  },

  "procedure-call": async ({ ctx, req, res }) => {
    // Scope resolution is procedure-defined: `runRemoteProcedure` authenticates
    // the bearer token against the called procedure's own scope.
    writeJson(res, 200, { result: await runRemoteProcedure(ctx, req) });
  },

  "project-command": async ({ ctx, req, res }) => {
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
  },

  "project-settings": ({ res, params }) => {
    const projectSettingsId = requirePathParam(params, "projectId");
    const project = dbGetProject(projectSettingsId);
    if (!project) {
      throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
    }
    // Same credential custody as the global MCP read route: stdio env and
    // HTTP header values are masked on the wire (editors restore via the
    // MCP settings command's marker round-trip). Never raw values.
    writeJson(
      res,
      200,
      remoteProjectSettingsSchema.parse({
        ...(project.mcpServers ? { mcpServers: project.mcpServers.map(redactMcpServer) } : {}),
      }),
    );
  },

  "push-config": async ({ ctx, res }) => {
    // Push config/registration is gated on session:operate (no separate push scope),
    // so already-paired devices register without re-pairing. POST (not
    // DELETE) for both, matching the existing endpoint conventions.
    const publicKey = await ctx.requirePushRegistrations().webPublicKey();
    writeJson(res, 200, { publicKey });
  },

  "push-register": async ({ ctx, req, res }) => {
    const registration = remotePushRegistrationSchema.parse(await readJsonBody(req));
    if (registration.routing && registration.routing.desktopId !== ctx.options.identity.desktopId) {
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
  },

  "push-unregister": async ({ ctx, req, res }) => {
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
  },

  "thread-history-items": async ({ req, res, url, params }) => {
    const threadId = requirePathParam(params, "threadId");
    const beforePosition = url.searchParams.get("beforePosition");
    const targetTimelineEntryCount = url.searchParams.get("targetTimelineEntryCount");
    const input = remoteRuntimeItemsPageRequestSchema.parse({
      threadId,
      limit: Number(url.searchParams.get("limit")),
      ...(beforePosition !== null ? { beforePosition: Number(beforePosition) } : {}),
      ...(targetTimelineEntryCount !== null
        ? { targetTimelineEntryCount: Number(targetTimelineEntryCount) }
        : {}),
    });
    await writeNegotiatedJsonResponse(req, res, 200, buildThreadRuntimeItemsPage(input));
  },

  "thread-history": async ({ ctx, req, res, url, params }) => {
    const historyThreadId = requirePathParam(params, "threadId");
    const targetTimelineEntryCount = url.searchParams.get("targetTimelineEntryCount");
    const omitScrollback = url.searchParams.get("omitScrollback") === "1";
    await writeNegotiatedJsonResponse(
      req,
      res,
      200,
      await buildThreadSnapshot(ctx, historyThreadId, {
        runtimePage: url.searchParams.get("runtimePage") === "1",
        ...(omitScrollback ? { omitScrollback } : {}),
        ...(targetTimelineEntryCount !== null
          ? {
              targetTimelineEntryCount: remoteTimelineEntryCountSchema.parse(
                Number(targetTimelineEntryCount),
              ),
            }
          : {}),
      }),
    );
  },

  "thread-start-existing": async (call) => {
    const { ctx, req, res, url } = call;
    const body = await readJsonBody(req);
    const payload = startThreadPayloadSchema.parse(body);
    const threadId = payload.threadId;
    if (!threadId) {
      throw new RemoteHttpError(
        "thread_id_required",
        "Remote thread start requires an existing thread id.",
        400,
      );
    }
    const thread = dbGetThread(threadId);
    if (!thread) {
      throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
    }
    assertRemoteThreadStartExperimentSafe(threadId);
    if (startExistingThreadBodySchema.parse(body).ensureRunning) {
      if (
        payload.prompt ||
        payload.segments?.length ||
        payload.providerSwitch ||
        payload.userMessageItemId
      ) {
        throw new RemoteHttpError(
          "invalid_reopen",
          "Thread reopen cannot include new input or a provider switch.",
          400,
        );
      }
      // Legacy clients reused their creation receipt here. Reopen is an
      // ensure-running operation, so a durable completed receipt cannot
      // represent its result after a later unload or process restart.
      const result = await ensureRemoteThreadRunning(ctx, threadId, payload.initialSize);
      writeJson(res, 200, result);
      return;
    }
    const mcpSnapshot =
      ctx.options.resolveMcpLaunchSnapshot?.(thread.projectId) ?? emptyMcpLaunchSnapshot();
    // Gate 6 item 4.7 (S7): thread creation/opens are audited.
    auditRouteEvent(call, "thread_create", { threadId });
    const result = await runIdempotentRemoteMutation(req, url.pathname, () =>
      payload.providerSwitch
        ? applyRemoteThreadSwitch(ctx, { ...payload, threadId, ...mcpSnapshot })
        : ctx.options.callSupervisor("startThread", { ...payload, ...mcpSnapshot }),
    );
    writeJson(res, 200, result);
  },

  "terminal-start": async ({ ctx, req, res }) => {
    // Spawns a dev shell. The id is carried in the body (`shellId`), not the
    // path, since this isn't scoped to a thread.
    const payload = startShellPayloadSchema.parse(await readJsonBody(req));
    await ctx.options.callSupervisor("startShell", payload);
    writeJson(res, 200, { ok: true });
  },

  "thread-runtime-truncate": async ({ ctx, req, res, params }) => {
    const truncateThreadId = requirePathParam(params, "threadId");
    const body = await readJsonBody(req);
    const payload = dbTruncateRuntimeItemsPayloadSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      threadId: truncateThreadId,
    });
    // One mutation + one canonical `runtime.truncated` publication, owned by
    // the host composition — this route never writes the DB directly, so a
    // remote truncate reaches every other client exactly like a local one.
    ctx.options.truncateThreadRuntime(payload.threadId, payload.itemId);
    ctx.publishThreadsChanged([payload.threadId]);
    writeJson(res, 200, { ok: true });
  },

  "thread-checkpoint-revert": async ({ ctx, req, res, url, params }) => {
    const revertThreadId = requirePathParam(params, "threadId");
    // WS2 stage 3/4: the compound checkpoint revert — provider rollback, file
    // checkpoint restore and transcript truncation as ONE journaled backend
    // operation, keyed by the client's operationKey (plus the command-id
    // receipt here). The host publishes the canonical `runtime.truncated`
    // event through the same funnel a local truncate uses.
    if (!ctx.options.revertCheckpoint) {
      throw new RemoteHttpError(
        "checkpoint_revert_unavailable",
        "This host cannot run compound checkpoint reverts.",
        501,
      );
    }
    const body = await readJsonBody(req);
    const payload = checkpointRevertPayloadSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      threadId: revertThreadId,
    });
    const result = await runIdempotentRemoteMutation(
      req,
      url.pathname,
      () => ctx.options.revertCheckpoint!(payload),
      {
        isRetryableResult: (value) =>
          Boolean(value && typeof value === "object" && "outcome" in value) &&
          (value as { outcome?: unknown }).outcome === "failed",
        // The outer receipt must not bypass canonical validation: a cache
        // hit still binds to the inner journal's frozen target.
        mapCompletedResponse: (cached) => mapCheckpointRevertCompletedResponse(payload, cached),
      },
    );
    ctx.publishThreadsChanged([payload.threadId]);
    await writeNegotiatedJsonResponse(req, res, 200, result);
  },

  "thread-command": async (call) => {
    const { ctx, req, res, url, params } = call;
    const commandThreadId = requirePathParam(params, "threadId");
    const body = await readJsonBody(req);
    const command = remoteThreadCommandSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      threadId: commandThreadId,
    });
    if (command.kind === "start" && command.providerSwitch) {
      throw new RemoteHttpError(
        "provider_switch_route_invalid",
        "Provider switches must use the existing-thread start endpoint.",
        400,
      );
    }
    assertRemoteThreadCommandExperimentSafe(command);
    // Gate 6 item 4.7 (S7): the command route's start kind is the other
    // thread-creation path; the metadata-only kinds are not audited.
    if (command.kind === "start") {
      auditRouteEvent(call, "thread_create", { threadId: commandThreadId });
    }
    const dispatch = async () => {
      if (command.kind === "delete-worktree-group") {
        const linkedThreadIds = dbGetThreads()
          .filter(
            (thread) =>
              thread.projectId === command.projectId &&
              thread.worktreePath === command.worktreePath,
          )
          .map((thread) => thread.id);
        const requestedThreadIds = new Set(command.threadIds);
        if (
          requestedThreadIds.size !== linkedThreadIds.length ||
          linkedThreadIds.some((threadId) => !requestedThreadIds.has(threadId))
        ) {
          throw new RemoteHttpError(
            "worktree_threads_changed",
            msg("remote.worktree.threadsChanged"),
            409,
          );
        }
      }
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
  },

  "thread-send": (call) => {
    auditRouteEvent(call, "thread_send", {
      threadId: requirePathParam(call.params, "threadId"),
    });
    return forwardThreadBodyPost(
      call,
      (callSupervisor, body) =>
        callSupervisor("sendThreadInput", sendThreadInputPayloadSchema.parse(body)),
      { idempotent: true },
    );
  },

  "thread-interrupt": (call) => {
    auditRouteEvent(call, "thread_stop", {
      threadId: requirePathParam(call.params, "threadId"),
    });
    return forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("interruptThread", interruptThreadPayloadSchema.parse(body)),
    );
  },

  "thread-goal": (call) =>
    forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("controlThreadGoal", controlThreadGoalPayloadSchema.parse(body)),
    ),

  "thread-close": (call) => {
    auditRouteEvent(call, "thread_stop", {
      threadId: requirePathParam(call.params, "threadId"),
    });
    return forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("closeThread", closeThreadPayloadSchema.parse(body)),
    );
  },

  "thread-steer-set": (call) =>
    forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("setPendingSteer", setPendingSteerPayloadSchema.parse(body)),
    ),

  "thread-steer-clear": (call) =>
    forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("clearPendingSteer", clearPendingSteerPayloadSchema.parse(body)),
    ),

  "terminal-write": (call) =>
    forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("writeTerminal", writeTerminalPayloadSchema.parse(body)),
    ),

  "terminal-resize": (call) =>
    forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("resizeTerminal", resizeTerminalPayloadSchema.parse(body)),
    ),

  "request-resolve": (call) =>
    forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor(
        "resolveThreadServerRequest",
        resolveThreadServerRequestPayloadSchema.parse(body),
      ),
    ),

  "terminal-close": (call) =>
    // Closes a terminal by id. `closeThread` is shell-aware on the supervisor,
    // so this tears down a dev shell or a CLI thread's PTY alike.
    forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("closeThread", closeThreadPayloadSchema.parse(body)),
    ),
};
