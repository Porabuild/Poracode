import { useEffect, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import type { Project } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  productSurfaceView,
  useProductViewTracking,
} from "@/renderer/analytics/useProductViewTracking";
import { BrowserDockSlot } from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/BrowserDockSlot";
import {
  extractBrowserToWindow,
  injectBrowserToMain,
} from "@/renderer/views/MainView/parts/RightPanel/parts/BrowserPanel/browserWindowActions";
import { DevTerminalPanel } from "@/renderer/views/MainView/parts/RightPanel/parts/DevTerminalPanel/DevTerminalPanel";
import {
  UnifiedRightPanel,
  type RightPanelTab,
} from "@/renderer/components/layout/UnifiedRightPanel";
import { ProjectFilesPanel } from "@/renderer/views/FileEditorOverlay/parts/ProjectFilesPanel";
import { NotesPanel } from "@/renderer/views/MainView/parts/RightPanel/parts/NotesPanel/NotesPanel";
import { UsagePanel } from "@/renderer/views/MainView/parts/RightPanel/parts/UsagePanel/UsagePanel";
import { UsagePanelHeaderActions } from "@/renderer/views/MainView/parts/RightPanel/parts/UsagePanel/parts/UsagePanelHeaderActions";
import {
  SubAgentContent,
  SubAgentHeaderText,
} from "@/renderer/components/thread/ChatPane/parts/items/SubAgentOverlay";
import { ThreadTodoDock } from "@/renderer/components/thread/ThreadTodoDock";
import { selectThreadTodoDockState } from "@/renderer/components/thread/threadTodoState";
import { useAppStore } from "@/renderer/state/appStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore, type FileEditorRootContext } from "@/renderer/state/fileEditorStore";
import {
  usePanelStore,
  type FilesPanelContext,
  type GitReviewContext,
} from "@/renderer/state/panelStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { watchRemoteTerminal } from "@/renderer/state/remoteTerminalFeed";
import { prefetchVisibleGitPanelPrData } from "@/renderer/state/gitRefresh";
import {
  closeAllPanels,
  moveThreadTodoDock,
  showFilesPanel,
  showGitReviewPanel,
} from "@/renderer/actions/panelActions";
import { showTerminalPanel } from "@/renderer/actions/terminalActions";
import { getCurrentProjectId } from "@/renderer/actions/currentProject";
import { selectFocusedThreadId, useFocusedThreadId } from "@/renderer/hooks/uiSelectors";
import { syncRightPanelTabToFocusedThread } from "@/renderer/hooks/useRightPanelThreadLock";
import { buildFileEditorContext } from "@/renderer/utils/gitHelpers";
import { formatProjectScopeLabel } from "@/renderer/utils/projectScopeLabel";
import { GitReviewPanelContent } from "./RightPanel/parts/GitReviewPanelContent";

interface PanelProjectScope {
  projectId: string;
  worktreePath?: string;
}

function scopeFromGitContext(context: GitReviewContext | null): PanelProjectScope | null {
  if (!context) return null;
  return {
    projectId: context.projectId,
    ...(context.worktreePath ? { worktreePath: context.worktreePath } : {}),
  };
}

function scopeFromFilesContext(context: FileEditorRootContext | null): PanelProjectScope | null {
  if (!context) return null;
  return {
    projectId: context.projectId,
    ...(context.worktreePath ? { worktreePath: context.worktreePath } : {}),
  };
}

function resolveFilesRootContext(
  context: FilesPanelContext | null,
  projects: Project[],
): FileEditorRootContext | null {
  if (!context) return null;
  const project = projects.find((p) => p.id === context.projectId);
  if (!project) return null;
  return {
    ...buildFileEditorContext(project, context.worktreePath),
    rootLabel: context.rootLabel,
  };
}

export function ProjectAuxiliaryPanel(props: { includeTerminal: boolean; visible: boolean }) {
  const { t } = useLingui();
  const projects = useAppStore((s) => s.projects);
  const gitReviewContext = usePanelStore((s) => s.gitReviewContext);
  const gitReviewAsPanel = usePanelStore((s) => s.gitReviewAsPanel);
  const filesPanelContext = usePanelStore((s) => s.filesPanelContext);
  const subAgentPanelContext = usePanelStore((s) => s.subAgentPanelContext);
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab);
  const rightPanelFollowsThread = usePanelStore((s) => s.rightPanelFollowsThread);
  const toggleRightPanelFollowsThread = usePanelStore((s) => s.toggleRightPanelFollowsThread);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const browserExtracted = useBrowserPanelStore((s) => s.extracted);
  const usagePanelOpen = usePanelStore((s) => s.usagePanelOpen);
  const setUsagePanelOpen = usePanelStore((s) => s.setUsagePanelOpen);
  const notesPanelOpen = usePanelStore((s) => s.notesPanelOpen);
  const setNotesPanelOpen = usePanelStore((s) => s.setNotesPanelOpen);
  // Reactive id of the project the notes panel should show — recomputed (and
  // re-rendered) as the user navigates between threads/drafts/projects.
  const currentProjectId = useAppStore(() => getCurrentProjectId());
  const setBrowserPanelOpen = usePanelStore((s) => s.setBrowserPanelOpen);
  const setBrowserOverlayOpen = usePanelStore((s) => s.setBrowserOverlayOpen);
  const setBrowserOverlayMaximized = usePanelStore((s) => s.setBrowserOverlayMaximized);
  const setGitReviewContext = usePanelStore((s) => s.setGitReviewContext);
  const setGitOverlayOpen = usePanelStore((s) => s.setGitOverlayOpen);
  const setFileEditorOverlayMode = useFileEditorStore((s) => s.setOverlayMode);
  const terminalOpen = useDevTerminalStore((s) => s.isOpen);
  const terminalProjectId = useDevTerminalStore((s) => s.activeProjectId);
  const terminalWorktreePath = useDevTerminalStore((s) => s.activeWorktreePath);
  const terminalProject = projects.find((project) => project.id === terminalProjectId);
  const currentThreadId = useFocusedThreadId();
  const todoDockPlacement = useThreadTodoDockStore((state) =>
    currentThreadId
      ? (state.byThreadId[currentThreadId]?.placement ?? state.defaultPlacement)
      : "composer",
  );
  const todoDockCollapsed = useThreadTodoDockStore((state) =>
    currentThreadId
      ? (state.byThreadId[currentThreadId]?.collapsed ?? state.defaultCollapsed)
      : false,
  );
  const retiredTodoSourceItemId = useThreadTodoDockStore((state) =>
    currentThreadId ? state.byThreadId[currentThreadId]?.retiredSourceItemId : undefined,
  );
  const todoDockState = useAppStore((state) =>
    currentThreadId && todoDockPlacement === "right"
      ? selectThreadTodoDockState(state, currentThreadId)
      : null,
  );

  const gitPanelOpen = !!gitReviewContext && gitReviewAsPanel;
  const filesPanelOpen = filesPanelContext !== null;
  const subAgentItemExists = useAppStore((state) =>
    subAgentPanelContext
      ? state.runtimeItemsByIdByThread[subAgentPanelContext.threadId]?.[
          subAgentPanelContext.parentItemId
        ] !== undefined
      : false,
  );
  const subAgentInCurrentThread =
    subAgentPanelContext !== null &&
    subAgentPanelContext.threadId === currentThreadId &&
    subAgentItemExists;
  const planInCurrentThread =
    currentThreadId !== null &&
    todoDockPlacement === "right" &&
    todoDockState !== null &&
    todoDockState.sourceItemId !== retiredTodoSourceItemId;

  const previousGitReviewContextRef = useRef<GitReviewContext | null>(null);
  const gitReviewContextChanged = previousGitReviewContextRef.current !== gitReviewContext;
  previousGitReviewContextRef.current = gitReviewContext;

  const lastGitPanelContextRef = useRef(gitReviewContext);
  if (gitReviewContext && gitReviewAsPanel) {
    lastGitPanelContextRef.current = gitReviewContext;
  }
  const gitPanelContext = gitPanelOpen ? gitReviewContext : lastGitPanelContextRef.current;

  const lastFilesPanelContextRef = useRef(filesPanelContext);
  if (filesPanelContext) {
    lastFilesPanelContextRef.current = filesPanelContext;
  }
  const rawFilesPanelContext = filesPanelOpen
    ? filesPanelContext
    : lastFilesPanelContextRef.current;
  const resolvedFilesPanelContext = resolveFilesRootContext(rawFilesPanelContext, projects);

  const requestedTab: RightPanelTab = props.includeTerminal
    ? rightPanelTab === "ports"
      ? "git"
      : rightPanelTab
    : rightPanelTab === "files" ||
        rightPanelTab === "browser" ||
        rightPanelTab === "usage" ||
        rightPanelTab === "notes" ||
        rightPanelTab === "plan" ||
        rightPanelTab === "subagent"
      ? rightPanelTab
      : "git";

  function requestedTabIsAvailable(): boolean {
    if (requestedTab === "subagent") return subAgentInCurrentThread;
    if (requestedTab === "plan") return planInCurrentThread;
    // The browser panel is dismissed out-of-band when its last tab closes (the
    // browser sync clears browserPanelOpen but leaves rightPanelTab pointing at
    // "browser"), so it must honor its open flag even when no plan is present —
    // otherwise the panel stays open on an empty browser layer.
    if (requestedTab === "browser") return browserPanelOpen;
    if (!planInCurrentThread) return true;
    if (requestedTab === "terminal") return terminalOpen;
    if (requestedTab === "files") return filesPanelOpen;
    if (requestedTab === "git") return gitPanelOpen;
    if (requestedTab === "usage") return usagePanelOpen;
    return requestedTab === "notes" && notesPanelOpen;
  }

  function fallbackActiveTab(): RightPanelTab {
    if (planInCurrentThread) return "plan";
    if (subAgentInCurrentThread) return "subagent";
    if (filesPanelOpen) return "files";
    if (gitPanelOpen) return "git";
    if (browserPanelOpen) return "browser";
    if (usagePanelOpen) return "usage";
    if (notesPanelOpen) return "notes";
    if (props.includeTerminal && terminalOpen) return "terminal";
    return "git";
  }

  const activeTab = requestedTabIsAvailable() ? requestedTab : fallbackActiveTab();
  useEffect(() => {
    if (!props.visible) return;
    let refreshTimer: number | undefined;
    const frame = requestAnimationFrame(() => {
      // A new git context is an explicit target (for example, clicking thread
      // B's badge while thread A is focused). Let that open win; the follow
      // lock will take over again on the next thread or tab change.
      if (activeTab !== "git" || !gitReviewContextChanged) {
        syncRightPanelTabToFocusedThread(activeTab);
      }
      if (activeTab !== "git") return;

      // Let the thread and linked-panel frames paint before paying for PR I/O.
      // The prefetch itself gates on gh availability + GitHub remote, and also
      // throttles and deduplicates per project.
      refreshTimer = window.setTimeout(() => {
        const app = useAppStore.getState();
        if (selectFocusedThreadId(app) !== currentThreadId) return;
        const thread = app.threads.find((item) => item.id === currentThreadId);
        if (!thread || isHomeProjectId(thread.projectId)) return;
        void prefetchVisibleGitPanelPrData(thread.projectId, thread.worktreePath);
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [
    activeTab,
    currentThreadId,
    gitReviewContext,
    gitReviewContextChanged,
    props.visible,
    rightPanelFollowsThread,
  ]);
  useProductViewTracking(productSurfaceView(activeTab, "panel"), "panel", {
    active: props.visible,
    finishWhenInactive: true,
  });

  const gitScope = scopeFromGitContext(gitPanelContext);
  const filesScope = scopeFromFilesContext(resolvedFilesPanelContext);
  const terminalScope: PanelProjectScope | null = terminalProjectId
    ? {
        projectId: terminalProjectId,
        ...(terminalWorktreePath ? { worktreePath: terminalWorktreePath } : {}),
      }
    : null;

  function fallbackScope(): PanelProjectScope | null {
    const firstProject = projects[0];
    return firstProject ? { projectId: firstProject.id } : null;
  }

  function activeProjectScope(): PanelProjectScope | null {
    if (activeTab === "terminal") return terminalScope ?? filesScope ?? gitScope;
    if (activeTab === "files") return filesScope ?? gitScope ?? terminalScope;
    if (activeTab === "git") return gitScope ?? filesScope ?? terminalScope;
    return filesScope ?? gitScope ?? terminalScope;
  }

  function projectNameForScope(scope: PanelProjectScope | null): string | undefined {
    if (!scope) return undefined;
    return projects.find((p) => p.id === scope.projectId)?.name;
  }

  const notesProjectId = currentProjectId ?? resolveNextProjectScope()?.projectId;

  function resolveProjectName(): string | undefined {
    switch (activeTab) {
      case "browser":
        return t`Browser`;
      case "usage":
        return t`Usage`;
      case "notes":
        return notesProjectId ? projectNameForScope({ projectId: notesProjectId }) : t`Notes`;
      case "terminal": {
        const terminalProjectName = projectNameForScope(terminalScope);
        return terminalProjectName
          ? formatProjectScopeLabel(terminalProjectName, terminalWorktreePath ?? undefined)
          : undefined;
      }
      case "subagent":
      case "plan":
        return undefined;
      case "files":
        return resolvedFilesPanelContext?.rootLabel ?? projectNameForScope(activeProjectScope());
      default:
        return projectNameForScope(activeProjectScope());
    }
  }
  const projectName = resolveProjectName();
  const isHomeScope = isHomeProjectId(activeProjectScope()?.projectId);

  function resolveNextProjectScope(): PanelProjectScope | null {
    return activeProjectScope() ?? fallbackScope();
  }

  function handleOpenGit() {
    const scope = resolveNextProjectScope();
    if (!scope) return;
    showGitReviewPanel(scope.projectId, scope.worktreePath);
  }

  function handleOpenFiles() {
    const scope = resolveNextProjectScope();
    if (!scope) return;
    showFilesPanel(scope.projectId, scope.worktreePath);
  }

  function handleOpenTerminal() {
    const scope = resolveNextProjectScope();
    if (!scope) return;
    showTerminalPanel(scope.projectId, scope.worktreePath);
  }

  function handleClose() {
    if (props.includeTerminal) {
      useDevTerminalStore.getState().closePanel();
    }
    closeAllPanels();
  }

  function handleCloseSubAgent() {
    usePanelStore.getState().setSubAgentPanelContext(null);
    handleClose();
  }

  const renderTerminalContent = props.includeTerminal && terminalOpen;
  const renderGitContent = gitPanelOpen;
  const renderFilesContent = filesPanelOpen;
  const renderBrowserContent = browserPanelOpen;
  const renderUsageContent = usagePanelOpen;
  const renderNotesContent = notesPanelOpen && notesProjectId !== undefined;
  const renderPlanContent = planInCurrentThread;
  const renderSubAgentContent = subAgentInCurrentThread;

  return (
    <UnifiedRightPanel
      activeTab={activeTab}
      onTabChange={(tab) => {
        if (tab === "subagent" && !renderSubAgentContent) return;
        if (tab === "plan" && !renderPlanContent) return;
        setRightPanelTab(tab);
      }}
      {...(renderTerminalContent
        ? {
            terminalContent: (
              <DevTerminalPanel
                hideHeader
                {...(terminalProject?.remoteServerId
                  ? {
                      watchTerminal: (terminalId, listener) =>
                        watchRemoteTerminal(terminalProject.remoteServerId!, terminalId, listener),
                    }
                  : {})}
              />
            ),
          }
        : {})}
      gitContent={
        renderGitContent ? (
          <GitReviewPanelContent
            gitPanelContext={gitPanelContext}
            onClose={() => setGitReviewContext(null)}
            onExpandToOverlay={() => setGitOverlayOpen(true)}
          />
        ) : undefined
      }
      filesContent={
        renderFilesContent && resolvedFilesPanelContext ? (
          <ProjectFilesPanel rootContext={resolvedFilesPanelContext} />
        ) : undefined
      }
      browserContent={
        renderBrowserContent ? (
          <BrowserDockSlot
            extracted={browserExtracted}
            onBringBack={injectBrowserToMain}
            onFocusWindow={extractBrowserToWindow}
          />
        ) : undefined
      }
      usageContent={renderUsageContent ? <UsagePanel /> : undefined}
      notesContent={
        renderNotesContent && notesProjectId ? (
          <NotesPanel key={notesProjectId} projectId={notesProjectId} />
        ) : undefined
      }
      {...(renderPlanContent && currentThreadId && todoDockState
        ? {
            planContent: (
              <ThreadTodoDock
                collapsed={todoDockCollapsed}
                placement="right"
                state={todoDockState}
                onCollapsedChange={(collapsed) =>
                  useThreadTodoDockStore.getState().setCollapsed(currentThreadId, collapsed)
                }
                onPlacementChange={(placement) => moveThreadTodoDock(currentThreadId, placement)}
                onRetire={() =>
                  useThreadTodoDockStore
                    .getState()
                    .retire(currentThreadId, todoDockState.sourceItemId)
                }
              />
            ),
          }
        : {})}
      subagentContent={
        renderSubAgentContent ? (
          <SubAgentContent
            key={`${subAgentPanelContext.threadId}:${subAgentPanelContext.parentItemId}`}
            threadId={subAgentPanelContext.threadId}
            parentItemId={subAgentPanelContext.parentItemId}
            hideHeader
            {...(subAgentPanelContext.projectLocation
              ? { projectLocation: subAgentPanelContext.projectLocation }
              : {})}
          />
        ) : undefined
      }
      usageHeaderActions={
        <UsagePanelHeaderActions dragControlClass="poracode-overlay-header__controls" />
      }
      showTerminalTab={props.includeTerminal}
      showFilesTab={!isHomeScope}
      showGitTab={!isHomeScope}
      showNotesTab={notesProjectId !== undefined}
      showPlanTab={renderPlanContent}
      showSubagentTab={renderSubAgentContent}
      {...(renderSubAgentContent
        ? {
            subagentModel: (
              <SubAgentHeaderText
                threadId={subAgentPanelContext.threadId}
                parentItemId={subAgentPanelContext.parentItemId}
                compact
                part="description"
              />
            ),
            subagentTitle: (
              <SubAgentHeaderText
                threadId={subAgentPanelContext.threadId}
                parentItemId={subAgentPanelContext.parentItemId}
                compact
                part="title"
              />
            ),
            onCloseSubagent: handleCloseSubAgent,
          }
        : {})}
      projectName={projectName}
      onExpandGitToOverlay={() => setGitOverlayOpen(true)}
      onExpandFilesToOverlay={() => setFileEditorOverlayMode("fullscreen")}
      onExpandBrowserToOverlay={() => {
        setBrowserOverlayMaximized(true);
        setBrowserOverlayOpen(true);
      }}
      onExtractBrowserToWindow={extractBrowserToWindow}
      onOpenGit={handleOpenGit}
      onOpenFiles={handleOpenFiles}
      {...(props.includeTerminal ? { onOpenTerminal: handleOpenTerminal } : {})}
      onOpenBrowser={() => {
        if (browserExtracted) {
          extractBrowserToWindow();
          return;
        }
        setBrowserPanelOpen(true);
        setRightPanelTab("browser");
      }}
      onOpenUsage={() => {
        setUsagePanelOpen(true);
        setRightPanelTab("usage");
      }}
      onOpenNotes={() => {
        setNotesPanelOpen(true);
        setRightPanelTab("notes");
      }}
      followsThread={rightPanelFollowsThread}
      onToggleFollowsThread={toggleRightPanelFollowsThread}
      onClose={handleClose}
    />
  );
}
