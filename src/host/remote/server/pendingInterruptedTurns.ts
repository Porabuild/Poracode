import type { Thread, ThreadTurnInterruption } from "@/shared/contracts";

// Cut-off markers from thread states whose row write is still queued. The
// state is published before that write lands, so reads must show them too.
const pendingInterruptedTurns = new Map<string, ThreadTurnInterruption | null>();

export function notePendingInterruptedTurn(
  threadId: string,
  interruptedTurn: ThreadTurnInterruption | null,
): void {
  pendingInterruptedTurns.set(threadId, interruptedTurn);
}

export function pendingInterruptedTurn(
  threadId: string,
): ThreadTurnInterruption | null | undefined {
  return pendingInterruptedTurns.get(threadId);
}

export function settlePendingInterruptedTurn(threadId: string): void {
  pendingInterruptedTurns.delete(threadId);
}

export function withPendingInterruptedTurn(thread: Thread): Thread {
  const pending = pendingInterruptedTurns.get(thread.id);
  if (pending === undefined) return thread;
  if (pending !== null) return { ...thread, interruptedTurn: pending };
  const { interruptedTurn: _cleared, ...rest } = thread;
  return rest;
}

export function resetPendingInterruptedTurnsForTests(): void {
  pendingInterruptedTurns.clear();
}
