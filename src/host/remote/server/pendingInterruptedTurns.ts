import type { Thread, ThreadTurnInterruption } from "@/shared/contracts";

// Metadata from thread states whose row write is still queued. Cut-off markers
// also project into reads published before the write lands.
type ThreadOwner = Pick<Thread, "id" | "agentKind">;
export interface PendingInterruptedTurnEntry {
  agentKind: Thread["agentKind"];
  interruptedTurn: ThreadTurnInterruption | null;
  turnStopRequested: boolean;
}
const pendingInterruptedTurns = new Map<string, PendingInterruptedTurnEntry>();
interface PendingThreadState {
  agentKind: Thread["agentKind"] | undefined;
  /** Null retires an earlier error even if its clearing state never reaches disk. */
  errorMessage: string | null;
}
const pendingThreadStates = new Map<string, PendingThreadState>();

/** Admission tokens fence callbacks retained by the control queue across rewind. */
export function notePendingThreadState(threadId: string, token: PendingThreadState): void {
  pendingThreadStates.set(threadId, token);
}

export function pendingThreadErrorMessage(thread: ThreadOwner): string | null | undefined {
  const pending = pendingThreadStates.get(thread.id);
  return pending?.agentKind === thread.agentKind ? pending.errorMessage : undefined;
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
  turnStopRequested = false,
): void {
  pendingInterruptedTurns.set(thread.id, {
    agentKind: thread.agentKind,
    interruptedTurn,
    turnStopRequested,
  });
}

export function pendingThreadStopRequested(thread: ThreadOwner): boolean {
  const pending = pendingInterruptedTurns.get(thread.id);
  return pending?.turnStopRequested === true && pending.agentKind === thread.agentKind;
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

export function snapshotPendingInterruptedTurns(): Record<string, PendingInterruptedTurnEntry> {
  const snapshot: Record<string, PendingInterruptedTurnEntry> = {};
  for (const [threadId, entry] of pendingInterruptedTurns) {
    snapshot[threadId] = entry;
  }
  return snapshot;
}

export function applyPendingInterruptedTurn(
  thread: Thread,
  entry: PendingInterruptedTurnEntry | undefined,
): Thread {
  if (!entry || entry.agentKind !== thread.agentKind) return thread;
  const pending = entry.interruptedTurn;
  if (pending !== null) return { ...thread, interruptedTurn: pending };
  const { interruptedTurn: _cleared, ...rest } = thread;
  return rest;
}

export function withPendingInterruptedTurn(thread: Thread): Thread {
  return applyPendingInterruptedTurn(thread, pendingInterruptedTurns.get(thread.id));
}

export function resetPendingInterruptedTurnsForTests(): void {
  pendingInterruptedTurns.clear();
  pendingThreadStates.clear();
}
