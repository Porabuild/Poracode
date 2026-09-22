import type { RemoteRuntimeGapDescriptor, RemoteRuntimeHistoryNotice } from "@/shared/remote";

/**
 * B1 durable history-incomplete notice state (renderer).
 *
 * The notice is thread-level and durable on the host: it survives later turns,
 * pagination, reset/rebase/truncate and reconnect. Therefore a read that OMITS
 * the field never clears an existing notice — only an authoritative thread
 * removal or an authority replacement does (the entry is fenced by connection
 * identity, so a re-pair/host switch can neither display nor acknowledge
 * another server's notice). `gap` is the current UNACKNOWLEDGED episode read
 * from the declared descriptor route; it is the acknowledgement precondition.
 */
export interface ThreadHistoryNoticeEntry {
  readonly notice: RemoteRuntimeHistoryNotice | null;
  readonly gap: RemoteRuntimeGapDescriptor | null;
  /**
   * True after a definite declared-read refusal on a notice-capable host: the
   * thread likely has an OPEN gap, so the explicit recovery read/ack path is
   * offered instead of a generic "failed to load" state.
   */
  readonly needsReview: boolean;
  /** Connection identity of the authority that authored this entry. */
  readonly authority: string;
}

const entries = new Map<string, ThreadHistoryNoticeEntry>();
const listeners = new Set<() => void>();

export function subscribeThreadHistoryNotices(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(): void {
  for (const listener of [...listeners]) listener();
}

export function readThreadHistoryNotice(
  viewThreadId: string,
): ThreadHistoryNoticeEntry | undefined {
  return entries.get(viewThreadId);
}

function replaceIfAuthorityChanged(viewThreadId: string, authority: string): void {
  const existing = entries.get(viewThreadId);
  if (existing && existing.authority !== authority) entries.delete(viewThreadId);
}

/**
 * Record an authoritative transcript read. `notice === undefined` means the
 * response carried no field (an older host or an incremental read): the
 * existing notice is retained, never cleared.
 */
export function recordThreadHistoryNoticeRead(
  viewThreadId: string,
  authority: string,
  notice: RemoteRuntimeHistoryNotice | null | undefined,
): void {
  replaceIfAuthorityChanged(viewThreadId, authority);
  const current = entries.get(viewThreadId);
  if (notice === undefined) {
    if (current) {
      if (!current.needsReview) {
        entries.set(viewThreadId, { ...current, needsReview: false });
        publish();
      }
      return;
    }
    entries.set(viewThreadId, { notice: null, gap: null, needsReview: false, authority });
    publish();
    return;
  }
  const nextNotice = notice ?? null;
  const nextGap = nextNotice ? (current?.gap ?? null) : null;
  if (current && current.notice === nextNotice && current.gap === nextGap && !current.needsReview) {
    return;
  }
  entries.set(viewThreadId, { notice: nextNotice, gap: nextGap, needsReview: false, authority });
  publish();
}

/**
 * Mark a definite declared-read refusal on a notice-capable host: the thread
 * may have an open gap and the user can explicitly read/acknowledge it.
 */
export function noteThreadHistoryRecoveryNeeded(viewThreadId: string, authority: string): void {
  replaceIfAuthorityChanged(viewThreadId, authority);
  const current = entries.get(viewThreadId);
  if (current?.needsReview || current?.gap || current?.notice) return;
  entries.set(viewThreadId, { notice: null, gap: null, needsReview: true, authority });
  publish();
}

/** Record the declared gap-descriptor read (acknowledgement precondition). */
export function recordThreadHistoryGapRead(
  viewThreadId: string,
  authority: string,
  gap: RemoteRuntimeGapDescriptor | null,
): void {
  replaceIfAuthorityChanged(viewThreadId, authority);
  const current = entries.get(viewThreadId);
  const next: ThreadHistoryNoticeEntry = {
    notice: current?.notice ?? null,
    gap,
    needsReview: false,
    authority,
  };
  if (
    current &&
    current.notice === next.notice &&
    current.gap === next.gap &&
    !current.needsReview
  ) {
    return;
  }
  entries.set(viewThreadId, next);
  publish();
}

/** Authoritative removal / explicit reset. */
export function clearThreadHistoryNotice(viewThreadId: string): void {
  if (!entries.delete(viewThreadId)) return;
  publish();
}

/**
 * Authoritative server removal: drop every entry the outgoing authority
 * authored, so a removed connection's notice can never be displayed (or
 * acknowledged) against a future re-pair with the same key.
 */
export function clearThreadHistoryNoticesForAuthority(authority: string): void {
  let changed = false;
  for (const [viewThreadId, entry] of entries) {
    if (entry.authority !== authority) continue;
    entries.delete(viewThreadId);
    changed = true;
  }
  if (changed) publish();
}

/** Test-only. */
export function __resetThreadHistoryNoticeStoreForTest(): void {
  entries.clear();
  listeners.clear();
}
