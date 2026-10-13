import type { StartRemoteNewThreadInput } from "@/shared/remote/client";
import type { ProjectLocation } from "@/shared/contracts";

/** Saved metadata launches through the existing-thread endpoint at this captured location. */
export type ManagedRootLaunchReplay = StartRemoteNewThreadInput & {
  readonly projectLocation?: ProjectLocation;
};

/**
 * Managed-root catalog readiness (B4 S3/D2).
 *
 * The root desktop's catalog is a bounded projection of the co-located
 * server's DB. Persisted hydration is preferences-only and releases at once;
 * this store is the ONLY readiness surface for the catalog, so the shell paints
 * immediately and shows a truthful starting/failed state with retry instead of
 * gating on the loopback leg. It is process-local and never persisted.
 */
export type ManagedRootCatalogStatus =
  | { readonly status: "starting"; readonly message?: undefined }
  | { readonly status: "ready"; readonly message?: undefined }
  | { readonly status: "failed"; readonly message: string; readonly retrying: boolean };

let status: ManagedRootCatalogStatus = { status: "starting" };
const listeners = new Set<() => void>();

export function getManagedRootCatalogStatus(): ManagedRootCatalogStatus {
  return status;
}

export function subscribeManagedRootCatalogStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setManagedRootCatalogStatus(next: ManagedRootCatalogStatus): void {
  if (
    status.status === next.status &&
    status.message === next.message &&
    (status.status !== "failed" || next.status !== "failed" || status.retrying === next.retrying)
  ) {
    return;
  }
  status = next;
  for (const listener of [...listeners]) listener();
}

/**
 * Root rows with an in-flight intent (a delete/rename the host has not
 * confirmed, an optimistic creation still awaiting its host row) are pinned:
 * the confirmation-gated deletion pass must never remove a row whose durable
 * state is unknown. Every pin is released by the caller's finally block.
 */
const pinnedThreadIds = new Map<string, number>();

export function pinManagedRootThread(threadId: string): () => void {
  pinnedThreadIds.set(threadId, (pinnedThreadIds.get(threadId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (pinnedThreadIds.get(threadId) ?? 1) - 1;
    if (count <= 0) pinnedThreadIds.delete(threadId);
    else pinnedThreadIds.set(threadId, count);
  };
}

export function pinnedManagedRootThreadIds(): ReadonlySet<string> {
  return new Set(pinnedThreadIds.keys());
}

/**
 * An optimistic root row awaiting its first runtime launch. Draft creation
 * can persist its metadata first; other creators use the host's create+launch
 * command. The marker remains until launch acknowledgement or confirmed
 * deletion, preserving launch identity and cancellation through awaits.
 *
 * Each launch episode carries its own command id. An explicit retry starts a
 * genuinely new operation (fresh id and body) only while no uncertain episode
 * exists: a first-ever attempt whose failure is classified definite, or a
 * retained operation the host authoritatively resolved as failed for the same
 * command id (a recorded receipt answered `command_failed`). An UNCERTAIN
 * outcome may have committed — absence of the durable row never proves
 * otherwise, because the host can fail after the provider already received the
 * prompt — so the SAME command id and the exact original body are retained for
 * an explicit retry. A locally raised refusal (for example the loopback leg
 * being down) or a generic 404/403 says nothing about the earlier external
 * effect and therefore never replaces the retained operation; the host receipt
 * replays or refuses that operation instead of running a second launch.
 */
export interface PendingManagedRootLaunch {
  readonly isNewWorktree: boolean;
  readonly commandId: string;
  /** The host already owns the metadata row; only the runtime launch remains pending. */
  readonly metadataCreated?: true;
  /** Creation may have committed; deletion must still go through the host authority. */
  readonly metadataCreationUncertain?: true;
  /** A provisioning cancellation waits for confirmed host deletion before removing its worktree. */
  readonly removal?: Promise<boolean>;
  /**
   * The exact original `start` body retained across an uncertain retry. A
   * fresh attempt leaves it unset and derives a new body from the thread.
   */
  readonly replay?: ManagedRootLaunchReplay;
}

const pendingRootLaunches = new Map<string, PendingManagedRootLaunch>();

export function notePendingManagedRootLaunch(
  threadId: string,
  isNewWorktree: boolean,
  commandId: string = crypto.randomUUID(),
): void {
  pendingRootLaunches.set(threadId, { isNewWorktree, commandId });
}

/**
 * Keep one in-flight launch operation addressable after an uncertain outcome:
 * the same id and the exact body the first attempt sent, so a retry can never
 * be mistaken for a new external effect.
 */
export function retainPendingManagedRootLaunch(
  threadId: string,
  launch: PendingManagedRootLaunch,
): void {
  pendingRootLaunches.set(threadId, launch);
}

export function markPendingManagedRootThreadCreated(threadId: string): void {
  const pending = pendingRootLaunches.get(threadId);
  if (pending) {
    const { metadataCreationUncertain: _uncertain, ...rest } = pending;
    pendingRootLaunches.set(threadId, { ...rest, metadataCreated: true });
  }
}

export function markPendingManagedRootThreadCreationUncertain(threadId: string): void {
  const pending = pendingRootLaunches.get(threadId);
  if (pending) pendingRootLaunches.set(threadId, { ...pending, metadataCreationUncertain: true });
}

export function trackPendingManagedRootThreadRemoval(
  threadId: string,
  removal: Promise<boolean>,
): void {
  const pending = pendingRootLaunches.get(threadId);
  if (pending) pendingRootLaunches.set(threadId, { ...pending, removal });
  void removal.then(() => {
    const current = pendingRootLaunches.get(threadId);
    if (current?.removal !== removal) return;
    const { removal: _removed, ...rest } = current;
    pendingRootLaunches.set(threadId, rest);
  });
}

/**
 * Thread ids whose UNCERTAIN launch episode is still retained (an entry whose
 * exact replay body exists). The confirmation-gated deletion pass unions
 * these into its protected set: an absent durable row is evidence only, so
 * catalog membership must never retire an operation whose effect on the
 * provider is unknown. Fresh markers (`replay` unset — a first attempt not
 * yet sent, or a definite/authoritative-failure re-arm) stay unprotected, so
 * abandoned definitely-failed rows remain garbage-collectable.
 */
export function retainedUncertainManagedRootThreadIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const [threadId, launch] of pendingRootLaunches) {
    if (launch.replay !== undefined) ids.add(threadId);
  }
  return ids;
}

export function peekPendingManagedRootLaunch(
  threadId: string,
): PendingManagedRootLaunch | undefined {
  return pendingRootLaunches.get(threadId);
}

export function consumePendingManagedRootLaunch(
  threadId: string,
): PendingManagedRootLaunch | undefined {
  const pending = pendingRootLaunches.get(threadId);
  if (pending) pendingRootLaunches.delete(threadId);
  return pending;
}

export function dropPendingManagedRootLaunch(threadId: string): void {
  pendingRootLaunches.delete(threadId);
}

/** Test-only: drop the readiness value, pins, and every listener. */
export function __resetManagedRootCatalogStoreForTest(): void {
  status = { status: "starting" };
  listeners.clear();
  pinnedThreadIds.clear();
  pendingRootLaunches.clear();
}
