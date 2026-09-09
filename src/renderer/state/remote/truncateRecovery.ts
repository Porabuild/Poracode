import { useAppStore } from "@/renderer/state/appStore";

/**
 * Transport-side destructive-replay guard for `runtime.truncated`.
 *
 * The reducer applies truncations in event order, but a replayed
 * `runtime.truncated` that an already-installed authoritative history already
 * incorporated must never roll back newer live state. Suppression uses the
 * installed per-thread authoritative history seq — the `snapshotSeq` of the
 * last `threadHistory` that actually replaced the transcript — never the
 * per-server resume watermark (an unrelated thread's newer event would
 * wrongly freeze this thread) and never a shell snapshot (projects/threads
 * list proves nothing about the transcript being installed).
 *
 * Unknown checkpoints (paged-out or never-loaded) cannot identify the deleted
 * tail locally, so the transport fetches an authoritative baseline instead of
 * speculatively deleting. Reloads are owned per thread (epoch + token lease),
 * deduped, bounded per epoch, and track the latest needed event seq so a newer
 * truncation arriving mid-fetch triggers a bounded follow-up instead of being
 * lost. Only an installed snapshot covering that seq clears the budget.
 */

export const MAX_TRUNCATE_RELOAD_ATTEMPTS = 3;

export interface TruncateReloadLease {
  readonly desktopId: string;
  readonly remoteThreadId: string;
  readonly epoch: number;
  readonly token: number;
}

const authoritativeSeqByDesktopId = new Map<string, Map<string, number>>();
const truncateReloadEpochByDesktopId = new Map<string, number>();
const truncateReloadOwnerByKey = new Map<string, TruncateReloadLease>();
const truncateReloadAttemptsByKey = new Map<string, number>();
const truncateReloadPendingSeqByKey = new Map<string, number>();
let truncateReloadTokenSeq = 0;

function truncateReloadKey(desktopId: string, remoteThreadId: string): string {
  return `${desktopId}\0${remoteThreadId}`;
}

function currentTruncateEpoch(desktopId: string): number {
  return truncateReloadEpochByDesktopId.get(desktopId) ?? 0;
}

/** Record the authoritative install; only call when `applyThreadSnapshot`
 * reported `installedAuthoritativeHistory: true`. Stale snapshots and
 * additive missing-older-history splices must never create a baseline.
 * Survives offline/online (only a server restart/close/remove clears it). */
export function recordAuthoritativeHistoryInstall(
  desktopId: string,
  remoteThreadId: string,
  snapshotSeq: number,
): void {
  let byThread = authoritativeSeqByDesktopId.get(desktopId);
  if (!byThread) {
    byThread = new Map();
    authoritativeSeqByDesktopId.set(desktopId, byThread);
  }
  if ((byThread.get(remoteThreadId) ?? 0) >= snapshotSeq) return;
  byThread.set(remoteThreadId, snapshotSeq);
}

export function getAuthoritativeHistorySeq(
  desktopId: string,
  remoteThreadId: string,
): number | undefined {
  return authoritativeSeqByDesktopId.get(desktopId)?.get(remoteThreadId);
}

/** True when an authoritative history already incorporated this truncation:
 * the installed snapshot was built at or past the truncation's server seq in
 * the same epoch, so replaying the event would only roll back newer state. */
export function shouldSuppressTruncatedReplay(
  desktopId: string,
  remoteThreadId: string,
  eventSeq: number,
): boolean {
  const installed = getAuthoritativeHistorySeq(desktopId, remoteThreadId);
  return installed !== undefined && eventSeq <= installed;
}

/** True when the projected transcript already contains the checkpoint. */
export function isTruncateCheckpointLoaded(
  projectedThreadId: string,
  checkpointItemId: string,
): boolean {
  const ids = useAppStore.getState().runtimeItemIdsByThread[projectedThreadId];
  return ids?.includes(checkpointItemId) ?? false;
}

/** Latest truncation seq still needing authoritative coverage per thread.
 * A second `runtime.truncated` arriving while a reload is in flight must not be
 * discarded: the in-flight snapshot may predate it and be refused as stale. */
export function noteTruncateNeeded(
  desktopId: string,
  remoteThreadId: string,
  eventSeq: number,
): void {
  const key = truncateReloadKey(desktopId, remoteThreadId);
  if ((truncateReloadPendingSeqByKey.get(key) ?? Number.NEGATIVE_INFINITY) >= eventSeq) return;
  truncateReloadPendingSeqByKey.set(key, eventSeq);
}

export function getTruncateNeededSeq(
  desktopId: string,
  remoteThreadId: string,
): number | undefined {
  return truncateReloadPendingSeqByKey.get(truncateReloadKey(desktopId, remoteThreadId));
}

/** Pending authoritative recoveries for one server. Lets a healthy reconnect
 * restart outstanding reloads without waiting for another truncation event:
 * the caller filters to still-subscribed threads and re-enters the owned,
 * bounded reload gate per thread. */
export function listPendingTruncateReloads(
  desktopId: string,
): readonly { readonly remoteThreadId: string; readonly neededSeq: number }[] {
  const prefix = `${desktopId}\0`;
  const pending: { remoteThreadId: string; neededSeq: number }[] = [];
  for (const [key, neededSeq] of truncateReloadPendingSeqByKey) {
    if (!key.startsWith(prefix)) continue;
    pending.push({ remoteThreadId: key.slice(prefix.length), neededSeq });
  }
  return pending;
}

/** Deduped + bounded gate returning an owned lease, or null when the caller
 * must not fetch: a reload is already in flight for this thread, or the bounded
 * budget for this epoch is exhausted. The lease captures the epoch + a unique
 * token so completion can prove it still owns the slot. */
export function tryBeginTruncateReload(
  desktopId: string,
  remoteThreadId: string,
): TruncateReloadLease | null {
  const key = truncateReloadKey(desktopId, remoteThreadId);
  if (truncateReloadOwnerByKey.has(key)) return null;
  if ((truncateReloadAttemptsByKey.get(key) ?? 0) >= MAX_TRUNCATE_RELOAD_ATTEMPTS) return null;
  truncateReloadTokenSeq += 1;
  const lease: TruncateReloadLease = {
    desktopId,
    remoteThreadId,
    epoch: currentTruncateEpoch(desktopId),
    token: truncateReloadTokenSeq,
  };
  truncateReloadOwnerByKey.set(key, lease);
  return lease;
}

export function isTruncateReloadLeaseCurrent(lease: TruncateReloadLease): boolean {
  if (lease.epoch !== currentTruncateEpoch(lease.desktopId)) return false;
  const key = truncateReloadKey(lease.desktopId, lease.remoteThreadId);
  return truncateReloadOwnerByKey.get(key)?.token === lease.token;
}

/** Owned completion. A stale lease (epoch bumped by offline/reactivation/
 * restart/remove, or a replacement lease started after it) is ignored so an old
 * request never clears or mutates its replacement's slot. Otherwise the slot is
 * released and the budget settled: only an installed snapshot whose seq covers
 * the latest needed truncation counts as success and clears the failure count
 * plus the pending seq. Stale/additive installs, outdated snapshots, and fetch
 * failures increment the bounded failure count and keep the pending seq for a
 * deduped follow-up. */
export function finishTruncateReload(
  lease: TruncateReloadLease,
  result: { readonly installed: boolean; readonly snapshotSeq: number } | null,
): { readonly stale: boolean; readonly covered: boolean } {
  const key = truncateReloadKey(lease.desktopId, lease.remoteThreadId);
  if (lease.epoch !== currentTruncateEpoch(lease.desktopId)) return { stale: true, covered: false };
  if (truncateReloadOwnerByKey.get(key)?.token !== lease.token) {
    return { stale: true, covered: false };
  }
  truncateReloadOwnerByKey.delete(key);
  const pending = truncateReloadPendingSeqByKey.get(key);
  const covers =
    result !== null && result.installed && (pending === undefined || result.snapshotSeq >= pending);
  if (covers) {
    truncateReloadAttemptsByKey.delete(key);
    truncateReloadPendingSeqByKey.delete(key);
    return { stale: false, covered: true };
  }
  truncateReloadAttemptsByKey.set(key, (truncateReloadAttemptsByKey.get(key) ?? 0) + 1);
  return { stale: false, covered: false };
}

export function isTruncateReloadInFlight(desktopId: string, remoteThreadId: string): boolean {
  return truncateReloadOwnerByKey.has(truncateReloadKey(desktopId, remoteThreadId));
}

/** Full reset: server restart (resync-required), socket close, server removal.
 * Clears suppression baselines (old seqs are meaningless after a restart),
 * drops owned slots, bumps the epoch, re-arms bounded attempts, and drops
 * pending truncations from the old epoch. */
export function resetTruncateRecoveryEpoch(desktopId: string): void {
  truncateReloadEpochByDesktopId.set(desktopId, currentTruncateEpoch(desktopId) + 1);
  authoritativeSeqByDesktopId.delete(desktopId);
  for (const key of [...truncateReloadOwnerByKey.keys()]) {
    if (key.startsWith(`${desktopId}\0`)) truncateReloadOwnerByKey.delete(key);
  }
  for (const key of [...truncateReloadAttemptsByKey.keys()]) {
    if (key.startsWith(`${desktopId}\0`)) truncateReloadAttemptsByKey.delete(key);
  }
  for (const key of [...truncateReloadPendingSeqByKey.keys()]) {
    if (key.startsWith(`${desktopId}\0`)) truncateReloadPendingSeqByKey.delete(key);
  }
}

/** Backoff-only reset: offline drop / online recovery. Re-arms bounded
 * unknown-checkpoint reloads without clearing suppression baselines or pending
 * truncations — an installed history is still valid across a transport flap,
 * and an outstanding truncation still needs coverage. */
export function resetTruncateReloadBackoff(desktopId: string): void {
  truncateReloadEpochByDesktopId.set(desktopId, currentTruncateEpoch(desktopId) + 1);
  for (const key of [...truncateReloadOwnerByKey.keys()]) {
    if (key.startsWith(`${desktopId}\0`)) truncateReloadOwnerByKey.delete(key);
  }
  for (const key of [...truncateReloadAttemptsByKey.keys()]) {
    if (key.startsWith(`${desktopId}\0`)) truncateReloadAttemptsByKey.delete(key);
  }
}

/** Test-only: clear all process-local recovery state. */
export function __resetTruncateRecoveryForTest(): void {
  authoritativeSeqByDesktopId.clear();
  truncateReloadEpochByDesktopId.clear();
  truncateReloadOwnerByKey.clear();
  truncateReloadAttemptsByKey.clear();
  truncateReloadPendingSeqByKey.clear();
  truncateReloadTokenSeq = 0;
}
