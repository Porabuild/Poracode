import { useShallow } from "zustand/shallow";
import { X } from "lucide-react";
import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type {
  ExtractContextResult,
  Project,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { friendlyError } from "@/shared/messages";
import { isHomeProject } from "@/shared/homeScope";
import { buildWorktreeLocation } from "@/shared/worktree";
import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { buildPaneLayoutFromLegacy, findPaneAlign } from "@/shared/paneLayout";
import { titlePromptFromSegments } from "@/shared/threadTitle";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import {
  isDetectingAgentsForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { getProjectActiveWorktreePaths, refreshGitProject } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  useInitialProjectDraftConfig,
  useProjectIds,
  useProjectWithoutDraftConfig,
} from "@/renderer/state/useThread";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { closeAllPanels } from "@/renderer/actions/panelActions";
import { worktreePlacementPayload } from "@/renderer/actions/worktreePlacement";
import { SplitPaneContainer, type Rect } from "@/renderer/components/layout/SplitPaneContainer";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import {
  normalizeShellScript,
  startShellWithToast,
  writeScriptToShellThenExitOnSuccess,
} from "@/renderer/utils/shellUtils";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { HomeView } from "@/renderer/views/HomeView";
import { SchedulesView } from "@/renderer/views/SchedulesView/SchedulesView";
import { buildProjectDraftConfig } from "./draftConfig";
import { ThreadPane } from "./parts/ThreadPane";
import { DraftPane } from "./parts/DraftPane";

export async function startThreadFromDraft(
  project: Project,
  input: DraftStartInput,
  options: { replacePaneId?: string; preserveActiveGroup?: boolean } = {},
): Promise<void> {
  const {
    agentKind,
    config,
    prompt,
    segments,
    existingWorktreePath,
    worktreeBranch,
    worktreeBaseBranch,
    worktreeIsNewBranch,
    worktreeTransferUncommitted,
    presentationMode,
  } = input;
  const isHomeScope = isHomeProject(project);
  const store = useAppStore.getState();

  store.updateProjectDraftConfig(
    project.id,
    buildProjectDraftConfig({
      agentKind,
      config,
      worktreeMode: !isHomeScope && worktreeIsNewBranch === true,
    }),
  );

  let worktreePath: string | undefined;
  let newWorktreeSetupPath: string | undefined;
  if (isHomeScope) {
    worktreePath = undefined;
  } else if (existingWorktreePath) {
    worktreePath = existingWorktreePath;
  } else if (worktreeBranch) {
    try {
      const result = await readBridge().gitAddWorktree({
        projectLocation: project.location,
        branch: worktreeBranch,
        createBranch: worktreeIsNewBranch ?? false,
        startPoint: worktreeBaseBranch,
        ...worktreePlacementPayload(project),
        copyIgnoredPatterns: project.scripts?.worktreeCopyPatterns,
        transferUncommitted: worktreeTransferUncommitted ?? false,
        keepChangesInSource: worktreeTransferUncommitted ?? false,
      });
      worktreePath = result.path;
      newWorktreeSetupPath = result.path;
      if (worktreeTransferUncommitted && result.changesTransferred === false) {
        toast.danger(
          i18n._(
            msg`Couldn't copy your uncommitted changes into the new worktree — they remain on the current branch.`,
          ),
        );
      }
    } catch (error) {
      console.error("[renderer] failed to create worktree:", error);
      toast.danger(friendlyError(error));
      throw error;
    }
  }

  const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    agentStatuses,
    wslAgentStatuses,
  );
  const titlePrompt = titlePromptFromSegments(prompt, segments);
  const currentView = store.view;
  const activeGroup =
    options.preserveActiveGroup !== false &&
    currentView.kind === "thread" &&
    currentView.activeGroupId
      ? {
          groupId: currentView.activeGroupId,
          groupName: store.threads.find((thread) => thread.groupId === currentView.activeGroupId)
            ?.groupName,
        }
      : undefined;

  const thread = store.createThread({
    projectId: project.id,
    agentKind,
    config,
    prompt: titlePrompt,
    ...(presentationMode ? { presentationMode } : {}),
    ...(worktreePath ? { worktreePath, ...(worktreeBranch ? { worktreeBranch } : {}) } : {}),
    ...(options.replacePaneId ? { replacePaneId: options.replacePaneId } : {}),
    ...(activeGroup?.groupId ? { groupId: activeGroup.groupId } : {}),
    ...(activeGroup?.groupName ? { groupName: activeGroup.groupName } : {}),
  });
  store.queueThreadLaunch(thread.id, prompt, segments);
  generateTitleAsync(thread.id, project.location, projectAgentStatuses, titlePrompt);
  if (worktreePath) {
    void primeWorktreeGitState(project, worktreePath);
    void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");
  }
  if (newWorktreeSetupPath) {
    const setupScript = project.scripts?.setupScript;
    if (setupScript) runWorktreeSetupScript(project, newWorktreeSetupPath, setupScript);
  }
}

export function AppContent() {
  const { t } = useLingui();
  const view = useAppStore((state) => state.view);
  const projectIds = useProjectIds();
  const draftProjectId = view.kind === "draft" ? view.projectId : undefined;
  const draftProject = useProjectWithoutDraftConfig(draftProjectId);
  const draftLastDraftConfig = useInitialProjectDraftConfig(draftProjectId);
  const createThread = useAppStore((state) => state.createThread);
  const queueThreadLaunch = useAppStore((state) => state.queueThreadLaunch);
  const activeGroupName = useAppStore((s) => {
    const v = s.view;
    if (v.kind !== "thread" || !v.activeGroupId) return undefined;
    const match = s.threads.find((thread) => thread.groupId === v.activeGroupId);
    return match?.groupName ?? match?.title ?? t`Group`;
  });
  async function handleContinueInProvider(
    sourceThread: Thread,
    targetAgentKind: string,
    targetConfig: ThreadConfig,
    targetPresentationMode: ThreadPresentationMode,
    prompt: string,
    segments: PromptSegment[] | undefined,
    closeOriginal: boolean,
    extractedContext: ExtractContextResult | null,
  ) {
    const storeProjects = useAppStore.getState().projects;
    const project = storeProjects.find((p) => p.id === sourceThread.projectId);
    if (!project) return;

    let groupId: string | undefined;
    let groupName: string | undefined;
    if (!closeOriginal) {
      groupId = sourceThread.groupId ?? crypto.randomUUID();
      groupName = sourceThread.groupName ?? sourceThread.title;
      if (!sourceThread.groupId) {
        useAppStore.setState((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === sourceThread.id ? { ...thread, groupId, groupName } : thread,
          ),
        }));
      }
    }

    const thread = createThread({
      projectId: project.id,
      agentKind: targetAgentKind,
      config: targetConfig,
      prompt,
      presentationMode: targetPresentationMode,
      ...(sourceThread.worktreePath ? { worktreePath: sourceThread.worktreePath } : {}),
      ...(sourceThread.worktreeBranch ? { worktreeBranch: sourceThread.worktreeBranch } : {}),
      ...(groupId ? { groupId } : {}),
      ...(groupName ? { groupName } : {}),
    });

    if (extractedContext) {
      try {
        const filePath = await readBridge().saveHandoffContext({
          threadId: thread.id,
          content: extractedContext.summary,
        });
        const handoffPrompt = `This task was handed off from a ${extractedContext.sourceProvider} session. Use the attached context file as prior conversation context.`;
        const launchSegments: PromptSegment[] = [
          { kind: "text", content: `${handoffPrompt}\n\n` },
          { kind: "attachment", path: filePath, mimeType: "text/markdown" },
          { kind: "text", content: "\n\n" },
          ...(segments ?? [{ kind: "text" as const, content: prompt }]),
        ];
        queueThreadLaunch(thread.id, `${handoffPrompt}\n\n${prompt}`, launchSegments);
      } catch {
        const fallbackPrompt = `[Context from previous ${extractedContext.sourceProvider} session]\n\n${extractedContext.summary}\n\n${prompt}`;
        const fallbackSegments: PromptSegment[] = [
          {
            kind: "text",
            content: `[Context from previous ${extractedContext.sourceProvider} session]\n\n${extractedContext.summary}\n\n`,
          },
          ...(segments ?? [{ kind: "text" as const, content: prompt }]),
        ];
        queueThreadLaunch(thread.id, fallbackPrompt, fallbackSegments);
      }
    } else {
      queueThreadLaunch(thread.id, prompt, segments);
    }

    if (closeOriginal) {
      readBridge()
        .closeThread({ threadId: sourceThread.id })
        .catch(() => {});
      const store = useAppStore.getState();
      const sourceVisible =
        store.view.kind === "thread" && store.view.panes.includes(sourceThread.id);
      if (sourceVisible) {
        store.replacePaneId(sourceThread.id, thread.id);
      } else {
        store.openThread(thread.id);
      }
      useAppStore.getState().markThreadDone(sourceThread.id);
    } else {
      useAppStore.getState().openThreadSideBySide(thread.id);
    }

    const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
    const agents = getProjectAgentStatuses(project.location, agentStatuses, wslAgentStatuses);
    generateTitleAsync(thread.id, project.location, agents, prompt);

    const targetLabel = agents.find((a) => a.kind === targetAgentKind)?.label ?? targetAgentKind;
    toast.success(
      extractedContext
        ? t`Context transferred to ${targetLabel}`
        : t`Started ${targetLabel} thread`,
    );
  }

  if (view.kind === "schedules") {
    return (
      <div className="h-full overflow-y-auto px-6 pb-8 pt-4 [scrollbar-gutter:stable]">
        <SchedulesView />
      </div>
    );
  }

  if (view.kind === "draft") {
    if (!draftProject) {
      return <HomeView />;
    }
    return (
      <div className="h-full">
        <DraftViewContent
          key={draftProject.id}
          project={draftProject}
          lastDraftConfig={draftLastDraftConfig}
          onStart={(input) => startThreadFromDraft(draftProject, input)}
        />
      </div>
    );
  }

  if (view.kind === "thread") {
    const closePane = useAppStore.getState().closePane;
    const paneCount = view.panes.length;
    const paneLayout = view.paneLayout ?? buildPaneLayoutFromLegacy(view.panes, view.rowLayout);
    // Non-subscribing read: threads / projects array identity isn't worth
    // a re-render here — pane deletion always updates view.panes atomically.
    const storeThreads = useAppStore.getState().threads;
    const hasValidPanes = view.panes.some((id) =>
      isDraftPaneId(id)
        ? projectIds.includes(parseDraftProjectId(id) ?? "")
        : storeThreads.some((thread) => thread.id === id),
    );

    if (!hasValidPanes) {
      return (
        <div className="h-full">
          <HomeView />
        </div>
      );
    }
    const activeGroupId = view.activeGroupId;
    const hasGroupHeader = !!(activeGroupId && activeGroupName);

    function renderPane(paneId: string, rect: Rect) {
      const paneDraftProjectId = parseDraftProjectId(paneId);
      const paneAlign = findPaneAlign(paneLayout, paneId);
      // Only the top-left pane's own header is the topmost row in the content
      // area when there's no group header — that's when it needs traffic-light
      // padding on macOS. Pure layout fact: doesn't change on collapse/expand.
      const headerNeedsTrafficLightPad = rect.left === 0 && rect.top === 0 && !hasGroupHeader;
      const paneContent = paneDraftProjectId ? (
        <DraftPane
          key={paneId}
          paneId={paneId}
          projectId={paneDraftProjectId}
          paneCount={paneCount}
          paneAlign={paneAlign}
          headerNeedsTrafficLightPad={headerNeedsTrafficLightPad}
          onClose={() => closePane(paneId)}
          onStart={(project, input) =>
            startThreadFromDraft(project, input, { replacePaneId: paneId })
          }
        />
      ) : (
        <ThreadPane
          key={paneId}
          threadId={paneId}
          paneCount={paneCount}
          paneAlign={paneAlign}
          headerNeedsTrafficLightPad={headerNeedsTrafficLightPad}
          onClose={() => closePane(paneId)}
          onContinueInProvider={(...args) => void handleContinueInProvider(...args)}
        />
      );
      return (
        <div
          key={paneId}
          className="h-full outline-none"
          tabIndex={-1}
          onFocusCapture={() => useAppStore.getState().setFocusedPane(paneId)}
        >
          {paneContent}
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        {activeGroupId && activeGroupName && (
          <div
            className={`poracode-content-over-drag-region ${macosTrafficLightPadClass} flex h-[env(titlebar-area-height,32px)] shrink-0 items-center gap-1 border-b border-[var(--hairline)] px-2`}
          >
            <span className="truncate text-xs font-medium text-muted">{activeGroupName}</span>
            <button
              type="button"
              aria-label={t`Close group`}
              className="shrink-0 rounded p-0.5 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
              onClick={() => useAppStore.getState().closeGroupView()}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <SplitPaneContainer layout={paneLayout} renderPane={renderPane} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <HomeView />
    </div>
  );
}

export async function primeWorktreeGitState(project: Project, worktreePath: string): Promise<void> {
  const worktreePaths = [
    ...new Set([...getProjectActiveWorktreePaths(project.id), worktreePath]),
  ].sort();
  const watchWorktrees = readBridge()
    .gitWatchWorktrees({ projectId: project.id, worktreePaths })
    .catch(() => undefined);
  if (project.location.kind === "wsl") return;
  await watchWorktrees;
  void readBridge()
    .getGitStatus({ projectLocation: buildWorktreeLocation(project.location, worktreePath) })
    .then((status) => useGitStore.getState().setWorktreeStatus(worktreePath, status))
    .catch(() => undefined);
}

export function runWorktreeSetupScript(
  project: Project,
  worktreePath: string,
  setupScript: string,
): void {
  // Blank / comments-only scripts have nothing to run — skip the terminal
  // entirely rather than leaving an idle "setup" shell behind.
  if (!normalizeShellScript(setupScript)) return;

  const wtLocation = buildWorktreeLocation(project.location, worktreePath);
  const store = useDevTerminalStore.getState();
  const tab = store.addTab(project.id, "setup", worktreePath);
  const autoShow = useSharedSettings.getState().autoShowTerminalPanel;
  const panelAlreadyOpen = store.isOpen;
  if (autoShow) {
    store.openWorktreePanel(project.id, worktreePath);
  }
  store.setActiveTab(tab.id);

  // When the terminal panel is (or becomes) visible, every tab mounts its own
  // XTermSurface, which spawns the PTY itself at the measured viewport size.
  // Spawning eagerly too would create a second PTY for the same shell id and
  // race it, re-running the setup chain. Only spawn eagerly when the panel
  // stays closed (no surface ever mounts), where this is the sole spawn.
  if (!autoShow && !panelAlreadyOpen) {
    startShellWithToast(
      {
        shellId: tab.id,
        projectLocation: wtLocation,
        worktreePath,
      },
      "setup shell",
    );
  }

  // Auto-close the setup terminal once every command succeeds (the script
  // self-exits) so worktrees don't accumulate stale shells. A failed setup
  // stops short of the exit and leaves the shell open for inspection.
  const detach = writeScriptToShellThenExitOnSuccess(tab.id, setupScript, wtLocation.kind, () =>
    removeWorktreeSetupTab(tab),
  );
  // If the tab is closed before setup finishes (manual close, worktree
  // deletion), `closeThread` suppresses `thread-exited`, so detach the exit
  // listener here instead of leaking it for the rest of the session.
  const unsubscribeTabs = useDevTerminalStore.subscribe((state, prev) => {
    if (state.tabs === prev.tabs) return;
    if (state.tabs.some((t) => t.id === tab.id)) return;
    detach();
    unsubscribeTabs();
  });
}

/**
 * Removes a finished setup terminal tab. The PTY has already exited (success or
 * a manual `exit`), so the supervisor session is gone — removing the tab is
 * sufficient and `closeThread` would be a no-op. If the setup tab was the only
 * one in the worktree context the panel is showing, close the panel too so the
 * auto-opened panel doesn't linger on an empty "Open a terminal" state (mirrors
 * manual close in DevTerminalPanel).
 */
function removeWorktreeSetupTab(tab: DevTerminalTab): void {
  const store = useDevTerminalStore.getState();
  const showingThisContext =
    store.isOpen &&
    store.activeProjectId === tab.projectId &&
    (store.activeWorktreePath ?? undefined) === tab.worktreePath;
  store.removeTab(tab.id);
  if (!showingThisContext) return;
  const remaining = useDevTerminalStore
    .getState()
    .tabs.filter((t) => t.projectId === tab.projectId && t.worktreePath === tab.worktreePath);
  if (remaining.length > 0) return;
  if (useSharedSettings.getState().terminalPosition !== "bottom") closeAllPanels();
  useDevTerminalStore.getState().closePanel();
}

/**
 * Draft view for the full-screen "draft" app view (no thread panes yet).
 * Subscribes to the agent statuses store so the composer re-renders when
 * detection finishes — previously the parent used a non-subscribing read and
 * the "No supported agents" message could persist after statuses arrived.
 */
function DraftViewContent(props: {
  project: Project;
  lastDraftConfig?: Project["lastDraftConfig"];
  onStart: (input: DraftStartInput) => void | Promise<void>;
}) {
  const { project, lastDraftConfig, onStart } = props;
  const projectAgentStatuses = useAgentStatusesStore(
    useShallow((s) =>
      getProjectAgentStatuses(project.location, s.agentStatuses, s.wslAgentStatuses),
    ),
  );
  const isDetectingAgents = useAgentStatusesStore((s) =>
    isDetectingAgentsForLocation(s, project.location),
  );
  return (
    <ThreadDraftView
      project={project}
      agentStatuses={projectAgentStatuses}
      isDetectingAgents={isDetectingAgents}
      {...(lastDraftConfig ? { lastDraftConfig } : {})}
      onStart={onStart}
    />
  );
}
