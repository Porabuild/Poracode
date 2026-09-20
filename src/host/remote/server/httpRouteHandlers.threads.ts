import type { IncomingMessage } from "node:http";
import {
  REMOTE_COMMAND_ID_HEADER,
  remoteRuntimeItemsPageRequestSchema,
  remoteTimelineEntryCountSchema,
} from "@/shared/remote";
import {
  checkpointRevertPayloadSchema,
  closeThreadPayloadSchema,
  clearPendingSteerPayloadSchema,
  controlThreadGoalPayloadSchema,
  interruptThreadPayloadSchema,
  emptyMcpLaunchSnapshot,
  remoteThreadCommandSchema,
  resizeTerminalPayloadSchema,
  resolveThreadServerRequestPayloadSchema,
  sendThreadInputPayloadSchema,
  setPendingSteerPayloadSchema,
  startShellPayloadSchema,
  startThreadPayloadSchema,
  writeTerminalPayloadSchema,
} from "@/shared/contracts";
import { dbTruncateRuntimeItemsPayloadSchema } from "@/shared/ipc/schemas";
import { startExistingThreadBodySchema } from "@/shared/remote/contract/routeBodies";
import { msg } from "@/shared/messages";
import {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
  dbResetRemoteCommand,
  dbGetThread,
  dbGetThreads,
} from "@/host/db";
import { RemoteHttpError } from "../auth";
import {
  assertRemoteThreadCommandExperimentSafe,
  assertRemoteThreadStartExperimentSafe,
} from "../experimentOwnership";
import type { RemoteAccessServerOptions } from "../RemoteAccessServer";
import { writeJson, writeNegotiatedJsonResponse } from "./httpResponses";
import {
  mapCheckpointRevertCompletedResponse,
  requirePathParam,
  type HttpRouteCall,
  type HttpRouteHandlerTable,
} from "./httpRouteHandlers.shared";
import { readJsonBody } from "./requestBody";
import { buildThreadListPage, buildThreadRuntimeItemsPage, buildThreadSnapshot } from "./snapshots";
import {
  applyRemoteThreadCommand,
  applyRemoteThreadSwitch,
  ensureRemoteThreadRunning,
} from "./threadCommands";

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

type ThreadRouteId =
  | "thread-list"
  | "thread-history-items"
  | "thread-history"
  | "thread-start-existing"
  | "terminal-start"
  | "thread-runtime-truncate"
  | "thread-checkpoint-revert"
  | "thread-command"
  | "thread-send"
  | "thread-interrupt"
  | "thread-goal"
  | "thread-close"
  | "thread-steer-set"
  | "thread-steer-clear"
  | "terminal-write"
  | "terminal-resize"
  | "terminal-close"
  | "request-resolve";

/** Thread-group HTTP route handlers (contract `threadRoutes`). */
export const THREAD_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, ThreadRouteId> = {
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
    return forwardThreadBodyPost(
      call,
      (callSupervisor, body) =>
        callSupervisor("sendThreadInput", sendThreadInputPayloadSchema.parse(body)),
      { idempotent: true },
    );
  },

  "thread-interrupt": (call) => {
    return forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("interruptThread", interruptThreadPayloadSchema.parse(body)),
    );
  },

  "thread-goal": (call) =>
    forwardThreadBodyPost(call, (callSupervisor, body) =>
      callSupervisor("controlThreadGoal", controlThreadGoalPayloadSchema.parse(body)),
    ),

  "thread-close": (call) => {
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
