import type { StartRemoteNewThreadInput } from "@/shared/remote/client";
import type { ProjectLocation } from "@/shared/contracts";

/**
 * In-flight thread launch intents, whichever host owns the thread.
 *
 * A new thread is created on its host, then launched. Until the host has
 * acknowledged the launch, the client keeps the operation addressable (its
 * command id and exact body), keeps the optimistic row resident against
 * catalog passes, and lets a cancellation wait for confirmed host deletion.
 * Keyed by the thread's store id.
 */

/** Saved metadata launches through the existing-thread endpoint at this captured location. */
export type ThreadLaunchReplay = StartRemoteNewThreadInput & {
  readonly projectLocation?: ProjectLocation;
};

/**
 * Rows with an in-flight intent (a delete/rename the host has not confirmed,
 * an optimistic creation still awaiting its host row) are pinned: a host's
 * catalog pass must never remove a row whose durable state is unknown. Every
 * pin is released by the caller's finally block.
 */
const pinnedThreadIds = new Map<string, number>();

export function pinThreadRow(threadId: string): () => void {
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

export function pinnedThreadRowIds(): ReadonlySet<string> {
  return new Set(pinnedThreadIds.keys());
}

/**
 * An optimistic row awaiting its first runtime launch. Draft creation
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
export interface PendingThreadLaunch {
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
  readonly replay?: ThreadLaunchReplay;
}

const pendingLaunches = new Map<string, PendingThreadLaunch>();

export function notePendingThreadLaunch(
  threadId: string,
  isNewWorktree: boolean,
  commandId: string = crypto.randomUUID(),
): void {
  pendingLaunches.set(threadId, { isNewWorktree, commandId });
}

/**
 * Keep one in-flight launch operation addressable after an uncertain outcome:
 * the same id and the exact body the first attempt sent, so a retry can never
 * be mistaken for a new external effect.
 */
export function retainPendingThreadLaunch(threadId: string, launch: PendingThreadLaunch): void {
  pendingLaunches.set(threadId, launch);
}

export function markPendingThreadCreated(threadId: string): void {
  const pending = pendingLaunches.get(threadId);
  if (pending) {
    const { metadataCreationUncertain: _uncertain, ...rest } = pending;
    pendingLaunches.set(threadId, { ...rest, metadataCreated: true });
  }
}

export function markPendingThreadCreationUncertain(threadId: string): void {
  const pending = pendingLaunches.get(threadId);
  if (pending) pendingLaunches.set(threadId, { ...pending, metadataCreationUncertain: true });
}

export function trackPendingThreadRemoval(threadId: string, removal: Promise<boolean>): void {
  const pending = pendingLaunches.get(threadId);
  if (pending) pendingLaunches.set(threadId, { ...pending, removal });
  void removal.then(() => {
    const current = pendingLaunches.get(threadId);
    if (current?.removal !== removal) return;
    const { removal: _removed, ...rest } = current;
    pendingLaunches.set(threadId, rest);
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
export function retainedUncertainLaunchThreadIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const [threadId, launch] of pendingLaunches) {
    if (launch.replay !== undefined) ids.add(threadId);
  }
  return ids;
}

export function peekPendingThreadLaunch(threadId: string): PendingThreadLaunch | undefined {
  return pendingLaunches.get(threadId);
}

export function consumePendingThreadLaunch(threadId: string): PendingThreadLaunch | undefined {
  const pending = pendingLaunches.get(threadId);
  if (pending) pendingLaunches.delete(threadId);
  return pending;
}

export function dropPendingThreadLaunch(threadId: string): void {
  pendingLaunches.delete(threadId);
}

/** Test-only: drop every pin and pending launch. */
export function __resetThreadLaunchIntentsForTest(): void {
  pinnedThreadIds.clear();
  pendingLaunches.clear();
}
