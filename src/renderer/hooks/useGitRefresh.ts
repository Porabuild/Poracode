import { useEffect } from "react";
import type { Project, ProjectLocation } from "@/shared/contracts";
import { parseDraftProjectId } from "@/shared/paneId";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import {
  buildActiveProjectsKey,
  buildBranchPrPrefetchThreadKeys,
  diffProjectKeys,
} from "@/renderer/state/projectKeys";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { runRendererAction } from "@/renderer/state/rendererActionStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { isRemoteProjectStatusUnreachable } from "@/renderer/state/remoteServers/reachability";
import { shouldPollProject } from "@/renderer/state/wslBackgroundActivity";
import {
  cleanupGitRefreshProjects,
  getWatcherRefreshMode,
  prefetchBranchPrData,
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
    // `activeProjectsKey` is this run's request identity: the project set
    // below must derive from the same store snapshot, otherwise the key raced
    // ahead and this run would watch/fetch a stale set.
    const requestKey = activeProjectsKey;
    const projectsSnapshot = useAppStore.getState().projects;
    if (buildActiveProjectsKey(projectsSnapshot) !== requestKey) return;
    const allActiveProjects = projectsSnapshot.filter((project) => !project.disabled);
    if (!storeHydrated) return;
    cleanupGitRefreshProjects(new Set(allActiveProjects.map((project) => project.id)));
    const reachableProjects = () => {
      const state = useRemoteServersStore.getState();
      const reachableServerIds = new Set(
        state.servers
          .filter(
            (server) =>
              !isRemoteProjectStatusUnreachable(
                { remoteServerId: remoteConnectionKey(server) },
                state.runtime[remoteConnectionKey(server)]?.status,
              ),
          )
          .map(remoteConnectionKey),
      );
      return allActiveProjects.filter(
        (project) => !project.remoteServerId || reachableServerIds.has(project.remoteServerId),
      );
    };
    let activeProjects = reachableProjects();
    const projectRuns = new Map(activeProjects.map((project) => [project.id, Symbol()]));
    // Projects whose watch settled in this run. A project watch replaces every
    // watcher of that project's worktrees, so worktree sets register after it.
    const watchedProjectIds = new Set<string>();

    let isActive = true;
    const lastFetchTimes = new Map<string, number>();
    const pendingFetchProjectIds = new Set<string>();
    let previousPriorityProjectIds = new Set<string>();
    const projectActiveCheck = (projectId: string) => {
      const run = projectRuns.get(projectId);
      return () => isActive && run !== undefined && projectRuns.get(projectId) === run;
    };

    const watcherDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const WATCHER_DEBOUNCE_MS = 250;

    function scheduleWatcherRefresh(project: { id: string; location: ProjectLocation }) {
      if (!isActive) return;
      const isProjectActive = projectActiveCheck(project.id);
      const existing = watcherDebounceTimers.get(project.id);
      if (existing) clearTimeout(existing);
      watcherDebounceTimers.set(
        project.id,
        setTimeout(() => {
          watcherDebounceTimers.delete(project.id);
          if (!isProjectActive()) return;
          void refreshGitProject(project, "watcher", getWatcherRefreshMode(project.id), {
            isActive: isProjectActive,
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

    function startProject(project: Project) {
      const isProjectActive = projectActiveCheck(project.id);
      // Reuse the per-host queue across reconnects so initial snapshots and
      // watcher registration leave capacity for chat and connection probes.
      void runRendererAction(
        `git:initial:${project.remoteServerId ?? "local"}`,
        async () => {
          if (!isProjectActive()) return;
          await readBridge()
            .gitWatchProject({ projectId: project.id, projectLocation: project.location })
            .catch(() => undefined);
          if (!isProjectActive()) return;
          watchedProjectIds.add(project.id);
          // The watch dropped this project's worktree watchers, so anything this
          // renderer registered or cached for it before now is stale: reset the
          // project's cache, then register its current worktree set.
          cleanupGitRefreshProjects(
            new Set(
              activeProjects
                .map((candidate) => candidate.id)
                .filter((projectId) => projectId !== project.id),
            ),
          );
          syncWatchedWorktreeProjects([project]);
          prefetchVisibleBranchPrData(new Set([project.id]));
          await refreshGitProject(project, "initial", "full", { isActive: isProjectActive });
        },
        { queue: true },
      ).catch(() => undefined);
    }

    function syncActiveWorktrees() {
      if (!isActive) return;
      // Until its watch settles, a project's worktree set would be wiped by it.
      syncWatchedWorktreeProjects(
        activeProjects.filter((project) => watchedProjectIds.has(project.id)),
      );
      syncPendingPrRefreshProjects(activeProjects);
    }

    // An unreachable paired host cannot be told to stop watching: the call would
    // wait out its deadline once per project on the shared desktop bridge. Its
    // watch is replaced when the host returns.
    function releaseProjectWatch(project: Project) {
      if (
        project.remoteServerId &&
        isRemoteProjectStatusUnreachable(
          project,
          useRemoteServersStore.getState().runtime[project.remoteServerId]?.status,
        )
      ) {
        return;
      }
      readBridge()
        .gitUnwatchProject({ projectId: project.id })
        .catch(() => undefined);
    }

    function prefetchVisibleBranchPrData(onlyProjectIds?: ReadonlySet<string>) {
      if (!isActive) return;
      // One bulk PR query keeps sidebar rows current when a thread becomes
      // visible (for example after "See more") without spawning one `gh pr
      // view` process per worktree. Do not put this on the view-change path:
      // plain thread switches must not spawn Git work while the panel is hidden.
      for (const project of activeProjects) {
        if (onlyProjectIds && !onlyProjectIds.has(project.id)) continue;
        if (
          project.remoteServerId &&
          isRemoteProjectStatusUnreachable(
            project,
            useRemoteServersStore.getState().runtime[project.remoteServerId]?.status,
          )
        ) {
          continue;
        }
        if (!shouldPollProject(project)) continue;
        void prefetchBranchPrData(project);
      }
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
      startProject(project);
    }
    // A paired host's status must not tear down local watchers and restart
    // every project's initial HTTP batch. Reconcile only the changed host.
    const unsubRemoteReachability = useRemoteServersStore.subscribe(() => {
      const nextProjects = reachableProjects();
      const nextIds = new Set(nextProjects.map((project) => project.id));
      const added = nextProjects.filter((project) => !projectRuns.has(project.id));
      const removed = activeProjects.filter((project) => !nextIds.has(project.id));
      if (added.length === 0 && removed.length === 0) return;
      activeProjects = nextProjects;
      for (const project of removed) {
        projectRuns.delete(project.id);
        watchedProjectIds.delete(project.id);
        const timer = watcherDebounceTimers.get(project.id);
        if (timer) clearTimeout(timer);
        watcherDebounceTimers.delete(project.id);
        lastFetchTimes.delete(project.id);
        releaseProjectWatch(project);
      }
      cleanupGitRefreshProjects(nextIds);
      for (const project of added) {
        projectRuns.set(project.id, Symbol());
        startProject(project);
      }
      syncActiveWorktrees();
    });
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
    const unsubBranchPrPrefetchApp = useAppStore.subscribe((state, prev) => {
      if (state.projects !== prev.projects) {
        prefetchVisibleBranchPrData();
        return;
      }
      if (state.threads === prev.threads) return;
      // Only projects whose PR-relevant thread fields changed: a turn ending in
      // one project must not spawn `gh pr list` for every other project.
      const changedProjectIds = diffProjectKeys(
        buildBranchPrPrefetchThreadKeys(prev.threads),
        buildBranchPrPrefetchThreadKeys(state.threads),
      );
      if (changedProjectIds.size > 0) prefetchVisibleBranchPrData(changedProjectIds);
    });
    const unsubActiveWorktreeExperiments = subscribeToFieldChanges(
      useExperimentStore.subscribe,
      (state) => [state.experiments],
      () => {
        syncActiveWorktrees();
        prefetchVisibleBranchPrData();
      },
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
      () => {
        syncActiveWorktrees();
        prefetchVisibleBranchPrData();
      },
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
        if (pendingFetchProjectIds.has(project.id)) return false;
        if (lastFetchTimes.has(project.id) && !shouldPollProject(project)) return false;
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
          const isProjectActive = projectActiveCheck(project.id);
          pendingFetchProjectIds.add(project.id);
          try {
            // Network fetches can wait for minutes. Keep background work from
            // filling the HTTP pool, including across effect replacements; one
            // queue per host so a slow host never delays another host's fetch.
            await runRendererAction(
              `git:background-fetch:${project.remoteServerId ?? "local"}`,
              async () => {
                if (!isProjectActive()) return;
                const isPriority = priorityProjectIds.has(project.id);
                const promoted = promotedProjectIds.has(project.id);
                console.log(
                  `[git-refresh] fetch-start project=${project.id} priority=${isPriority} promoted=${promoted}`,
                );
                lastFetchTimes.set(project.id, Date.now());
                try {
                  await readBridge().gitFetch({
                    projectLocation: project.location,
                    remote: "origin",
                    prune: true,
                  });
                } catch {
                  // ignore — remote may be unreachable
                }
                if (isProjectActive()) {
                  void refreshGitProject(project, "fetch", "full", {
                    isActive: isProjectActive,
                  });
                }
              },
              { queue: true },
            );
          } finally {
            pendingFetchProjectIds.delete(project.id);
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
        if (!shouldPollProject(project)) continue;
        if (!priorityProjectIds.has(project.id)) continue;
        void refreshGitProject(project, "poll", "status", {
          isActive: projectActiveCheck(project.id),
        });
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
      unsubRemoteReachability();
      unsubPendingPrRefresh();
      unsubActiveWorktreeApp();
      unsubBranchPrPrefetchApp();
      unsubActiveWorktreeExperiments();
      unsubActiveWorktreePanel();
      unsubActiveWorktreeSidebar();
      unsubActiveWorktreeTerminal();
      stopPendingPrRefresh();
      unsubWatcher();
      for (const project of activeProjects) releaseProjectWatch(project);
      cleanupGitRefreshProjects(new Set());
    };
  }, [storeHydrated, activeProjectsKey]);
}
