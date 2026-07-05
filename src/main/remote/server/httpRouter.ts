import type { IncomingMessage, ServerResponse } from "node:http";
import {
  remoteBrowserCommandSchema,
  remoteProjectCommandSchema,
  remotePushRegistrationSchema,
  remotePushUnregisterSchema,
  remoteSettingsPatchSchema,
  remoteTokenExchangePayloadSchema,
  type RemoteAccessScope,
} from "@/shared/remote";
import {
  closeThreadPayloadSchema,
  clearPendingSteerPayloadSchema,
  interruptThreadPayloadSchema,
  profileIdentitySchema,
  profileStatsRequestSchema,
  remoteThreadCommandSchema,
  resizeTerminalPayloadSchema,
  resolveThreadServerRequestPayloadSchema,
  sendThreadInputPayloadSchema,
  setPendingSteerPayloadSchema,
  startShellPayloadSchema,
  startThreadPayloadSchema,
  writeTerminalPayloadSchema,
} from "@/shared/contracts";
import { dbGetThread } from "../../db";
import {
  getProfileCoreStats,
  getProfileDevicesResponse,
  getProfileTokenStats,
  setProfileIdentityResponse,
} from "../../profile";
import { RemoteHttpError } from "../auth";
import {
  buildLocalPairingIconSvg,
  buildLocalPairingManifestJson,
  buildLocalPairingPageHtml,
  buildLocalPairingServiceWorkerJs,
} from "../pairingPage";
import { tryServeBuiltMobileApp } from "../staticMobileApp";
import type { RemoteServerContext } from "./context";
import { writeError, writeHtml, writeJson, writeText } from "./httpResponses";
import { readJsonBody } from "./requestBody";
import { DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT } from "./security";
import {
  buildAgentStatuses,
  buildShellSnapshot,
  buildThreadSnapshot,
  descriptor,
} from "./snapshots";
import { applyRemoteThreadCommand, runGitCall, runProjectCommand } from "./threadCommands";
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

/**
 * POST /api/threads/:threadId<suffix> endpoints that validate the body (merged
 * with the path's threadId) and forward it to a supervisor procedure.
 */
const THREAD_POST_ROUTES: ReadonlyArray<{
  readonly suffix: string;
  readonly scope: RemoteAccessScope;
  dispatch(
    call: RemoteAccessServerOptions["callSupervisor"],
    body: Record<string, unknown>,
  ): Promise<unknown>;
}> = [
  {
    suffix: "/send",
    scope: "session:operate",
    dispatch: (call, body) => call("sendThreadInput", sendThreadInputPayloadSchema.parse(body)),
  },
  {
    suffix: "/interrupt",
    scope: "session:operate",
    dispatch: (call, body) => call("interruptThread", interruptThreadPayloadSchema.parse(body)),
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
    if (req.method === "GET" && url.pathname === "/.well-known/lightcode/environment") {
      writeJson(res, 200, descriptor(ctx));
      return;
    }
    if (req.method === "GET" && (url.pathname === "/pair" || url.pathname === "/app")) {
      if (ctx.options.devMobileAppUrl) {
        const target = new URL(ctx.options.devMobileAppUrl);
        for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
        target.searchParams.set("host", ctx.requireInfo().httpBaseUrl);
        res.writeHead(302, { location: target.toString() });
        res.end();
        return;
      }
      if (tryServeBuiltMobileApp(url.pathname, res)) {
        return;
      }
      writeHtml(
        res,
        200,
        buildLocalPairingPageHtml({ httpBaseUrl: ctx.requireInfo().httpBaseUrl }),
      );
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      if (tryServeBuiltMobileApp(url.pathname, res)) {
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
        buildLocalPairingServiceWorkerJs(),
        "application/javascript; charset=utf-8",
      );
      return;
    }
    if (req.method === "GET" && url.pathname === "/app-icon.svg") {
      writeText(res, 200, buildLocalPairingIconSvg(), "image/svg+xml; charset=utf-8");
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
        ctx.auth.exchangePairingCredential({
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
      writeJson(res, 200, buildShellSnapshot(ctx));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/agent-statuses") {
      ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, await buildAgentStatuses(ctx));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/provider-usage") {
      ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, await ctx.options.callSupervisor("getProviderUsage", {}));
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
    if (req.method === "GET" && url.pathname === "/api/browser/state") {
      ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, { state: ctx.requireBrowserGateway().state() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/browser/command") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const command = remoteBrowserCommandSchema.parse(await readJsonBody(req));
      writeJson(res, 200, { state: await ctx.requireBrowserGateway().command(command) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/git/call") {
      writeJson(res, 200, { result: await runGitCall(ctx, req) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/projects/command") {
      ctx.security.requireBearer(req, ["projects:manage"]);
      const command = remoteProjectCommandSchema.parse(await readJsonBody(req));
      const result = await runProjectCommand(ctx, command);
      // Tell every connected client to refresh its shell snapshot.
      ctx.publishSupervisorEvent({
        type: "remote-projects-changed",
        projects: result.projects,
      });
      writeJson(res, 200, result);
      return;
    }
    // Push registration is gated on session:operate (no separate push scope),
    // so already-paired devices register without re-pairing. POST (not
    // DELETE) for both, matching the existing endpoint conventions.
    if (req.method === "POST" && url.pathname === "/api/push/register") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const registration = remotePushRegistrationSchema.parse(await readJsonBody(req));
      ctx.requirePushRegistrations().upsert(registration);
      writeJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/push/unregister") {
      ctx.security.requireBearer(req, ["session:operate"]);
      const { deviceId } = remotePushUnregisterSchema.parse(await readJsonBody(req));
      ctx.requirePushRegistrations().remove(deviceId);
      writeJson(res, 200, { ok: true });
      return;
    }
    const historyThreadId = threadIdFromPath(url.pathname, "/history");
    if (req.method === "GET" && historyThreadId) {
      ctx.security.requireBearer(req, ["session:read"]);
      writeJson(res, 200, await buildThreadSnapshot(ctx, historyThreadId));
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
      if (!dbGetThread(payload.threadId)) {
        throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
      }
      writeJson(res, 200, await ctx.options.callSupervisor("startThread", payload));
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
    if (req.method === "POST" && commandThreadId) {
      ctx.security.requireBearer(req, ["session:operate"]);
      const body = await readJsonBody(req);
      const command = remoteThreadCommandSchema.parse({
        ...(typeof body === "object" && body !== null ? body : {}),
        threadId: commandThreadId,
      });
      const requiresRenderer = await applyRemoteThreadCommand(ctx, command);
      if (requiresRenderer && ctx.options.dispatchThreadCommand?.(command) !== true) {
        throw new RemoteHttpError(
          "desktop_unavailable",
          "The desktop app is not available to apply this change.",
          503,
        );
      }
      if (!requiresRenderer) {
        const rendererCommand =
          command.kind === "start" ? { ...command, launchRuntime: false } : command;
        ctx.options.dispatchThreadCommand?.(rendererCommand);
        ctx.publishThreadsChanged([command.threadId]);
      }
      writeJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST") {
      for (const route of THREAD_POST_ROUTES) {
        const threadId = threadIdFromPath(url.pathname, route.suffix);
        if (!threadId) continue;
        ctx.security.requireBearer(req, [route.scope]);
        const body = await readJsonBody(req);
        await route.dispatch(ctx.options.callSupervisor, {
          ...(typeof body === "object" && body !== null ? body : {}),
          threadId,
        });
        writeJson(res, 200, { ok: true });
        return;
      }
    }
    writeError(res, new RemoteHttpError("not_found", "Remote endpoint not found.", 404));
  } catch (error) {
    writeError(res, error);
  }
}
