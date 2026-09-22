import { remoteConnectionKey, type RemoteServersState } from "./types";

// ── Per-connection snapshot refresh: coalesced + debounced ──────────
// Route qualifying events through one per-connection-key debounced scheduler
// (mirrors the PWA's 600ms) so a burst yields a single GET, and tag each
// in-flight refresh with a monotonic request id so a stale response never
// overwrites a newer one.
const REMOTE_SERVER_REFRESH_DEBOUNCE_MS = 600;
const remoteServerRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const remoteServerRefreshSeqByDesktopId = new Map<string, number>();
/**
 * Set on `resync-required`: the client may have missed events, so the next
 * refresh re-mirrors the snapshot rows into the app store even when the HTTP
 * cache already matches them (live event rows can be ahead of the cache in
 * exactly the way a restart loses).
 */
const remoteServerRowResyncPendingByDesktopId = new Set<string>();
const remoteServerAgentStatusRefreshes = new Set<string>();
const remoteHostUpdateReconnectSeqByDesktopId = new Map<string, number>();
const remoteHostUpdateRequestSeqByDesktopId = new Map<string, number>();
let remoteHostUpdateSequence = 0;

export function nextRemoteHostUpdateSequence(): number {
  remoteHostUpdateSequence += 1;
  return remoteHostUpdateSequence;
}

export function nextRemoteServerRefreshRequestSeq(desktopId: string): number {
  const requestSeq = (remoteServerRefreshSeqByDesktopId.get(desktopId) ?? 0) + 1;
  remoteServerRefreshSeqByDesktopId.set(desktopId, requestSeq);
  return requestSeq;
}

export function isRemoteServerRefreshCurrent(desktopId: string, requestSeq: number): boolean {
  return remoteServerRefreshSeqByDesktopId.get(desktopId) === requestSeq;
}

export function markRemoteServerRowResyncPending(desktopId: string): void {
  remoteServerRowResyncPendingByDesktopId.add(desktopId);
}

export function takeRemoteServerRowResyncPending(desktopId: string): boolean {
  return remoteServerRowResyncPendingByDesktopId.delete(desktopId);
}

export function remoteHostUpdateReconnectSeq(desktopId: string): number | undefined {
  return remoteHostUpdateReconnectSeqByDesktopId.get(desktopId);
}

export function setRemoteHostUpdateReconnectSeq(desktopId: string, seq: number): void {
  remoteHostUpdateReconnectSeqByDesktopId.set(desktopId, seq);
}

export function remoteHostUpdateRequestSeq(desktopId: string): number | undefined {
  return remoteHostUpdateRequestSeqByDesktopId.get(desktopId);
}

export function setRemoteHostUpdateRequestSeq(desktopId: string, seq: number): void {
  remoteHostUpdateRequestSeqByDesktopId.set(desktopId, seq);
}

export function deleteRemoteHostUpdateRequestSeq(desktopId: string): void {
  remoteHostUpdateRequestSeqByDesktopId.delete(desktopId);
}

export function clearRemoteServerRefreshTimer(desktopId: string): void {
  const timer = remoteServerRefreshTimers.get(desktopId);
  if (timer) {
    clearTimeout(timer);
    remoteServerRefreshTimers.delete(desktopId);
  }
  remoteServerAgentStatusRefreshes.delete(desktopId);
}

export function invalidateRemoteServerRefresh(desktopId: string): void {
  clearRemoteServerRefreshTimer(desktopId);
  nextRemoteServerRefreshRequestSeq(desktopId);
}

export function scheduleServerRefresh(
  get: () => RemoteServersState,
  connectionKey: string,
  options: { readonly includeAgentStatuses?: boolean } = {},
): void {
  if (!get().servers.some((entry) => remoteConnectionKey(entry) === connectionKey)) return;
  const shouldIncludeAgentStatuses =
    options.includeAgentStatuses === true || remoteServerAgentStatusRefreshes.has(connectionKey);
  clearRemoteServerRefreshTimer(connectionKey);
  if (shouldIncludeAgentStatuses) remoteServerAgentStatusRefreshes.add(connectionKey);
  remoteServerRefreshTimers.set(
    connectionKey,
    setTimeout(() => {
      remoteServerRefreshTimers.delete(connectionKey);
      if (!get().servers.some((entry) => remoteConnectionKey(entry) === connectionKey)) return;
      const includeAgentStatuses = remoteServerAgentStatusRefreshes.delete(connectionKey);
      void get()
        .refreshServer(connectionKey, { includeAgentStatuses })
        .catch(() => undefined);
    }, REMOTE_SERVER_REFRESH_DEBOUNCE_MS),
  );
}

export function __resetConnectionRefreshForTest(): void {
  for (const desktopId of [...remoteServerRefreshTimers.keys()]) {
    clearRemoteServerRefreshTimer(desktopId);
  }
  remoteServerRefreshSeqByDesktopId.clear();
  remoteServerRowResyncPendingByDesktopId.clear();
  remoteServerAgentStatusRefreshes.clear();
  remoteHostUpdateReconnectSeqByDesktopId.clear();
  remoteHostUpdateRequestSeqByDesktopId.clear();
}
