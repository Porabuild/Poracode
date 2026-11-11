import { toError, toErrorMessage } from "@/shared/errorMessage";
import { isGitProcessAdmissionRefusal } from "@/shared/gitProcessAdmission";
import { isHostResourceAdmissionRefusal } from "@/shared/hostResourceAdmission";
import { isThreadSessionAbsenceRefusal } from "@/shared/threadSessionRefusal";
import type { AgentKind, SessionRef } from "@/shared/contracts";
import type { RuntimeEventRouter } from "./runtimeEventRouter";

type AllocatedSession = {
  agentKind: AgentKind;
  sessionRef: SessionRef;
  canResumeWithConfig: boolean;
};
const allocatedSessions = new WeakMap<Error, Map<string, AllocatedSession>>();

export interface StartThreadAttemptOutcome {
  confirmedPreRuntimeFailure?: boolean;
  providerSessionTouched?: boolean;
  launchTurnDispatched?: boolean;
}

class ConfirmedIpcThreadLaunchFailureCarrier extends Error {
  readonly rawError: unknown;

  constructor(rawError: unknown) {
    super(toErrorMessage(rawError), rawError instanceof Error ? { cause: rawError } : undefined);
    this.name = "ConfirmedIpcThreadLaunchFailureCarrier";
    this.rawError = rawError;
  }
}

export function isEligiblePreRuntimeLaunchFailure(error: unknown): boolean {
  return (
    !isHostResourceAdmissionRefusal(error) &&
    !isGitProcessAdmissionRefusal(error) &&
    !isThreadSessionAbsenceRefusal(error)
  );
}

export function wrapConfirmedIpcThreadLaunchFailure(error: unknown): Error {
  if (error instanceof ConfirmedIpcThreadLaunchFailureCarrier) return error;
  return new ConfirmedIpcThreadLaunchFailureCarrier(error);
}

export function unwrapConfirmedIpcThreadLaunchFailure(error: unknown): {
  rawError: unknown;
  confirmedLaunchFailure: boolean;
} {
  if (error instanceof ConfirmedIpcThreadLaunchFailureCarrier) {
    return {
      rawError: error.rawError,
      confirmedLaunchFailure: isEligiblePreRuntimeLaunchFailure(error.rawError),
    };
  }
  return { rawError: error, confirmedLaunchFailure: false };
}

/**
 * An open can allocate a native resource before later configuration fails.
 * Keep its exact, provider-bound reference on the original failure so the
 * startup boundary can persist it even after retiring the unpublished handle.
 * This metadata is private to the current attempt, never inferred from a list
 * or serialized onto an error/RPC response.
 */
export function retainUnpublishedStartSessionRef(
  failure: unknown,
  threadId: string,
  agentKind: AgentKind,
  sessionRef: SessionRef | undefined,
  canResumeWithConfig = true,
): Error {
  const error = toError(failure);
  let threads = allocatedSessions.get(error);
  if (sessionRef) {
    if (!threads) {
      threads = new Map();
      allocatedSessions.set(error, threads);
    }
    threads.set(threadId, { agentKind, sessionRef: { ...sessionRef }, canResumeWithConfig });
  } else {
    threads?.delete(threadId);
  }
  return error;
}

/**
 * A rejected startup has no live runtime to settle the client's optimistic turn.
 * A start that carried the user's message was a turn of its own: it stays
 * resumable, like any other turn that failed.
 */
export function publishUnpublishedStartFailure(
  threadId: string,
  error: unknown,
  router: Pick<RuntimeEventRouter, "append" | "queueStopMarker">,
  options: { carriedPrompt?: boolean } = {},
): void {
  // One error object may be reused by concurrent provider attempts. Consume
  // only this thread's capture; another owner must never acquire its ref.
  const captures = error instanceof Error ? allocatedSessions.get(error) : undefined;
  const allocated = captures?.get(threadId);
  captures?.delete(threadId);
  const message = toErrorMessage(error);
  router.append(threadId, { type: "error", threadId, message });
  // Keep the terminal state behind its canonical error when delivery is
  // backpressured. A failed start is authoritative even if its RPC receipt
  // was lost and the client cannot classify the mutation's outcome.
  router.queueStopMarker(threadId, {
    type: "thread-state",
    threadId,
    status: "error",
    attention: "error",
    errorMessage: message,
    canResumeWithConfig: allocated?.canResumeWithConfig ?? options.carriedPrompt === true,
    sessionConfigOptions: null,
    ...(allocated ? { agentKind: allocated.agentKind, sessionRef: allocated.sessionRef } : {}),
    ...(options.carriedPrompt ? { interruptedTurn: "error" as const } : {}),
    forceCloseActiveTurn: true,
    threadStatusSource: "server",
  });
}

/** An explicitly interrupted failed open still owns any resource it allocated. */
export function publishUnpublishedStartInterruption(
  threadId: string,
  error: Error,
  router: Pick<RuntimeEventRouter, "queueStopMarker">,
): void {
  const captures = allocatedSessions.get(error);
  const allocated = captures?.get(threadId);
  captures?.delete(threadId);
  if (!allocated) return;
  router.queueStopMarker(threadId, {
    type: "thread-state",
    threadId,
    agentKind: allocated.agentKind,
    sessionRef: allocated.sessionRef,
    canResumeWithConfig: allocated.canResumeWithConfig,
    status: "inactive",
    attention: "none",
    sessionConfigOptions: null,
    forceCloseActiveTurn: true,
    threadStatusSource: "server",
  });
}
