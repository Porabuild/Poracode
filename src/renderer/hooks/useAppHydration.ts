import { startTransition, useEffect, useRef, useState } from "react";
import { isThreadTurnActive } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getRunningExperimentCandidateIds,
  useExperimentStore,
} from "@/renderer/state/experimentStore";
import { recoverExperimentCandidateWorktrees } from "@/renderer/state/experimentHydration";
import { hydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { bootstrapWorkspaces } from "@/renderer/state/workspaceStore";
import { startPrMergeAutoDone } from "@/renderer/state/prMergeAutoDone";
import { startPrWatchStatusSync } from "@/renderer/state/prWatchStatusSync";
import { startDeferredFeaturePrewarm } from "@/renderer/deferredFeatures";
import { setThreadRuntimeReopenEnabled } from "@/renderer/actions/threadActions";

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

export function useAppHydration(options: { runtimeOwner?: boolean } = {}) {
  const runtimeOwner =
    options.runtimeOwner ??
    (!window.poracodeHost && !window.poracode ? true : hasClientCapability("localBackend"));
  const markThreadsInactiveOnLaunch = useAppStore((state) => state.markThreadsInactiveOnLaunch);
  const purgeStaleArchivedThreads = useAppStore((state) => state.purgeStaleArchivedThreads);
  const archiveOldDoneThreads = useAppStore((state) => state.archiveOldDoneThreads);
  const reconcileRuntimeSnapshots = useAppStore((state) => state.reconcileRuntimeSnapshots);
  const updateThreadRuntime = useAppStore((state) => state.updateThreadRuntime);
  const view = useAppStore((state) => state.view);

  const [initialLoading, setInitialLoading] = useState(true);
  const [appStoreHydrated, setAppStoreHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const [experimentStoreHydrated, setExperimentStoreHydrated] = useState(() =>
    useExperimentStore.persist.hasHydrated(),
  );
  const storeHydrated = appStoreHydrated && experimentStoreHydrated;
  const [loadT0] = useState(() => Date.now());
  const [runtimeSnapshotsReady, setRuntimeSnapshotsReady] = useState(false);
  const skipSnapshotRefreshForView = useRef<ReturnType<typeof useAppStore.getState>["view"] | null>(
    null,
  );

  useEffect(() => {
    const unsubscribeHydrate = useAppStore.persist.onHydrate(() => {
      setAppStoreHydrated(false);
    });
    const unsubscribeFinishHydration = useAppStore.persist.onFinishHydration(() => {
      setAppStoreHydrated(true);
    });
    const unsubscribeExperimentHydrate = useExperimentStore.persist.onHydrate(() => {
      setExperimentStoreHydrated(false);
    });
    const unsubscribeExperimentFinishHydration = useExperimentStore.persist.onFinishHydration(
      () => {
        setExperimentStoreHydrated(true);
      },
    );

    setAppStoreHydrated(useAppStore.persist.hasHydrated());
    setExperimentStoreHydrated(useExperimentStore.persist.hasHydrated());

    return () => {
      unsubscribeHydrate();
      unsubscribeFinishHydration();
      unsubscribeExperimentHydrate();
      unsubscribeExperimentFinishHydration();
    };
  }, []);

  useEffect(() => {
    if (!storeHydrated) {
      console.log(`[renderer] +${Date.now() - loadT0}ms: waiting for store hydration`);
      return;
    }

    let isActive = true;
    setRuntimeSnapshotsReady(false);
    setThreadRuntimeReopenEnabled(false);
    skipSnapshotRefreshForView.current = null;
    const appState = useAppStore.getState();
    const experimentStore = useExperimentStore.getState();
    experimentStore.reconcileExperiments(new Set(appState.projects.map((project) => project.id)));
    const restoredView = appState.view;
    if (
      restoredView.kind === "experiment" &&
      !useExperimentStore.getState().experiments[restoredView.experimentId]
    ) {
      appState.openHome();
    }
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
      const candidateRecovery = recoverExperimentCandidateWorktrees();
      if (candidateRecovery) await candidateRecovery;
      if (!isActive) return;
      if (!runtimeOwner) {
        setInitialLoading(false);
        setThreadRuntimeReopenEnabled(true);
        setRuntimeSnapshotsReady(true);
        return;
      }

      startTransition(() => {
        markThreadsInactiveOnLaunch();
        purgeStaleArchivedThreads(30);
      });

      const snapshotsPromise = readBridge().getThreadSnapshots();

      const visibleGuiThreadIds = collectVisibleGuiThreadIds();
      if (visibleGuiThreadIds.length > 0) {
        await Promise.all(
          visibleGuiThreadIds.map((threadId) => hydrateThreadRuntimeItems(threadId)),
        );
      }

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
      stopPrewarm = startDeferredFeaturePrewarm();
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
