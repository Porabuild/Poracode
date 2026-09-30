import {
  isRemoteProjectCatalogCommand,
  REMOTE_PROJECT_COMMAND_RESULT_DECLARATION,
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
  remoteScheduleCommandSchema,
} from "@/shared/remote";
import {
  prWatchAgentSyncSchema,
  prWatchInputSchema,
  prWatchKeySchema,
  scheduledTaskIdPayloadSchema,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { dbGetProject } from "@/host/db";
import { redactMcpServer } from "@/host/mcpSettings";
import { parseBearerAuthorizationHeader, RemoteHttpError } from "../auth";
import { FORWARD_ORIGIN_UNAVAILABLE } from "../portForward/forwardOriginIdentity";
import { writeHardenedImageResponse, writeJson } from "./httpResponses";
import {
  remoteProjectCommandResultIsBounded,
  requirePathParam,
  requireRemoteCommandId,
  type HttpRouteHandlerTable,
} from "./httpRouteHandlers.shared";
import { commandOutcomeUncertainAfterEffect, runRemoteCommand } from "./remoteCommandIdempotency";
import {
  IMAGE_TICKET_QUERY_PARAM,
  imageTicketRequestBodySchema,
  imageTickets,
} from "./imageTickets";
import { parseImageRefPath, resolveImageRef } from "./imageRefProjection";
import { writeLocalImageFile } from "./localImageFile";
import { readAttachmentBody, readJsonBody } from "./requestBody";
import { runProjectCommand, runRemoteProcedure } from "./threadCommands";

type WorkspaceRouteId =
  | "local-image"
  | "local-image-ticket"
  | "runtime-image"
  | "attachment-upload"
  | "schedules-read"
  | "schedules-command"
  | "schedule-runs-read"
  | "pr-watch-read"
  | "pr-watch-check"
  | "pr-watch-agent-sync"
  | "pr-watch-upsert"
  | "pr-watch-delete"
  | "browser-state"
  | "browser-command"
  | "ports-read"
  | "port-forward"
  | "port-enter"
  | "port-unforward"
  | "procedure-call"
  | "project-command"
  | "project-settings"
  | "push-config"
  | "push-register"
  | "push-unregister";

/** Workspace-group HTTP route handlers (contract `workspaceRoutes`). */
export const WORKSPACE_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, WorkspaceRouteId> = {
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
    // Transport (Gate 6 item 4.6, S6): the Authorization header is primary.
    // <img> tags use the one-time `ticket` query param minted above. The raw
    // `access_token` query param acceptance is REMOVED — a long-lived bearer
    // in the URL leaks into proxy/relay access logs, and the ticket mechanism
    // has been the shipped answer since B5b.
    const header = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const bearerToken = parseBearerAuthorizationHeader(header);
    const imageTicket = url.searchParams.get(IMAGE_TICKET_QUERY_PARAM);
    const imagePath = url.searchParams.get("path");
    if (bearerToken) {
      ctx.auth.authenticateBearerToken(bearerToken, ["session:read"]);
    } else if (imageTicket) {
      imageTickets.consume(imageTicket, imagePath ?? "");
    } else {
      throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
    }
    await writeLocalImageFile(res, imagePath);
  },

  "local-image-ticket": async ({ req, res, session }) => {
    // Mints a short-lived, one-time, path-scoped ticket for
    // `GET /api/files/image` (B5b): <img> consumers cannot send an
    // Authorization header, and a long-lived bearer token in the query string
    // leaks into proxy/relay access logs — the ticket expires in 30 seconds,
    // works for exactly one request, and serves exactly the minted path.
    const body = imageTicketRequestBodySchema.parse(await readJsonBody(req));
    writeJson(res, 200, imageTickets.issue(body.path, Date.now(), session?.sessionId));
  },

  "runtime-image": async ({ ctx, req, res, url, params }) => {
    // Resolves a host-minted image reference back to bytes. Unlike
    // `/api/files/image` this takes NO caller-supplied filesystem path: it
    // addresses a location inside the thread's own persisted runtime payload and
    // re-verifies that the addressed value really is an inline image, so a
    // prompt-injected tool result cannot steer it at the filesystem or network.
    //
    // Transport (Gate 6 item 4.6, S6): Authorization header or the one-time
    // image ticket, minted for the exact raw `path` value — the former
    // `?access_token=` acceptance is gone.
    const header = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const bearerToken = parseBearerAuthorizationHeader(header);
    const imageTicket = url.searchParams.get(IMAGE_TICKET_QUERY_PARAM);
    const rawPath = url.searchParams.get("path");
    if (bearerToken) {
      ctx.auth.authenticateBearerToken(bearerToken, ["session:read"]);
    } else if (imageTicket) {
      imageTickets.consume(imageTicket, rawPath ?? "");
    } else {
      throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
    }
    const threadId = decodeURIComponent(params.threadId ?? "");
    const itemId = decodeURIComponent(params.itemId ?? "");
    const path = parseImageRefPath(rawPath);
    if (!path) {
      throw new RemoteHttpError("invalid_path", "An image reference path is required.", 400);
    }
    const resolved = resolveImageRef(threadId, itemId, path);
    if (!resolved) {
      throw new RemoteHttpError("image_not_found", "No inline image at that reference.", 404);
    }
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

  "attachment-upload": async ({ ctx, req, res, url }) => {
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
    const forward = await gateway.startForward(targetPort);
    // Raw-TCP connect credential, minted at forward creation (Gate 6): the
    // forwarded listener refuses any connection that does not present a live
    // ticket (or a validator-authorized bearer) as its first LF-terminated
    // line. Browser-origin entry keeps `enterPath` with session auth.
    const connectTicket = gateway.mintConnectTicket(forward.id, session?.sessionId ?? "unknown");
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

  "project-command": async ({ ctx, req, res, url, session }) => {
    const command = remoteProjectCommandSchema.parse(await readJsonBody(req));
    if (remoteProjectCommandResultIsBounded(req)) {
      // Declared bounded result mode (capabilities.projectCommandResults v1).
      // Separate from the catalog-mutation KINDS: the declaration decides only
      // the response/payload contract, so every kind may opt in. The command
      // id is REQUIRED for every opted-in mutation (the receipt is the only
      // retry-safety identity), and the semantic mode is part of the receipt
      // digest, so the same id with a different mode or body conflicts instead
      // of replaying across contracts. Only the bounded response is recorded —
      // never the catalog — and the declaration-aware publication reads the
      // catalog only when an undeclared subscriber or the embedding callback
      // actually consumes it.
      const response = await runRemoteCommand({
        commandId: requireRemoteCommandId(req, command.kind),
        route: url.pathname,
        principalId: session?.sessionId ?? null,
        requestPayload: {
          result: REMOTE_PROJECT_COMMAND_RESULT_DECLARATION,
          command,
        },
        operation: async (markDispatched) => {
          // The effect boundary marks the receipt's uncertainty; any later
          // failure (post-write read/parse, publication, callback) must answer
          // as may-have-committed, never as a definite failed receipt.
          let committed = false;
          const signal = () => {
            committed = true;
            markDispatched();
          };
          try {
            const outcome = await runProjectCommand(ctx, command, signal, {
              resultMode: "bounded",
              onEffectBoundary: signal,
            });
            ctx.publishCatalogChanged();
            return outcome.response;
          } catch (error) {
            if (committed) throw commandOutcomeUncertainAfterEffect(error);
            throw error;
          }
        },
      });
      writeJson(res, 200, response);
      return;
    }
    if (isRemoteProjectCatalogCommand(command)) {
      // Narrow catalog mutation: the caller's per-action command id is
      // REQUIRED before any effect (a relative move is only retry-safe under
      // it), the response is bounded, and publication happens inside the
      // operation so a replayed receipt never re-broadcasts. Only the bounded
      // response is recorded — never the catalog. The declaration-aware
      // publication reads the catalog only when an undeclared subscriber or
      // the embedding `onProjectsChanged` hook actually consumes it.
      const response = await runRemoteCommand({
        commandId: requireRemoteCommandId(req, command.kind),
        route: url.pathname,
        principalId: session?.sessionId ?? null,
        requestPayload: command,
        operation: async (markDispatched) => {
          // The DB intent signals its true commit boundary: the change-listener
          // fan-out, post-write read/parse, WS publication, and the optional
          // in-process project hook all run AFTER the durable write. A failure
          // from any of them must answer as may-have-committed, never as a
          // definite pre-effect failure — while a refusal or no-op (no signal)
          // stays raw.
          let committed = false;
          try {
            const outcome = await runProjectCommand(ctx, command, () => {
              committed = true;
              markDispatched();
            });
            ctx.publishCatalogChanged();
            return outcome.response;
          } catch (error) {
            if (committed) throw commandOutcomeUncertainAfterEffect(error);
            throw error;
          }
        },
      });
      writeJson(res, 200, response);
      return;
    }
    // Tell every connected client to refresh its snapshot with the bounded
    // `remote-projects-changed` membership event. Remote responses deliberately
    // omit sensitive project settings such as MCP server definitions; the
    // optional in-process `onProjectsChanged` hook gets the authoritative rows
    // for a host that owns project state directly (no production composition
    // consumes it — the desktop renderer converges over the loopback WS).
    const outcome = await runProjectCommand(ctx, command);
    if (outcome.kind !== "complete") {
      // Unreachable: only catalog kinds return a bounded outcome, and they
      // were handled above.
      throw new Error("Legacy project command returned a bounded outcome.");
    }
    ctx.publishSupervisorEvent({
      type: "remote-projects-changed",
      projects: [...outcome.broadcastProjects],
    });
    ctx.options.onProjectsChanged?.(outcome.projects);
    writeJson(res, 200, outcome.response);
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
};
