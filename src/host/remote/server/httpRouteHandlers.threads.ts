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
import {
  remoteRuntimeGapAcknowledgeBodySchema,
  remoteRuntimeGapReadResultSchema,
  startExistingThreadBodySchema,
} from "@/shared/remote/contract/routeBodies";
import {
  isRemoteThreadCatalogCommand,
  remoteRuntimeGapAcknowledgeResultSchema,
} from "@/shared/remote";
import { runtimeHistoryNoticeTokensEqual } from "@/shared/runtimeHistoryNotice";
import { isHostResourceAdmissionRefusal } from "@/shared/hostResourceAdmission";
import { msg } from "@/shared/messages";
import { dbGetProject, dbGetThread, dbGetThreads } from "@/host/db";
import { RemoteHttpError } from "../auth";
import {
  assertRemoteThreadCommandExperimentSafe,
  assertRemoteThreadStartExperimentSafe,
} from "../experimentOwnership";
import type { RemoteAccessServerOptions } from "../RemoteAccessServer";
import { writeJson, writeNegotiatedJsonResponse } from "./httpResponses";
import {
  mapCheckpointRevertCompletedResponse,
  remoteCommandId,
  requirePathParam,
  requireRemoteCommandId,
  type HttpRouteCall,
  type HttpRouteHandlerTable,
} from "./httpRouteHandlers.shared";
import { commandOutcomeUncertainAfterEffect, runRemoteCommand } from "./remoteCommandIdempotency";
import { readJsonBody } from "./requestBody";
import { mapPersistenceRefusal } from "./persistenceRefusals";
import {
  requireRuntimeHistoryGapPort,
  requireRuntimeHistoryNoticesDeclaration,
  toRemoteRuntimeGapAcknowledgeResult,
  toRemoteRuntimeGapDescriptor,
  toRemoteRuntimeHistoryNotice,
} from "./runtimeHistoryNoticeGate";
import { handleCatalogThreadList } from "./catalogPages";
import { handleBoundedThreadHistoryItems, handleBoundedThreadTurns } from "./historyRead";
import { handleLegacyAdmittedThreadHistory } from "./legacyAdmittedReads";
import {
  applyRemoteThreadCommand,
  applyRemoteThreadSwitch,
  ensureRemoteThreadRunning,
} from "./threadCommands";

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
): Promise<void> {
  const { ctx, req, res, params } = call;
  const threadId = requirePathParam(params, "threadId");
  const body = await readJsonBody(req);
  await dispatch(ctx.options.callSupervisor, {
    ...(typeof body === "object" && body !== null ? body : {}),
    threadId,
  });
  writeJson(res, 200, { ok: true });
}

type ThreadRouteId =
  | "thread-list"
  | "thread-history-items"
  | "thread-history"
  | "thread-turns"
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
  | "request-resolve"
  | "thread-runtime-gap"
  | "thread-runtime-gap-acknowledge";

/** Thread-group HTTP route handlers (contract `threadRoutes`). */
export const THREAD_ROUTE_HANDLERS: Pick<HttpRouteHandlerTable, ThreadRouteId> = {
  // B4: legacy `limit` + `tp1.` cursor path is preserved byte-for-byte inside
  // the handler; declared clients get paint/inventory pages with caps.
  "thread-list": handleCatalogThreadList,

  "thread-history-items": handleBoundedThreadHistoryItems,

  // B4: the undeclared full-history variant is wrapped by the explicit legacy
  // bulk admission + stored-byte pre-check; declared clients get the bounded
  // tail. Both paths are written by the delegated handler.
  "thread-history": handleLegacyAdmittedThreadHistory,

  "thread-turns": handleBoundedThreadTurns,

  "thread-start-existing": async (call) => {
    const { ctx, req, res, url, session } = call;
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
    const result = await runRemoteCommand({
      commandId: remoteCommandId(req),
      route: url.pathname,
      principalId: session?.sessionId ?? null,
      requestPayload: payload,
      // A plain restart's whole operation is the supervisor call (the B1
      // pre-launch touch is evidence, not a command effect), so an admission
      // refusal is definite. A provider switch retargets the durable row and
      // dispatches the renderer before that call — earlier effects exist, so
      // no predicate: the receipt and the first response stay uncertain.
      ...(payload.providerSwitch ? {} : { isPreEffectFailure: isHostResourceAdmissionRefusal }),
      operation: (markDispatched) => {
        // A provider switch marks at its own true effect boundary: the switch
        // validates before any retarget, renderer dispatch or supervisor call
        // and marks only past that, so a rejected validation is a definite
        // failure while everything from the retarget on stays uncertain.
        if (payload.providerSwitch) {
          return applyRemoteThreadSwitch(
            ctx,
            { ...payload, threadId, ...mcpSnapshot },
            markDispatched,
          );
        }
        markDispatched();
        return ctx.options.callSupervisor("startThread", { ...payload, ...mcpSnapshot });
      },
    });
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
    // A typed persistence refusal (busy/degraded/contaminated) is raised by
    // the gate before the truncate applies, so it maps to a retryable 503
    // instead of an opaque 500.
    try {
      ctx.options.truncateThreadRuntime(payload.threadId, payload.itemId);
    } catch (error) {
      throw mapPersistenceRefusal(error);
    }
    ctx.publishThreadsChanged([payload.threadId]);
    writeJson(res, 200, { ok: true });
  },

  "thread-checkpoint-revert": async (call) => {
    const { ctx, req, res, url, params, session } = call;
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
    const result = await runRemoteCommand({
      commandId: remoteCommandId(req),
      route: url.pathname,
      principalId: session?.sessionId ?? null,
      requestPayload: payload,
      operation: (markDispatched) => {
        markDispatched();
        return ctx.options.revertCheckpoint!(payload);
      },
      isRetryableResult: (value) =>
        Boolean(value && typeof value === "object" && "outcome" in value) &&
        (value as { outcome?: unknown }).outcome === "failed",
      // The outer receipt must not bypass canonical validation: a cache
      // hit still binds to the inner journal's frozen target.
      mapCompletedResponse: (cached) => mapCheckpointRevertCompletedResponse(payload, cached),
      // A pre-binding frozen response is safe to replay: it is a cached result,
      // never a new mutation, and `mapCompletedResponse` still validates it
      // against the inner journal whenever that row survives.
      isLegacyCompletedResponseReplayable: () => true,
      // An interrupted revert resumes through its own journal: the journal is
      // claimed before the first side effect, records every phase before its
      // effect, and never re-runs a completed destructive provider phase.
      reconcileUncertain: () => ({ kind: "resume" }),
    }).catch((error: unknown) => {
      // A typed persistence refusal is mapped to a retryable 503 only after
      // `runRemoteCommand` recorded the receipt outcome: the dispatch mark
      // already classified the command `uncertain`, so this mapping never
      // promises a blind re-send and never bypasses receipt classification.
      throw mapPersistenceRefusal(error);
    });
    ctx.publishThreadsChanged([payload.threadId]);
    await writeNegotiatedJsonResponse(req, res, 200, result);
  },

  "thread-command": async (call) => {
    const { ctx, req, res, url, params, session } = call;
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
    const dispatch = async (markDispatched?: () => void) => {
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
      // A `start`'s genuinely pre-effect validation runs BEFORE the mark: a
      // missing project means no row and no provider call can exist, so the
      // receipt is a definite failure and the client may create a new attempt
      // with a fresh id. Everything after the mark (worktree preparation, the
      // durable row write, the provider launch) may have produced an external
      // effect and must stay `uncertain`, never a definite failure.
      if (command.kind === "start" && !dbGetProject(command.projectId)) {
        throw new RemoteHttpError("project_not_found", msg("remote.project.notFound"), 404);
      }
      if (command.kind === "start") markDispatched?.();
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
      const catalogIntent = isRemoteThreadCatalogCommand(command);
      // Catalog kinds signal their true commit boundary from inside the DB
      // intent (after the atomic write, before the throwing listener fan-out),
      // so every post-commit failure below answers as may-have-committed.
      let catalogCommitted = false;
      try {
        const requiresRenderer = await applyRemoteThreadCommand(
          ctx,
          command,
          catalogIntent && markDispatched
            ? () => {
                catalogCommitted = true;
                markDispatched();
              }
            : undefined,
        );
        if (requiresRenderer && (await ctx.options.dispatchThreadCommand?.(command)) !== true) {
          throw new RemoteHttpError(
            "desktop_unavailable",
            "The desktop app is not available to apply this change.",
            503,
          );
        }
        if (!requiresRenderer) {
          // Catalog mutations are host-authoritative and mirror-free: the
          // desktop renderer is not asked to understand the new kinds, and every
          // client (the desktop included) converges from the server broadcast.
          if (!catalogIntent) {
            const rendererCommand = (() => {
              if (command.kind !== "start") return command;
              const { isNewWorktree: _isNewWorktree, ...startCommand } = command;
              return { ...startCommand, launchRuntime: false };
            })();
            await ctx.options.dispatchThreadCommand?.(rendererCommand);
          }
          if (command.kind === "acknowledge") {
            ctx.publishSupervisorEvent({
              type: "remote-threads-changed",
              threadIds: [command.threadId],
              viewedThreadIds: [command.threadId],
            });
          } else if (command.kind === "reorder") {
            // Every moved thread is named so a client can re-sort without a
            // catalog-wide response.
            ctx.publishThreadsChanged([...command.threadIds, command.targetThreadId]);
          } else {
            ctx.publishThreadsChanged([command.threadId]);
          }
        }
      } catch (error) {
        if (catalogCommitted) throw commandOutcomeUncertainAfterEffect(error);
        throw error;
      }
      return { ok: true };
    };
    // Receipt-guarded kinds: `start` (crash-unsafe launch) and the narrow
    // catalog mutations. Catalog kinds REQUIRE the caller's per-action command
    // id before any effect, because a relative move is only retry-safe under
    // it; legacy kinds keep their historical optional header. A pure
    // validation refusal stays a definite failure: the commit signal fires
    // only after a real write.
    const catalogCommand = isRemoteThreadCatalogCommand(command);
    const result =
      command.kind === "start" || catalogCommand
        ? await runRemoteCommand({
            commandId: catalogCommand
              ? requireRemoteCommandId(req, command.kind)
              : remoteCommandId(req),
            route: url.pathname,
            principalId: session?.sessionId ?? null,
            requestPayload: command,
            operation: (markDispatched) => dispatch(markDispatched),
          })
        : await dispatch();
    writeJson(res, 200, result);
  },

  "thread-send": async (call) => {
    const { ctx, req, res, url, params, session } = call;
    const threadId = requirePathParam(params, "threadId");
    const body = await readJsonBody(req);
    const payload = sendThreadInputPayloadSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      threadId,
    });
    const result = await runRemoteCommand({
      commandId: remoteCommandId(req),
      route: url.pathname,
      principalId: session?.sessionId ?? null,
      requestPayload: payload,
      operation: async (markDispatched) => {
        markDispatched();
        await ctx.options.callSupervisor("sendThreadInput", payload);
        return { ok: true };
      },
    });
    writeJson(res, 200, result);
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

  // B1 declared-only durable-gap recovery. `notices=v1` is required on both
  // routes; the ack requires the standard command-id receipt and never touches
  // committed transcript bytes.
  "thread-runtime-gap": (call) => {
    const { ctx, res, url, params } = call;
    const threadId = requirePathParam(params, "threadId");
    requireRuntimeHistoryNoticesDeclaration(url);
    const port = requireRuntimeHistoryGapPort(ctx);
    if (!dbGetThread(threadId)) {
      throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
    }
    try {
      const descriptor = port.read(threadId);
      const notice = port.readNotice(threadId);
      writeJson(
        res,
        200,
        remoteRuntimeGapReadResultSchema.parse({
          gap: descriptor ? toRemoteRuntimeGapDescriptor(descriptor) : null,
          notice: notice ? toRemoteRuntimeHistoryNotice(notice) : null,
        }),
      );
    } catch (error) {
      throw mapPersistenceRefusal(error);
    }
  },

  "thread-runtime-gap-acknowledge": async (call) => {
    const { ctx, req, res, url, params, session } = call;
    const threadId = requirePathParam(params, "threadId");
    requireRuntimeHistoryNoticesDeclaration(url);
    const port = requireRuntimeHistoryGapPort(ctx);
    if (!dbGetThread(threadId)) {
      throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
    }
    const body = await readJsonBody(req);
    const payload = remoteRuntimeGapAcknowledgeBodySchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      threadId,
    });
    const commandId = remoteCommandId(req);
    if (!commandId) {
      throw new RemoteHttpError(
        "command_id_required",
        "Acknowledging a runtime gap requires an x-poracode-command-id header.",
        400,
      );
    }
    const result = await runRemoteCommand({
      commandId,
      route: url.pathname,
      principalId: session?.sessionId ?? null,
      requestPayload: payload,
      operation: (markDispatched) => {
        // Everything past this mark may have committed the durable
        // acknowledgement, so a failure stays `uncertain` (never a definite
        // failure) and a retry resolves only through the reconcile proof below.
        markDispatched();
        return port
          .acknowledge(threadId, payload.episodeToken)
          .then(toRemoteRuntimeGapAcknowledgeResult);
      },
      // A cached response is replayed through the wire schema, so a receipt
      // written by another build can never leak a non-wire shape.
      mapCompletedResponse: (cached) => remoteRuntimeGapAcknowledgeResultSchema.parse(cached),
      // Concrete existing notice proof through the current session seam: the
      // stored acknowledged token must be exactly the episode token this
      // command requested. Without that proof the receipt stays unresolved —
      // a previously uncertain acknowledgement is never re-executed blindly.
      reconcileUncertain: () => {
        try {
          const notice = port.readNotice(threadId);
          return notice &&
            runtimeHistoryNoticeTokensEqual(notice.acknowledgedToken, payload.episodeToken)
            ? { kind: "resume" }
            : { kind: "unresolved" };
        } catch {
          return { kind: "unresolved" };
        }
      },
    }).catch((error: unknown) => {
      // Typed busy/unavailable/identity refusals are honest retryable or
      // corrupt-state answers; commit errors keep their truthful HTTP shape.
      throw mapPersistenceRefusal(error);
    });
    writeJson(res, 200, result);
  },
};
