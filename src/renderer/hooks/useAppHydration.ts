import { startTransition, useEffect, useState } from "react";
import { isThreadTurnActive } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { captureRendererException } from "@/renderer/diagnostics/sentry";
import { useAppStore } from "@/renderer/state/appStore";
import {
  getRunningExperimentCandidateIds,
  useExperimentStore,
} from "@/renderer/state/experimentStore";
import { hydrateThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
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

function recoverExperimentCandidateWorktrees(): Promise<void> | null {
  const appState = useAppStore.getState();
  const experiments = Object.values(useExperimentStore.getState().experiments);
  if (experiments.length === 0) return null;

  return (async () => {
    const resolvedByThreadId = new Map<
      string,
      {
        readonly branch: string;
        readonly path: string | undefined;
        readonly preserveCandidatePath: boolean;
        readonly state: "pending" | "owned" | "removed";
      }
    >();
    const threadById = new Map(appState.threads.map((thread) => [thread.id, thread] as const));

    for (const project of appState.projects) {
      const projectExperiments = experiments.filter(
        (experiment) => experiment.projectId === project.id,
      );
      if (projectExperiments.length === 0) continue;
      try {
        const { worktrees } = await readBridge().gitListWorktrees({
          projectLocation: project.location,
        });
        for (const experiment of projectExperiments) {
          for (const candidate of experiment.candidates) {
            const state = candidate.worktreeState;
            if (state === "removed") {
              resolvedByThreadId.set(candidate.threadId, {
                branch: candidate.worktreeBranch,
                path: undefined,
                preserveCandidatePath: false,
                state,
              });
              continue;
            }
            const caseInsensitive = project.location.kind === "windows";
            const recordedPaths = new Set(
              [threadById.get(candidate.threadId)?.worktreePath, candidate.worktreePath]
                .filter((path): path is string => path !== undefined)
                .map((path) => normalizeWorktreePath(path, caseInsensitive)),
            );
            const registeredAtRecordedPath = worktrees.some((worktree) =>
              recordedPaths.has(normalizeWorktreePath(worktree.path, caseInsensitive)),
            );
            const branchWorktree = worktrees.find(
              (worktree) => worktree.branch === candidate.worktreeBranch,
            );
            let recoveredState = state;
            let recoveredPath = branchWorktree?.path;
            let preserveCandidatePath = registeredAtRecordedPath;
            if (branchWorktree) {
              try {
                const metadata = await readBridge().gitGetWorktreeSourceBranch({
                  projectLocation: project.location,
                  branch: candidate.worktreeBranch,
                });
                if (metadata.ownerToken === candidate.worktreeOwnerToken) {
                  recoveredState = "owned";
                } else {
                  recoveredPath = undefined;
                  preserveCandidatePath = registeredAtRecordedPath;
                }
              } catch (error) {
                captureRendererException(error, { featureArea: "hydration" });
                recoveredPath = undefined;
                preserveCandidatePath = registeredAtRecordedPath;
              }
            } else if (state === "pending") {
              recoveredPath = undefined;
            }
            resolvedByThreadId.set(candidate.threadId, {
              branch: candidate.worktreeBranch,
              path: recoveredPath,
              preserveCandidatePath,
              state: recoveredState,
            });
          }
        }
      } catch (error) {
        captureRendererException(error, { featureArea: "hydration" });
      }
    }

    if (resolvedByThreadId.size === 0) return;
    useAppStore.setState((state) => ({
      threads: state.threads.map((thread) => {
        const resolved = resolvedByThreadId.get(thread.id);
        if (!resolved) return thread;
        if (resolved.path) {
          if (thread.worktreePath === resolved.path && thread.worktreeBranch === resolved.branch) {
            return thread;
          }
          return {
            ...thread,
            worktreePath: resolved.path,
            worktreeBranch: resolved.branch,
            updatedAt: new Date().toISOString(),
          };
        }
        if (thread.worktreePath === undefined) return thread;
        const { worktreePath: _worktreePath, ...withoutWorktreePath } = thread;
        return {
          ...withoutWorktreePath,
          worktreeBranch: resolved.branch,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
    useExperimentStore.setState((state) => ({
      experiments: Object.fromEntries(
        Object.entries(state.experiments).map(([experimentId, experiment]) => [
          experimentId,
          {
            ...experiment,
            candidates: experiment.candidates.map((candidate) => {
              const resolved = resolvedByThreadId.get(candidate.threadId);
              if (!resolved) return candidate;
              const { worktreePath: _worktreePath, ...candidateWithoutPath } = candidate;
              if (resolved.path) {
                return {
                  ...candidateWithoutPath,
                  worktreePath: resolved.path,
                  worktreeState: resolved.state,
                };
              }
              return resolved.preserveCandidatePath
                ? { ...candidate, worktreeState: resolved.state }
                : { ...candidateWithoutPath, worktreeState: resolved.state };
            }),
          },
        ]),
      ),
    }));
  })();
}

function normalizeWorktreePath(path: string, caseInsensitive: boolean): string {
  const normalized = path.replace(/\\/gu, "/").replace(/\/+$/u, "");
  return caseInsensitive ? normalized.toLowerCase() : normalized;
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
  const [appStoreHydrated, setAppStoreHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const [experimentStoreHydrated, setExperimentStoreHydrated] = useState(() =>
    useExperimentStore.persist.hasHydrated(),
  );
  const storeHydrated = appStoreHydrated && experimentStoreHydrated;
  const [loadT0] = useState(() => Date.now());

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

    void (async () => {
      const candidateRecovery = recoverExperimentCandidateWorktrees();
      if (candidateRecovery) await candidateRecovery;
      if (!isActive) return;
      if (!runtimeOwner) {
        setInitialLoading(false);
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
          console.log(`[renderer] +${Date.now() - loadT0}ms: initialLoading = false`);
          setInitialLoading(false);
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
          console.log(`[renderer] +${Date.now() - loadT0}ms: initialLoading = false`);
          setInitialLoading(false);
        });
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
    updateThreadRuntime,
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
