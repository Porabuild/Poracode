import React, { lazy, startTransition, Suspense, useEffect, useEffectEvent, useState } from "react";
import { ArrowRight, FolderOpen, FolderPlus, Monitor, Plus, TerminalSquare } from "lucide-react";
import { Button, Dropdown, Label, Spinner } from "@heroui/react";
import { TuxIcon } from "./components/common/TuxIcon";
import type { AgentStatus, PrData, Project, ProjectLocation, PromptSegment } from "../shared/contracts";
import { getProjectAgentStatuses } from "../shared/agentStatus";
import type { PendingThreadServerRequest } from "./state/appStore";
import { parseWslUncPath } from "../shared/wsl";
import { buildWorktreeLocation } from "../shared/worktree";
import { isWindows, readBridge } from "./bridge";
import { ProviderIcon, getStatusTone, generateTitleWithFallback } from "./components/providers";
import { DevTerminalPanel } from "./components/devTerminal/DevTerminalPanel";
import { PageLayout } from "./components/layout/PageLayout";
import { OverlayShell } from "./components/layout/OverlayShell";
import { SplitPaneContainer } from "./components/layout/SplitPaneContainer";
import { ProjectSettingsOverlay } from "./components/settings/ProjectSettingsOverlay";
import { SettingsOverlay } from "./components/settings/SettingsOverlay";
import { Sidebar } from "./components/sidebar/Sidebar";
import {
  DeleteWorktreeDialog,
  readWorktreeDeletePref,
} from "./components/sidebar/DeleteWorktreeDialog";
import { ForceDeleteBranchDialog } from "./components/sidebar/ForceDeleteBranchDialog";
import { ForceRemoveWorktreeDialog } from "./components/sidebar/ForceRemoveWorktreeDialog";
import { ThreadDraftView } from "./components/thread/ThreadDraftView";
import { ThreadView } from "./components/thread/ThreadView";
import { AppProvider } from "./components/ui/provider";
const GitReviewOverlay = lazy(() =>
  import("./components/gitReview/GitReviewOverlay").then((m) => ({ default: m.GitReviewOverlay })),
);
import { useAppStore, makeThreadTitle } from "./state/appStore";
import { useSharedSettings } from "./state/sharedSettingsStore";
import { useThread } from "./state/useThread";
import { useDevTerminalStore } from "./state/devTerminalStore";
import { useGitStore } from "./state/gitStore";
import type { ReorderPlacement } from "./state/reorder";
import { useUpdateStore } from "./state/updateStore";

// ── Module-level IPC listener ───────────────────────────────────
// Subscribes to supervisor events as soon as the module loads,
// completely outside React's lifecycle.  This guarantees events are
// never missed due to useEffect timing, StrictMode double-mounts,
// or startTransition batching.
readBridge().onSupervisorEvent((event) => {
  // Shell sessions use a "shell:" prefix — skip appStore updates for them.
  if ("threadId" in event && event.threadId.startsWith("shell:")) {
    return;
  }

  if (event.type === "thread-state") {
    useAppStore.getState().updateThreadRuntime(event.threadId, event);
  }
  if (event.type === "thread-server-request") {
    useAppStore.getState().addThreadServerRequest({
      threadId: event.threadId,
      requestId: event.requestId,
      method: event.method,
      params: event.params,
    });
  }
  if (event.type === "thread-reset") {
    useAppStore.getState().clearThreadServerRequests(event.threadId);
  }
  if (event.type === "thread-exited") {
    useAppStore.getState().markThreadExited(event.threadId);
  }
  if (event.type === "windows-agent-statuses") {
    console.log(`[renderer] event: windows-agent-statuses (${event.statuses.length} agents)`);
    useAppStore.getState().setAgentStatuses(event.statuses);
  }
  if (event.type === "wsl-agent-statuses") {
    console.log(`[renderer] event: wsl-agent-statuses (${event.statuses.length} agents)`);
    useAppStore.getState().setWslAgentStatuses(event.statuses);
  }
});

// ── Module-level update status listener ──────────────────────────
// Subscribes to auto-update events from the main process,
// forwarding them to the Zustand update store.
readBridge().onUpdateStatus((status) => {
  const store = useUpdateStore.getState();
  switch (status.type) {
    case "checking":
      store.setChecking();
      break;
    case "update-available":
      store.setAvailable(status.version);
      break;
    case "update-not-available":
      store.setNotAvailable();
      break;
    case "downloading":
      store.setDownloading(status.percent);
      break;
    case "downloaded":
      store.setDownloaded(status.version);
      break;
    case "error":
      store.setError(status.message);
      break;
  }
});

// ── Async title generation ──────────────────────────────────
// Fire-and-forget: generates an AI title and swaps it in if the user
// hasn't manually renamed the thread in the meantime.
function generateTitleAsync(
  threadId: string,
  projectLocation: ProjectLocation,
  agentStatuses: readonly AgentStatus[],
  prompt: string,
): void {
  const settings = useSharedSettings.getState();
  const isWsl = projectLocation.kind === "wsl";
  const provider = isWsl ? settings.wslTitleGenProvider : settings.titleGenProvider;
  if (provider === "disabled") return;

  const model = isWsl ? settings.wslTitleGenModel : settings.titleGenModel;
  const effort = isWsl ? settings.wslTitleGenEffort : settings.titleGenEffort;
  console.log(
    `[title-gen] provider=${provider} model=${model || "(auto)"} effort=${effort || "(auto)"} env=${isWsl ? "wsl" : "windows"} candidates=${agentStatuses
      .filter((a) => a.installed)
      .map((a) => `${a.kind}(${a.authState})`)
      .join(",")}`,
  );

  void generateTitleWithFallback({
    projectLocation,
    agentStatuses,
    provider,
    model,
    effort,
    prompt,
    invoke: (payload) => {
      console.log(
        `[title-gen] invoke: agent=${payload.agentKind} model=${payload.model ?? "(default)"} effort=${payload.effort ?? "(default)"}`,
      );
      return readBridge().generateTitle(payload);
    },
  })
    .then((title) => {
      const store = useAppStore.getState();
      const thread = store.threads.find((t) => t.id === threadId);
      if (thread && thread.title === makeThreadTitle(prompt)) {
        store.renameThread(threadId, title);
      }
    })
    .catch((err) => {
      console.warn("[title-gen] failed, keeping fallback title:", err);
    });
}

const SIDEBAR_THREAD_MIME = "application/x-lightcode-sidebar-thread";
const EMPTY_PANES: string[] = [];
const GIT_POLL_INTERVAL_MS = 10_000;
const GIT_FETCH_INTERVAL_MS = 60_000;

function formatRelativeTime(iso: string): string {
  const deltaMinutes = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  return `${Math.floor(deltaHours / 24)}d ago`;
}

function HomeView() {
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const openDraft = useAppStore((state) => state.openDraft);
  const openThread = useAppStore((state) => state.openThread);
  const recentThreads = threads.slice(0, 8);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-full min-h-0 flex-col px-8 py-8">
        <div className="mx-auto flex h-full w-full max-w-[560px] flex-col">
          <div className="flex flex-1 flex-col justify-center">
            {/* Fancy Lightcode logo */}
            <h1 className="flex items-baseline gap-3 overflow-visible pr-[0.22em] pb-[0.32em] text-[clamp(3.25rem,8vw,6.25rem)] leading-[1.22] font-semibold tracking-[-0.06em]">
              <span className="pr-[0.04em] pb-[0.04em] text-transparent [background-image:linear-gradient(135deg,var(--foreground)_0%,color-mix(in_oklab,var(--accent)_60%,var(--foreground))_52%,var(--muted)_100%)] [background-size:100%_100%] bg-clip-text">
                Lightcode
              </span>
              <TerminalSquare className="translate-y-[-0.04em] size-[0.48em] shrink-0 text-[color:color-mix(in_oklab,var(--accent)_58%,var(--foreground))] opacity-90" />
            </h1>

            <div className="mt-10 flex w-full flex-col gap-8">
              {/* Projects */}
              {projects.length > 0 && (
                <section>
                  {projects.length === 0 ? (
                    <p className="text-sm text-muted">add a project to start</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {projects.map((project) => (
                        <button
                          key={project.id}
                          className="group flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                          onClick={() => openDraft(project.id)}
                          type="button"
                        >
                          <FolderOpen className="size-4 shrink-0 text-muted" />
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {project.name}
                          </p>
                          <Plus className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Recent threads */}
              {recentThreads.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Recent threads
                  </h2>
                  <div className="flex flex-col gap-1">
                    {recentThreads.map((thread) => {
                      const project = projects.find((p) => p.id === thread.projectId);
                      return (
                        <button
                          key={thread.id}
                          className="group flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                          onClick={() => openThread(thread.id)}
                          type="button"
                        >
                          <ProviderIcon
                            kind={thread.agentKind}
                            tone={getStatusTone(thread)}
                            className="size-4 shrink-0"
                          />
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {thread.title}
                          </p>
                          {project ? (
                            <span className="shrink-0 text-xs text-muted">{project.name}</span>
                          ) : null}
                          <span className="w-[6ch] shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                            {formatRelativeTime(thread.updatedAt)}
                          </span>
                          <ArrowRight className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadPane(props: {
  threadId: string;
  paneIndex: number;
  paneCount: number;
  projects: Project[];
  agentStatuses: AgentStatus[];
  wslAgentStatuses: AgentStatus[];
  pendingServerRequests: PendingThreadServerRequest[];
  pendingLaunchPrompt: string | undefined;
  pendingLaunchSegments: PromptSegment[] | undefined;
  paneDragSource: string | undefined;
  sidebarDragActive: boolean;
  paneDropTarget: string | undefined;
  sidebarDropTarget:
    | { kind: "replace"; paneIndex: number }
    | { kind: "insert"; index: number }
    | undefined;
  onPaneDragStart: (() => void) | undefined;
  onPaneDragEnd: (() => void) | undefined;
  onPaneDragOver: (zone: "left" | "center" | "right", event: React.DragEvent) => void;
  onPaneDrop: (event: React.DragEvent) => void;
  onClose: () => void;
}) {
  const thread = useThread(props.threadId);
  const updateThreadConfig = useAppStore((s) => s.updateThreadConfig);
  const updateThreadRuntime = useAppStore((s) => s.updateThreadRuntime);
  const consumeThreadLaunch = useAppStore((s) => s.consumeThreadLaunch);
  const removeThreadServerRequest = useAppStore((s) => s.removeThreadServerRequest);
  const touchThread = useAppStore((s) => s.touchThread);

  if (!thread) return null;

  const project = props.projects.find((item) => item.id === thread.projectId);
  if (!project) return null;

  const projectAgentStatuses = getProjectAgentStatuses(
    project.location,
    props.agentStatuses,
    props.wslAgentStatuses,
  );
  const agentStatus = projectAgentStatuses.find((status) => status.kind === thread.agentKind);
  const paneAlign =
    props.paneCount <= 1
      ? ("center" as const)
      : props.paneIndex === 0
        ? ("right" as const)
        : props.paneIndex === props.paneCount - 1
          ? ("left" as const)
          : ("center" as const);

  const dropIndicator: false | "replace" | "insert-left" | "insert-right" =
    props.paneDropTarget === props.threadId
      ? "replace"
      : props.sidebarDropTarget?.kind === "replace" &&
          props.sidebarDropTarget.paneIndex === props.paneIndex
        ? "replace"
        : props.sidebarDropTarget?.kind === "insert" &&
            props.sidebarDropTarget.index === props.paneIndex
          ? "insert-left"
          : props.sidebarDropTarget?.kind === "insert" &&
              props.sidebarDropTarget.index === props.paneIndex + 1
            ? "insert-right"
            : false;

  return (
    <ThreadView
      key={props.threadId}
      thread={thread}
      agentStatus={agentStatus}
      isWsl={project.location.kind === "wsl"}
      showCloseButton={props.paneCount > 1}
      paneAlign={paneAlign}
      isDragging={props.paneDragSource === props.threadId}
      paneDragActive={props.paneDragSource !== undefined || props.sidebarDragActive}
      dropIndicator={dropIndicator}
      onPaneDragStart={props.onPaneDragStart}
      onPaneDragEnd={props.onPaneDragEnd}
      onPaneDragOver={props.onPaneDragOver}
      onPaneDrop={props.onPaneDrop}
      onClose={props.onClose}
      onConfigChange={(config) => updateThreadConfig(thread.id, config)}
      pendingServerRequests={props.pendingServerRequests.filter(
        (request) => request.threadId === thread.id,
      )}
      projectLocation={
        thread.worktreePath
          ? buildWorktreeLocation(project.location, thread.worktreePath)
          : project.location
      }
      onLaunchConsumed={() => consumeThreadLaunch(thread.id)}
      onLaunchFailed={() => {
        startTransition(() => {
          updateThreadRuntime(thread.id, {
            status: "error",
            attention: "error",
            ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
            canResumeWithConfig: thread.canResumeWithConfig || thread.sessionRef !== undefined,
          });
        });
      }}
      onResolveServerRequest={async ({ requestId, method, response }) => {
        await readBridge().resolveThreadServerRequest({
          threadId: thread.id,
          requestId,
          method,
          response,
        });
        removeThreadServerRequest(thread.id, requestId);
        touchThread(thread.id);
      }}
      {...(props.pendingLaunchPrompt !== undefined
        ? { pendingLaunchPrompt: props.pendingLaunchPrompt }
        : {})}
      {...(props.pendingLaunchSegments
        ? { pendingLaunchSegments: props.pendingLaunchSegments }
        : {})}
      onSubmitInput={async (prompt, segments) => {
        await readBridge().sendThreadInput({
          threadId: thread.id,
          prompt,
          ...(segments ? { segments } : {}),
          config: thread.config,
        });
        touchThread(thread.id);
      }}
    />
  );
}

function AppContent() {
  const view = useAppStore((state) => state.view);
  const projects = useAppStore((state) => state.projects);
  const pendingServerRequests = useAppStore((state) => state.pendingServerRequests);
  const pendingThreadLaunches = useAppStore((state) => state.pendingThreadLaunches);
  const pendingLaunchSegments = useAppStore((state) => state.pendingLaunchSegments);
  const agentStatuses = useAppStore((state) => state.agentStatuses);
  const wslAgentStatuses = useAppStore((state) => state.wslAgentStatuses);
  const createThread = useAppStore((state) => state.createThread);
  const queueThreadLaunch = useAppStore((state) => state.queueThreadLaunch);
  const updateProjectDraftConfig = useAppStore((state) => state.updateProjectDraftConfig);
  const reorderPanes = useAppStore((state) => state.reorderPanes);
  const openThread = useAppStore((state) => state.openThread);
  const openThreadSideBySide = useAppStore((state) => state.openThreadSideBySide);
  const replaceSecondPane = useAppStore((state) => state.replaceSecondPane);
  const insertPaneAtIndex = useAppStore((state) => state.insertPaneAtIndex);
  const hasValidPanes = useAppStore(
    (s) =>
      s.view.kind === "thread" && s.view.panes.some((id) => s.threads.some((t) => t.id === id)),
  );
  const [paneDragSource, setPaneDragSource] = useState<string | undefined>();
  const [paneDropTarget, setPaneDropTarget] = useState<string | undefined>();
  const [sidebarDragActive, setSidebarDragActive] = useState(false);
  const [sidebarDropTarget, setSidebarDropTarget] = useState<
    { kind: "replace"; paneIndex: number } | { kind: "insert"; index: number } | undefined
  >();

  useEffect(() => {
    function onDragEnd() {
      setSidebarDragActive(false);
      setSidebarDropTarget(undefined);
    }
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, []);

  function handleSidebarDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes(SIDEBAR_THREAD_MIME)) {
      e.preventDefault();
      if (!sidebarDragActive) setSidebarDragActive(true);
    }
  }

  function handleSidebarDrop(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(SIDEBAR_THREAD_MIME)) return;
    e.preventDefault();
    const threadId = e.dataTransfer.getData("text/plain");
    if (threadId) {
      startTransition(() => openThread(threadId));
    }
    setSidebarDragActive(false);
    setSidebarDropTarget(undefined);
  }

  if (view.kind === "draft") {
    const project = projects.find((item) => item.id === view.projectId);
    if (!project) {
      return <HomeView />;
    }
    const projectAgentStatuses = getProjectAgentStatuses(
      project.location,
      agentStatuses,
      wslAgentStatuses,
    );
    return (
      <div
        className="relative h-full"
        onDragOver={handleSidebarDragOver}
        onDrop={handleSidebarDrop}
      >
        <ThreadDraftView
          project={project}
          agentStatuses={projectAgentStatuses}
          {...(project.lastDraftConfig ? { lastDraftConfig: project.lastDraftConfig } : {})}
          onStart={async ({
            agentKind,
            config,
            prompt,
            segments,
            existingWorktreePath,
            worktreeBranch,
            worktreeBaseBranch,
            worktreeIsNewBranch,
          }) => {
            updateProjectDraftConfig(project.id, {
              agentKind,
              model: config.model,
              effort: config.effort,
              mode: config.mode,
              approvalPolicy: config.approvalPolicy,
              sandboxMode: config.sandboxMode,
              worktreeMode: Boolean(worktreeBranch || existingWorktreePath),
            });

            let worktreePath: string | undefined;
            if (existingWorktreePath) {
              worktreePath = existingWorktreePath;
            } else if (worktreeBranch) {
              try {
                const result = await readBridge().gitAddWorktree({
                  projectLocation: project.location,
                  branch: worktreeBranch,
                  createBranch: worktreeIsNewBranch ?? false,
                  startPoint: worktreeBaseBranch,
                });
                worktreePath = result.path;

                // Run setup script if configured
                const setupScript = project.scripts?.setupScript;
                if (setupScript) {
                  const wtLocation = buildWorktreeLocation(project.location, result.path);
                  const store = useDevTerminalStore.getState();
                  const tab = store.addTab(project.id, "setup", result.path);
                  store.openWorktreePanel(project.id, result.path);
                  store.setActiveTab(tab.id);
                  void readBridge().startShell({ shellId: tab.id, projectLocation: wtLocation });
                  writeScriptToShell(tab.id, setupScript);
                }
              } catch (err) {
                console.error("[renderer] failed to create worktree:", err);
                return;
              }
            }

            const titlePrompt = segments
              ? segments
                  .filter((s) => s.kind !== "attachment")
                  .map((s) => (s.kind === "file" ? `@${s.path}` : s.content))
                  .join("")
                  .trim() || prompt
              : prompt;
            const thread = createThread({
              projectId: project.id,
              agentKind,
              config,
              prompt: titlePrompt,
              ...(worktreePath ? { worktreePath, worktreeBranch } : {}),
            });
            queueThreadLaunch(thread.id, prompt, segments);
            generateTitleAsync(thread.id, project.location, projectAgentStatuses, titlePrompt);
          }}
        />
        {sidebarDragActive && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 rounded-2xl bg-accent/10 ring-1 ring-inset ring-accent/30"
          />
        )}
      </div>
    );
  }

  if (view.kind === "thread") {
    const closePane = useAppStore.getState().closePane;
    const paneCount = view.panes.length;

    if (!hasValidPanes) {
      return (
        <div className="h-full" onDragOver={handleSidebarDragOver} onDrop={handleSidebarDrop}>
          <HomeView />
          {sidebarDragActive && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 rounded-2xl bg-accent/10 ring-1 ring-inset ring-accent/30"
            />
          )}
        </div>
      );
    }

    const paneElements = view.panes.map((paneThreadId, paneIndex) => (
      <ThreadPane
        key={paneThreadId}
        threadId={paneThreadId}
        paneIndex={paneIndex}
        paneCount={paneCount}
        projects={projects}
        agentStatuses={agentStatuses}
        wslAgentStatuses={wslAgentStatuses}
        pendingServerRequests={pendingServerRequests}
        pendingLaunchPrompt={pendingThreadLaunches[paneThreadId]}
        pendingLaunchSegments={pendingLaunchSegments[paneThreadId]}
        paneDragSource={paneDragSource}
        sidebarDragActive={sidebarDragActive}
        paneDropTarget={paneDropTarget}
        sidebarDropTarget={sidebarDropTarget}
        onPaneDragStart={
          paneCount > 1
            ? () => {
                setPaneDragSource(paneThreadId);
                setPaneDropTarget(undefined);
              }
            : undefined
        }
        onPaneDragEnd={
          paneCount > 1
            ? () => {
                setPaneDragSource(undefined);
                setPaneDropTarget(undefined);
              }
            : undefined
        }
        onPaneDragOver={(zone, event) => {
          // Sidebar thread drag
          if (event.dataTransfer.types.includes(SIDEBAR_THREAD_MIME)) {
            if (zone === "center" || paneCount >= 3) {
              setSidebarDropTarget({ kind: "replace", paneIndex });
            } else {
              setSidebarDropTarget({
                kind: "insert",
                index: zone === "left" ? paneIndex : paneIndex + 1,
              });
            }
            return;
          }
          // Pane-to-pane drag
          if (paneDragSource && paneDragSource !== paneThreadId) {
            setPaneDropTarget(paneThreadId);
          }
        }}
        onPaneDrop={(event) => {
          // Sidebar thread drag
          if (event.dataTransfer.types.includes(SIDEBAR_THREAD_MIME)) {
            const threadId = event.dataTransfer.getData("text/plain");
            if (threadId && !view.panes.includes(threadId)) {
              const target = sidebarDropTarget;
              startTransition(() => {
                if (target?.kind === "replace") {
                  if (target.paneIndex === 0) openThread(threadId);
                  else if (target.paneIndex === 1) replaceSecondPane(threadId);
                  else openThreadSideBySide(threadId);
                } else if (target?.kind === "insert") {
                  insertPaneAtIndex(threadId, target.index);
                } else {
                  openThreadSideBySide(threadId);
                }
              });
            }
            setSidebarDragActive(false);
            setSidebarDropTarget(undefined);
            return;
          }
          // Pane-to-pane drag
          if (paneDragSource && paneDragSource !== paneThreadId) {
            const sourceIdx = view.panes.indexOf(paneDragSource);
            const targetIdx = view.panes.indexOf(paneThreadId);
            const placement: ReorderPlacement = sourceIdx < targetIdx ? "after" : "before";
            startTransition(() => reorderPanes(paneDragSource, paneThreadId, placement));
            setPaneDragSource(undefined);
            setPaneDropTarget(undefined);
          }
        }}
        onClose={() => closePane(paneThreadId)}
      />
    ));

    return (
      <div className="h-full" onDragOver={handleSidebarDragOver}>
        <SplitPaneContainer>{paneElements}</SplitPaneContainer>
      </div>
    );
  }

  return (
    <div className="relative h-full" onDragOver={handleSidebarDragOver} onDrop={handleSidebarDrop}>
      <HomeView />
      {sidebarDragActive && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-2xl bg-accent/10 ring-1 ring-inset ring-accent/30"
        />
      )}
    </div>
  );
}

/** Write a script into a shell once the prompt is ready. Lines are joined with && for sequential execution. */
function writeScriptToShell(shellId: string, script: string) {
  const command = script
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"))
    .join(" && ");
  const unsub = readBridge().onSupervisorEvent((event) => {
    if (event.type === "thread-output" && event.threadId === shellId) {
      unsub();
      void readBridge().writeTerminal({ threadId: shellId, data: command + "\r" });
    }
  });
}

export function App() {
  const projects = useAppStore((state) => state.projects);
  const view = useAppStore((state) => state.view);
  const markThreadsInactiveOnLaunch = useAppStore((state) => state.markThreadsInactiveOnLaunch);
  const addProject = useAppStore((state) => state.addProject);
  const openDraft = useAppStore((state) => state.openDraft);
  const openThread = useAppStore((state) => state.openThread);
  const openThreadSideBySide = useAppStore((state) => state.openThreadSideBySide);
  const replaceSecondPane = useAppStore((state) => state.replaceSecondPane);
  const openHome = useAppStore((state) => state.openHome);
  const renameThread = useAppStore((state) => state.renameThread);
  const deleteThread = useAppStore((state) => state.deleteThread);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const queueThreadLaunch = useAppStore((state) => state.queueThreadLaunch);
  const reconcileRuntimeSnapshots = useAppStore((state) => state.reconcileRuntimeSnapshots);
  const reorderProjects = useAppStore((state) => state.reorderProjects);
  const reorderThreads = useAppStore((state) => state.reorderThreads);
  const reorderThreadBlock = useAppStore((state) => state.reorderThreadBlock);
  const updateThreadRuntime = useAppStore((state) => state.updateThreadRuntime);
  const devTerminalOpen = useDevTerminalStore((s) => s.isOpen);
  const devTerminalActiveProjectId = useDevTerminalStore((s) => {
    if (!s.isOpen || !s.activeProjectId) return null;
    // Only highlight project icon when showing the project panel (not a worktree panel).
    if (s.activeWorktreePath) return null;
    return s.activeProjectId;
  });
  const devTerminalTabs = useDevTerminalStore((s) => s.tabs);
  const terminalProjectIds = devTerminalTabs.reduce<string[]>((ids, t) => {
    if (!t.worktreePath && !ids.includes(t.projectId)) ids.push(t.projectId);
    return ids;
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);
  const [gitReviewContext, setGitReviewContext] = useState<{
    projectId: string;
    worktreePath?: string | undefined;
  } | null>(null);
  const [worktreeDeleteDialog, setWorktreeDeleteDialog] = useState<
    | {
        kind: "single-thread";
        threadId: string;
        projectId: string;
        worktreePath: string;
        worktreeBranch: string;
      }
    | {
        kind: "force-retry";
        projectId: string;
        worktreePath: string;
        worktreeBranch: string;
        error: string;
      }
    | {
        kind: "branch-unmerged";
        projectId: string;
        worktreeBranch: string;
        error: string;
      }
    | null
  >(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [storeHydrated, setStoreHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const [loadT0] = useState(() => Date.now());
  const [reopenAttempted] = useState(() => new Set<string>());
  const [wslAvailable, setWslAvailable] = useState(false);
  const wslProjectDistrosKey = [
    ...new Set(
      projects.flatMap((project) =>
        project.location.kind === "wsl" ? [project.location.distro] : [],
      ),
    ),
  ]
    .sort()
    .join("\0");
  const reopenStoredThread = useEffectEvent(
    (input: { threadId: string; projectLocation: (typeof projects)[number]["location"] }) => {
      const thread = useAppStore.getState().threads.find((item) => item.id === input.threadId);
      if (!thread) {
        return;
      }

      if (reopenAttempted.has(thread.id)) {
        return;
      }
      reopenAttempted.add(thread.id);

      startTransition(() => {
        updateThreadRuntime(thread.id, {
          status: "launching",
          attention: "none",
          ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
          canResumeWithConfig: thread.canResumeWithConfig || thread.sessionRef !== undefined,
        });
      });
      queueThreadLaunch(thread.id, "");
    },
  );

  function autoDetectSetupScript(project: Project) {
    void readBridge()
      .detectSetupScript({ projectLocation: project.location })
      .then((result) => {
        if (result.setupScript) {
          useAppStore.getState().updateProjectScripts(project.id, {
            setupScript: result.setupScript,
            actions: [],
          });
        }
      })
      .catch(() => undefined);
  }

  function runProjectAction(projectId: string, actionId: string, worktreePath?: string) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const action = project.scripts?.actions?.find((a) => a.id === actionId);
    if (!action) return;

    const location = worktreePath
      ? buildWorktreeLocation(project.location, worktreePath)
      : project.location;

    const store = useDevTerminalStore.getState();
    const tabLabel = `${action.name}`;
    const tab = store.addTab(projectId, tabLabel, worktreePath);

    if (worktreePath) {
      store.openWorktreePanel(projectId, worktreePath);
    } else {
      store.openPanel(projectId);
    }
    store.setActiveTab(tab.id);

    void readBridge().startShell({ shellId: tab.id, projectLocation: location });
    writeScriptToShell(tab.id, action.command);
  }

  async function performWorktreeRemoval(
    project: Project,
    worktreePath: string,
    worktreeBranch?: string,
  ) {
    // Run cleanup script if configured (best-effort, fire-and-forget)
    const cleanupScript = project.scripts?.cleanupScript;
    if (cleanupScript) {
      const wtLocation = buildWorktreeLocation(project.location, worktreePath);
      const store = useDevTerminalStore.getState();
      const tab = store.addTab(project.id, "cleanup", worktreePath);
      void readBridge().startShell({ shellId: tab.id, projectLocation: wtLocation });
      writeScriptToShell(tab.id, cleanupScript);
    }

    const removedTabIds = useDevTerminalStore.getState().removeTabsForWorktree(worktreePath);
    for (const tabId of removedTabIds) {
      void readBridge()
        .closeThread({ threadId: tabId })
        .catch(() => undefined);
    }

    useGitStore.getState().clearWorktreeStatus(worktreePath);

    if (gitReviewContext?.worktreePath === worktreePath) {
      setGitReviewContext(null);
    }

    try {
      await readBridge().gitRemoveWorktree({
        projectLocation: project.location,
        path: worktreePath,
        force: true,
      });
    } catch (err: unknown) {
      const branch = worktreeBranch ?? worktreePath.split(/[/\\]/).pop() ?? worktreePath;
      setWorktreeDeleteDialog({
        kind: "force-retry",
        projectId: project.id,
        worktreePath,
        worktreeBranch: branch,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // Worktree removed — now clean up the branch
    if (worktreeBranch) {
      try {
        await readBridge().gitDeleteBranch({
          projectLocation: project.location,
          branch: worktreeBranch,
          force: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not fully merged")) {
          setWorktreeDeleteDialog({
            kind: "branch-unmerged",
            projectId: project.id,
            worktreeBranch,
            error: msg,
          });
          return;
        }
        // Best-effort: branch may already be deleted or not exist
        console.warn(`[renderer] failed to delete branch ${worktreeBranch}:`, msg);
      }

      void readBridge()
        .gitListBranches({ projectLocation: project.location, includeRemote: true })
        .then((branches) => useGitStore.getState().setBranches(project.id, branches))
        .catch(() => undefined);
    }
  }

  useEffect(() => {
    const unsubscribeHydrate = useAppStore.persist.onHydrate(() => {
      setStoreHydrated(false);
    });
    const unsubscribeFinishHydration = useAppStore.persist.onFinishHydration(() => {
      setStoreHydrated(true);
    });

    setStoreHydrated(useAppStore.persist.hasHydrated());

    return () => {
      unsubscribeHydrate();
      unsubscribeFinishHydration();
    };
  }, []);

  // Supervisor events are handled by the module-level IPC listener
  // above (outside React).  This effect only fetches initial state.
  useEffect(() => {
    if (!storeHydrated) {
      console.log(`[renderer] +${Date.now() - loadT0}ms: waiting for store hydration`);
      return;
    }

    let isActive = true;
    const restoredView = useAppStore.getState().view;
    console.log(
      `[renderer] +${Date.now() - loadT0}ms: store hydrated, view=${JSON.stringify(restoredView)}, ${useAppStore.getState().projects.length} projects, ${useAppStore.getState().threads.length} threads`,
    );

    startTransition(() => {
      markThreadsInactiveOnLaunch();
      // Clear spinner immediately — agent statuses and thread snapshots
      // arrive asynchronously and the UI updates reactively.
      console.log(`[renderer] +${Date.now() - loadT0}ms: initialLoading = false`);
      setInitialLoading(false);
    });

    // Reconcile thread snapshots in the background.
    void readBridge()
      .getThreadSnapshots()
      .then((snapshots) => {
        if (!isActive) {
          return;
        }

        const currentView = useAppStore.getState().view;
        const selectedIds = new Set(currentView.kind === "thread" ? currentView.panes : []);
        const storeThreadIds = new Set(useAppStore.getState().threads.map((t) => t.id));

        for (const snapshot of snapshots) {
          if (!selectedIds.has(snapshot.threadId) && storeThreadIds.has(snapshot.threadId)) {
            void readBridge()
              .closeThread({ threadId: snapshot.threadId })
              .catch(() => undefined);
          }
        }

        startTransition(() => {
          reconcileRuntimeSnapshots(
            selectedIds.size > 0 ? snapshots.filter((s) => selectedIds.has(s.threadId)) : [],
          );
        });
      });

    return () => {
      isActive = false;
    };
  }, [loadT0, markThreadsInactiveOnLaunch, reconcileRuntimeSnapshots, storeHydrated]);

  useEffect(() => {
    if (!storeHydrated) {
      return;
    }

    let isActive = true;
    void readBridge()
      .listWslDistros()
      .then((distros) => {
        if (!isActive) {
          return;
        }
        startTransition(() => {
          setWslAvailable(distros.length > 0);
        });
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        startTransition(() => {
          setWslAvailable(false);
        });
      });

    return () => {
      isActive = false;
    };
  }, [storeHydrated]);

  useEffect(() => {
    if (!storeHydrated) {
      return;
    }

    // Fire-and-forget: triggers detection in the supervisor.
    // Results arrive via events (windows-agent-statuses, wsl-agent-statuses).
    void readBridge()
      .getAgentStatuses(wslProjectDistrosKey ? wslProjectDistrosKey.split("\0") : [])
      .catch(() => undefined);
  }, [storeHydrated, wslProjectDistrosKey]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        useDevTerminalStore.getState().togglePanel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Poll git status, branches, and worktrees for all projects
  useEffect(() => {
    if (!storeHydrated || projects.length === 0) return;

    let isActive = true;
    let isPolling = false;
    let lastFetchTime = 0;

    async function pollGitStatus() {
      if (isPolling) {
        return;
      }
      isPolling = true;
      const t0 = Date.now();
      const gitStoreActions = useGitStore.getState();

      try {
        // Fetch from remote periodically so ahead/behind counts stay fresh
        const shouldFetch = t0 - lastFetchTime >= GIT_FETCH_INTERVAL_MS;
        if (shouldFetch) lastFetchTime = t0;

        await Promise.all(
          projects.map(async (project) => {
            if (!isActive) return;

            // Background fetch (best-effort, don't block status polling)
            if (shouldFetch) {
              try {
                await readBridge().gitFetch({
                  projectLocation: project.location,
                  remote: "origin",
                  prune: false,
                });
              } catch {
                // ignore — remote may be unreachable
              }
              if (!isActive) return;
            }

            // Status, branches, and worktrees in parallel
            const [statusResult, branchesResult, worktreesResult] = await Promise.allSettled([
              readBridge().getGitStatus({ projectLocation: project.location }),
              readBridge().gitListBranches({
                projectLocation: project.location,
                includeRemote: true,
              }),
              readBridge().gitListWorktrees({ projectLocation: project.location }),
            ]);
            if (!isActive) return;

            const status = statusResult.status === "fulfilled" ? statusResult.value : undefined;
            const branches =
              branchesResult.status === "fulfilled" ? branchesResult.value : undefined;
            const worktrees =
              worktreesResult.status === "fulfilled" ? worktreesResult.value.worktrees : undefined;
            const ghAvailable = useGitStore.getState().ghAvailable[project.id];

            gitStoreActions.setProjectSnapshot(project.id, {
              ...(status ? { status } : {}),
              ...(branches ? { branches } : {}),
              ...(worktrees ? { worktrees } : {}),
              ...(ghAvailable === undefined && status?.remoteInfo?.platform !== "github"
                ? { ghAvailable: false }
                : {}),
            });

            if (worktrees) {
              const worktreeStatusEntries = await Promise.all(
                worktrees
                  .filter((wt) => !wt.isMain)
                  .map(async (wt) => {
                    if (!isActive) return undefined;
                    try {
                      const wtLocation = buildWorktreeLocation(project.location, wt.path);
                      const wtStatus = await readBridge().getGitStatus({
                        projectLocation: wtLocation,
                      });
                      if (!isActive) return undefined;
                      return [wt.path, wtStatus] as const;
                    } catch {
                      return undefined;
                    }
                  }),
              );
              if (!isActive) return;

              const nextWorktreeStatuses = Object.fromEntries(
                worktreeStatusEntries.filter((entry) => entry !== undefined),
              );
              if (Object.keys(nextWorktreeStatuses).length > 0) {
                gitStoreActions.setWorktreeStatuses(nextWorktreeStatuses);
              }
            }

            // Check gh availability once (first poll where it's undefined)
            if (ghAvailable === undefined) {
              const isGitHub = status?.remoteInfo?.platform === "github";
              if (isGitHub) {
                readBridge()
                  .ghCheckAvailable({ projectLocation: project.location })
                  .then((r) => useGitStore.getState().setGhAvailable(project.id, r.available))
                  .catch(() => useGitStore.getState().setGhAvailable(project.id, false));
              }
            }

            // Poll PR data for worktree threads on GitHub projects
            if (useGitStore.getState().ghAvailable[project.id]) {
              const currentThreads = useAppStore.getState().threads;
              const wtThreads = currentThreads.filter(
                (t) => t.projectId === project.id && t.worktreeBranch && t.worktreePath,
              );
              const prUpdates: Record<string, PrData | null> = {};
              const prNumberUpdates = new Map<string, number | undefined>();

              await Promise.all(
                wtThreads.map(async (t) => {
                  if (!isActive || !t.worktreeBranch || !t.worktreePath) return;
                  try {
                    const pr = await readBridge().ghGetPrForBranch({
                      projectLocation: project.location,
                      branch: t.worktreeBranch,
                    });
                    if (!isActive) return;
                    prUpdates[t.worktreePath] = pr;
                    const newPrNumber = pr?.number ?? undefined;
                    if (newPrNumber !== t.prNumber) {
                      prNumberUpdates.set(t.id, newPrNumber);
                    }
                  } catch {
                    // ignore — gh may not be authenticated
                  }
                }),
              );
              if (!isActive) return;

              if (Object.keys(prUpdates).length > 0) {
                gitStoreActions.setPrDataBatch(prUpdates);
              }
              if (prNumberUpdates.size > 0) {
                useAppStore.setState((state) => {
                  let changed = false;
                  const nextThreads = state.threads.map((thread) => {
                    if (!prNumberUpdates.has(thread.id)) {
                      return thread;
                    }
                    const nextPrNumber = prNumberUpdates.get(thread.id);
                    if (thread.prNumber === nextPrNumber) {
                      return thread;
                    }
                    changed = true;
                    return { ...thread, prNumber: nextPrNumber };
                  });
                  return changed ? { threads: nextThreads } : state;
                });
              }
            }
          }),
        );
      } finally {
        isPolling = false;
        console.log(`[renderer] git poll total: ${Date.now() - t0}ms (${projects.length} projects)`);
      }
    }

    void pollGitStatus();
    const intervalId = setInterval(() => void pollGitStatus(), GIT_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [storeHydrated, projects]);

  const currentPaneIds = view.kind === "thread" ? view.panes : EMPTY_PANES;
  const currentProjectId = useAppStore((s) => {
    const v = s.view;
    if (v.kind === "draft") return v.projectId;
    if (v.kind === "thread") {
      return s.threads.find((t) => t.id === v.panes[0])?.projectId;
    }
    return undefined;
  });

  useEffect(() => {
    if (!storeHydrated) return;

    const currentThreads = useAppStore.getState().threads;
    const currentProjects = useAppStore.getState().projects;
    for (const paneId of currentPaneIds) {
      const thread = currentThreads.find((t) => t.id === paneId);
      if (!thread || thread.status !== "inactive") continue;
      const project = currentProjects.find((p) => p.id === thread.projectId);
      if (!project) continue;
      reopenStoredThread({
        threadId: thread.id,
        projectLocation: project.location,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reopenStoredThread is a useEffectEvent
  }, [currentPaneIds, storeHydrated]);

  if (initialLoading) {
    console.log(
      `[renderer] +${Date.now() - loadT0}ms: rendering spinner (hydrated=${storeHydrated})`,
    );
    return (
      <AppProvider>
        <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
          <div className="flex flex-col items-center gap-4">
            <Spinner size="lg" />
            <p className="text-sm text-muted">Loading&hellip;</p>
          </div>
        </div>
      </AppProvider>
    );
  }

  console.log(`[renderer] +${Date.now() - loadT0}ms: rendering main UI`);
  return (
    <AppProvider>
      <PageLayout
        title="Lightcode"
        onTitleClick={() => startTransition(() => openHome())}
        headerChildren={
          <div className="lightcode-overlay-header__controls">
            {isWindows() ? (
              <Dropdown>
                <Button
                  isIconOnly
                  aria-label="Add project"
                  size="sm"
                  variant="ghost"
                  className="size-6 min-w-0 text-muted hover:text-foreground"
                >
                  <FolderPlus className="size-3.5" />
                </Button>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    aria-label="Add project options"
                    onAction={(key) => {
                      if (key === "windows") {
                        void readBridge()
                          .pickFolder()
                          .then((path) => {
                            if (!path) return;
                            startTransition(() => {
                              const project = addProject({ kind: "windows", path });
                              autoDetectSetupScript(project);
                              openDraft(project.id);
                            });
                          });
                      }
                      if (key === "wsl") {
                        void readBridge()
                          .listWslDistros()
                          .then((distros) => {
                            const distro = distros[0];
                            const defaultPath = distro
                              ? `\\\\wsl.localhost\\${distro}\\home`
                              : undefined;
                            return readBridge().pickFolder(defaultPath);
                          })
                          .then((selectedPath) => {
                            if (!selectedPath) return;
                            const parsed = parseWslUncPath(selectedPath);
                            if (!parsed) return;
                            startTransition(() => {
                              const project = addProject({
                                kind: "wsl",
                                distro: parsed.distro,
                                linuxPath: parsed.linuxPath,
                                uncPath: selectedPath,
                              });
                              autoDetectSetupScript(project);
                              openDraft(project.id);
                            });
                          });
                      }
                    }}
                  >
                    <Dropdown.Item id="windows" textValue="Add Windows Project">
                      <Monitor className="size-4 shrink-0 text-muted" />
                      <Label>Add Windows Project</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="wsl" isDisabled={!wslAvailable} textValue="Add WSL Project">
                      <TuxIcon className="size-4 shrink-0 text-muted" />
                      <Label>Add WSL Project</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            ) : (
              <Button
                isIconOnly
                aria-label="Add project"
                size="sm"
                variant="ghost"
                className="size-6 min-w-0 text-muted hover:text-foreground"
                onPress={() => {
                  void readBridge()
                    .pickFolder()
                    .then((path) => {
                      if (!path) return;
                      startTransition(() => {
                        const project = addProject({ kind: "posix", path });
                        autoDetectSetupScript(project);
                        openDraft(project.id);
                      });
                    });
                }}
              >
                <FolderPlus className="size-3.5" />
              </Button>
            )}
          </div>
        }
        sidebar={
          <Sidebar
            projects={projects}
            currentProjectId={currentProjectId}
            currentThreadIds={view.kind === "thread" ? view.panes : []}
            onOpenNewThread={(projectId) => {
              const targetProjectId = projectId ?? currentProjectId ?? projects[0]?.id;

              startTransition(() => {
                if (targetProjectId) {
                  openDraft(targetProjectId);
                  return;
                }

                openHome();
              });
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenGitReview={(projectId, worktreePath?) =>
              setGitReviewContext({ projectId, worktreePath })
            }
            onGitSync={(projectId, worktreePath?) => {
              const project = projects.find((p) => p.id === projectId);
              if (!project) return;
              const location = worktreePath
                ? buildWorktreeLocation(project.location, worktreePath)
                : project.location;
              void readBridge()
                .gitSync({ projectLocation: location })
                .catch(() => undefined);
            }}
            onGitMergeToSource={(projectId, worktreePath) => {
              const project = projects.find((p) => p.id === projectId);
              if (!project) return;
              const thread = useAppStore
                .getState()
                .threads.find((t) => t.worktreePath === worktreePath && t.worktreeBranch);
              if (!thread?.worktreeBranch) return;
              void (async () => {
                try {
                  const { sourceBranch } = await readBridge().gitGetWorktreeSourceBranch({
                    projectLocation: project.location,
                    branch: thread.worktreeBranch!,
                  });
                  if (!sourceBranch) return;
                  const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
                  await readBridge().gitMergeToSource({
                    projectLocation: project.location,
                    worktreeLocation,
                    worktreeBranch: thread.worktreeBranch!,
                    sourceBranch,
                  });
                } catch {
                  // ignored — user can open git review for details
                }
              })();
            }}
            onGitMergeAndRemove={(projectId, worktreePath) => {
              const project = projects.find((p) => p.id === projectId);
              if (!project) return;
              const allThreads = useAppStore.getState().threads;
              const thread = allThreads.find(
                (t) => t.worktreePath === worktreePath && t.worktreeBranch,
              );
              if (!thread?.worktreeBranch) return;
              void (async () => {
                try {
                  const { sourceBranch } = await readBridge().gitGetWorktreeSourceBranch({
                    projectLocation: project.location,
                    branch: thread.worktreeBranch!,
                  });
                  if (!sourceBranch) return;
                  const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
                  const result = await readBridge().gitMergeToSource({
                    projectLocation: project.location,
                    worktreeLocation,
                    worktreeBranch: thread.worktreeBranch!,
                    sourceBranch,
                  });
                  if (!result.merged) return;
                  const siblings = allThreads.filter((t) => t.worktreePath === worktreePath);
                  for (const sib of siblings) {
                    deleteThread(sib.id);
                    void readBridge()
                      .closeThread({ threadId: sib.id })
                      .catch(() => undefined);
                  }
                  void performWorktreeRemoval(project, worktreePath, thread.worktreeBranch);
                } catch {
                  // ignored — user can open git review for details
                }
              })();
            }}
            onGitPullFromSource={(projectId, worktreePath) => {
              const project = projects.find((p) => p.id === projectId);
              if (!project) return;
              const thread = useAppStore
                .getState()
                .threads.find((t) => t.worktreePath === worktreePath && t.worktreeBranch);
              if (!thread?.worktreeBranch) return;
              void (async () => {
                try {
                  const { sourceBranch } = await readBridge().gitGetWorktreeSourceBranch({
                    projectLocation: project.location,
                    branch: thread.worktreeBranch!,
                  });
                  if (!sourceBranch) return;
                  const worktreeLocation = buildWorktreeLocation(project.location, worktreePath);
                  const result = await readBridge().gitPullFromSource({ worktreeLocation, sourceBranch });
                  // Background sync — abort if conflicts, user resolves manually via git review
                  if (result.conflicting) {
                    await readBridge().gitAbortMerge({ worktreeLocation }).catch(() => undefined);
                  }
                } catch {
                  // ignored — user can open git review for details
                }
              })();
            }}
            onOpenThread={(threadId) => {
              const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
              const project = thread
                ? projects.find((item) => item.id === thread.projectId)
                : undefined;

              startTransition(() => {
                openThread(threadId);
              });

              if (storeHydrated && thread?.status === "inactive" && project) {
                reopenStoredThread({
                  threadId,
                  projectLocation: project.location,
                });
              }
            }}
            onOpenThreadSideBySide={(threadId) => {
              const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
              const project = thread
                ? projects.find((item) => item.id === thread.projectId)
                : undefined;

              startTransition(() => {
                openThreadSideBySide(threadId);
              });

              if (storeHydrated && thread?.status === "inactive" && project) {
                reopenStoredThread({
                  threadId,
                  projectLocation: project.location,
                });
              }
            }}
            onReplaceSecondPane={(threadId) => {
              const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
              const project = thread
                ? projects.find((item) => item.id === thread.projectId)
                : undefined;

              startTransition(() => {
                replaceSecondPane(threadId);
              });

              if (storeHydrated && thread?.status === "inactive" && project) {
                reopenStoredThread({
                  threadId,
                  projectLocation: project.location,
                });
              }
            }}
            onRenameThread={(threadId, title) => {
              renameThread(threadId, title);
            }}
            onDeleteThread={(threadId, worktreePath, projectId) => {
              if (!worktreePath) {
                deleteThread(threadId);
                void readBridge()
                  .closeThread({ threadId })
                  .catch(() => undefined);
                return;
              }

              const pref = readWorktreeDeletePref();
              if (pref === "thread-only") {
                deleteThread(threadId);
                void readBridge()
                  .closeThread({ threadId })
                  .catch(() => undefined);
                return;
              }

              if (pref === "thread-and-worktree") {
                // Delete this thread + all siblings sharing the worktree
                const allThreads = useAppStore.getState().threads;
                const thread = allThreads.find((t) => t.id === threadId);
                const siblings = allThreads.filter(
                  (t) => t.worktreePath === worktreePath && t.id !== threadId,
                );
                deleteThread(threadId);
                void readBridge()
                  .closeThread({ threadId })
                  .catch(() => undefined);
                for (const t of siblings) {
                  deleteThread(t.id);
                  void readBridge()
                    .closeThread({ threadId: t.id })
                    .catch(() => undefined);
                }

                const project = projects.find((p) => p.id === projectId);
                if (project) {
                  void performWorktreeRemoval(project, worktreePath, thread?.worktreeBranch);
                }
                return;
              }

              // No preference — show dialog
              const thread = useAppStore.getState().threads.find((t) => t.id === threadId);
              setWorktreeDeleteDialog({
                kind: "single-thread",
                threadId,
                projectId: projectId!,
                worktreePath,
                worktreeBranch:
                  thread?.worktreeBranch ?? worktreePath.split(/[/\\]/).pop() ?? worktreePath,
              });
            }}
            onDeleteProject={(projectId) => {
              const projectThreadIds = useAppStore
                .getState()
                .threads.filter((t) => t.projectId === projectId)
                .map((t) => t.id);

              deleteProject(projectId);

              for (const threadId of projectThreadIds) {
                void readBridge()
                  .closeThread({ threadId })
                  .catch(() => undefined);
              }

              const removedTabIds = useDevTerminalStore.getState().removeTabsForProject(projectId);
              for (const tabId of removedTabIds) {
                void readBridge()
                  .closeThread({ threadId: tabId })
                  .catch(() => undefined);
              }

              const termStore = useDevTerminalStore.getState();
              if (termStore.isOpen && termStore.activeProjectId === projectId) {
                termStore.closePanel();
              }

              useGitStore.getState().clearStatus(projectId);

              if (gitReviewContext?.projectId === projectId) {
                setGitReviewContext(null);
              }
            }}
            onDeleteWorktreeGroup={(projectId, worktreePath, threadIds) => {
              const project = projects.find((p) => p.id === projectId);
              if (!project) return;

              const sampleThread = useAppStore
                .getState()
                .threads.find((t) => threadIds.includes(t.id) && t.worktreeBranch);

              for (const threadId of threadIds) {
                deleteThread(threadId);
                void readBridge()
                  .closeThread({ threadId })
                  .catch(() => undefined);
              }

              void performWorktreeRemoval(project, worktreePath, sampleThread?.worktreeBranch);
            }}
            onOpenProjectSettings={(projectId) => setProjectSettingsId(projectId)}
            onRunProjectAction={(projectId, actionId, worktreePath) => {
              runProjectAction(projectId, actionId, worktreePath);
            }}
            onOpenTerminal={(projectId) => {
              const project = projects.find((p) => p.id === projectId);
              if (!project) return;

              const store = useDevTerminalStore.getState();

              // Toggle off if already showing project panel for this project.
              if (
                store.isOpen &&
                store.activeProjectId === projectId &&
                !store.activeWorktreePath
              ) {
                store.closePanel();
                return;
              }

              // Open project panel (clears any worktree context).
              store.openPanel(projectId);

              // If the project already has a non-worktree tab, activate it.
              const existingTab = store.tabs.find(
                (t) => t.projectId === projectId && !t.worktreePath,
              );
              if (existingTab) {
                store.setActiveTab(existingTab.id);
                return;
              }

              // Otherwise create a new tab — DevTerminalPanel's effect handles spawning.
              const tab = store.addTab(projectId, project.name);
              store.setActiveTab(tab.id);
            }}
            onOpenWorktreeTerminal={(projectId, worktreePath) => {
              const project = projects.find((p) => p.id === projectId);
              if (!project) return;

              const store = useDevTerminalStore.getState();

              // Toggle off if already showing this worktree's panel.
              if (
                store.isOpen &&
                store.activeProjectId === projectId &&
                store.activeWorktreePath === worktreePath
              ) {
                store.closePanel();
                return;
              }

              // Open worktree panel (sets worktree context, separate from project panel).
              store.openWorktreePanel(projectId, worktreePath);

              // If a tab for this worktree already exists, activate it.
              const existingTab = store.tabs.find(
                (t) => t.projectId === projectId && t.worktreePath === worktreePath,
              );
              if (existingTab) {
                store.setActiveTab(existingTab.id);
                return;
              }

              // Create a new tab with the worktree path.
              const branchName = worktreePath.split(/[/\\]/).pop() ?? project.name;
              const tab = store.addTab(projectId, branchName, worktreePath);
              store.setActiveTab(tab.id);
            }}
            terminalProjectIds={terminalProjectIds}
            activeTerminalProjectId={devTerminalActiveProjectId}
            activeWorktreeTerminalPaths={devTerminalTabs
              .filter((t) => t.worktreePath)
              .map((t) => t.worktreePath!)}
            activeWorktreeTerminalPath={
              devTerminalOpen
                ? useDevTerminalStore.getState().activeWorktreePath
                : null
            }
            onReorderProjects={(sourceProjectId, targetProjectId, placement) => {
              startTransition(() => {
                reorderProjects(sourceProjectId, targetProjectId, placement);
              });
            }}
            onReorderThreads={(sourceThreadId, targetThreadId, placement) => {
              startTransition(() => {
                reorderThreads(sourceThreadId, targetThreadId, placement);
              });
            }}
            onReorderThreadBlock={(blockIds, targetId, placement) => {
              startTransition(() => {
                reorderThreadBlock(blockIds, targetId, placement);
              });
            }}
          />
        }
        content={<AppContent />}
        rightPanel={<DevTerminalPanel projects={projects} />}
        rightPanelOpen={devTerminalOpen}
      />
      <OverlayShell open={settingsOpen}>
        <SettingsOverlay onClose={() => setSettingsOpen(false)} />
      </OverlayShell>
      <OverlayShell open={!!projectSettingsId} onExited={() => setProjectSettingsId(null)}>
        {projectSettingsId && (
          <ProjectSettingsOverlay
            projectId={projectSettingsId}
            onClose={() => setProjectSettingsId(null)}
          />
        )}
      </OverlayShell>
      <OverlayShell open={!!gitReviewContext} onExited={() => setGitReviewContext(null)}>
        {gitReviewContext && (
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center">
                <Spinner size="lg" />
              </div>
            }
          >
            <GitReviewOverlay
              project={projects.find((p) => p.id === gitReviewContext.projectId)!}
              {...(gitReviewContext.worktreePath
                ? {
                    locationOverride: buildWorktreeLocation(
                      projects.find((p) => p.id === gitReviewContext.projectId)!.location,
                      gitReviewContext.worktreePath,
                    ),
                    statusKey: gitReviewContext.worktreePath,
                    worktreePath: gitReviewContext.worktreePath,
                    worktreeBranch:
                      useAppStore
                        .getState()
                        .threads.find(
                          (t) => t.worktreePath === gitReviewContext!.worktreePath,
                        )?.worktreeBranch ?? undefined,
                    onMergeAndRemove: () => {
                      const allThreads = useAppStore.getState().threads;
                      const reviewProject = projects.find(
                        (p) => p.id === gitReviewContext!.projectId,
                      );
                      const wtPath = gitReviewContext!.worktreePath;
                      const wtBranch = allThreads.find(
                        (t) => t.worktreePath === wtPath,
                      )?.worktreeBranch;
                      setGitReviewContext(null);
                      if (reviewProject && wtPath) {
                        const siblings = allThreads.filter(
                          (t) => t.worktreePath === wtPath,
                        );
                        for (const sib of siblings) {
                          deleteThread(sib.id);
                          void readBridge()
                            .closeThread({ threadId: sib.id })
                            .catch(() => undefined);
                        }
                        void performWorktreeRemoval(reviewProject, wtPath, wtBranch);
                      }
                    },
                  }
                : {})}
              onClose={() => setGitReviewContext(null)}
            />
          </Suspense>
        )}
      </OverlayShell>
      {worktreeDeleteDialog?.kind === "single-thread" && (
        <DeleteWorktreeDialog
          isOpen
          worktreeBranch={worktreeDeleteDialog.worktreeBranch}
          onClose={() => setWorktreeDeleteDialog(null)}
          onDeleteThreadOnly={() => {
            deleteThread(worktreeDeleteDialog.threadId);
            void readBridge()
              .closeThread({ threadId: worktreeDeleteDialog.threadId })
              .catch(() => undefined);
            setWorktreeDeleteDialog(null);
          }}
          onDeleteThreadAndWorktree={() => {
            // Delete this thread + all siblings sharing the worktree
            const siblings = useAppStore
              .getState()
              .threads.filter(
                (t) =>
                  t.worktreePath === worktreeDeleteDialog.worktreePath &&
                  t.id !== worktreeDeleteDialog.threadId,
              );
            deleteThread(worktreeDeleteDialog.threadId);
            void readBridge()
              .closeThread({ threadId: worktreeDeleteDialog.threadId })
              .catch(() => undefined);
            for (const t of siblings) {
              deleteThread(t.id);
              void readBridge()
                .closeThread({ threadId: t.id })
                .catch(() => undefined);
            }

            const project = projects.find((p) => p.id === worktreeDeleteDialog.projectId);
            if (project) {
              void performWorktreeRemoval(
                project,
                worktreeDeleteDialog.worktreePath,
                worktreeDeleteDialog.worktreeBranch,
              );
            }
            setWorktreeDeleteDialog(null);
          }}
        />
      )}
      {worktreeDeleteDialog?.kind === "force-retry" && (
        <ForceRemoveWorktreeDialog
          isOpen
          worktreeBranch={worktreeDeleteDialog.worktreeBranch}
          errorMessage={worktreeDeleteDialog.error}
          onClose={() => setWorktreeDeleteDialog(null)}
          onForceRemove={() => {
            const project = projects.find((p) => p.id === worktreeDeleteDialog.projectId);
            const { worktreePath, worktreeBranch } = worktreeDeleteDialog;
            setWorktreeDeleteDialog(null);
            if (project) {
              void (async () => {
                try {
                  await readBridge().gitRemoveWorktree({
                    projectLocation: project.location,
                    path: worktreePath,
                    force: true,
                  });
                } catch {
                  return;
                }

                // Worktree force-removed — now clean up the branch
                if (worktreeBranch) {
                  try {
                    await readBridge().gitDeleteBranch({
                      projectLocation: project.location,
                      branch: worktreeBranch,
                      force: false,
                    });
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes("not fully merged")) {
                      setWorktreeDeleteDialog({
                        kind: "branch-unmerged",
                        projectId: project.id,
                        worktreeBranch,
                        error: msg,
                      });
                      return;
                    }
                  }

                  void readBridge()
                    .gitListBranches({
                      projectLocation: project.location,
                      includeRemote: true,
                    })
                    .then((branches) => useGitStore.getState().setBranches(project.id, branches))
                    .catch(() => undefined);
                }
              })();
            }
          }}
        />
      )}
      {worktreeDeleteDialog?.kind === "branch-unmerged" && (
        <ForceDeleteBranchDialog
          isOpen
          branch={worktreeDeleteDialog.worktreeBranch}
          errorMessage={worktreeDeleteDialog.error}
          onClose={() => setWorktreeDeleteDialog(null)}
          onKeepBranch={() => setWorktreeDeleteDialog(null)}
          onForceDelete={() => {
            const project = projects.find((p) => p.id === worktreeDeleteDialog.projectId);
            if (project) {
              void readBridge()
                .gitDeleteBranch({
                  projectLocation: project.location,
                  branch: worktreeDeleteDialog.worktreeBranch,
                  force: true,
                })
                .then(() => {
                  void readBridge()
                    .gitListBranches({
                      projectLocation: project.location,
                      includeRemote: true,
                    })
                    .then((branches) => useGitStore.getState().setBranches(project.id, branches))
                    .catch(() => undefined);
                })
                .catch(() => undefined);
            }
            setWorktreeDeleteDialog(null);
          }}
        />
      )}
    </AppProvider>
  );
}
