import { isDeepStrictEqual } from "node:util";
import { isHostResourceAdmissionRefusal } from "@/shared/hostResourceAdmission";
import {
  THREAD_LAUNCH_FAILED_REFUSAL_CODE,
  isThreadLaunchFailedRefusal,
} from "@/shared/threadLaunchRefusal";
import { WorkspaceLaunchUnavailableError } from "@/shared/threadWorkspaceRefusal";
import type {
  RemoteThreadCommand,
  StartThreadPayload,
  StartThreadResult,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
  ThreadStatusSource,
} from "@/shared/contracts";
import { dbGetThreads, dbUpsertThread } from "@/host/db";
import { RemoteHttpError } from "../auth";
import type { RemoteServerContext } from "./context";
import { sortOrderForThread } from "./snapshots";

const remoteThreadSwitchTails = new Map<string, Promise<void>>();

async function serializeRemoteThreadSwitch<Result>(
  threadId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const previous = remoteThreadSwitchTails.get(threadId) ?? Promise.resolve();
  const run = previous.then(operation);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  remoteThreadSwitchTails.set(threadId, tail);
  try {
    return await run;
  } finally {
    if (remoteThreadSwitchTails.get(threadId) === tail) {
      remoteThreadSwitchTails.delete(threadId);
    }
  }
}

/**
 * Continue an existing thread under a different provider (the `providerSwitch`
 * variant of `/api/threads/start`). The durable row must name the new provider
 * BEFORE the supervisor call: the supervisor emits the new session's first
 * state events during the awaited call, and `persistThreadStateEvent` drops
 * any state whose `agentKind` disagrees with the row. The renderer retarget is
 * dispatched first too — the desktop renderer's store is the last writer for
 * the threads table (its persist rewrites every column), so a late mirror is a
 * clobber window. The caller runs this inside its idempotent closure, so a
 * replayed command id returns the stored response without repeating any of it.
 * `markDispatched` is invoked at the first real effect — after the pre-effect
 * validation below, immediately before the row retarget — so a pure rejection
 * never marks the command dispatched.
 */
export async function applyRemoteThreadSwitch(
  ctx: RemoteServerContext,
  supervisorPayload: StartThreadPayload & { threadId: string },
  markDispatched: () => void,
  prepared?: {
    admit: () => void;
    assertCheckoutCurrent: () => void;
  },
): Promise<StartThreadResult> {
  const { threadId } = supervisorPayload;
  const run = async () => {
    prepared?.admit();
    const controlIsCurrent = ctx.options.captureThreadControlState?.(threadId, 0);
    const current = dbGetThreads().find((thread) => thread.id === supervisorPayload.threadId);
    if (!current) {
      throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
    }
    if (
      current.presentationMode !== "gui" &&
      !(prepared && current.presentationMode === undefined)
    ) {
      throw new RemoteHttpError(
        "provider_switch_requires_gui",
        "Only GUI threads can switch provider in place.",
        409,
      );
    }
    if (current.agentKind !== supervisorPayload.providerSwitch?.fromAgentKind) {
      throw new RemoteHttpError(
        "provider_switch_stale",
        "The thread provider changed before this switch could start.",
        409,
      );
    }

    // Validation is pure and stays inside the per-thread serialization; the
    // dispatch marker belongs past it, at the first real effect — the durable
    // row retarget below. The caller's receipt then records a rejected
    // validation as a definite failure instead of an uncertain dispatch.
    markDispatched();
    const { previous, switched } = retargetRemoteThreadForSwitch(supervisorPayload.threadId, {
      agentKind: supervisorPayload.agentKind,
      ...(supervisorPayload.agentInstanceId !== undefined
        ? { agentInstanceId: supervisorPayload.agentInstanceId }
        : {}),
      config: supervisorPayload.config,
      ...(supervisorPayload.presentationMode
        ? { presentationMode: supervisorPayload.presentationMode }
        : {}),
    });
    await Promise.resolve()
      .then(() =>
        ctx.options.dispatchThreadCommand?.(
          switchRetargetCommand(supervisorPayload, previous.projectId),
        ),
      )
      .catch((error: unknown) => {
        console.warn("[remote] provider switch projection failed:", error);
      });
    let result: StartThreadResult;
    let refusedBeforeLaunch = false;
    const admitLaunch = () => {
      try {
        prepared?.assertCheckoutCurrent();
        if (controlIsCurrent && !controlIsCurrent()) {
          throw new Error("A newer thread control cancelled the switch.");
        }
      } catch (error) {
        refusedBeforeLaunch = true;
        throw error;
      }
    };
    try {
      const launch = prepared
        ? {
            ...supervisorPayload,
            ...ctx.options.resolveMcpLaunchSnapshot?.(
              previous.projectId,
              supervisorPayload.config.mcpServerOverrides,
            ),
          }
        : supervisorPayload;
      if (ctx.options.runThreadMutation) {
        result = await ctx.options.callSupervisor("startThread", launch, {
          skipThreadMutation: true,
          assertLaunchCurrent: admitLaunch,
        });
      } else {
        admitLaunch();
        result = await ctx.options.callSupervisor("startThread", launch);
      }
    } catch (error) {
      // The MCP receipt must retain the target row when the supervisor could
      // have accepted the launch before its reply was lost.
      if (
        prepared &&
        !refusedBeforeLaunch &&
        !(error instanceof WorkspaceLaunchUnavailableError) &&
        !isPlainThreadStartPreEffectFailure(error)
      ) {
        try {
          ctx.publishThreadsChanged([threadId]);
        } catch (publishError) {
          console.warn(
            "[remote] uncertain provider switch catalog publication failed:",
            publishError,
          );
        }
        throw error;
      }
      await restoreFailedSwitch(ctx, previous, switched, supervisorPayload.prompt).catch(
        (restoreError: unknown) =>
          console.warn("[remote] provider switch restore failed:", restoreError),
      );
      throw error;
    }
    try {
      ctx.publishThreadsChanged([threadId]);
    } catch (error) {
      console.warn("[remote] provider switch committed but catalog publication failed:", error);
    }
    return result;
  };
  return ctx.options.runThreadMutation
    ? ctx.options.runThreadMutation(threadId, run)
    : serializeRemoteThreadSwitch(threadId, run);
}

async function restoreFailedSwitch(
  ctx: RemoteServerContext,
  previous: Thread,
  switched: Thread,
  prompt: string,
): Promise<void> {
  const threads = dbGetThreads();
  const current = threads.find((thread) => thread.id === switched.id);
  if (
    !current ||
    current.createdAt !== switched.createdAt ||
    current.agentKind !== switched.agentKind ||
    current.agentInstanceId !== switched.agentInstanceId ||
    current.presentationMode !== switched.presentationMode ||
    !isDeepStrictEqual(current.config, switched.config)
  )
    return;
  const {
    sessionRef: _closedSessionRef,
    agentInstanceId: _discardedInstance,
    slashCommands: _discardedCommands,
    sessionConfigOptions: _discardedOptions,
    errorMessage: _discardedError,
    threadStatusSource: _discardedStatusSource,
    presentationMode: _discardedPresentation,
    activeTurnStartedAt: _closedTurn,
    ...metadata
  } = current;
  const restored: Thread = {
    ...metadata,
    agentKind: previous.agentKind,
    ...(previous.agentInstanceId !== undefined
      ? { agentInstanceId: previous.agentInstanceId }
      : {}),
    config: previous.config,
    ...(previous.threadStatusSource ? { threadStatusSource: previous.threadStatusSource } : {}),
    ...(previous.presentationMode ? { presentationMode: previous.presentationMode } : {}),
    status:
      current.archived ||
      current.status === "inactive" ||
      previous.status === "working" ||
      previous.status === "launching"
        ? "inactive"
        : previous.status,
    attention: "none",
    canResumeWithConfig: false,
  };
  dbUpsertThread(restored, sortOrderForThread(threads, restored.id));
  ctx.publishThreadsChanged([restored.id]);
  await ctx.options.dispatchThreadCommand?.({
    kind: "start",
    threadId: restored.id,
    projectId: restored.projectId,
    agentKind: restored.agentKind,
    ...(restored.agentInstanceId !== undefined
      ? { agentInstanceId: restored.agentInstanceId }
      : {}),
    config: restored.config,
    prompt,
    ...(restored.presentationMode ? { presentationMode: restored.presentationMode } : {}),
    launchRuntime: false,
    providerSwitch: { fromAgentKind: switched.agentKind, previousStatus: restored.status },
  });
}

function switchRetargetCommand(
  payload: StartThreadPayload & { threadId: string },
  projectId: string,
): Extract<RemoteThreadCommand, { kind: "start" }> {
  return {
    kind: "start",
    threadId: payload.threadId,
    projectId,
    agentKind: payload.agentKind,
    ...(payload.agentInstanceId !== undefined ? { agentInstanceId: payload.agentInstanceId } : {}),
    config: payload.config,
    prompt: payload.prompt,
    ...(payload.presentationMode ? { presentationMode: payload.presentationMode } : {}),
    launchRuntime: false,
    ...(payload.providerSwitch ? { providerSwitch: payload.providerSwitch } : {}),
  };
}

/**
 * Flip an existing thread's durable row to a new provider for an in-place
 * switch. Mirrors the renderer's `applyProviderSwitch` exactly: identity and
 * transcript survive; the session ref, instance, slash commands, error, and
 * done-markers of the provider being left behind are dropped — and because
 * `dbUpsertThread` writes every column unconditionally, the dropped keys really
 * clear. Returns the previous row so the caller can restore it if the launch
 * fails.
 */
export function retargetRemoteThreadForSwitch(
  threadId: string,
  input: {
    agentKind: string;
    agentInstanceId?: string;
    config: ThreadConfig;
    presentationMode?: ThreadPresentationMode;
  },
): { previous: Thread; switched: Thread } {
  const threads = dbGetThreads();
  const previous = threads.find((entry) => entry.id === threadId);
  if (!previous) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const {
    sessionRef: _droppedSessionRef,
    agentInstanceId: _droppedInstanceId,
    slashCommands: _droppedSlashCommands,
    sessionConfigOptions: _droppedSessionOptions,
    errorMessage: _droppedError,
    doneAt: _droppedDoneAt,
    threadStatusSource: _droppedStatusSource,
    ...rest
  } = previous;
  const now = new Date().toISOString();
  const presentationMode = input.presentationMode ?? previous.presentationMode ?? "terminal";
  const switched: Thread = {
    ...rest,
    agentKind: input.agentKind,
    ...(input.agentInstanceId !== undefined ? { agentInstanceId: input.agentInstanceId } : {}),
    config: input.config,
    presentationMode,
    ...(presentationMode !== "terminal"
      ? { threadStatusSource: "server" as ThreadStatusSource }
      : {}),
    status: "launching",
    attention: "none",
    canResumeWithConfig: false,
    done: false,
    updatedAt: now,
    activeTurnStartedAt: now,
  };
  dbUpsertThread(switched, sortOrderForThread(threads, threadId));
  return { previous, switched };
}

export function isPlainThreadStartPreEffectFailure(error: unknown): boolean {
  return isHostResourceAdmissionRefusal(error) || isThreadLaunchFailedRefusal(error);
}

export function rethrowPlainThreadStartRefusal(error: unknown, providerSwitch: unknown): never {
  if (!providerSwitch && isThreadLaunchFailedRefusal(error)) {
    throw new RemoteHttpError(
      THREAD_LAUNCH_FAILED_REFUSAL_CODE,
      error instanceof Error && error.message.length > 0
        ? error.message
        : "The thread could not be started.",
      422,
    );
  }
  throw error;
}
