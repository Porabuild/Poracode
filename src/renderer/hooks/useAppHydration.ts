import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isThreadTurnActive } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import {
  hasAnyClientBridge,
  hasClientCapability,
  isCompactClientRuntimeSurface,
} from "@/renderer/clientRuntime";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getRunningExperimentCandidateIds,
  useExperimentStore,
} from "@/renderer/state/experimentStore";
import { hydrateManagedExperimentState } from "@/renderer/state/managedRootCatalog/rootExperimentAuthority";
import { recoverExperimentCandidateWorktrees } from "@/renderer/state/experimentHydration";
import { hydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { bootstrapWorkspaces } from "@/renderer/state/workspaceStore";
import { startPrMergeAutoDone } from "@/renderer/state/prMergeAutoDone";
import { startPrWatchStatusSync } from "@/renderer/state/prWatchStatusSync";
import { startDeferredFeaturePrewarm } from "@/renderer/deferredFeatures";
import { setThreadRuntimeReopenEnabled } from "@/renderer/actions/threadActions";
import { isManagedRootDesktopRuntime } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";

interface IdleCallbackHandle {
  cancel: () => void;
}

function scheduleIdle(work: () => void): IdleCallbackHandle {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(() => work(), { timeout: 5000 });
    return { cancel: () => window.cancelIdleCallback?.(id) };
  }
  const timeoutId = setTimeout(work, 2000);
  return { cancel: () => clearTimeout(timeoutId) };
}

function subscribeToAppStoreHydration(listener: () => void): () => void {
  const unsubscribeHydrate = useAppStore.persist.onHydrate(listener);
  const unsubscribeFinishHydration = useAppStore.persist.onFinishHydration(listener);
  return () => {
    unsubscribeHydrate();
    unsubscribeFinishHydration();
  };
}

function getAppStoreHydrationSnapshot(): boolean {
  return useAppStore.persist.hasHydrated();
}

export function useAppHydration(options: { runtimeOwner?: boolean } = {}) {
  const runtimeOwner =
    options.runtimeOwner ?? (!hasAnyClientBridge() ? true : hasClientCapability("localBackend"));
  const markThreadsInactiveOnLaunch = useAppStore((state) => state.markThreadsInactiveOnLaunch);
  const purgeStaleArchivedThreads = useAppStore((state) => state.purgeStaleArchivedThreads);
  const archiveOldDoneThreads = useAppStore((state) => state.archiveOldDoneThreads);
  const reconcileRuntimeSnapshots = useAppStore((state) => state.reconcileRuntimeSnapshots);
  const updateThreadRuntime = useAppStore((state) => state.updateThreadRuntime);
  const view = useAppStore((state) => state.view);

  const [initialLoading, setInitialLoading] = useState(true);
  const appStoreHydrated = useSyncExternalStore(
    subscribeToAppStoreHydration,
    getAppStoreHydrationSnapshot,
  );
  // The experiment store is a memory-only projection of the host authority, so
  // it has no persisted hydration of its own; it hydrates from
  // `GET /api/experiments` below.
  const storeHydrated = appStoreHydrated;
  const [loadT0] = useState(() => Date.now());
  const [runtimeSnapshotsReady, setRuntimeSnapshotsReady] = useState(false);
  const skipSnapshotRefreshForView = useRef<ReturnType<typeof useAppStore.getState>["view"] | null>(
    null,
  );
  // Resetting the snapshot gate when hydration (re)completes derives from
  // `storeHydrated`, so adjust during render. The module-level reopen flag
  // and the view ref below stay in the effect to preserve startup ordering.
  const [prevHydratedForSnapshots, setPrevHydratedForSnapshots] = useState(storeHydrated);
  if (prevHydratedForSnapshots !== storeHydrated) {
    setPrevHydratedForSnapshots(storeHydrated);
    if (storeHydrated) setRuntimeSnapshotsReady(false);
  }

  useEffect(() => {
    if (!storeHydrated) {
      console.log(`[renderer] +${Date.now() - loadT0}ms: waiting for store hydration`);
      return;
    }

    let isActive = true;
    setThreadRuntimeReopenEnabled(false);
    skipSnapshotRefreshForView.current = null;
    const appState = useAppStore.getState();
    const restoredView = appState.view;
    const experimentAuthorityHydration = isManagedRootDesktopRuntime()
      ? hydrateManagedExperimentState()
      : Promise.resolve(false);
    console.log(
      `[renderer] +${Date.now() - loadT0}ms: store hydrated, view=${JSON.stringify(restoredView)}, ${useAppStore.getState().projects.length} projects, ${useAppStore.getState().threads.length} threads`,
    );

    // Seed default workspaces and file pre-existing projects. Runtime-owner
    // only: a remote client must not decide how the desktop's projects are
    // grouped. Projects are hydrated by now, so nothing is missed.
    if (runtimeOwner) {
      void bootstrapWorkspaces().catch((error: unknown) => {
        captureRendererException(error, { featureArea: "hydration" });
      });
    }

    void (async () => {
      if (!isActive) return;
      // Reset restored runtime state before yielding to host hydration. A
      // forwarded start can arrive during that await; it is a fresh live row,
      // not restored state that may be marked inactive and relaunched.
      if (runtimeOwner) {
        startTransition(() => {
          // Ephemeral session maps reset on every launch; the status rewrite in
          // this action is scoped to renderer-owned rows, so host-owned catalog
          // rows — including terminal root rows with no source marker — keep the
          // server's status.
          markThreadsInactiveOnLaunch({
            preserveHostOwnedRootRows: isManagedRootDesktopRuntime(),
          });
          // The purge sweep is renderer-owned policy that used to persist
          // through the catalog mirror. The root desktop has no mirror anymore,
          // so it must not derive destructive work from a partial projection:
          // host-owned housekeeping is the remaining authority move (see the B4
          // report's host dependency) and the sweep stays off until it lands.
          if (!isManagedRootDesktopRuntime()) purgeStaleArchivedThreads(30);
        });
      }
      // The experiment board's records come from the host authority; wait for
      // this activation's projection before deciding whether a restored
      // experiment view still exists. A loopback that is down resolves
      // truthfully after its own bounded read instead of pinning the shell.
      await experimentAuthorityHydration;
      if (!isActive) return;
      if (
        restoredView.kind === "experiment" &&
        !useExperimentStore.getState().experiments[restoredView.experimentId]
      ) {
        useAppStore.getState().openHome();
      }
      if (!runtimeOwner) {
        setInitialLoading(false);
        setThreadRuntimeReopenEnabled(true);
        setRuntimeSnapshotsReady(true);
        void recoverExperimentCandidateWorktrees()?.catch((error: unknown) => {
          captureRendererException(error, { featureArea: "hydration" });
        });
        return;
      }

      // A user can create a thread while this request is in flight. Scope the
      // response to the threads that existed when it began so an older empty
      // snapshot cannot mark a fresh direct launch inactive and relaunch it.
      const requestedThreadIds = new Set(useAppStore.getState().threads.map((thread) => thread.id));
      const snapshotsPromise = readBridge().getThreadSnapshots();

      // Backend IPC can hang if the host is dead; do not pin the splash on it.
      const visibleGuiThreadIds = collectVisibleGuiThreadIds();
      void Promise.all([
        recoverExperimentCandidateWorktrees() ?? Promise.resolve(),
        ...visibleGuiThreadIds.map((threadId) => hydrateThreadRuntimeItems(threadId)),
      ]).catch((error: unknown) => {
        captureRendererException(error, { featureArea: "hydration" });
      });

      if (!isActive) return;
      startTransition(() => {
        console.log(
          `[renderer] +${Date.now() - loadT0}ms: initialLoading = false; reconciling runtime snapshots in background`,
        );
        setInitialLoading(false);
      });

      // Skill lists depend on the loaded plugin list, so it has to be there
      // before the first thread renders.
      void usePlugins.getState().load();

      try {
        const snapshots = await snapshotsPromise;
        if (!isActive) return;

        const currentView = useAppStore.getState().view;
        const selectedIds = collectRetainedThreadIds(currentView);
        const storeThreadIds = new Set(useAppStore.getState().threads.map((thread) => thread.id));

        for (const snapshot of snapshots) {
          if (!selectedIds.has(snapshot.threadId) && storeThreadIds.has(snapshot.threadId)) {
            void readBridge()
              .closeThread({ threadId: snapshot.threadId })
              .catch((error: unknown) => {
                captureRendererException(error, { featureArea: "hydration" });
              });
          }
        }

        startTransition(() => {
          reconcileRuntimeSnapshots(
            selectedIds.size > 0
              ? snapshots.filter((snapshot) => selectedIds.has(snapshot.threadId))
              : [],
            requestedThreadIds,
            { preserveHostOwnedRootRows: isManagedRootDesktopRuntime() },
          );
        });
      } catch (error) {
        captureRendererException(error, { featureArea: "hydration" });
        if (!isActive) return;
        startTransition(() => {
          const candidateIds = getRunningExperimentCandidateIds();
          for (const threadId of candidateIds) {
            const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
            if (thread?.status === "inactive") {
              updateThreadRuntime(threadId, {
                status: "launching",
                attention: "none",
                canResumeWithConfig: thread.canResumeWithConfig,
              });
            }
          }
        });
      } finally {
        if (isActive) {
          skipSnapshotRefreshForView.current = useAppStore.getState().view;
          setThreadRuntimeReopenEnabled(true);
          setRuntimeSnapshotsReady(true);
        }
      }
    })();

    if (!runtimeOwner) {
      return () => {
        isActive = false;
      };
    }

    const idleHandle = scheduleIdle(() => {
      if (!isActive) return;
      // Host-owned auto-archive is a pending host obligation for the managed
      // root; the renderer must not flip rows it cannot persist.
      if (isManagedRootDesktopRuntime()) return;
      const days = useSharedSettings.getState().autoArchiveDoneAfterDays;
      if (days > 0) {
        startTransition(() => {
          archiveOldDoneThreads(days);
        });
      }
    });

    const stopPrMergeAutoDone = startPrMergeAutoDone();
    const stopPrWatchStatusSync = startPrWatchStatusSync();

    return () => {
      isActive = false;
      setThreadRuntimeReopenEnabled(false);
      idleHandle.cancel();
      stopPrMergeAutoDone();
      stopPrWatchStatusSync();
    };
  }, [
    loadT0,
    markThreadsInactiveOnLaunch,
    purgeStaleArchivedThreads,
    archiveOldDoneThreads,
    reconcileRuntimeSnapshots,
    updateThreadRuntime,
    runtimeOwner,
    storeHydrated,
  ]);

  useEffect(() => {
    if (!runtimeOwner || !storeHydrated || initialLoading || !runtimeSnapshotsReady) {
      return;
    }
    if (skipSnapshotRefreshForView.current === view) {
      skipSnapshotRefreshForView.current = null;
      return;
    }

    let cancelled = false;
    void readBridge()
      .getThreadSnapshots()
      .then((snapshots) => {
        if (cancelled) return;
        const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.threadId));
        for (const snapshot of snapshots) {
          updateThreadRuntime(snapshot.threadId, snapshot);
        }
        for (const threadId of getRunningExperimentCandidateIds()) {
          if (snapshotIds.has(threadId)) continue;
          const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
          if (thread?.status === "launching") {
            updateThreadRuntime(threadId, {
              status: "inactive",
              attention: "none",
              canResumeWithConfig: thread.canResumeWithConfig,
            });
          }
        }
      })
      .catch((error: unknown) => {
        captureRendererException(error, { featureArea: "hydration" });
      });

    return () => {
      cancelled = true;
    };
  }, [
    runtimeOwner,
    runtimeSnapshotsReady,
    storeHydrated,
    initialLoading,
    updateThreadRuntime,
    view,
  ]);

  useEffect(() => {
    if (!storeHydrated || initialLoading) return;

    let stopPrewarm = () => {};
    const frame = window.requestAnimationFrame(() => {
      stopPrewarm = startDeferredFeaturePrewarm(
        isCompactClientRuntimeSurface() ? "compact" : "desktop",
      );
    });
    return () => {
      window.cancelAnimationFrame(frame);
      stopPrewarm();
    };
  }, [initialLoading, storeHydrated]);

  return { initialLoading, runtimeSnapshotsReady, storeHydrated, loadT0 };
}

function collectVisibleGuiThreadIds(): string[] {
  const state = useAppStore.getState();
  const visibleThreadIds = collectRetainedThreadIds(state.view);
  return state.threads
    .filter(
      (thread) =>
        visibleThreadIds.has(thread.id) &&
        thread.presentationMode === "gui" &&
        !isThreadTurnActive(thread.status),
    )
    .map((thread) => thread.id);
}

function collectRetainedThreadIds(
  view: ReturnType<typeof useAppStore.getState>["view"],
): Set<string> {
  const retained = getRunningExperimentCandidateIds();
  if (view.kind === "thread") {
    for (const threadId of view.panes) retained.add(threadId);
  } else if (view.kind === "experiment") {
    const experiment = useExperimentStore.getState().experiments[view.experimentId];
    for (const candidate of experiment?.candidates ?? []) retained.add(candidate.threadId);
  }
  return retained;
}
