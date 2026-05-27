import { useShallow } from "zustand/shallow";
import { X } from "lucide-react";
import { toast } from "@heroui/react";
import type {
  AgentStatus,
  ExtractContextResult,
  Project,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { isHomeProject } from "@/shared/homeScope";
import { buildWorktreeLocation } from "@/shared/worktree";
import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { buildPaneLayoutFromLegacy, findPaneAlign } from "@/shared/paneLayout";
import { readBridge } from "@/renderer/bridge";
import {
  isDetectingAgentsForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  useInitialProjectDraftConfig,
  useProjectIds,
  useProjectWithoutDraftConfig,
} from "@/renderer/state/useThread";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { SplitPaneContainer, type Rect } from "@/renderer/components/layout/SplitPaneContainer";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import { startShellWithToast, writeScriptToShell } from "@/renderer/utils/shellUtils";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { HomeView } from "@/renderer/views/HomeView";
import { buildProjectDraftConfig } from "./draftConfig";
import { ThreadPane } from "./parts/ThreadPane";
import { DraftPane } from "./parts/DraftPane";

export function AppContent() {
  const view = useAppStore((state) => state.view);
  const projectIds = useProjectIds();
  const draftProjectId = view.kind === "draft" ? view.projectId : undefined;
  const draftProject = useProjectWithoutDraftConfig(draftProjectId);
  const draftLastDraftConfig = useInitialProjectDraftConfig(draftProjectId);
  const createThread = useAppStore((state) => state.createThread);
  const queueThreadLaunch = useAppStore((state) => state.queueThreadLaunch);
  const updateProjectDraftConfig = useAppStore((state) => state.updateProjectDraftConfig);
  const activeGroupName = useAppStore((s) => {
    const v = s.view;
    if (v.kind !== "thread" || !v.activeGroupId) return undefined;
    const match = s.threads.find((t) => t.groupId === v.activeGroupId);
    return match?.groupName ?? match?.title ?? "Group";
  });
  async function handleDraftStart(
    project: Project,
    input: {
      agentKind: AgentStatus["kind"];
      config: import("@/shared/contracts").ThreadConfig;
      prompt: string;
      segments?: PromptSegment[];
      existingWorktreePath?: string;
      worktreeBranch?: string;
      worktreeBaseBranch?: string;
      worktreeIsNewBranch?: boolean;
      presentationMode?: import("@/shared/contracts").ThreadPresentationMode;
    },
    replacePaneIdParam?: string,
  ) {
    const {
      agentKind,
      config,
      prompt,
      segments,
      existingWorktreePath,
      worktreeBranch,
      worktreeBaseBranch,
      worktreeIsNewBranch,
      presentationMode,
    } = input;
    const isHomeScope = isHomeProject(project);

    updateProjectDraftConfig(
      project.id,
      buildProjectDraftConfig({
        agentKind,
        config,
        worktreeMode: !isHomeScope && worktreeIsNewBranch === true,
      }),
    );

    let worktreePath: string | undefined;
    if (isHomeScope) {
      worktreePath = undefined;
    } else if (existingWorktreePath) {
      worktreePath = existingWorktreePath;
      await primeWorktreeGitState(project, existingWorktreePath);
    } else if (worktreeBranch) {
      try {
        const result = await readBridge().gitAddWorktree({
          projectLocation: project.location,
          branch: worktreeBranch,
          createBranch: worktreeIsNewBranch ?? false,
          startPoint: worktreeBaseBranch,
        });
        worktreePath = result.path;
        await primeWorktreeGitState(project, result.path);

        // Full refresh so the new worktree enters the cache and gets a file
        // watcher (status-mode refreshes only walk cached worktrees), and so
        // any new branch from createBranch shows up in BranchSelectors and
        // worktreeSourceInfo without lagging a refresh cycle. Without this,
        // the sidebar diff badge stays empty until the Git review panel
        // mounts and runs its own one-shot fetch.
        void refreshGitProject({ id: project.id, location: project.location }, "manual", "full");

        const setupScript = project.scripts?.setupScript;
        if (setupScript) {
          const wtLocation = buildWorktreeLocation(project.location, result.path);
          const store = useDevTerminalStore.getState();
          const tab = store.addTab(project.id, "setup", result.path);
          if (useSharedSettings.getState().autoShowTerminalPanel) {
            store.openWorktreePanel(project.id, result.path);
          }
          store.setActiveTab(tab.id);
          startShellWithToast(
            {
              shellId: tab.id,
              projectLocation: wtLocation,
              worktreePath: result.path,
            },
            "setup shell",
          );
          writeScriptToShell(tab.id, setupScript);
        }
      } catch (err) {
        console.error("[renderer] failed to create worktree:", err);
        return;
      }
    }

    const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
    const projectAgentStatuses = getProjectAgentStatuses(
      project.location,
      agentStatuses,
      wslAgentStatuses,
    );
    const titlePrompt = segments
      ? segments
          .filter((s) => s.kind !== "attachment")
          .map((s) => (s.kind === "file" ? `@${s.path}` : s.content))
          .join("")
          .trim() || prompt
      : prompt;
    const currentView = useAppStore.getState().view;
    const activeGroup =
      currentView.kind === "thread" && currentView.activeGroupId
        ? {
            groupId: currentView.activeGroupId,
            groupName: useAppStore
              .getState()
              .threads.find((t) => t.groupId === currentView.activeGroupId)?.groupName,
          }
        : undefined;

    const thread = createThread({
      projectId: project.id,
      agentKind,
      config,
      prompt: titlePrompt,
      ...(presentationMode ? { presentationMode } : {}),
      ...(worktreePath ? { worktreePath, worktreeBranch } : {}),
      ...(replacePaneIdParam ? { replacePaneId: replacePaneIdParam } : {}),
      ...(activeGroup?.groupId ? { groupId: activeGroup.groupId } : {}),
      ...(activeGroup?.groupName ? { groupName: activeGroup.groupName } : {}),
    });
    queueThreadLaunch(thread.id, prompt, segments);
    generateTitleAsync(thread.id, project.location, projectAgentStatuses, titlePrompt);
  }

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
          threads: state.threads.map((t) =>
            t.id === sourceThread.id ? { ...t, groupId, groupName } : t,
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
      extractedContext ? `Context transferred to ${targetLabel}` : `Started ${targetLabel} thread`,
    );
  }

  if (view.kind === "draft") {
    if (!draftProject) {
      return <HomeView />;
    }
    return (
      <div className="h-full">
        <DraftViewContent
          project={draftProject}
          lastDraftConfig={draftLastDraftConfig}
          onStart={(input) => void handleDraftStart(draftProject, input)}
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
        : storeThreads.some((t) => t.id === id),
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
          onStart={(project, input) => void handleDraftStart(project, input, paneId)}
        />
      ) : (
        <ThreadPane
          key={paneId}
          threadId={paneId}
          paneCount={paneCount}
          paneAlign={paneAlign}
          headerNeedsTrafficLightPad={headerNeedsTrafficLightPad}
          onClose={() => closePane(paneId)}
          onContinueInProvider={handleContinueInProvider}
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
            className={`lightcode-content-over-drag-region ${macosTrafficLightPadClass} flex h-[env(titlebar-area-height,32px)] shrink-0 items-center gap-1 border-b border-white/[0.06] px-2`}
          >
            <span className="truncate text-xs font-medium text-muted">{activeGroupName}</span>
            <button
              type="button"
              aria-label="Close group"
              className="shrink-0 rounded p-0.5 text-muted/60 transition-colors hover:bg-white/[0.06] hover:text-foreground"
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

async function primeWorktreeGitState(project: Project, worktreePath: string): Promise<void> {
  const cachedWorktreePaths =
    useGitStore
      .getState()
      .worktrees[project.id]?.filter((worktree) => !worktree.isMain)
      .map((worktree) => worktree.path) ?? [];
  const worktreePaths = [...new Set([...cachedWorktreePaths, worktreePath])];
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

/**
 * Draft view for the full-screen "draft" app view (no thread panes yet).
 * Subscribes to the agent statuses store so the composer re-renders when
 * detection finishes — previously the parent used a non-subscribing read and
 * the "No supported agents" message could persist after statuses arrived.
 */
function DraftViewContent(props: {
  project: Project;
  lastDraftConfig?: Project["lastDraftConfig"];
  onStart: (input: {
    agentKind: AgentStatus["kind"];
    config: ThreadConfig;
    prompt: string;
    segments?: PromptSegment[];
    existingWorktreePath?: string;
    worktreeBranch?: string;
    worktreeBaseBranch?: string;
    worktreeIsNewBranch?: boolean;
  }) => void;
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
