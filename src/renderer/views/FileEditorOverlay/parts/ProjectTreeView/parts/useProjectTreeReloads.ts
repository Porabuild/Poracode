import { useEffect, useRef } from "react";
import { toast } from "@heroui/react";
import type { ProjectLocation, ProjectTreeEntry } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { invalidateProjectRoot, listProjectRoot } from "@/renderer/state/projectRootNamesStore";
import { useProjectTreeStore } from "@/renderer/state/projectTreeStore";

let activeLoader: ReturnType<typeof createTreeLoader> | undefined;

export function useProjectTreeReloads(
  projectLocation: ProjectLocation,
  rootKey: string,
  refreshToken: number,
  visible: boolean,
) {
  const loaderRef = useRef<{
    loader: ReturnType<typeof createTreeLoader>;
    owner: symbol;
  } | null>(null);

  useEffect(() => {
    if (!visible && useProjectTreeStore.getState().rootKey !== rootKey) return;
    useProjectTreeStore.getState().resetForRoot(rootKey);
    const generation = useProjectTreeStore.getState().generation;
    if (!activeLoader || activeLoader.disposed || activeLoader.generation !== generation) {
      activeLoader?.invalidate();
      activeLoader = createTreeLoader(projectLocation, refreshToken);
    }
    const loader = activeLoader;
    const owner = Symbol();
    loaderRef.current = { loader, owner };
    loader.update(owner, refreshToken, visible);
    return () => {
      loader.release(owner);
      loaderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- root and visibility select ownership; token changes update the shared loader below.
  }, [rootKey, visible]);

  useEffect(() => {
    const subscription = loaderRef.current;
    subscription?.loader.update(subscription.owner, refreshToken, visible);
  }, [refreshToken, rootKey, visible]);

  return {
    invalidatePendingLoads: () => {
      if (useProjectTreeStore.getState().rootKey === rootKey)
        activeLoader?.invalidatePendingLoads();
    },
    reloadPaths: (paths: string[]) =>
      useProjectTreeStore.getState().rootKey === rootKey
        ? (loaderRef.current?.loader.load(paths) ?? Promise.resolve())
        : Promise.resolve(),
    refresh: () =>
      useProjectTreeStore.getState().rootKey === rootKey
        ? (loaderRef.current?.loader.refresh() ?? Promise.resolve())
        : Promise.resolve(),
  };
}

function createTreeLoader(projectLocation: ProjectLocation, refreshToken: number) {
  const generation = useProjectTreeStore.getState().generation;
  const ownsRoot = () => useProjectTreeStore.getState().generation === generation;
  let disposed = false;
  let visible = false;
  let revision = 0;
  let pendingRefresh = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  const pendingPaths = new Set<string>();
  const loadingPaths = new Set<string>();
  const owners = new Map<symbol, boolean>();
  const isCurrent = () => !disposed && owners.size > 0 && ownsRoot();

  function cancelTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function clearLoading() {
    if (ownsRoot()) useProjectTreeStore.getState().clearLoadingFor([...loadingPaths]);
    loadingPaths.clear();
  }

  function invalidateRequests() {
    revision += 1;
    invalidateProjectRoot(projectLocation);
  }

  function queueRefreshPaths() {
    pendingRefresh = false;
    const state = useProjectTreeStore.getState();
    pendingPaths.add("");
    for (const path of Object.keys(state.directoryEntries)) pendingPaths.add(path);
    for (const [path, expanded] of Object.entries(state.expandedPaths)) {
      if (expanded) pendingPaths.add(path);
    }
    for (const path of loadingPaths) pendingPaths.add(path);
  }

  function drain(): Promise<void> {
    if (!isCurrent() || !visible) return Promise.resolve();
    if (running) return running;
    if (!pendingPaths.size && !(pendingRefresh && !timer)) return Promise.resolve();
    running = (async () => {
      while (isCurrent()) {
        if (!visible) break;
        if (pendingRefresh && !timer) {
          queueRefreshPaths();
        }
        if (!pendingPaths.size) break;
        const paths = [...pendingPaths];
        pendingPaths.clear();
        const requestRevision = revision;
        for (const path of paths) {
          loadingPaths.add(path);
          useProjectTreeStore.getState().setLoading(path, true);
        }
        const results = await Promise.allSettled(
          paths.map(async (path) => {
            try {
              const result = await (path === ""
                ? listProjectRoot(
                    projectLocation,
                    () => isCurrent() && revision === requestRevision,
                  )
                : readBridge().listProjectTree({ projectLocation, directoryPath: path }));
              return { path, entries: result.entries };
            } catch (error) {
              if (path && isMissingPathError(error)) return { path, entries: [] };
              throw error;
            }
          }),
        );
        if (!isCurrent()) return;
        if (requestRevision !== revision) continue;
        const updates: Record<string, ProjectTreeEntry[]> = {};
        for (const result of results) {
          if (result.status === "fulfilled") {
            updates[result.value.path] = result.value.entries;
          } else {
            const error: unknown = result.reason;
            toast.danger(error instanceof Error ? error.message : String(error));
          }
        }
        if (Object.keys(updates).length) {
          useProjectTreeStore.getState().setDirectoryEntries(updates);
        }
      }
    })().finally(() => {
      running = undefined;
      // Retain loading flags between an invalidated response and its trailing reload.
      if (isCurrent() && (!visible || (!pendingPaths.size && !pendingRefresh))) clearLoading();
      if (isCurrent() && visible && (pendingPaths.size || (pendingRefresh && !timer))) {
        void drain();
      }
    });
    return running;
  }

  function updateVisibility(nextToken: number) {
    const nextVisible = [...owners.values()].some(Boolean);
    const becameVisible = !visible && nextVisible;
    visible = nextVisible;
    if (nextToken !== refreshToken) {
      refreshToken = nextToken;
      // Watcher events mark the snapshot dirty without starving a completed listing.
      if (visible && !becameVisible && !pendingRefresh && !timer) {
        timer = setTimeout(() => {
          timer = undefined;
          void drain();
        }, 275);
      }
      pendingRefresh = true;
    }
    if (!visible) {
      cancelTimer();
      if (!running) clearLoading();
    } else if (becameVisible) {
      void drain();
    }
  }

  function dispose() {
    disposed = true;
    cancelTimer();
    clearLoading();
  }

  return {
    generation,
    get disposed() {
      return disposed;
    },
    invalidatePendingLoads() {
      if (!isCurrent()) return;
      invalidateRequests();
    },
    load(paths: string[]) {
      if (!isCurrent()) return Promise.resolve();
      if (paths.some((path) => loadingPaths.has(path))) {
        invalidateRequests();
        for (const path of loadingPaths) pendingPaths.add(path);
      }
      for (const path of paths) pendingPaths.add(path);
      return drain();
    },
    refresh() {
      if (!isCurrent()) return Promise.resolve();
      invalidateRequests();
      cancelTimer();
      queueRefreshPaths();
      return drain();
    },
    update(owner: symbol, nextToken: number, nextVisible: boolean) {
      if (disposed || !ownsRoot()) return;
      owners.set(owner, nextVisible);
      updateVisibility(nextToken);
    },
    release(owner: symbol) {
      owners.delete(owner);
      updateVisibility(refreshToken);
      // Effect replay or a handoff can restore visibility before a real pause begins.
      void Promise.resolve().then(() => {
        if (!owners.size) dispose();
        else if (!visible) pendingRefresh = true;
      });
    },
    invalidate() {
      invalidateRequests();
      dispose();
    },
  };
}

export function isMissingPathError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "ENOENT") return true;
  }
  return error instanceof Error && /\bENOENT\b/.test(error.message);
}
