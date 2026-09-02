import type { ProjectLocation, Thread } from "@/shared/contracts";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { toast } from "@heroui/react";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { hasDirtyEditorBuffers } from "@/renderer/state/fileEditorSelectors";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { isTabBottomDocked } from "@/renderer/state/panelDockSelectors";
import {
  DOCKABLE_PANEL_TABS,
  usePanelStore,
  type PanelDockTarget,
  type RightPanelTab,
  type ThreadDockKind,
} from "@/renderer/state/panelStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { buildFileEditorContext, resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads } from "@/renderer/utils/shellUtils";
import { resolveActivePaneId } from "./currentProject";
import { showTerminalPanel } from "./terminalActions";

function panelContextMatchesThread(
  projectId: string,
  worktreePath: string | undefined,
  ctxProjectId: string,
  ctxWorktreePath: string | undefined,
): boolean {
  if (ctxProjectId !== projectId) return false;
  if (worktreePath) return ctxWorktreePath === worktreePath;
  return ctxWorktreePath === undefined;
}

/** Clear git, files, file editor, and worktree dev-terminal tabs for this thread's project/worktree. */
export function closePanelsForUnloadedThread(thread: Thread): void {
  const { projectId, worktreePath } = thread;
  const panelStore = usePanelStore.getState();

  if (
    panelStore.gitReviewContext &&
    panelContextMatchesThread(
      projectId,
      worktreePath,
      panelStore.gitReviewContext.projectId,
      panelStore.gitReviewContext.worktreePath,
    )
  ) {
    panelStore.setGitOverlayOpen(false);
    panelStore.setGitReviewContext(null);
  }

  if (
    panelStore.filesPanelContext &&
    panelContextMatchesThread(
      projectId,
      worktreePath,
      panelStore.filesPanelContext.projectId,
      panelStore.filesPanelContext.worktreePath,
    )
  ) {
    panelStore.setFilesPanelContext(null);
  }

  if (panelStore.subAgentPanelContext?.threadId === thread.id) {
    panelStore.setSubAgentPanelContext(null);
  }

  const fileRoot = useFileEditorStore.getState().rootContext;
  if (
    fileRoot &&
    panelContextMatchesThread(projectId, worktreePath, fileRoot.projectId, fileRoot.worktreePath)
  ) {
    useFileEditorStore.getState().clearSession();
  }

  if (worktreePath) {
    const removedTabIds = useDevTerminalStore.getState().removeTabsForWorktree(worktreePath);
    if (removedTabIds.length > 0) {
      void closeThreads(removedTabIds);
    }
  }
}

export function openSettings(): void {
  usePanelStore.getState().openSettings();
}

export function openUsageSettings(): void {
  usePanelStore.getState().openSettingsSection("usage");
}

export function openRemoteAccessSettings(): void {
  usePanelStore.getState().openSettingsSection("remoteAccess");
}

export function openChangelogSettings(): void {
  usePanelStore.getState().openSettingsSection("changelog");
}

export function openWorkspaceSettings(): void {
  usePanelStore.getState().openSettingsSection("workspaces");
}

export function openMcpServersSettings(): void {
  usePanelStore.getState().openSettingsSection("mcpServers");
}

/** Open the docked usage panel, or close all right-side panels if it is already active. */
export function openUsagePanel(): void {
  const panelStore = usePanelStore.getState();
  // A docked Usage is not what the right panel is showing, so closing it here
  // would be a no-op the user can see; bring it back instead.
  if (
    panelStore.usagePanelOpen &&
    panelStore.rightPanelTab === "usage" &&
    !isTabBottomDocked("usage")
  ) {
    closeAllPanels();
    return;
  }
  undockPanelTab("usage");
  panelStore.openUsagePanel();
}

/** Open the docked notes panel, or close all right-side panels if it is already active. */
export function openNotesPanel(): void {
  const panelStore = usePanelStore.getState();
  if (
    panelStore.notesPanelOpen &&
    panelStore.rightPanelTab === "notes" &&
    !isTabBottomDocked("notes")
  ) {
    closeAllPanels();
    return;
  }
  undockPanelTab("notes");
  panelStore.openNotesPanel();
}

/**
 * Toggle the docked browser panel: reveal it (switching the right panel to the
 * browser tab) when it's hidden, or hide it when it's already the active right
 * panel. Backs both the `browser.toggle` command and the sidebar Globe button,
 * keeping the two entry points in lockstep.
 */
export function toggleBrowserPanel(): void {
  const panelStore = usePanelStore.getState();
  if (panelStore.browserPanelOpen && panelStore.rightPanelTab === "browser") {
    panelStore.setBrowserPanelOpen(false);
  } else {
    undockPanelTab("browser");
    panelStore.setBrowserPanelOpen(true);
    panelStore.setRightPanelTab("browser");
  }
}

export function openProjectSettings(projectId: string): void {
  const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
  const owner = remoteOwner(project);
  if (owner) {
    void useRemoteServersStore
      .getState()
      .loadProjectSettings(owner.desktopId, owner.remoteId)
      .catch((error) => toast.danger(friendlyError(error)));
  }
  usePanelStore.getState().openProjectSettings(projectId);
}

/**
 * Switch the global docks mode. Moving to the right panel opens the Docks tab
 * right away so the docks do not simply vanish from the composer; moving back
 * closes that tab (its content now lives above the composer again).
 */
export function setThreadDocksPlacement(placement: ThreadDocksPlacement): void {
  useSharedSettings.getState().setThreadDocksPlacement(placement);
  if (placement === "right") {
    usePanelStore.getState().openThreadDocksPanel();
  } else {
    usePanelStore.getState().setThreadDocksPanelOpen(false);
  }
}

/** Composer bubble click: show the Docks tab scrolled to one dock, or hide it if already showing. */
export function toggleThreadDocksPanel(focus: ThreadDockKind): void {
  const panelStore = usePanelStore.getState();
  if (
    panelStore.threadDocksPanelOpen &&
    panelStore.rightPanelTab === "docks" &&
    panelStore.threadDocksFocus === focus
  ) {
    closeAllPanels();
    return;
  }
  panelStore.openThreadDocksPanel(focus);
}

/** Close right-panel content. */
export function closeAllPanels(): void {
  // Bottom docks survive this (they are their own surface), but only while
  // there is a bottom row to hold them — drop stale slots first so they cannot
  // pin a panel's open flag from a row that no longer renders.
  if (useSharedSettings.getState().terminalPosition !== "bottom") {
    usePanelStore.getState().clearBottomPanelDocks();
  }
  usePanelStore.getState().closeAllPanels();
}

/** Show one subagent as a temporary right-panel tab beside its parent thread. */
export function showSubAgentPanel(
  threadId: string,
  parentItemId: string,
  projectLocation?: ProjectLocation,
): void {
  const panelStore = usePanelStore.getState();
  panelStore.setSubAgentPanelContext({
    threadId,
    parentItemId,
    ...(projectLocation ? { projectLocation } : {}),
  });
  panelStore.setRightPanelTab("subagent");
}

/** Dismiss every panel that can occupy the right edge — used by the overlay backdrop. */
export function dismissRightOverlay(): void {
  closeAllPanels();
  useDevTerminalStore.getState().closePanel();
}

function applyFilesPanel(
  projectId: string,
  worktreePath: string | undefined,
  options: { toggleCloseIfActive: boolean },
): void {
  const project = useAppStore.getState().projects.find((item) => item.id === projectId);
  if (!project) return;

  const context = buildFileEditorContext(
    project,
    worktreePath,
    worktreePath ? resolveWorktreeBranch(projectId, worktreePath) : undefined,
  );

  const fileEditor = useFileEditorStore.getState();
  const currentRoot = fileEditor.rootContext;
  const isSameContext =
    currentRoot?.projectId === context.projectId &&
    currentRoot?.worktreePath === context.worktreePath;

  if (
    !isSameContext &&
    hasDirtyEditorBuffers() &&
    !window.confirm("Discard unsaved editor changes?")
  ) {
    return;
  }

  if (!isSameContext) {
    fileEditor.setRootContext(context);
  }

  const panelStore = usePanelStore.getState();

  if (options.toggleCloseIfActive) {
    const filesPanelContext = panelStore.filesPanelContext;
    const rightPanelTab = panelStore.rightPanelTab;
    if (
      isSameContext &&
      filesPanelContext?.projectId === context.projectId &&
      filesPanelContext?.worktreePath === context.worktreePath &&
      rightPanelTab === "files" &&
      // A docked Files renders elsewhere, so `rightPanelTab` saying "files"
      // does not mean the user is looking at it here — toggling would close
      // nothing they can see. Pull it back into this panel instead.
      !isTabBottomDocked("files")
    ) {
      closeAllPanels();
      return;
    }
    undockPanelTab("files");
  }

  panelStore.setFilesPanelContext(context);
  panelStore.setRightPanelTab("files");
}

export function openFilesPanel(projectId: string, worktreePath?: string): void {
  applyFilesPanel(projectId, worktreePath, { toggleCloseIfActive: true });
}

export function showFilesPanel(projectId: string, worktreePath?: string): void {
  applyFilesPanel(projectId, worktreePath, { toggleCloseIfActive: false });
}

export function openGitReview(
  projectId: string,
  worktreePath?: string,
  originComposerId?: string,
): void {
  const mode = useSharedSettings.getState().gitReviewMode;
  const panelStore = usePanelStore.getState();
  const gitReviewContext = panelStore.gitReviewContext;
  const gitPanelOpen = !!gitReviewContext && panelStore.gitReviewAsPanel;
  const rightPanelTab = panelStore.rightPanelTab;
  const nextContext = {
    projectId,
    ...(worktreePath ? { worktreePath } : {}),
    ...(originComposerId ? { originComposerId } : {}),
  };

  if (mode === "panel") {
    const isSameContext =
      gitPanelOpen &&
      gitReviewContext?.projectId === projectId &&
      gitReviewContext?.worktreePath === worktreePath;

    // See `applyFilesPanel`: a docked Git is not what this panel is showing.
    if (isSameContext && rightPanelTab === "git" && !isTabBottomDocked("git")) {
      closeAllPanels();
      return;
    }
  }

  panelStore.setGitReviewContext(nextContext);
  if (mode === "panel") {
    undockPanelTab("git");
    panelStore.setGitReviewAsPanel(true);
    panelStore.setRightPanelTab("git");
  } else {
    panelStore.setGitReviewAsPanel(false);
    panelStore.setGitOverlayOpen(true);
  }
}

export function showGitReviewPanel(projectId: string, worktreePath?: string): void {
  const panelStore = usePanelStore.getState();
  panelStore.setGitReviewContext({ projectId, ...(worktreePath ? { worktreePath } : {}) });
  panelStore.setGitReviewAsPanel(true);
  panelStore.setGitOverlayOpen(false);
  panelStore.setRightPanelTab("git");
}

export function openGitOverlay(): void {
  usePanelStore.getState().setGitOverlayOpen(true);
}

/** Project/worktree scope of the focused thread, falling back to the first project. */
function resolveCurrentThreadScope(): { projectId: string; worktreePath?: string } | null {
  const appState = useAppStore.getState();
  if (appState.view.kind === "thread") {
    const paneId = resolveActivePaneId(appState.view.panes, appState.focusedPaneId);
    const thread = appState.threads.find((item) => item.id === paneId);
    if (thread) {
      return {
        projectId: thread.projectId,
        ...(thread.worktreePath ? { worktreePath: thread.worktreePath } : {}),
      };
    }
  }
  if (appState.view.kind === "draft" || appState.view.kind === "experiment") {
    return { projectId: appState.view.projectId };
  }
  const firstProject = appState.projects[0];
  return firstProject ? { projectId: firstProject.id } : null;
}

/**
 * Open the given tab's content without stealing the active right-panel tab.
 * The `show*` actions activate the tab they open; a drag-and-drop dock must
 * leave the active tab alone, so the pre-call tab is restored afterwards.
 */
function ensurePanelTabContent(tab: RightPanelTab): void {
  const panelStore = usePanelStore.getState();
  const previousTab = panelStore.rightPanelTab;
  switch (tab) {
    case "usage":
      panelStore.setUsagePanelOpen(true);
      return;
    case "notes":
      panelStore.setNotesPanelOpen(true);
      return;
    case "browser":
      panelStore.setBrowserPanelOpen(true);
      return;
    case "git": {
      if (panelStore.gitReviewContext) {
        panelStore.setGitReviewAsPanel(true);
        panelStore.setGitOverlayOpen(false);
        return;
      }
      const scope = resolveCurrentThreadScope();
      if (!scope) return;
      showGitReviewPanel(scope.projectId, scope.worktreePath);
      usePanelStore.getState().setRightPanelTab(previousTab);
      return;
    }
    case "files": {
      if (panelStore.filesPanelContext) return;
      const scope = resolveCurrentThreadScope();
      if (!scope) return;
      showFilesPanel(scope.projectId, scope.worktreePath);
      usePanelStore.getState().setRightPanelTab(previousTab);
      return;
    }
    case "terminal": {
      if (useDevTerminalStore.getState().isOpen) return;
      const scope = resolveCurrentThreadScope();
      if (!scope) return;
      showTerminalPanel(scope.projectId, scope.worktreePath);
      usePanelStore.getState().setRightPanelTab(previousTab);
      return;
    }
    default:
      return;
  }
}

/** Take a tab out of the right-panel split and any bottom dock slot holding it. */
export function undockPanelTab(tab: RightPanelTab): void {
  const panelStore = usePanelStore.getState();
  if (panelStore.rightPanelSplit?.tab === tab) panelStore.setRightPanelSplit(null);
  panelStore.clearBottomPanelDockTab(tab);
}

/** Apply a drag-and-drop dock of a right-panel tab icon onto a dock zone. */
export function dockPanelTab(tab: RightPanelTab, target: PanelDockTarget): void {
  if (!DOCKABLE_PANEL_TABS.has(tab)) return;
  if (target.zone === "bottom-panel") {
    // The terminal already owns the middle of the bottom row.
    if (tab === "terminal") return;
    const terminalStore = useDevTerminalStore.getState();
    const { left, right } = usePanelStore.getState().bottomPanelDocks;
    // Terminal can sit beside one dock (`left | terminal` or `terminal | right`),
    // but not both. When the opposite slot is free the terminal keeps the
    // remaining space; only close it when the other side is already filled.
    if (terminalStore.isOpen) {
      const oppositeOccupied = target.placement === "left" ? right !== null : left !== null;
      if (oppositeOccupied) terminalStore.closePanel();
    }
    ensurePanelTabContent(tab);
    const panelStore = usePanelStore.getState();
    if (panelStore.rightPanelSplit?.tab === tab) panelStore.setRightPanelSplit(null);
    panelStore.setBottomPanelDock(target.placement, tab);
    return;
  }
  ensurePanelTabContent(tab);
  const panelStore = usePanelStore.getState();
  panelStore.clearBottomPanelDockTab(tab);
  // The active tab cannot split with itself — pulling it back out is enough.
  if (panelStore.rightPanelTab === tab) {
    panelStore.setRightPanelSplit(null);
    return;
  }
  panelStore.setRightPanelSplit({ tab, placement: target.placement });
}

export function closeGitPanel(): void {
  usePanelStore.getState().setGitReviewContext(null);
}

export function openExternalUrl(url: string): void {
  void readBridge()
    .openExternal(url)
    .catch(() => undefined);
}
