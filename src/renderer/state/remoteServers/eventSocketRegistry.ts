import {
  RemoteSocketHealthMonitor,
  RemoteSocketReconnectPolicy,
} from "@/shared/remote/socketPolicy";
import type { OpenRemoteThread, RemoteSocketLike } from "./types";

/**
 * Process-local state for the desktop-as-client event sockets (one per paired
 * remote server): the socket entry itself, the server-wide resume watermark,
 * per-thread applied-seq watermarks, thread item interests, the cursor-sync v2
 * negotiation flag, and the identity generation counter that fences async
 * open-thread work against disconnect/reconnect races.
 *
 * Nothing here is persisted. The store (`remoteServersStore.ts`) owns the
 * connect orchestration and the cross-cluster close path (refresh timers,
 * truncate recovery, terminal feed); this module only owns the maps and their
 * invariants so every touchpoint goes through one owner.
 *
 * Interests write paths differ deliberately:
 *  - `setRemoteServerThreadItemInterests` SENDS the new list on the live
 *    socket when it changed (or when forced).
 *  - `rememberRemoteServerThreadItemInterests` writes the map without sending
 *    (refreshing stored identity for an already-delivered list).
 *  - `forgetRemoteServerThreadItemInterests` drops the entry without sending.
 */

export interface RemoteServerEventSocketEntry {
  readonly serverKey: string;
  socket: RemoteSocketLike | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  readonly reconnectPolicy: RemoteSocketReconnectPolicy;
  connecting: boolean;
  connectTimeout: ReturnType<typeof setTimeout> | null;
  healthPingInterval: ReturnType<typeof setInterval> | null;
  health: RemoteSocketHealthMonitor<RemoteSocketLike> | null;
}

const remoteServerEventSockets = new Map<string, RemoteServerEventSocketEntry>();
const remoteServerSnapshotSeqByDesktopId = new Map<string, number>();
/**
 * Highest event seq applied per thread from each server's live stream. The
 * resume watermark above is per server, so it cannot arbitrate one thread's
 * snapshot writes: an unrelated thread's newer event would wrongly freeze it.
 * Keyed [desktopId][remoteThreadId]; shares the watermark's lifecycle.
 */
const remoteThreadAppliedSeqByDesktopId = new Map<string, Map<string, number>>();
const remoteServerThreadItemInterests = new Map<string, readonly string[]>();
/** Desktops whose current connection negotiated cursor-sync v2: their thread
 * history fetches may omit the inlined terminal scrollback (WS3 #2) because
 * the chunked watch baseline carries the tail instead. */
const remoteServerCursorSyncV2ByDesktopId = new Set<string>();
const remoteServerIdentityGenerationByDesktopId = new Map<string, number>();

// ── Socket entry registry ────────────────────────────────────────────

export function getRemoteServerEventSocketEntry(
  desktopId: string,
): RemoteServerEventSocketEntry | undefined {
  return remoteServerEventSockets.get(desktopId);
}

export function setRemoteServerEventSocketEntry(
  desktopId: string,
  entry: RemoteServerEventSocketEntry,
): void {
  remoteServerEventSockets.set(desktopId, entry);
}

export function deleteRemoteServerEventSocketEntry(desktopId: string): void {
  remoteServerEventSockets.delete(desktopId);
}

export function listRemoteServerEventSocketDesktopIds(): string[] {
  return [...remoteServerEventSockets.keys()];
}

export function clearRemoteServerEventSocketHealth(entry: RemoteServerEventSocketEntry): void {
  if (entry.healthPingInterval) {
    clearInterval(entry.healthPingInterval);
    entry.healthPingInterval = null;
  }
  entry.health?.reset();
}

export function clearRemoteServerEventSocketConnectTimeout(
  entry: RemoteServerEventSocketEntry,
): void {
  if (!entry.connectTimeout) return;
  clearTimeout(entry.connectTimeout);
  entry.connectTimeout = null;
}

// ── Server-wide resume watermark ─────────────────────────────────────

export function remoteServerSnapshotSeq(desktopId: string): number {
  return remoteServerSnapshotSeqByDesktopId.get(desktopId) ?? 0;
}

/** Monotone: never lowers the watermark even when a stale response arrives. */
export function bumpRemoteServerSnapshotSeq(desktopId: string, seq: number): void {
  remoteServerSnapshotSeqByDesktopId.set(
    desktopId,
    Math.max(remoteServerSnapshotSeq(desktopId), seq),
  );
}

/** Direct overwrite — bootstrap installs where the snapshot IS authoritative. */
export function setRemoteServerSnapshotSeq(desktopId: string, seq: number): void {
  remoteServerSnapshotSeqByDesktopId.set(desktopId, seq);
}

export function deleteRemoteServerSnapshotSeq(desktopId: string): void {
  remoteServerSnapshotSeqByDesktopId.delete(desktopId);
}

// ── Per-thread applied-seq watermarks ────────────────────────────────

export function recordRemoteThreadAppliedSeq(
  desktopId: string,
  threadId: string,
  seq: number,
): void {
  let byThread = remoteThreadAppliedSeqByDesktopId.get(desktopId);
  if (!byThread) {
    byThread = new Map();
    remoteThreadAppliedSeqByDesktopId.set(desktopId, byThread);
  }
  if ((byThread.get(threadId) ?? 0) >= seq) return;
  byThread.set(threadId, seq);
}

export function remoteThreadAppliedSeq(desktopId: string, threadId: string): number | undefined {
  return remoteThreadAppliedSeqByDesktopId.get(desktopId)?.get(threadId);
}

export function clearRemoteThreadAppliedSeqs(desktopId: string): void {
  remoteThreadAppliedSeqByDesktopId.delete(desktopId);
}

// ── Thread item interests ────────────────────────────────────────────

/** Thread ids a supervisor event frame touches: the supervisory field, or the
 * per-thread batches of a multi frame. */
export function supervisorEventThreadIds(event: unknown): readonly string[] {
  if (!event || typeof event !== "object") return [];
  const record = event as { threadId?: unknown; batches?: unknown };
  if (typeof record.threadId === "string") return [record.threadId];
  if (!Array.isArray(record.batches)) return [];
  const threadIds: string[] = [];
  for (const batch of record.batches) {
    const batchThreadId = (batch as { threadId?: unknown } | null)?.threadId;
    if (typeof batchThreadId === "string") threadIds.push(batchThreadId);
  }
  return threadIds;
}

export function sameRemoteServerThreadItemInterests(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  return (
    left?.length === right.length && left.every((threadId, index) => threadId === right[index])
  );
}

/** Raw stored list (undefined = never set); callers own their fallback. */
export function getRemoteServerThreadItemInterests(
  desktopId: string,
): readonly string[] | undefined {
  return remoteServerThreadItemInterests.get(desktopId);
}

export function currentRemoteServerThreadItemInterests(desktopId: string): readonly string[] {
  return remoteServerThreadItemInterests.get(desktopId) ?? [];
}

export function rememberRemoteServerThreadItemInterests(
  desktopId: string,
  threadIds: readonly string[],
): void {
  remoteServerThreadItemInterests.set(desktopId, threadIds);
}

export function forgetRemoteServerThreadItemInterests(desktopId: string): void {
  remoteServerThreadItemInterests.delete(desktopId);
}

export function setRemoteServerThreadItemInterests(
  desktopId: string,
  threadIds: readonly string[],
  forceSend = false,
): void {
  const existing = remoteServerThreadItemInterests.get(desktopId);
  remoteServerThreadItemInterests.set(desktopId, threadIds);
  if (!forceSend && sameRemoteServerThreadItemInterests(existing, threadIds)) return;
  const socket = remoteServerEventSockets.get(desktopId)?.socket;
  if (!socket?.send) return;
  try {
    socket.send(JSON.stringify({ type: "thread-item-interests", threadIds }));
  } catch {
    // A connecting socket receives the latest interests from activateSocket.
  }
}

/**
 * Register one more thread whose runtime item content this client wants
 * forwarded. Interests are a per-server set, not a single exclusive thread:
 * several remote panes can be visible at once (desktop split panes), and a
 * pane's live feed must survive another pane's open the same way the last
 * explicit open already survives a pane close.
 */
export function addRemoteServerThreadItemInterest(desktopId: string, threadId: string): void {
  const existing = remoteServerThreadItemInterests.get(desktopId);
  if (existing?.includes(threadId)) return;
  setRemoteServerThreadItemInterests(desktopId, existing ? [...existing, threadId] : [threadId]);
}

export function removeRemoteServerThreadItemInterest(desktopId: string, threadId: string): void {
  const existing = remoteServerThreadItemInterests.get(desktopId);
  if (!existing?.includes(threadId)) return;
  setRemoteServerThreadItemInterests(
    desktopId,
    existing.filter((candidate) => candidate !== threadId),
  );
}

export function setHydratingRemoteServerThreadItemInterest(
  desktopId: string,
  threadId: string,
  previousOpenThread: OpenRemoteThread | null,
): void {
  if (previousOpenThread) {
    addRemoteServerThreadItemInterest(previousOpenThread.desktopId, previousOpenThread.threadId);
  }
  addRemoteServerThreadItemInterest(desktopId, threadId);
}

// ── Cursor-sync v2 negotiation flag ──────────────────────────────────

export function markRemoteServerCursorSyncV2(desktopId: string, enabled: boolean): void {
  if (enabled) {
    remoteServerCursorSyncV2ByDesktopId.add(desktopId);
  } else {
    remoteServerCursorSyncV2ByDesktopId.delete(desktopId);
  }
}

export function hasRemoteServerCursorSyncV2(desktopId: string): boolean {
  return remoteServerCursorSyncV2ByDesktopId.has(desktopId);
}

export function forgetRemoteServerCursorSyncV2(desktopId: string): void {
  remoteServerCursorSyncV2ByDesktopId.delete(desktopId);
}

// ── Identity generation fence ────────────────────────────────────────

export function currentRemoteServerGeneration(desktopId: string): number {
  return remoteServerIdentityGenerationByDesktopId.get(desktopId) ?? 0;
}

export function bumpRemoteServerGeneration(desktopId: string): void {
  remoteServerIdentityGenerationByDesktopId.set(
    desktopId,
    currentRemoteServerGeneration(desktopId) + 1,
  );
}

// ── Test reset ───────────────────────────────────────────────────────

/** Mirrors the store's test reset: clears exactly the maps that reset cleared
 * inline before the extraction. The socket map itself is torn down by the
 * store's closeAll path, which also deletes per-desktop watermarks. */
export function __resetEventSocketRegistryForTest(): void {
  remoteServerSnapshotSeqByDesktopId.clear();
  remoteThreadAppliedSeqByDesktopId.clear();
  remoteServerThreadItemInterests.clear();
  remoteServerIdentityGenerationByDesktopId.clear();
}
