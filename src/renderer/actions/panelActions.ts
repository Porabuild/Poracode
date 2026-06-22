import type { Thread } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { buildFileEditorContext, resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads } from "@/renderer/utils/shellUtils";

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

/** Open the docked usage panel, or close all right-side panels if it is already active. */
export function openUsagePanel(): void {
  const panelStore = usePanelStore.getState();
  if (panelStore.usagePanelOpen && panelStore.rightPanelTab === "usage") {
    closeAllPanels();
    return;
  }
  panelStore.openUsagePanel();
}

/** Open the docked notes panel, or close all right-side panels if it is already active. */
export function openNotesPanel(): void {
  const panelStore = usePanelStore.getState();
  if (panelStore.notesPanelOpen && panelStore.rightPanelTab === "notes") {
    closeAllPanels();
    return;
  }
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
    panelStore.setBrowserPanelOpen(true);
    panelStore.setRightPanelTab("browser");
  }
}

export function openProjectSettings(projectId: string): void {
  usePanelStore.getState().openProjectSettings(projectId);
}

/** Closes git/files side and right-panel content only. Does not hide the dev terminal (bottom or right). */
export function closeAllPanels(): void {
  usePanelStore.getState().closeAllPanels();
}

/** Dismiss every panel that can occupy the right edge — used by the overlay backdrop. */
export function dismissRightOverlay(): void {
  usePanelStore.getState().closeAllPanels();
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
  const hasDirtyBuffers = Object.values(fileEditor.buffers).some(
    (buffer) => buffer.status === "ready" && buffer.isDirty,
  );
  const isSameContext =
    currentRoot?.projectId === context.projectId &&
    currentRoot?.worktreePath === context.worktreePath;

  if (!isSameContext && hasDirtyBuffers && !window.confirm("Discard unsaved editor changes?")) {
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
      rightPanelTab === "files"
    ) {
      closeAllPanels();
      return;
    }
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

export function openGitReview(projectId: string, worktreePath?: string): void {
  const mode = useSharedSettings.getState().gitReviewMode;
  const panelStore = usePanelStore.getState();
  const gitReviewContext = panelStore.gitReviewContext;
  const gitPanelOpen = !!gitReviewContext && panelStore.gitReviewAsPanel;
  const rightPanelTab = panelStore.rightPanelTab;

  if (mode === "panel") {
    const isSameContext =
      gitPanelOpen &&
      gitReviewContext?.projectId === projectId &&
      gitReviewContext?.worktreePath === worktreePath;

    if (isSameContext && rightPanelTab === "git") {
      closeAllPanels();
      return;
    }
    panelStore.setGitReviewContext({ projectId, ...(worktreePath ? { worktreePath } : {}) });
    panelStore.setGitReviewAsPanel(true);
    panelStore.setRightPanelTab("git");
  } else {
    panelStore.setGitReviewContext({ projectId, ...(worktreePath ? { worktreePath } : {}) });
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

export function closeGitPanel(): void {
  usePanelStore.getState().setGitReviewContext(null);
}

export function openExternalUrl(url: string): void {
  void readBridge()
    .openExternal(url)
    .catch(() => undefined);
}
