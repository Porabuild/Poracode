import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  type RemoteBoundedReadsProof,
  type RemoteBoundedThreadHistoryPage,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { recordThreadHistoryNoticeRead } from "@/renderer/state/remote/historyNoticeStore";
import { currentRemoteServerGeneration } from "../eventSocketRegistry";

/**
 * B4 bounded-history tail registry (W1, renderer).
 *
 * Stores, per projected thread, the bounded history page proof and
 * `completedTurnsNextCursor` so continuations can carry a strict reads echo.
 * Deliberately free of app-store/store imports so the procedure router and the
 * browser bridge can consult it without creating a module cycle; the
 * app-store-facing merge helpers live in `boundedHistory.ts`.
 */

export interface BoundedHistoryTail {
  /**
   * Which live data plane authored this tail: a paired/attached remote server
   * (`desktopId` + the remote-store client) or the desktop's own managed
   * loopback connection (`managed-root`, raw thread ids, the ONE loopback
   * client, activation-seq generation). Both kinds share one continuation
   * engine; only client acquisition and the view-id keying differ.
   */
  readonly connectionKind: "remote" | "managed-root";
  readonly desktopId: string;
  readonly threadId: string;
  readonly viewThreadId: string;
  readonly generation: number;
  cursor: string | null;
  readonly proof: RemoteBoundedReadsProof;
  readonly snapshotSeq: number;
}

const tails = new Map<string, BoundedHistoryTail>();
const MAX_TRACKED_TAILS = 256;

let withBoundedClient:
  | (<Result>(
      desktopId: string,
      invoke: (client: RemoteDesktopClient) => Promise<Result>,
    ) => Promise<Result>)
  | null = null;

export function configureBoundedHistoryClient(
  invoke: <Result>(
    desktopId: string,
    operation: (client: RemoteDesktopClient) => Promise<Result>,
  ) => Promise<Result>,
): void {
  withBoundedClient = invoke;
}

export function boundedClientInvoker(): typeof withBoundedClient {
  return withBoundedClient;
}

/**
 * The managed loopback client provider (B4 root history). Bound by the root
 * adapter from the live activation accessor so this registry stays free of
 * transport imports; `null` while the leg is down.
 */
export interface ManagedRootHistoryClientSnapshot {
  readonly client: RemoteDesktopClient;
  readonly seq: number;
  /** Opaque per-activation notice authority (C1 identity custody). */
  readonly authority: string;
}

let managedRootClientProvider: (() => ManagedRootHistoryClientSnapshot | null) | null = null;

export function configureBoundedHistoryManagedRootClient(
  provider: (() => ManagedRootHistoryClientSnapshot | null) | null,
): void {
  managedRootClientProvider = provider;
}

export function managedRootHistoryClient(): ManagedRootHistoryClientSnapshot | null {
  return managedRootClientProvider?.() ?? null;
}

export function recordBoundedHistoryTail(input: {
  readonly desktopId: string;
  readonly threadId: string;
  readonly page: RemoteBoundedThreadHistoryPage;
}): void {
  const viewThreadId = remoteThreadId(input.desktopId, input.threadId);
  if (tails.has(viewThreadId)) tails.delete(viewThreadId);
  tails.set(viewThreadId, {
    connectionKind: "remote",
    desktopId: input.desktopId,
    threadId: input.threadId,
    viewThreadId,
    generation: currentRemoteServerGeneration(input.desktopId),
    cursor: input.page.completedTurnsNextCursor,
    proof: input.page,
    snapshotSeq: input.page.snapshotSeq,
  });
  evictOldestTails();
}

/**
 * Record a managed-root bounded tail. Root rows are not projected, so the view
 * thread id IS the host thread id; the activation seq is the generation fence.
 */
export function recordManagedRootBoundedHistoryTail(input: {
  readonly threadId: string;
  readonly page: RemoteBoundedThreadHistoryPage;
}): void {
  const managed = managedRootHistoryClient();
  if (!managed) return;
  const viewThreadId = input.threadId;
  if (tails.has(viewThreadId)) tails.delete(viewThreadId);
  tails.set(viewThreadId, {
    connectionKind: "managed-root",
    desktopId: "",
    threadId: input.threadId,
    viewThreadId,
    generation: managed.seq,
    cursor: input.page.completedTurnsNextCursor,
    proof: input.page,
    snapshotSeq: input.page.snapshotSeq,
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
  if (tail.connectionKind === "managed-root") {
    const managed = managedRootHistoryClient();
    if (!managed || managed.seq !== tail.generation) {
      tails.delete(viewThreadId);
      return undefined;
    }
    return tail;
  }
  if (tail.generation !== currentRemoteServerGeneration(tail.desktopId)) {
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
  if (tails.get(viewThreadId) !== tail) return false;
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
  payload: {
    readonly threadId: string;
    readonly limit: number;
    readonly beforePosition?: number | undefined;
    readonly targetTimelineEntryCount?: number | undefined;
  },
): Promise<{ readonly items: unknown; readonly nextCursor: number | null } | undefined> {
  if (payload.beforePosition === undefined) return undefined;
  const tail = readBoundedHistoryTail(remoteThreadId(desktopId, payload.threadId));
  if (!tail) return undefined;
  const result = await client.boundedThreadHistoryItems({
    threadId: payload.threadId,
    beforePosition: payload.beforePosition,
    after: tail.proof,
    limit: payload.limit,
    ...(payload.targetTimelineEntryCount !== undefined
      ? { targetTimelineEntryCount: payload.targetTimelineEntryCount }
      : {}),
    // B1: this page shape carries the durable notice too, so a client that
    // hydrates incrementally cannot miss it.
    noticesCapable: true,
    maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
    maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  });
  if (result.negotiation !== "bounded") return undefined;
  // The notice rides the same authority as the history tail; an omitted field
  // never clears a notice already retained for this thread.
  recordThreadHistoryNoticeRead(
    remoteThreadId(desktopId, payload.threadId),
    desktopId,
    result.page.runtimeNotice,
  );
  return { items: result.page.items, nextCursor: result.page.nextCursor };
}

/**
 * Older runtime-items continuation for a managed-root thread. Root rows are
 * keyed by their raw id and use the ONE managed loopback client; returns
 * undefined when this thread has no live managed tail (never a local-DB
 * fallback — the ordinary root transcript read is the bounded HTTP route).
 */
export async function invokeManagedRootRuntimeItemsPage(payload: {
  readonly threadId: string;
  readonly limit: number;
  readonly beforePosition?: number | undefined;
  readonly targetTimelineEntryCount?: number | undefined;
}): Promise<{ readonly items: unknown; readonly nextCursor: number | null } | undefined> {
  if (payload.beforePosition === undefined) return undefined;
  const managed = managedRootHistoryClient();
  if (!managed) return undefined;
  const tail = readBoundedHistoryTail(payload.threadId);
  if (!tail || tail.connectionKind !== "managed-root") return undefined;
  const result = await managed.client.boundedThreadHistoryItems({
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
  });
  if (readManagedRootTailFor(payload.threadId, tail) === undefined) return undefined;
  if (result.negotiation !== "bounded") return undefined;
  recordThreadHistoryNoticeRead(payload.threadId, managed.authority, result.page.runtimeNotice);
  return { items: result.page.items, nextCursor: result.page.nextCursor };
}

/**
 * Fence for an in-flight managed-root page: the recorded tail must still be
 * the registry's current entry for this thread (a reset/replacement rejects
 * the stale page).
 */
function readManagedRootTailFor(
  threadId: string,
  captured: BoundedHistoryTail,
): BoundedHistoryTail | undefined {
  const current = readBoundedHistoryTail(threadId);
  return current === captured ? current : undefined;
}
