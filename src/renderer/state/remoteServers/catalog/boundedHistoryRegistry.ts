import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  type RemoteBoundedReadsProof,
  type RemoteBoundedThreadHistoryPage,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { recordThreadHistoryNoticeRead } from "@/renderer/state/remote/historyNoticeStore";

/**
 * B4 bounded-history tail registry (W1, renderer).
 *
 * Stores, per projected thread, the bounded history page proof and
 * `completedTurnsNextCursor` so continuations can carry a strict reads echo.
 * Deliberately free of app-store/store imports so the procedure router and the
 * browser bridge can consult it without creating a module cycle; the
 * app-store-facing merge helpers live in `boundedHistory.ts`.
 */

export interface BoundedHistorySession {
  readonly authority: string;
  isCurrent(): boolean;
  withClient<Result>(
    invoke: (client: RemoteDesktopClient) => Promise<Result>,
  ): Promise<Result> | undefined;
}

export interface BoundedHistoryTail {
  readonly compactDetails?: boolean;
  readonly session: BoundedHistorySession;
  readonly threadId: string;
  readonly viewThreadId: string;
  cursor: string | null;
  readonly proof: RemoteBoundedReadsProof;
  readonly snapshotSeq: number;
}

const tails = new Map<string, BoundedHistoryTail>();
const MAX_TRACKED_TAILS = 256;

/** Records a thread's bounded tail under the session of the host that served it. */
export function recordHistoryTail(
  viewThreadId: string,
  threadId: string,
  page: RemoteBoundedThreadHistoryPage,
  session: BoundedHistorySession,
): void {
  if (tails.has(viewThreadId)) tails.delete(viewThreadId);
  tails.set(viewThreadId, {
    session,
    threadId,
    viewThreadId,
    cursor: page.completedTurnsNextCursor,
    proof: { reads: page.reads },
    snapshotSeq: page.snapshotSeq,
    ...(page.historyProjection ? { compactDetails: true } : {}),
  });
  evictOldestTails();
}

function evictOldestTails(): void {
  while (tails.size > MAX_TRACKED_TAILS) {
    const oldest = tails.keys().next().value;
    if (oldest === undefined) break;
    tails.delete(oldest);
  }
}

export function readBoundedHistoryTail(viewThreadId: string): BoundedHistoryTail | undefined {
  const tail = tails.get(viewThreadId);
  if (!tail) return undefined;
  if (!tail.session.isCurrent()) {
    tails.delete(viewThreadId);
    return undefined;
  }
  return tail;
}

/**
 * Advance the continuation cursor only while the captured tail is still the
 * registry's current entry. A forgotten/replaced tail (truncate, reset,
 * removal, re-open) rejects the stale page outright.
 */
export function advanceBoundedHistoryTailCursor(
  viewThreadId: string,
  tail: BoundedHistoryTail,
  cursor: string | null,
): boolean {
  if (readBoundedHistoryTail(viewThreadId) !== tail) return false;
  tail.cursor = cursor;
  return true;
}

/** Drops one thread's continuation after a truncate/reset/removal. */
export function forgetBoundedHistoryThread(desktopId: string, threadId: string): void {
  tails.delete(remoteThreadId(desktopId, threadId));
}

/** Drops one projected thread's continuation (timeline reset/eviction). */
export function forgetBoundedHistoryThreadByViewId(viewThreadId: string): void {
  tails.delete(viewThreadId);
}

export function forgetBoundedHistoryForServer(desktopId: string): void {
  const prefix = remoteThreadId(desktopId, "");
  for (const key of tails.keys()) {
    if (key.startsWith(prefix)) tails.delete(key);
  }
}

export function __resetBoundedHistoryRegistryForTest(): void {
  // The store-provided client invoker is a process-level binding, not
  // per-test state; only the recorded tails are cleared.
  tails.clear();
}

/**
 * Older runtime-items continuation for a negotiated bounded connection. Returns
 * undefined when this thread has no bounded tail, so the caller falls back to
 * the legacy IPC route (the only path a genuine older host supports).
 */
export async function invokeBoundedRuntimeItemsPage(
  client: RemoteDesktopClient,
  desktopId: string,
  payload: RuntimeItemsPageRequest,
): Promise<{ readonly items: unknown; readonly nextCursor: number | null } | undefined> {
  const tail = readBoundedHistoryTail(remoteThreadId(desktopId, payload.threadId));
  if (!tail) return undefined;
  return readRuntimeItemsPage(client, tail, payload);
}

type RuntimeItemsPageRequest = {
  readonly threadId: string;
  readonly limit: number;
  readonly beforePosition?: number | undefined;
  readonly targetTimelineEntryCount?: number | undefined;
  readonly signal?: AbortSignal;
};

/**
 * Older runtime-items continuation of a thread's recorded tail, through the
 * session of the host that served it, whichever host that is. `threadId` is
 * the store (view) id; the host's own id comes from the tail. Undefined when
 * the thread has no recorded tail.
 */
export async function invokeRecordedRuntimeItemsPage(
  payload: RuntimeItemsPageRequest,
): Promise<{ readonly items: unknown; readonly nextCursor: number | null } | undefined> {
  const tail = readBoundedHistoryTail(payload.threadId);
  if (!tail) return undefined;
  return tail.session.withClient((client) =>
    readRuntimeItemsPage(client, tail, { ...payload, threadId: tail.threadId }),
  );
}

async function readRuntimeItemsPage(
  client: RemoteDesktopClient,
  tail: BoundedHistoryTail,
  payload: RuntimeItemsPageRequest,
): Promise<{ readonly items: unknown; readonly nextCursor: number | null } | undefined> {
  if (payload.beforePosition === undefined) return undefined;
  const result = await client.boundedThreadHistoryItems({
    ...(tail.compactDetails ? { compactDetails: true } : {}),
    threadId: payload.threadId,
    beforePosition: payload.beforePosition,
    after: tail.proof,
    limit: payload.limit,
    ...(payload.targetTimelineEntryCount !== undefined
      ? { targetTimelineEntryCount: payload.targetTimelineEntryCount }
      : {}),
    noticesCapable: true,
    maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
    maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
    ...(payload.signal ? { signal: payload.signal } : {}),
  });
  payload.signal?.throwIfAborted();
  if (readBoundedHistoryTail(tail.viewThreadId) !== tail) return undefined;
  if (result.negotiation !== "bounded") return undefined;
  recordThreadHistoryNoticeRead(
    tail.viewThreadId,
    tail.session.authority,
    result.page.runtimeNotice,
  );
  return { items: result.page.items, nextCursor: result.page.nextCursor };
}
