import {
  RemoteSocketHealthMonitor,
  RemoteSocketReconnectPolicy,
} from "@/shared/remote/socketPolicy";
import type { RemoteSocketLike } from "./types";
import { HostSession, hostEventThreadIds } from "@/renderer/hostTransport/hostSession";

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
  disposeFrames?: () => void;
  dispose?: () => void;
  /** Re-baselines the current connection's interested threads, or only the given ones. */
  recoverInterestedThreads?: (onlyThreadIds?: ReadonlySet<string>) => Promise<boolean>;
}

const remoteServerEventSockets = new Map<string, RemoteServerEventSocketEntry>();
/** Resume epochs, HTTP reply fences, and per-thread live sequences share
 * the same session owner used by the managed catalog. */
const hostSessions = new Map<string, HostSession>();

function hostSession(desktopId: string): HostSession {
  let session = hostSessions.get(desktopId);
  if (!session) {
    session = new HostSession();
    hostSessions.set(desktopId, session);
  }
  return session;
}
const remoteServerThreadItemInterests = new Map<string, readonly string[]>();
/** Desktops whose current connection negotiated cursor-sync v2: their thread
 * history fetches may omit the inlined terminal scrollback (WS3 #2) because
 * the chunked watch baseline carries the tail instead. */
const remoteServerCursorSyncV2ByDesktopId = new Set<string>();

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
  return hostSession(desktopId).resumeSeq;
}

/** Epoch the watermark is bound to; undefined while unbound. */
export function remoteServerSnapshotEpoch(desktopId: string): string | undefined {
  return hostSession(desktopId).epoch;
}

/** Capture before an HTTP read whose `snapshotSeq` may bump the watermark. */
export function remoteServerResumeFence(desktopId: string): number {
  return hostSession(desktopId).resumeFence;
}

/**
 * Monotone: never lowers the watermark even when a stale response arrives. An
 * HTTP caller passes the {@link remoteServerResumeFence} it captured before the
 * read; a reply that crossed an epoch-binding change is dropped.
 */
export function bumpRemoteServerSnapshotSeq(
  desktopId: string,
  seq: number,
  fence?: number,
  epoch?: string,
): void {
  if (fence !== undefined && fence !== remoteServerResumeFence(desktopId)) return;
  if (
    epoch !== undefined &&
    remoteServerSnapshotSeq(desktopId) === 0 &&
    remoteServerSnapshotEpoch(desktopId) === undefined &&
    !remoteServerEventSockets.has(desktopId)
  ) {
    setRemoteServerSnapshotSeq(desktopId, seq, epoch);
    return;
  }
  hostSession(desktopId).advanceResume(seq, fence);
}

/**
 * Direct overwrite — bootstrap installs where the snapshot IS authoritative,
 * and resyncs. `epoch` is the epoch `seq` belongs to; omitted, the watermark
 * is unbound (a legacy HTTP snapshot cannot name the instance that served it).
 */
export function setRemoteServerSnapshotSeq(desktopId: string, seq: number, epoch?: string): void {
  hostSession(desktopId).bindResume(seq, epoch);
}

export function deleteRemoteServerSnapshotSeq(desktopId: string): void {
  hostSession(desktopId).clearResume();
}

// ── Per-thread applied-seq watermarks ────────────────────────────────

export function recordRemoteThreadAppliedSeq(
  desktopId: string,
  threadId: string,
  seq: number,
): void {
  hostSession(desktopId).recordApplied(seq, [threadId]);
}

export function remoteThreadAppliedSeq(desktopId: string, threadId: string): number | undefined {
  return hostSession(desktopId).threadSequence(threadId);
}

export function clearRemoteThreadAppliedSeqs(desktopId: string): void {
  hostSession(desktopId).clearApplied();
}

// ── Thread item interests ────────────────────────────────────────────

/** Thread ids a supervisor event frame touches: the supervisory field, or the
 * per-thread batches of a multi frame. */
export function supervisorEventThreadIds(event: unknown): readonly string[] {
  return hostEventThreadIds(event);
}

export function sameRemoteServerThreadItemInterests(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  return (
    left?.length === right.length && left.every((threadId, index) => threadId === right[index])
  );
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
  rememberRemoteServerThreadItemInterests(desktopId, threadIds);
  if (!forceSend && sameRemoteServerThreadItemInterests(existing, threadIds)) return;
  const socket = remoteServerEventSockets.get(desktopId)?.socket;
  if (!socket?.send) return;
  try {
    socket.send(JSON.stringify({ type: "thread-item-interests", threadIds }));
  } catch {
    // A connecting socket receives the latest interests from activateSocket.
  }
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

/** The live sequence session of one paired connection. */
export function remoteServerHostSession(desktopId: string): HostSession {
  return hostSession(desktopId);
}

export function currentRemoteServerGeneration(desktopId: string): number {
  return hostSession(desktopId).generation;
}

export function bumpRemoteServerGeneration(desktopId: string): void {
  hostSession(desktopId).generation += 1;
}

/** The history-resume authority of one paired connection incarnation. */
export function remoteHistoryResumeAuthority(desktopId: string): string {
  return `remote:${desktopId}:${currentRemoteServerGeneration(desktopId)}`;
}

// ── Test reset ───────────────────────────────────────────────────────

/** Mirrors the store's test reset: clears exactly the maps that reset cleared
 * inline before the extraction. The socket map itself is torn down by the
 * store's closeAll path, which also deletes per-desktop watermarks. */
export function __resetEventSocketRegistryForTest(): void {
  hostSessions.clear();
  remoteServerThreadItemInterests.clear();
}
