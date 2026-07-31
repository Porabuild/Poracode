import { useEffect } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { parseDraftProjectId } from "@/shared/paneId";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { buildActiveProjectsKey } from "@/renderer/state/projectKeys";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import {
  cleanupGitRefreshProjects,
  getWatcherRefreshMode,
  refreshGitProject,
  stopPendingPrRefresh,
  syncPendingPrRefreshProjects,
  syncWatchedWorktreeProjects,
} from "@/renderer/state/gitRefresh";
import {
  GIT_FETCH_PRIORITY_INTERVAL_MS,
  GIT_FETCH_BACKGROUND_INTERVAL_MS,
} from "@/renderer/utils/gitHelpers";

const WSL_STATUS_POLL_INTERVAL_MS = 3_000;

/**
 * Subscribe to a store and invoke `onChange` whenever any of the selected
 * fields changes identity. Collapses the otherwise-identical "compare a fixed
 * field tuple, then re-sync" guards so the worktree-watch subscriptions below
 * stay in one shape instead of four hand-written `===` chains.
 */
function subscribeToFieldChanges<S>(
  subscribe: (listener: (state: S, prev: S) => void) => () => void,
  selectFields: (state: S) => readonly unknown[],
  onChange: () => void,
): () => void {
  return subscribe((state, prev) => {
    const next = selectFields(state);
    const previous = selectFields(prev);
    if (next.some((value, index) => value !== previous[index])) onChange();
  });
}

export function useGitRefresh(storeHydrated: boolean) {
  // Subscribe only to the active-project identity/location key so draft config
  // writes do not invalidate the whole shell.
  const activeProjectsKey = useAppStore((state) => buildActiveProjectsKey(state.projects));

  useEffect(() => {
    const activeProjects = useAppStore.getState().projects.filter((project) => !project.disabled);
    if (!storeHydrated) return;
    cleanupGitRefreshProjects(new Set(activeProjects.map((project) => project.id)));
    if (activeProjects.length === 0) return;

    let isActive = true;
    const lastFetchTimes = new Map<string, number>();
    let previousPriorityProjectIds = new Set<string>();
    const isActiveCheck = () => isActive;

    const watcherDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const WATCHER_DEBOUNCE_MS = 250;

    function scheduleWatcherRefresh(project: { id: string; location: ProjectLocation }) {
      if (!isActive) return;
      const existing = watcherDebounceTimers.get(project.id);
      if (existing) clearTimeout(existing);
      watcherDebounceTimers.set(
        project.id,
        setTimeout(() => {
          watcherDebounceTimers.delete(project.id);
          if (!isActive) return;
          void refreshGitProject(project, "watcher", getWatcherRefreshMode(project.id), {
            isActive: isActiveCheck,
          });
        }, WATCHER_DEBOUNCE_MS),
      );
    }

    function getPriorityProjectIds(): Set<string> {
      const state = useAppStore.getState();
      const priorityProjectIds = new Set<string>();

      if (state.view.kind === "draft" && state.view.projectId) {
        priorityProjectIds.add(state.view.projectId);
        return priorityProjectIds;
      }

      if (state.view.kind === "experiment") {
        priorityProjectIds.add(state.view.projectId);
        return priorityProjectIds;
      }

      if (state.view.kind !== "thread") {
        return priorityProjectIds;
      }

      for (const paneId of state.view.panes) {
        const draftProjectId = parseDraftProjectId(paneId);
        if (draftProjectId) {
          priorityProjectIds.add(draftProjectId);
          continue;
        }
        const threadProjectId = state.threads.find((thread) => thread.id === paneId)?.projectId;
        if (threadProjectId) {
          priorityProjectIds.add(threadProjectId);
        }
      }

      return priorityProjectIds;
    }

    for (const project of activeProjects) {
      readBridge()
        .gitWatchProject({ projectId: project.id, projectLocation: project.location })
        .catch(() => undefined);
    }

    function syncActiveWorktrees() {
      if (!isActive) return;
      syncWatchedWorktreeProjects(activeProjects);
      syncPendingPrRefreshProjects(activeProjects);
    }

    const unsubWatcher = readBridge().onSupervisorEvent((event) => {
      // Both events are git-affecting: `.git` metadata clearly, and worktree
      // edits change `git status` output (a tracked file becomes modified,
      // an untracked file appears, etc.). Refresh git state for either.
      if (event.type === "git-changed" || event.type === "project-tree-changed") {
        console.log(`[git-refresh] watcher-event ${event.type} project=${event.projectId}`);
        const project = activeProjects.find((p) => p.id === event.projectId);
        if (project) scheduleWatcherRefresh(project);
      }
      if (event.type === "project-tree-changed") {
        const editorRoot = useFileEditorStore.getState().rootContext;
        if (editorRoot && editorRoot.projectId === event.projectId) {
          useFileEditorStore.getState().bumpRefreshToken();
          void useFileEditorStore.getState().refreshOpenBuffers();
        }
      }
    });

    syncActiveWorktrees();
    for (const project of activeProjects) {
      void refreshGitProject(project, "initial", "full", { isActive: isActiveCheck });
    }
    const unsubPendingPrRefresh = useGitStore.subscribe((state, prev) => {
      if (
        state.statuses !== prev.statuses ||
        state.prData !== prev.prData ||
        state.prDetails !== prev.prDetails
      ) {
        syncPendingPrRefreshProjects(activeProjects);
      }
    });
    const unsubActiveWorktreeApp = subscribeToFieldChanges(
      useAppStore.subscribe,
      (state) => [state.threads, state.view, state.projects],
      syncActiveWorktrees,
    );
    const unsubActiveWorktreeExperiments = subscribeToFieldChanges(
      useExperimentStore.subscribe,
      (state) => [state.experiments],
      syncActiveWorktrees,
    );
    const unsubActiveWorktreePanel = subscribeToFieldChanges(
      usePanelStore.subscribe,
      (state) => [
        state.gitReviewContext,
        state.gitReviewAsPanel,
        state.filesPanelContext,
        state.rightPanelTab,
        state.threadSortMode,
      ],
      syncActiveWorktrees,
    );
    const unsubActiveWorktreeSidebar = subscribeToFieldChanges(
      useSidebarUiStore.subscribe,
      (state) => [state.collapsedProjects, state.collapsedWorktrees, state.threadListLimits],
      syncActiveWorktrees,
    );
    const unsubActiveWorktreeTerminal = subscribeToFieldChanges(
      useDevTerminalStore.subscribe,
      (state) => [state.isOpen, state.activeProjectId, state.activeWorktreePath],
      syncActiveWorktrees,
    );

    async function fetchRemotes() {
      if (!isActive) return;
      if (typeof document !== "undefined" && !document.hasFocus()) {
        console.log("[git-refresh] fetch-skip windowFocused=false");
        return;
      }
      const now = Date.now();
      const priorityProjectIds = getPriorityProjectIds();
      const promotedProjectIds = new Set(
        [...priorityProjectIds].filter((projectId) => !previousPriorityProjectIds.has(projectId)),
      );
      const projectsToFetch = activeProjects.filter((project) => {
        const isPriority = priorityProjectIds.has(project.id);
        const interval = isPriority
          ? GIT_FETCH_PRIORITY_INTERVAL_MS
          : GIT_FETCH_BACKGROUND_INTERVAL_MS;
        const lastFetchedAt = lastFetchTimes.get(project.id) ?? 0;
        const becamePriority = promotedProjectIds.has(project.id);
        return becamePriority || now - lastFetchedAt >= interval;
      });
      previousPriorityProjectIds = priorityProjectIds;
      if (projectsToFetch.length === 0) return;

      await Promise.all(
        projectsToFetch.map(async (project) => {
          if (!isActive) return;
          const isPriority = priorityProjectIds.has(project.id);
          const promoted = promotedProjectIds.has(project.id);
          console.log(
            `[git-refresh] fetch-start project=${project.id} priority=${isPriority} promoted=${promoted}`,
          );
          lastFetchTimes.set(project.id, now);
          try {
            await readBridge().gitFetch({
              projectLocation: project.location,
              remote: "origin",
              prune: true,
            });
          } catch {
            // ignore — remote may be unreachable
          }
          if (isActive) {
            void refreshGitProject(project, "fetch", "full", { isActive: isActiveCheck });
          }
        }),
      );
    }

    function pollPriorityWslStatus() {
      if (!isActive) return;
      if (typeof document !== "undefined" && !document.hasFocus()) return;
      const priorityProjectIds = getPriorityProjectIds();
      for (const project of activeProjects) {
        if (project.location.kind !== "wsl") continue;
        if (!priorityProjectIds.has(project.id)) continue;
        void refreshGitProject(project, "poll", "status", { isActive: isActiveCheck });
      }
    }

    // Defer the first remote fetch until after the initial refresh batch has
    // had a chance to paint UI. Running them concurrently means git fetch's
    // ref updates (legitimate `.git/refs/...` writes) trigger watcher events
    // mid-init, which queue a redundant refresh-after-init. Letting init
    // finish first cleanly separates "local snapshot" from "remote sync".
    const initialFetchTimer = setTimeout(() => void fetchRemotes(), 5000);
    const fetchIntervalId = setInterval(
      () => void fetchRemotes(),
      Math.min(GIT_FETCH_PRIORITY_INTERVAL_MS, GIT_FETCH_BACKGROUND_INTERVAL_MS),
    );
    const wslStatusPollIntervalId = setInterval(pollPriorityWslStatus, WSL_STATUS_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      clearTimeout(initialFetchTimer);
      clearInterval(fetchIntervalId);
      clearInterval(wslStatusPollIntervalId);
      for (const timer of watcherDebounceTimers.values()) clearTimeout(timer);
      watcherDebounceTimers.clear();
      unsubPendingPrRefresh();
      unsubActiveWorktreeApp();
      unsubActiveWorktreeExperiments();
      unsubActiveWorktreePanel();
      unsubActiveWorktreeSidebar();
      unsubActiveWorktreeTerminal();
      stopPendingPrRefresh();
      unsubWatcher();
      for (const project of activeProjects) {
        readBridge()
          .gitUnwatchProject({ projectId: project.id })
          .catch(() => undefined);
      }
      cleanupGitRefreshProjects(new Set());
    };
  }, [storeHydrated, activeProjectsKey]);
}
