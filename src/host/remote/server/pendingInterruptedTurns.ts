import type { Thread, ThreadTurnInterruption } from "@/shared/contracts";

// Cut-off markers from thread states whose row write is still queued. The
// state is published before that write lands, so reads must show them too.
type ThreadOwner = Pick<Thread, "id" | "agentKind">;
const pendingInterruptedTurns = new Map<
  string,
  { agentKind: Thread["agentKind"]; interruptedTurn: ThreadTurnInterruption | null }
>();
const pendingThreadStates = new Map<string, object>();

/** Admission tokens fence callbacks retained by the control queue across rewind. */
export function notePendingThreadState(threadId: string, token: object): void {
  pendingThreadStates.set(threadId, token);
}

export function isPendingThreadStateCurrent(threadId: string, token: object): boolean {
  return pendingThreadStates.get(threadId) === token;
}

/** Call only after a committed rewind; failed/no-op rewinds retain queued state. */
export function retirePendingThreadState(threadId: string): void {
  pendingThreadStates.delete(threadId);
  settlePendingInterruptedTurn(threadId);
}

export function notePendingInterruptedTurn(
  thread: ThreadOwner,
  interruptedTurn: ThreadTurnInterruption | null,
): void {
  pendingInterruptedTurns.set(thread.id, { agentKind: thread.agentKind, interruptedTurn });
}

export function pendingInterruptedTurn(
  thread: ThreadOwner,
): ThreadTurnInterruption | null | undefined {
  const pending = pendingInterruptedTurns.get(thread.id);
  return pending?.agentKind === thread.agentKind ? pending.interruptedTurn : undefined;
}

export function settlePendingInterruptedTurn(threadId: string): void {
  pendingInterruptedTurns.delete(threadId);
}

export function withPendingInterruptedTurn(thread: Thread): Thread {
  const pending = pendingInterruptedTurn(thread);
  if (pending === undefined) return thread;
  if (pending !== null) return { ...thread, interruptedTurn: pending };
  const { interruptedTurn: _cleared, ...rest } = thread;
  return rest;
}

export function resetPendingInterruptedTurnsForTests(): void {
  pendingInterruptedTurns.clear();
  pendingThreadStates.clear();
}
