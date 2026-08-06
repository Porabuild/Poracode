import { startTransition, useEffect, useState } from "react";
import { isThreadTurnActive } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import { hydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { normalizeRuntimeSnapshotLaunchConfig } from "@/renderer/state/slices/threadSlice";
import { startDeferredFeaturePrewarm } from "@/renderer/deferredFeatures";

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
  const runtimeOwner = options.runtimeOwner ?? true;
  const markThreadsInactiveOnLaunch = useAppStore((state) => state.markThreadsInactiveOnLaunch);
  const purgeStaleArchivedThreads = useAppStore((state) => state.purgeStaleArchivedThreads);
  const archiveOldDoneThreads = useAppStore((state) => state.archiveOldDoneThreads);
  const reconcileRuntimeSnapshots = useAppStore((state) => state.reconcileRuntimeSnapshots);
  const updateThreadRuntime = useAppStore((state) => state.updateThreadRuntime);
  const view = useAppStore((state) => state.view);

  const [initialLoading, setInitialLoading] = useState(true);
  const [storeHydrated, setStoreHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const [loadT0] = useState(() => Date.now());

  useEffect(() => {
    const unsubscribeHydrate = useAppStore.persist.onHydrate(() => {
      setStoreHydrated(false);
    });
    const unsubscribeFinishHydration = useAppStore.persist.onFinishHydration(() => {
      setStoreHydrated(true);
    });

    setStoreHydrated(useAppStore.persist.hasHydrated());

    return () => {
      unsubscribeHydrate();
      unsubscribeFinishHydration();
    };
  }, []);

  useEffect(() => {
    if (!storeHydrated) {
      console.log(`[renderer] +${Date.now() - loadT0}ms: waiting for store hydration`);
      return;
    }

    let isActive = true;
    const restoredView = useAppStore.getState().view;
    console.log(
      `[renderer] +${Date.now() - loadT0}ms: store hydrated, view=${JSON.stringify(restoredView)}, ${useAppStore.getState().projects.length} projects, ${useAppStore.getState().threads.length} threads`,
    );

    if (!runtimeOwner) {
      setInitialLoading(false);
      return;
    }

    void (async () => {
      startTransition(() => {
        markThreadsInactiveOnLaunch();
        purgeStaleArchivedThreads(30);
      });

      const visibleGuiThreadIds = collectVisibleGuiThreadIds();
      if (visibleGuiThreadIds.length > 0) {
        await Promise.all(
          visibleGuiThreadIds.map((threadId) => hydrateThreadRuntimeItems(threadId)),
        );
      }

      if (!isActive) return;
      startTransition(() => {
        console.log(`[renderer] +${Date.now() - loadT0}ms: initialLoading = false`);
        setInitialLoading(false);
      });
    })();

    const idleHandle = scheduleIdle(() => {
      if (!isActive) return;
      const days = useSharedSettings.getState().autoArchiveDoneAfterDays;
      if (days > 0) {
        startTransition(() => {
          archiveOldDoneThreads(days);
        });
      }
    });

    // Composer MCP toggles and skill lists both depend on the loaded plugin
    // list, so it has to be there before the first thread renders.
    void usePlugins.getState().load();

    void readBridge()
      .getThreadSnapshots()
      .then((snapshots) => {
        if (!isActive) {
          return;
        }

        const currentView = useAppStore.getState().view;
        const selectedIds = new Set(currentView.kind === "thread" ? currentView.panes : []);
        const storeThreadIds = new Set(useAppStore.getState().threads.map((t) => t.id));

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
            selectedIds.size > 0 ? snapshots.filter((s) => selectedIds.has(s.threadId)) : [],
          );
        });
      })
      .catch((error: unknown) => {
        captureRendererException(error, { featureArea: "hydration" });
      });

    return () => {
      isActive = false;
      idleHandle.cancel();
    };
  }, [
    loadT0,
    markThreadsInactiveOnLaunch,
    purgeStaleArchivedThreads,
    archiveOldDoneThreads,
    reconcileRuntimeSnapshots,
    runtimeOwner,
    storeHydrated,
  ]);

  useEffect(() => {
    if (!runtimeOwner || !storeHydrated || initialLoading) {
      return;
    }

    let cancelled = false;
    void readBridge()
      .getThreadSnapshots()
      .then((snapshots) => {
        if (cancelled || snapshots.length === 0) {
          return;
        }
        for (const snapshot of snapshots) {
          updateThreadRuntime(snapshot.threadId, normalizeRuntimeSnapshotLaunchConfig(snapshot));
        }
      })
      .catch((error: unknown) => {
        captureRendererException(error, { featureArea: "hydration" });
      });

    return () => {
      cancelled = true;
    };
  }, [runtimeOwner, storeHydrated, initialLoading, updateThreadRuntime, view]);

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

  return { initialLoading, storeHydrated, loadT0 };
}

function collectVisibleGuiThreadIds(): string[] {
  const state = useAppStore.getState();
  if (state.view.kind !== "thread") return [];
  const visibleThreadIds = new Set(state.view.panes);
  return state.threads
    .filter(
      (thread) =>
        visibleThreadIds.has(thread.id) &&
        thread.presentationMode === "gui" &&
        !isThreadTurnActive(thread.status),
    )
    .map((thread) => thread.id);
}
