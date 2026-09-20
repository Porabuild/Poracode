import { remoteSettingsPatchSchema, remoteTokenExchangePayloadSchema } from "@/shared/remote";
import {
  profileIdentitySchema,
  profileStatsRequestSchema,
  projectNotesSchema,
  type McpServer,
} from "@/shared/contracts";
import {
  remoteHostDescribeSchema,
  UNKNOWN_HOST_SERVICE_CAPABILITIES,
} from "@/shared/hostControlProtocol";
import { msg } from "@/shared/messages";
import { SettingsWriteRefusedError } from "@/backend/settings/settingsCompatWrites";
import { projectNotesWriteBodySchema } from "@/shared/remote/contract/routeBodies";
import {
  remoteMcpSettingsCommandSchema,
  remoteMcpSettingsOperationSchema,
} from "@/shared/remote/contract/routeSchemas";
import { dbGetProject, dbGetProjectNotes, dbSetProjectNotes } from "@/host/db";
import {
  getProfileCoreStats,
  getProfileDevicesResponse,
  getProfileTokenStats,
  setProfileIdentityResponse,
} from "@/host/profile";
import { RemoteHttpError } from "../auth";
import { buildForwardEnterErrorPageHtml } from "../pairingPage";
import { FORWARD_ORIGIN_UNAVAILABLE } from "../portForward/forwardOriginIdentity";
import { writeHtml, writeJson, writeNegotiatedJsonResponse } from "./httpResponses";
import { requirePathParam, type HttpRouteHandlerTable } from "./httpRouteHandlers.shared";
import { readJsonBody } from "./requestBody";
import { DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT } from "./security";
import {
  buildAgentSlashCommands,
  buildAgentStatuses,
  buildShellSnapshot,
  descriptor,
} from "./snapshots";

function mcpEndpointUrl(server: McpServer): string | null {
  switch (server.transport.type) {
    case "http":
    case "sse":
      return server.transport.url;
    case "stdio":
      return null;
  }
}

type SessionRouteId =
  | "environment"
  | "environment-legacy"
  | "forward-enter"
  | "token-exchange"
  | "websocket-ticket"
  | "shell-snapshot"
  | "agent-statuses"
  | "agent-slash-commands"
  | "host-update"
  | "host-update-check"
  | "host-update-install"
  | "host-describe"
  | "provider-usage"
  | "project-notes-read"
  | "project-notes-write"
  | "profile-devices"
  | "profile-core-stats"
  | "profile-token-stats"
  | "profile-identity"
  | "settings-read"
  | "settings-write"
  | "mcp-settings-read"
  | "mcp-settings-command"
  | "mcp-settings-operation";

/** Session-group HTTP route handlers (contract `sessionRoutes`). */
export const SESSION_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, SessionRouteId> = {
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
    // Gate 6 item 4.6: the parsed payload carries either the historical
    // pairing-token grant or the additive refresh_token grant; the server
    // dispatches both (and audits them) behind one context call.
    const payload = remoteTokenExchangePayloadSchema.parse(await readJsonBody(req));
    writeJson(res, 200, ctx.exchangePairingCredential(payload));
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

  "host-describe": ({ ctx, res }) => {
    writeJson(
      res,
      200,
      remoteHostDescribeSchema.parse({
        capabilities: ctx.options.hostCapabilities ?? UNKNOWN_HOST_SERVICE_CAPABILITIES,
      }),
    );
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
};
