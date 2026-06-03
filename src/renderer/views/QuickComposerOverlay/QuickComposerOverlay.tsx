import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import type { Project } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";
import { ensureHomeScopeProject } from "@/renderer/actions/projectActions";
import { startThreadFromDraft, type DraftThreadStartInput } from "@/renderer/actions/threadActions";
import { PixelLoader } from "@/renderer/components/common";
import { ThreadDraftView } from "@/renderer/components/thread/ThreadDraftView";
import { ThreadView } from "@/renderer/components/thread/ThreadView";
import { buildThreadViewHandlers } from "@/renderer/components/thread/threadViewHandlers";
import {
  isDetectingAgentsForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProject, useThread } from "@/renderer/state/useThread";
import { useAgentStatusHydration } from "@/renderer/hooks/useAgentStatusHydration";
import { useProjectAgentStatuses, useThreadPendingLaunch } from "@/renderer/hooks/uiSelectors";

type OverlayPhase = "draft" | "expanding" | "thread" | "closing";

export function QuickComposerOverlay() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [phase, setPhase] = useState<OverlayPhase>("draft");
  const view = useAppStore((s) => s.view);
  const projects = useAppStore((s) => s.projects);
  const threads = useAppStore((s) => s.threads);
  const wslProjectDistrosKey = useAppStore((s) => buildWslProjectDistrosKey(s.projects));
  const homeScopeEnabled = useSharedSettings((s) => s.homeScopeEnabled);
  const sharedSettingsHydrated = useSharedSettings((s) => s.sharedSettingsHydrated);
  const project = resolveDefaultProject({ projects, threads, view, homeScopeEnabled });
  const projectAgentStatuses = useAgentStatusesStore((s) =>
    project ? getProjectAgentStatuses(project.location, s.agentStatuses, s.wslAgentStatuses) : [],
  );
  const isDetectingAgents = useAgentStatusesStore((s) =>
    project ? isDetectingAgentsForLocation(s, project.location) : false,
  );

  useEffect(() => {
    if (!sharedSettingsHydrated || !homeScopeEnabled) return;
    void ensureHomeScopeProject()
      .then((homeProject) => readBridge().dbUpsertProject(homeProject))
      .catch(() => undefined);
  }, [homeScopeEnabled, sharedSettingsHydrated]);

  useAgentStatusHydration(wslProjectDistrosKey);

  async function handleStart(input: DraftThreadStartInput) {
    if (!project) return;
    setPhase("expanding");
    void readBridge().setQuickOverlayExpanded(true);
    if (project.id === HOME_PROJECT_ID) {
      await readBridge().dbUpsertProject(project);
    }
    const thread = await startThreadFromDraft(project, input, { preserveActiveGroup: false });
    if (!thread) {
      setPhase("draft");
      void readBridge().setQuickOverlayExpanded(false);
      return;
    }
    setThreadId(thread.id);
    setPhase("thread");
  }

  function closeOverlay() {
    setPhase("closing");
    void readBridge().setQuickOverlayExpanded(false);
    setTimeout(() => {
      void readBridge().closeQuickOverlay();
    }, 140);
  }

  function openInMainWindow() {
    if (!threadId) return;
    setPhase("closing");
    void readBridge().openQuickOverlayThreadInMainWindow(threadId);
  }

  return (
    <div className={`quick-composer-root quick-composer-root--${phase}`}>
      <div className="quick-composer-frame">
        <div className="quick-composer-titlebar lightcode-content-over-drag-region--drag">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight text-foreground">
              {threadId ? "Quick chat" : "New quick chat"}
            </p>
            <p className="truncate text-xs leading-tight text-muted">
              {project?.name ?? "Lightcode"}
            </p>
          </div>
          {threadId ? (
            <button
              type="button"
              aria-label="Open in Lightcode"
              className="lightcode-overlay-header__controls quick-composer-icon-button"
              onClick={openInMainWindow}
            >
              <Maximize2 className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close quick composer"
            className="lightcode-overlay-header__controls quick-composer-icon-button"
            onClick={closeOverlay}
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="quick-composer-body">
          {!project ? (
            <QuickComposerEmptyState />
          ) : threadId ? (
            <QuickOverlayThread threadId={threadId} />
          ) : (
            <ThreadDraftView
              project={project}
              agentStatuses={projectAgentStatuses}
              isDetectingAgents={isDetectingAgents}
              {...(project.lastDraftConfig ? { lastDraftConfig: project.lastDraftConfig } : {})}
              onStart={(input) => void handleStart(input)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function QuickComposerEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted">Add a project in Lightcode to start a quick chat.</p>
      <button
        type="button"
        className="quick-composer-text-button"
        onClick={() => {
          void readBridge().focusWindow();
          void readBridge().closeQuickOverlay();
        }}
      >
        Open Lightcode
      </button>
    </div>
  );
}

function QuickOverlayThread(props: { threadId: string }) {
  const thread = useThread(props.threadId);
  const project = useProject(thread?.projectId);
  const projectAgentStatuses = useProjectAgentStatuses(project?.location);
  const agentStatus = projectAgentStatuses.find((status) => status.kind === thread?.agentKind);
  const { prompt: pendingLaunchPrompt, segments: pendingLaunchSegments } = useThreadPendingLaunch(
    props.threadId,
  );

  useEffect(() => {
    if (!thread) return;
    void readBridge()
      .dbUpsertThread(thread)
      .then(() => readBridge().notifyQuickOverlayThreadChanged(thread.id))
      .catch(() => undefined);
  }, [thread]);

  if (!thread || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <PixelLoader size="md" />
      </div>
    );
  }

  const projectLocation = thread.worktreePath
    ? buildWorktreeLocation(project.location, thread.worktreePath)
    : project.location;
  const handlers = buildThreadViewHandlers(thread, projectLocation);

  return (
    <ThreadView
      thread={thread}
      projectName={project.name}
      agentStatus={agentStatus}
      isWsl={project.location.kind === "wsl"}
      paneCount={1}
      onConfigChange={handlers.onConfigChange}
      projectLocation={projectLocation}
      onLaunchConsumed={handlers.onLaunchConsumed}
      onLaunchFailed={handlers.onLaunchFailed}
      onResolveServerRequest={handlers.onResolveServerRequest}
      {...(pendingLaunchPrompt !== undefined ? { pendingLaunchPrompt } : {})}
      {...(pendingLaunchSegments ? { pendingLaunchSegments } : {})}
      onSubmitInput={handlers.onSubmitInput}
    />
  );
}

function resolveDefaultProject(input: {
  projects: Project[];
  threads: Array<{ id: string; projectId: string; archived?: boolean }>;
  view: ReturnType<typeof useAppStore.getState>["view"];
  homeScopeEnabled: boolean;
}): Project | undefined {
  const byId = new Map(input.projects.map((project) => [project.id, project]));
  const isUsableProject = (project: Project | undefined) =>
    project !== undefined &&
    (project.id === HOME_PROJECT_ID ? input.homeScopeEnabled : !project.disabled);
  const fromView = resolveProjectIdFromView(input.view, input.threads);
  const viewedProject = byId.get(fromView ?? "");
  if (isUsableProject(viewedProject)) return viewedProject;

  const latestThread = input.threads.find((thread) => !thread.archived);
  const latestThreadProject = byId.get(latestThread?.projectId ?? "");
  if (isUsableProject(latestThreadProject)) return latestThreadProject;

  const homeProject = byId.get(HOME_PROJECT_ID);
  if (input.homeScopeEnabled && homeProject) return homeProject;

  return input.projects.find((project) => !project.disabled && project.id !== HOME_PROJECT_ID);
}

function resolveProjectIdFromView(
  view: ReturnType<typeof useAppStore.getState>["view"],
  threads: Array<{ id: string; projectId: string }>,
): string | undefined {
  if (view.kind === "draft") return view.projectId;
  if (view.kind !== "thread") return undefined;
  const firstPaneId = view.panes[0];
  if (!firstPaneId) return undefined;
  if (isDraftPaneId(firstPaneId)) return parseDraftProjectId(firstPaneId) ?? undefined;
  return threads.find((thread) => thread.id === firstPaneId)?.projectId;
}
