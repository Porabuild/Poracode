import { X } from "lucide-react";
import { toast } from "@heroui/react";
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
import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { buildPaneLayoutFromLegacy, findPaneAlign, findPaneSlotId } from "@/shared/paneLayout";
import { readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import {
  useInitialProjectDraftConfig,
  useProjectIds,
  useProjectWithoutDraftConfig,
} from "@/renderer/state/useThread";
import { startThreadFromDraft } from "@/renderer/actions/threadLaunchActions";
import {
  resolvePaneDomKey,
  SplitPaneContainer,
  type Rect,
} from "@/renderer/components/layout/SplitPaneContainer";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { generateTitleAsync } from "@/renderer/utils/titleGen";
import { useDraftEnvironment } from "@/renderer/hooks/uiSelectors";
import { HomeView } from "@/renderer/views/HomeView";
import { ExperimentView } from "@/renderer/views/ExperimentView/ExperimentView";
import { PullRequestsView } from "@/renderer/views/PullRequestsView/PullRequestsView";
import { SchedulesView } from "@/renderer/views/SchedulesView/SchedulesView";
import { ThreadPane } from "./parts/ThreadPane";
import { DraftPane } from "./parts/DraftPane";

export function AppContent() {
  const { t } = useLingui();
  const view = useAppStore((state) => state.view);
  const projectIds = useProjectIds();
  const draftProjectId = view.kind === "draft" ? view.projectId : undefined;
  const draftProject = useProjectWithoutDraftConfig(draftProjectId);
  const draftLastDraftConfig = useInitialProjectDraftConfig(draftProjectId);
  const createThread = useAppStore((state) => state.createThread);
  const queueThreadLaunch = useAppStore((state) => state.queueThreadLaunch);
  // Keep-alive cache: thread panes opened then hidden stay mounted (invisible)
  // so their xterm buffer / alt-screen state survives. Only terminal-
  // presentation threads are kept; GUI threads and draft panes are not (no
  // terminal to preserve). Hook must be called unconditionally (before the
  // `view.kind === "thread"` branch) to satisfy the rules of hooks.
  const keepAlivePaneIds = useAppStore((state) => state.keepAlivePaneIds);
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
    if (findExperimentByThreadId(sourceThread.id)) return;
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

  if (view.kind === "experiment") {
    return <ExperimentView experimentId={view.experimentId} />;
  }

  if (view.kind === "schedules") {
    return (
      <div className="h-full overflow-y-auto px-6 pb-8 pt-4 [scrollbar-gutter:stable]">
        <SchedulesView />
      </div>
    );
  }

  if (view.kind === "pullRequests") {
    return (
      <div className="h-full overflow-y-auto px-6 pb-8 pt-4 [scrollbar-gutter:stable]">
        <PullRequestsView />
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
    function getPaneDomKey(paneId: string) {
      return resolvePaneDomKey({
        paneId,
        paneSlotId: findPaneSlotId(paneLayout, paneId) ?? paneId,
        presentationMode: storeThreads.find((thread) => thread.id === paneId)?.presentationMode,
      });
    }

    // Keep-alive: filter the cache to hidden, non-draft, terminal-presentation
    // thread panes (GUI threads have no terminal; their visible DOM key is a
    // stable slot key, not the thread id, so keep-alive wouldn't reuse it).
    const visiblePaneIds = new Set(view.panes);
    const hiddenPaneIds = keepAlivePaneIds.filter(
      (id) =>
        !visiblePaneIds.has(id) &&
        !isDraftPaneId(id) &&
        storeThreads.find((thread) => thread.id === id)?.presentationMode !== "gui",
    );

    function renderPane(paneId: string, rect: Rect, hidden = false) {
      const paneDraftProjectId = parseDraftProjectId(paneId);
      const paneAlign = findPaneAlign(paneLayout, paneId);
      // Only the top-left pane's own header is the topmost row in the content
      // area when there's no group header — that's when it needs traffic-light
      // padding on macOS. Pure layout fact: doesn't change on collapse/expand.
      const headerNeedsTrafficLightPad = rect.left === 0 && rect.top === 0 && !hasGroupHeader;
      const paneContent = paneDraftProjectId ? (
        <DraftPane
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
          threadId={paneId}
          paneCount={paneCount}
          paneAlign={paneAlign}
          headerNeedsTrafficLightPad={headerNeedsTrafficLightPad}
          hidden={hidden}
          onClose={() => closePane(paneId)}
          {...(!findExperimentByThreadId(paneId)
            ? {
                onContinueInProvider: (...args: Parameters<typeof handleContinueInProvider>) => {
                  void handleContinueInProvider(...args);
                },
              }
            : {})}
        />
      );
      return (
        <div
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
          <SplitPaneContainer
            layout={paneLayout}
            renderPane={renderPane}
            getPaneDomKey={getPaneDomKey}
            hiddenPaneIds={hiddenPaneIds}
          />
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
  const draftEnvironment = useDraftEnvironment(project);
  return (
    <ThreadDraftView
      project={project}
      agentStatuses={draftEnvironment.agentStatuses}
      isDetectingAgents={draftEnvironment.isDetectingAgents}
      {...(draftEnvironment.pickFiles ? { pickFiles: draftEnvironment.pickFiles } : {})}
      {...(lastDraftConfig ? { lastDraftConfig } : {})}
      onStart={onStart}
    />
  );
}
