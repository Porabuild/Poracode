import { startTransition } from "react";
import { isHomeProject } from "@/shared/homeScope";
import { makeDraftPaneId } from "@/shared/paneId";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import type { DragSourceData, MainPanelDropSource, PaneDropIndicator } from "@/renderer/dnd";
import type { ReorderPlacement } from "@/renderer/state/reorder";
import { showFilesPanel, showGitReviewPanel } from "@/renderer/actions/panelActions";
import { showTerminalPanel } from "@/renderer/actions/terminalActions";

type ThreadDragSource = Extract<DragSourceData, { type: "thread" }>;
type ProjectDragSource = Extract<DragSourceData, { type: "project" }>;

export function resolveProjectReorder(input: {
  projects: Project[];
  source: ProjectDragSource;
  target: DragSourceData | null;
  initialIndex: number;
  finalIndex: number;
}): { targetId: string; placement: ReorderPlacement } | null {
  const { projects, source, target, initialIndex, finalIndex } = input;
  const projectIds = projects.map((project) => project.id);

  if (target?.type === "project" && target.projectId !== source.projectId) {
    const sourceIndex = projectIds.indexOf(source.projectId);
    const targetIndex = projectIds.indexOf(target.projectId);
    if (sourceIndex === -1 || targetIndex === -1) return null;
    return {
      targetId: target.projectId,
      placement: sourceIndex < targetIndex ? "after" : "before",
    };
  }

  if (initialIndex === finalIndex) return null;

  const targetId = projectIds[finalIndex];
  if (!targetId || targetId === source.projectId) return null;

  return {
    targetId,
    placement: initialIndex < finalIndex ? "after" : "before",
  };
}

export function resolveThreadReorder(input: {
  threads: Thread[];
  source: ThreadDragSource;
  target: DragSourceData | null;
  initialIndex: number;
  finalIndex: number;
}): { targetId: string; placement: ReorderPlacement } | null {
  const { threads, source, target, initialIndex, finalIndex } = input;
  const targetThread =
    target?.type === "thread" &&
    target.projectId === source.projectId &&
    target.threadId !== source.threadId &&
    (source.sortGroup === undefined || target.sortGroup === source.sortGroup)
      ? target
      : null;

  if (targetThread) {
    const sourceIndex = source.sortIndex ?? initialIndex;
    const targetIndex = targetThread.sortIndex ?? finalIndex;
    return {
      targetId: targetThread.threadId,
      placement: sourceIndex < targetIndex ? "after" : "before",
    };
  }

  const projectWideSort = source.sortGroup?.startsWith("project-entries:") ?? false;
  const groupThreads = threads
    .filter(
      (t) =>
        t.projectId === source.projectId &&
        (projectWideSort || (t.worktreePath ?? undefined) === source.worktreePath),
    )
    .sort((a, b) => Number(b.starred) - Number(a.starred));
  const targetByIndex = groupThreads[finalIndex];
  if (!targetByIndex || targetByIndex.id === source.threadId) return null;

  return {
    targetId: targetByIndex.id,
    placement: initialIndex < finalIndex ? "after" : "before",
  };
}

export function useDndHandlers() {
  const reorderProjects = useAppStore((s) => s.reorderProjects);
  const reorderThreads = useAppStore((s) => s.reorderThreads);
  const replacePaneById = useAppStore((s) => s.replacePaneById);
  const splitPaneById = useAppStore((s) => s.splitPaneById);
  const insertPaneAtLayoutTarget = useAppStore((s) => s.insertPaneAtLayoutTarget);
  const movePaneToLayoutTarget = useAppStore((s) => s.movePaneToLayoutTarget);
  const swapPanes = useAppStore((s) => s.swapPanes);

  function handleSortEnd(
    source: DragSourceData,
    initialIndex: number,
    finalIndex: number,
    _initialGroup: string | undefined,
    _finalGroup: string | undefined,
    target: DragSourceData | null,
  ) {
    if (source.type === "project") {
      const projects = useAppStore.getState().projects.filter((project) => !isHomeProject(project));
      const reorder = resolveProjectReorder({
        projects,
        source,
        target,
        initialIndex,
        finalIndex,
      });
      if (!reorder) return;
      startTransition(() => reorderProjects(source.projectId, reorder.targetId, reorder.placement));
    } else if (source.type === "thread") {
      if (findExperimentByThreadId(source.threadId)) return;
      const allThreads = useAppStore.getState().threads;
      const reorder = resolveThreadReorder({
        threads: allThreads,
        source,
        target,
        initialIndex,
        finalIndex,
      });
      if (!reorder) return;
      startTransition(() => reorderThreads(source.threadId, reorder.targetId, reorder.placement));
    }
  }

  function handlePaneDrop(source: DragSourceData, target: PaneDropIndicator | null) {
    if (!target) return;
    const currentView = useAppStore.getState().view;
    if (currentView.kind !== "thread") return;
    const panes = currentView.panes;

    if (source.type === "thread") {
      const threadId = source.threadId;
      if (findExperimentByThreadId(threadId)) return;
      if (panes.includes(threadId)) return;
      startTransition(() => {
        if (target.kind === "replace") replacePaneById(threadId, target.paneId);
        else if (target.kind === "split-pane") splitPaneById(threadId, target.paneId, target.edge);
        else insertPaneAtLayoutTarget(threadId, target.target);

        // If in group view, add dropped thread to the group
        if (currentView.activeGroupId) {
          const match = useAppStore
            .getState()
            .threads.find((t) => t.groupId === currentView.activeGroupId);
          const groupName = match?.groupName ?? match?.title;
          useAppStore.setState((state) => ({
            threads: state.threads.map((t) =>
              t.id === threadId
                ? {
                    ...t,
                    groupId: currentView.activeGroupId,
                    ...(groupName ? { groupName } : {}),
                  }
                : t,
            ),
          }));
        }
      });
    } else if (source.type === "pane") {
      const sourcePaneId = source.paneId;
      if (target.kind === "replace") {
        if (sourcePaneId === target.paneId) return;
        startTransition(() => swapPanes(sourcePaneId, target.paneId));
      } else if (target.kind === "split-pane") {
        if (sourcePaneId === target.paneId) return;
        startTransition(() =>
          movePaneToLayoutTarget(sourcePaneId, { paneId: target.paneId, edge: target.edge }),
        );
      } else {
        startTransition(() => movePaneToLayoutTarget(sourcePaneId, target.target));
      }
    } else if (source.type === "new-thread") {
      const draftPaneId = makeDraftPaneId(source.projectId);
      startTransition(() => {
        if (target.kind === "replace") replacePaneById(draftPaneId, target.paneId);
        else if (target.kind === "split-pane")
          splitPaneById(draftPaneId, target.paneId, target.edge);
        else insertPaneAtLayoutTarget(draftPaneId, target.target);
      });
    }
  }

  function handleMainPanelDrop(source: MainPanelDropSource) {
    if (source.type === "project") {
      showFilesPanel(source.projectId);
    } else if (source.type === "worktree-group") {
      showFilesPanel(source.projectId, source.worktreePath);
    } else if (source.panel === "files") {
      showFilesPanel(source.projectId, source.worktreePath);
    } else if (source.panel === "git") {
      showGitReviewPanel(source.projectId, source.worktreePath);
    } else {
      showTerminalPanel(source.projectId, source.worktreePath);
    }
  }

  return { handleSortEnd, handlePaneDrop, handleMainPanelDrop };
}
