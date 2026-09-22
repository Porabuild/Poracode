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
): Promise<StartThreadResult> {
  return serializeRemoteThreadSwitch(supervisorPayload.threadId, async () => {
    const current = dbGetThreads().find((thread) => thread.id === supervisorPayload.threadId);
    if (!current) {
      throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
    }
    if (current.presentationMode !== "gui") {
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
    const { previous } = retargetRemoteThreadForSwitch(supervisorPayload.threadId, {
      agentKind: supervisorPayload.agentKind,
      config: supervisorPayload.config,
      ...(supervisorPayload.presentationMode
        ? { presentationMode: supervisorPayload.presentationMode }
        : {}),
    });
    await ctx.options.dispatchThreadCommand?.(
      switchRetargetCommand(supervisorPayload, previous.projectId),
    );
    try {
      const result = await ctx.options.callSupervisor("startThread", supervisorPayload);
      ctx.publishThreadsChanged([supervisorPayload.threadId]);
      return result;
    } catch (error) {
      const previousWasLive = previous.status === "working" || previous.status === "launching";
      const {
        sessionRef: _closedSessionRef,
        agentInstanceId: _closedAgentInstanceId,
        slashCommands: _closedSlashCommands,
        errorMessage: _closedErrorMessage,
        doneAt: _closedDoneAt,
        activeTurnStartedAt: _closedTurn,
        ...previousBase
      } = previous;
      const restored: Thread = {
        ...previousBase,
        status: previousWasLive ? "inactive" : previous.status,
        attention: "none",
        canResumeWithConfig: false,
        done: false,
      };
      dbUpsertThread(restored, sortOrderForThread(dbGetThreads(), restored.id));
      await ctx.options.dispatchThreadCommand?.({
        kind: "start",
        threadId: restored.id,
        projectId: restored.projectId,
        agentKind: restored.agentKind,
        config: restored.config,
        prompt: supervisorPayload.prompt,
        ...(restored.presentationMode ? { presentationMode: restored.presentationMode } : {}),
        launchRuntime: false,
        providerSwitch: {
          fromAgentKind: supervisorPayload.agentKind,
          previousStatus: restored.status,
        },
      });
      throw error;
    }
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
