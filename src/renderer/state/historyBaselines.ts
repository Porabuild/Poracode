import type { HostSession } from "@/renderer/hostTransport/hostSession";

/**
 * The newest authoritative history baseline each thread installed, per host
 * session: the `snapshotSeq` of the last history read that actually replaced
 * its transcript. A host's live frame at or below it is already part of that
 * transcript, so a replayed destructive frame (`runtime.truncated`) must not
 * roll newer state back.
 *
 * A baseline belongs to the host's event epoch: it survives reconnecting to
 * the same instance (the replay is exactly what it guards), and is dropped
 * once the session re-binds to a new epoch (`resumeFence` moves), where
 * sequences restart and prove nothing.
 */
const baselines = new WeakMap<
  HostSession,
  { readonly fence: number; readonly byThread: Map<string, number> }
>();

function ledger(session: HostSession) {
  let entry = baselines.get(session);
  if (!entry || entry.fence !== session.resumeFence) {
    entry = { fence: session.resumeFence, byThread: new Map() };
    baselines.set(session, entry);
  }
  return entry.byThread;
}

/** Records an authoritative install; only for a read that replaced the transcript. */
export function noteHistoryBaseline(
  session: HostSession,
  viewThreadId: string,
  snapshotSeq: number,
): void {
  const byThread = ledger(session);
  if ((byThread.get(viewThreadId) ?? Number.NEGATIVE_INFINITY) < snapshotSeq)
    byThread.set(viewThreadId, snapshotSeq);
}

/** True when the thread's installed baseline already includes `sequence`. */
export function historyBaselineCovers(
  session: HostSession,
  viewThreadId: string,
  sequence: number,
): boolean {
  const installed = ledger(session).get(viewThreadId);
  return installed !== undefined && sequence <= installed;
}

/** Drops a host session's baselines (its connection was closed, removed or re-paired). */
export function forgetHistoryBaselines(session: HostSession): void {
  baselines.delete(session);
}

/** The thread's installed baseline sequence, if any. */
export function readHistoryBaseline(
  session: HostSession,
  viewThreadId: string,
): number | undefined {
  return ledger(session).get(viewThreadId);
}

let incorporationCheck: ((threadId: string, sequence: number) => boolean) | null = null;

/**
 * Registered by the host history module (which resolves each thread's host):
 * whether a thread's installed baseline already includes a host sequence.
 */
export function setHistoryIncorporationCheck(
  check: ((threadId: string, sequence: number) => boolean) | null,
): void {
  incorporationCheck = check;
}

export function isHistoryIncorporated(threadId: string, sequence: number): boolean {
  return incorporationCheck?.(threadId, sequence) === true;
}
