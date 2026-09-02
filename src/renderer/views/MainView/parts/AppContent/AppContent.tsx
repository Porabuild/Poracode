import { X } from "lucide-react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type {
  Project,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { continuesInPlace } from "@/shared/continueProviderRanking";
import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { buildPaneLayoutFromLegacy, findPaneAlign, findPaneSlotId } from "@/shared/paneLayout";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { findExperimentByThreadId } from "@/renderer/state/experimentStore";
import {
  useInitialProjectDraftConfig,
  useProjectIds,
  useProjectWithoutDraftConfig,
} from "@/renderer/state/useThread";
import { startThreadFromDraft } from "@/renderer/actions/threadLaunchActions";
import { markThreadDone } from "@/renderer/actions/threadActions";
import {
  buildForkMentionLaunchInput,
  buildHandoffLaunchInput,
  type ProviderHandoffContext,
} from "@/renderer/actions/providerHandoff";
import { switchThreadProviderInPlace } from "@/renderer/actions/providerSwitchActions";
import { continueRemoteThreadInNewThread } from "@/renderer/actions/providerSwitchRemoteActions";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import type { ContinueIntent } from "@/renderer/components/thread/ContinueInProviderDialog";
import {
  resolvePaneDomKey,
  SplitPaneContainer,
  type Rect,
} from "@/renderer/components/layout/SplitPaneContainer";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
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
    intent: ContinueIntent,
    handoffContext: ProviderHandoffContext,
  ) {
    if (findExperimentByThreadId(sourceThread.id)) return;
    const storeProjects = useAppStore.getState().projects;
    const project = storeProjects.find((p) => p.id === sourceThread.projectId);
    if (!project) return;

    const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
    const agents = getProjectAgentStatuses(project.location, agentStatuses, wslAgentStatuses);
    // A mirrored thread's agents live on the host — its statuses carry the
    // labels and capabilities, and the local list may not know either agent.
    const owner = remoteOwner(sourceThread);
    const runtime = owner ? useRemoteServersStore.getState().runtime[owner.desktopId] : undefined;
    const hostStatuses = owner
      ? ((project.location.kind === "wsl"
          ? runtime?.agentStatuses?.wsl
          : runtime?.agentStatuses?.windows) ?? [])
      : [];
    const statusSource = owner
      ? hostStatuses.find((a) => a.kind === sourceThread.agentKind)
      : agents.find((a) => a.kind === sourceThread.agentKind);
    const targetLabel = owner
      ? (hostStatuses.find((a) => a.kind === targetAgentKind)?.label ?? targetAgentKind)
      : (agents.find((a) => a.kind === targetAgentKind)?.label ?? targetAgentKind);

    // Switching in place keeps the whole thread — id, title, and transcript —
    // and only changes which agent answers next; see `continuesInPlace`.
    // Resolved from the same agent population the dialog used, so the caption
    // it showed and the path taken here cannot disagree.
    const sourcePresentationMode =
      sourceThread.presentationMode ?? statusSource?.capabilities.presentationMode ?? "terminal";
    const switchesInPlace =
      intent === "switch" && continuesInPlace(sourcePresentationMode, targetPresentationMode);
    if (switchesInPlace) {
      await switchThreadProviderInPlace({
        thread: sourceThread,
        targetAgentKind,
        targetConfig,
        prompt,
        segments,
        handoffContext,
        targetLabel,
      });
      return;
    }

    // A fork on the transcript route reads its source thread through a thread
    // mention; every other replacement thread carries a context file (possibly
    // none). A replacement terminal thread never gets the transcript route —
    // the dialog only picks it for a chat target.
    const extractedContext =
      handoffContext.strategy === "context-file" ? handoffContext.extracted : null;
    const isFork = intent === "fork";
    const readsSourceThread = isFork && handoffContext.strategy === "thread-transcript";

    // The title is the user's own label for the task, and the task is what
    // carries over — so inherit it instead of generating a new one. A fork is
    // marked because it sits beside the original in the same group, but forking
    // a fork keeps one marker rather than stacking them.
    // Formatting with an empty title yields the localized marker on its own,
    // so the "already forked" check works in every locale.
    const forkMarker = t`${""} (fork)`;
    const title =
      isFork && !sourceThread.title.endsWith(forkMarker)
        ? t`${sourceThread.title} (fork)`
        : sourceThread.title;

    // A mirrored source builds its replacement on the host — a locally created
    // thread would launch against the host's paths on this machine.
    if (remoteOwner(sourceThread)) {
      await continueRemoteThreadInNewThread({
        thread: sourceThread,
        targetAgentKind,
        targetConfig,
        targetPresentationMode,
        prompt,
        segments,
        extractedContext,
        title,
        targetLabel,
        fork: isFork,
      });
      return;
    }

    let groupId: string | undefined;
    let groupName: string | undefined;
    if (isFork) {
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
      title,
      presentationMode: targetPresentationMode,
      ...(sourceThread.worktreePath ? { worktreePath: sourceThread.worktreePath } : {}),
      ...(sourceThread.worktreeBranch ? { worktreeBranch: sourceThread.worktreeBranch } : {}),
      ...(groupId ? { groupId } : {}),
      ...(groupName ? { groupName } : {}),
    });

    const launch = readsSourceThread
      ? buildForkMentionLaunchInput({ sourceThread, prompt, segments })
      : await buildHandoffLaunchInput({
          threadId: thread.id,
          prompt,
          segments,
          extractedContext,
        });
    queueThreadLaunch(
      thread.id,
      launch.prompt,
      launch.segments,
      undefined,
      // The mention is this fork's whole context. If the target session cannot
      // resolve `read_thread`, the supervisor starts without it and says so
      // instead of failing the launch.
      readsSourceThread ? { mentionHandoff: true } : undefined,
    );

    if (isFork) {
      useAppStore.getState().openThreadSideBySide(thread.id);
    } else {
      const store = useAppStore.getState();
      const sourceVisible =
        store.view.kind === "thread" && store.view.panes.includes(sourceThread.id);
      if (sourceVisible) {
        store.replacePaneId(sourceThread.id, thread.id);
      } else {
        store.openThread(thread.id);
      }
      markThreadDone(sourceThread.id);
    }

    toast.success(
      extractedContext || readsSourceThread
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
      {...(draftEnvironment.saveClipboardImage
        ? { saveClipboardImage: draftEnvironment.saveClipboardImage }
        : {})}
      {...(lastDraftConfig ? { lastDraftConfig } : {})}
      onStart={onStart}
    />
  );
}
