import { useEffect, useRef, useSyncExternalStore } from "react";
import { useShallow } from "zustand/shallow";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { isDraftPaneId } from "@/shared/paneId";
import { useAppStore, type AppStoreState } from "@/renderer/state/appStore";
import { remoteOwner, type RemoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerStatus, RemoteServersState } from "@/renderer/state/remoteServers/types";

function subscribeToRemoteServersHydration(listener: () => void): () => void {
  const unsubscribeHydrate = useRemoteServersStore.persist.onHydrate(listener);
  const unsubscribeFinishHydration = useRemoteServersStore.persist.onFinishHydration(listener);
  return () => {
    unsubscribeHydrate();
    unsubscribeFinishHydration();
  };
}

function getRemoteServersHydrationSnapshot(): boolean {
  return useRemoteServersStore.persist.hasHydrated();
}

/** Bounded quiet retry for a transient first history failure: the initial
 * attempt, then two backoff gaps. Exhausting them parks the pane until a
 * meaningful readiness change — the sidebar server status shows the failure
 * and an explicit thread click remains the recovery path. */
const RESTORED_REMOTE_ATTACH_ATTEMPTS = 3;
const RESTORED_REMOTE_RETRY_GAPS_MS = [750, 1_500];

const NO_OWNER_KEYS: readonly string[] = [];

function restoredRemoteOwnerKey(owner: RemoteOwner): string {
  return `${owner.desktopId} ${owner.remoteId}`;
}

/**
 * The app-store signal for restored remote panes: projected owner keys for
 * every pane in the current thread view. A reload restores the persisted view
 * immediately while the projected thread rows only arrive when the startup
 * snapshot mirror runs, so the hook re-evaluates on the rows' arrival (and
 * removal) instead of giving up when a pane's row is not there yet.
 */
function selectRestoredRemoteOwnerKeys(state: AppStoreState): readonly string[] {
  if (state.view.kind !== "thread") return NO_OWNER_KEYS;
  const keys = state.view.panes.flatMap((paneId) => {
    const owner = remoteOwner(state.threads.find((thread) => thread.id === paneId));
    return owner ? [restoredRemoteOwnerKey(owner)] : [];
  });
  return keys.length > 0 ? keys : NO_OWNER_KEYS;
}

/**
 * Stable readiness signal: one entry per paired server with its runtime
 * status. A primitive string, so the frequent runtime-object churn of snapshot
 * refreshes (projects/threads arrays rebuilt while staying online) never
 * restarts the effect or a retry budget — only the server set or a status
 * transition does.
 */
function selectRestoredRemoteReadinessKey(state: RemoteServersState): string {
  return state.servers
    .map((server) => `${server.desktopId}:${state.runtime[server.desktopId]?.status ?? "unknown"}`)
    .sort()
    .join(",");
}

/** Attach slot for one restored remote pane. `run` is the effect generation
 * that owns the slot; `attached` means an open was applied (or an explicit
 * open already owns the thread), `exhausted` means the bounded attempts ran
 * out while online and visible. */
interface RestoredAttachClaim {
  owner: RemoteOwner;
  state: "attaching" | "attached" | "exhausted";
  run: number;
}

interface PendingBackoff {
  timer: ReturnType<typeof setTimeout>;
  resolve: () => void;
}

/**
 * A reload restores the persisted thread view from cached history, but the
 * live remote subscription only exists behind an explicit open: after a
 * reload the restored pane renders with no `thread-item-interests`
 * registration, so the host strips that thread's runtime content events for
 * this client and a follow-up send completes server-side without the
 * transcript ever updating. This hook reattaches the same `openRemoteThread`
 * pipeline a thread click uses for every visible remote pane — desktop
 * split panes and, on the compact layout, only the focused pane — without
 * stealing the view.
 *
 * Attach is readiness-driven, never polled: the effect re-runs from store
 * subscriptions when the view, the mirrored thread rows (late hydration), or
 * a server's readiness (per-server status, not runtime identity) changes. A
 * pane claims a per-load attach slot only once its owner resolves and its
 * server is `online`; an owner that is not yet resolvable stays unclaimed, so
 * nothing is consumed prematurely and a later row arrival attaches normally.
 * The reattach passes `focus: false` so a navigation made while the history
 * fetch is in flight is never stolen, and `quiet: true` so bounded
 * transient-failure retries never toast-spam.
 *
 * Claims are reconciled every run against actual ownership: a pane leaving
 * the visible set releases its slot, a server dropping from `online` releases
 * its panes' slots, and a later `online` recovery (or a return to visibility)
 * claims them again — an exhausted slot is only retried after such a
 * meaningful transition, never on unrelated runtime churn. Each effect
 * generation owns its slots: an older generation's attach loop stops at its
 * next checkpoint without writing claims, and backoff timers are tracked and
 * cleared on unmount instead of outliving the hook. Local-only panes (drafts,
 * local threads) never attach.
 */
export function useRestoredRemoteThreadLifecycle(enabled: boolean): void {
  const compactLayout = useCompactLayout();
  const remoteHydrated = useSyncExternalStore(
    subscribeToRemoteServersHydration,
    getRemoteServersHydrationSnapshot,
  );
  const restoredOwnerKeys = useAppStore(useShallow(selectRestoredRemoteOwnerKeys));
  const focusedPaneId = useAppStore((state) => state.focusedPaneId);
  const readinessKey = useRemoteServersStore(selectRestoredRemoteReadinessKey);

  const claimsRef = useRef(new Map<string, RestoredAttachClaim>());
  /** Monotonic effect generation. Attach loops bind to the generation that
   * spawned them and stop at their next checkpoint — writing no claims — when
   * it is superseded or the hook has unmounted, so a rerun takes slots over
   * cleanly and nothing revives afterwards. Never reset: resetting to 0 would
   * reuse generation 1 and let a superseded loop's late resolution match the
   * new generation. */
  const runRef = useRef(0);
  const retryTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const pendingBackoffsRef = useRef(new Set<PendingBackoff>());
  const previousStatusesRef = useRef(new Map<string, RemoteServerStatus | "unknown">());
  const compactLayoutRef = useRef(false);

  useEffect(() => {
    compactLayoutRef.current = compactLayout;
    // Trigger-only subscriptions: the effect re-reads fresh store snapshots
    // via getState(), so these values are never read directly here — they
    // exist to re-run the effect when the view, focus, rows, layout, or a
    // server's readiness changes.
    void restoredOwnerKeys;
    void focusedPaneId;
    void readinessKey;
    const run = runRef.current + 1;
    runRef.current = run;
    /** Wake every pending backoff so superseded loops reach their next
     * checkpoint and exit instead of orphaning an `attaching` claim forever.
     * Clearing the timeout alone would leave the `await` pending. */
    const cancelPendingBackoffs = (): void => {
      for (const pending of pendingBackoffsRef.current) {
        clearTimeout(pending.timer);
        retryTimersRef.current.delete(pending.timer);
        pending.resolve();
      }
      pendingBackoffsRef.current.clear();
      for (const timer of retryTimersRef.current) clearTimeout(timer);
      retryTimersRef.current.clear();
    };
    const invalidateRun = (): void => {
      if (runRef.current === run) runRef.current += 1;
      cancelPendingBackoffs();
    };
    if (!enabled || !remoteHydrated) {
      return invalidateRun;
    }

    const desiredOwners = (): RemoteOwner[] => {
      const app = useAppStore.getState();
      if (app.view.kind !== "thread") return [];
      const { panes } = app.view;
      const visiblePaneIds = compactLayoutRef.current
        ? (() => {
            const focused =
              app.focusedPaneId && panes.includes(app.focusedPaneId) ? app.focusedPaneId : panes[0];
            return focused ? [focused] : [];
          })()
        : panes;
      const owners: RemoteOwner[] = [];
      for (const paneId of visiblePaneIds) {
        if (isDraftPaneId(paneId)) continue;
        const owner = remoteOwner(app.threads.find((thread) => thread.id === paneId));
        if (owner) owners.push(owner);
      }
      return owners;
    };

    const isDesired = (owner: RemoteOwner): boolean =>
      desiredOwners().some(
        (candidate) =>
          candidate.desktopId === owner.desktopId && candidate.remoteId === owner.remoteId,
      );

    const serverReady = (desktopId: string): boolean => {
      const remote = useRemoteServersStore.getState();
      return (
        remote.servers.some((server) => server.desktopId === desktopId) &&
        remote.runtime[desktopId]?.status === "online"
      );
    };

    /** Only the current generation may act: a superseded generation's late
     * resolution must never write claims or keep retrying. */
    const isCurrentRun = (ownerRun: number): boolean => runRef.current === ownerRun;

    const claimIsOwned = (key: string, ownerRun: number): boolean =>
      claimsRef.current.get(key)?.run === ownerRun;

    const releaseClaim = (key: string, ownerRun: number): void => {
      if (claimIsOwned(key, ownerRun)) claimsRef.current.delete(key);
    };

    const sleepBackoff = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        const pending: PendingBackoff = {
          timer: setTimeout(() => {
            pendingBackoffsRef.current.delete(pending);
            retryTimersRef.current.delete(pending.timer);
            resolve();
          }, ms),
          resolve: () => {
            pendingBackoffsRef.current.delete(pending);
            resolve();
          },
        };
        pendingBackoffsRef.current.add(pending);
        retryTimersRef.current.add(pending.timer);
      });

    const attach = async (owner: RemoteOwner, key: string, ownerRun: number): Promise<void> => {
      for (let attempt = 0; attempt < RESTORED_REMOTE_ATTACH_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          await sleepBackoff(RESTORED_REMOTE_RETRY_GAPS_MS[attempt - 1] ?? 750);
          if (!isCurrentRun(ownerRun)) return;
        }
        if (!isDesired(owner) || !serverReady(owner.desktopId)) {
          // No longer visible/offline: release the slot so a later return to
          // visibility or an `online` recovery can claim it again.
          releaseClaim(key, ownerRun);
          return;
        }
        const remote = useRemoteServersStore.getState();
        if (
          remote.openThread?.desktopId === owner.desktopId &&
          remote.openThread.threadId === owner.remoteId
        ) {
          // Already live — an explicit open won the race.
          if (claimIsOwned(key, ownerRun)) {
            claimsRef.current.set(key, { owner, state: "attached", run: ownerRun });
          }
          return;
        }
        const opened = await remote.openRemoteThread(owner.desktopId, owner.remoteId, {
          focus: false,
          quiet: true,
        });
        if (!isCurrentRun(ownerRun)) return;
        if (opened) {
          if (claimIsOwned(key, ownerRun)) {
            claimsRef.current.set(key, { owner, state: "attached", run: ownerRun });
          }
          return;
        }
      }
      if (claimIsOwned(key, ownerRun)) {
        claimsRef.current.set(key, { owner, state: "exhausted", run: ownerRun });
      }
    };

    // ── Reconcile claims with actual ownership ────────────────────────
    const remoteState = useRemoteServersStore.getState();
    const statuses = new Map(
      remoteState.servers.map(
        (server) => [server.desktopId, remoteState.runtime[server.desktopId]?.status] as const,
      ),
    );
    for (const [desktopId, status] of statuses) {
      const current = status ?? "unknown";
      const previous = previousStatusesRef.current.get(desktopId);
      previousStatusesRef.current.set(desktopId, current);
      const dropped = previous === "online" && current !== "online";
      const recovered = current === "online" && previous !== undefined && previous !== "online";
      if (!dropped && !recovered) continue;
      for (const [key, claim] of claimsRef.current) {
        if (claim.owner.desktopId !== desktopId) continue;
        if (dropped && claim.state !== "attaching") {
          // The live subscription can no longer be trusted: release it so the
          // next `online` run reattaches instead of silently staying dead.
          claimsRef.current.delete(key);
        } else if (recovered && claim.state === "exhausted") {
          // A meaningful offline→online transition is the only thing that
          // re-arms an exhausted slot.
          claimsRef.current.delete(key);
        }
      }
    }
    for (const desktopId of [...previousStatusesRef.current.keys()]) {
      if (!statuses.has(desktopId)) previousStatusesRef.current.delete(desktopId);
    }
    const desired = new Map(desiredOwners().map((owner) => [restoredRemoteOwnerKey(owner), owner]));
    for (const key of claimsRef.current.keys()) {
      // Ownership lifecycle: a pane that is no longer visible loses its slot.
      if (!desired.has(key)) claimsRef.current.delete(key);
    }

    // ── Claim + attach every visible remote pane ──────────────────────
    for (const [key, owner] of desired) {
      const claim = claimsRef.current.get(key);
      if (claim && (claim.state !== "attaching" || claim.run === run)) continue;
      // Absent, exhausted/attached handles skipped above, or `attaching` from
      // a superseded generation (its loop stops without writing claims, and
      // the store serializes its in-flight open via the request seq).
      claimsRef.current.set(key, { owner, state: "attaching", run });
      void attach(owner, key, run);
    }

    return invalidateRun;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effect is keyed to trigger signals; the body re-reads fresh snapshots via getState/refs.
  }, [enabled, remoteHydrated, restoredOwnerKeys, focusedPaneId, compactLayout, readinessKey]);
}
