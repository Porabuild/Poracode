import { runtimeHistoryBoundary } from "./runtimeHistoryBoundary";

interface ResumeState {
  readonly authority: string;
  readonly cursor: string;
  readonly boundary: object;
  appliedSeq: number;
  /** Control events are always delivered, even across a bulk-content interest gap. */
  controlSeq: number;
  coverageLost: boolean;
  unsafe: boolean;
}
const resumes = new Map<string, ResumeState>();
const reads = new Map<
  string,
  {
    authority: string;
    appliedSeq: number;
    controlSeq: number;
    coverageLost: boolean;
    unsafe: boolean;
  }
>();

/** Admission tracks deltas applied during a cold read, not merely received frames. */
export function beginHistorySnapshotRead(threadId: string, authority: string) {
  const read = { authority, appliedSeq: 0, controlSeq: 0, coverageLost: false, unsafe: false };
  reads.set(threadId, read);
  return {
    finish(cursor: string | undefined, snapshotSeq: number) {
      if (reads.get(threadId) !== read) return;
      reads.delete(threadId);
      if (!cursor) {
        resumes.delete(threadId);
        return;
      }
      resumes.delete(threadId);
      resumes.set(threadId, {
        authority,
        cursor,
        boundary: runtimeHistoryBoundary(threadId).generation,
        appliedSeq: Math.max(snapshotSeq, read.appliedSeq),
        controlSeq: Math.max(snapshotSeq, read.controlSeq),
        coverageLost: read.coverageLost,
        unsafe: read.unsafe,
      });
      while (resumes.size > 256) resumes.delete(resumes.keys().next().value!);
    },
    cancel() {
      if (reads.get(threadId) === read) reads.delete(threadId);
    },
  };
}

export function noteHistoryRuntimeApplied(
  threadId: string,
  authority: string,
  sequence: number | null,
  delivery: { readonly completeTranscript: boolean; readonly containsBulk: boolean },
) {
  const read = reads.get(threadId);
  const resume = resumes.get(threadId);
  for (const state of [read, resume]) {
    if (!state || state.authority !== authority) continue;
    if (sequence === null) state.unsafe = true;
    else {
      state.controlSeq = Math.max(state.controlSeq, sequence);
      if (!delivery.completeTranscript) state.coverageLost = true;
      if (state.coverageLost) {
        // Partial delivery is useful for controls, but cannot prove an append
        // prefix. Applying any new bulk before recovery needs a fresh baseline.
        if (delivery.containsBulk) state.unsafe = true;
      } else state.appliedSeq = Math.max(state.appliedSeq, sequence);
    }
  }
}

/** Preserve the useful cursor, freezing transcript coverage until recovery. */
export function noteHistoryDeliveryGap(threadId: string): void {
  for (const state of [reads.get(threadId), resumes.get(threadId)]) {
    if (state) state.coverageLost = true;
  }
}

export function readHistoryResume(threadId: string, authority: string) {
  const state = resumes.get(threadId);
  return state?.authority === authority &&
    !state.unsafe &&
    state.boundary === runtimeHistoryBoundary(threadId).generation
    ? state
    : undefined;
}

/** A baseline prefix remains useful for scheduling a rebuild even after replay became unsafe. */
export function historyTranscriptPrefix(threadId: string, authority: string): number | undefined {
  const state = resumes.get(threadId);
  return state?.authority === authority &&
    state.boundary === runtimeHistoryBoundary(threadId).generation
    ? state.appliedSeq
    : undefined;
}

export function advanceHistoryResume(
  threadId: string,
  captured: ResumeState,
  cursor: string,
  seq: number,
): boolean {
  if (
    resumes.get(threadId) !== captured ||
    captured.boundary !== runtimeHistoryBoundary(threadId).generation
  )
    return false;
  resumes.set(threadId, {
    ...captured,
    cursor,
    appliedSeq: Math.max(captured.appliedSeq, seq),
    controlSeq: Math.max(captured.controlSeq, seq),
    coverageLost: false,
  });
  return true;
}
export function forgetHistoryResume(threadId: string): void {
  resumes.delete(threadId);
  reads.delete(threadId);
}
