import React, { lazy, startTransition, Suspense, useEffect, useEffectEvent, useState } from "react";
import { ArrowRight, FolderOpen, FolderPlus, Monitor, Plus, TerminalSquare } from "lucide-react";
import { Button, Dropdown, Label, Spinner } from "@heroui/react";
import { TuxIcon } from "./components/common/TuxIcon";
import { getProjectAgentStatuses } from "../shared/agentStatus";
import { parseWslUncPath } from "../shared/wsl";
import { buildWorktreeLocation } from "../shared/worktree";
import { readBridge } from "./bridge";
import { ProviderIcon, getStatusTone } from "./components/providers";
import { DevTerminalPanel } from "./components/devTerminal/DevTerminalPanel";
import { AppShell } from "./components/layout/AppShell";
import { OverlayHeader } from "./components/layout/OverlayHeader";
import { OverlayShell } from "./components/layout/OverlayShell";
import { SplitPaneContainer } from "./components/layout/SplitPaneContainer";
import { SettingsOverlay } from "./components/settings/SettingsOverlay";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ThreadDraftView } from "./components/thread/ThreadDraftView";
import { ThreadView } from "./components/thread/ThreadView";
import { AppProvider } from "./components/ui/provider";
const GitReviewOverlay = lazy(() =>
  import("./components/gitReview/GitReviewOverlay").then((m) => ({ default: m.GitReviewOverlay })),
);
import { useAppStore } from "./state/appStore";
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
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Projects
                </h2>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted">
                    Add a project from the sidebar to get started.
                  </p>
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

function AppContent() {
  const view = useAppStore((state) => state.view);
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const pendingServerRequests = useAppStore((state) => state.pendingServerRequests);
  const pendingThreadLaunches = useAppStore((state) => state.pendingThreadLaunches);
  const agentStatuses = useAppStore((state) => state.agentStatuses);
  const wslAgentStatuses = useAppStore((state) => state.wslAgentStatuses);
  const createThread = useAppStore((state) => state.createThread);
  const queueThreadLaunch = useAppStore((state) => state.queueThreadLaunch);
  const consumeThreadLaunch = useAppStore((state) => state.consumeThreadLaunch);
  const updateProjectDraftConfig = useAppStore((state) => state.updateProjectDraftConfig);
  const removeThreadServerRequest = useAppStore((state) => state.removeThreadServerRequest);
  const updateThreadConfig = useAppStore((state) => state.updateThreadConfig);
  const updateThreadRuntime = useAppStore((state) => state.updateThreadRuntime);
  const touchThread = useAppStore((state) => state.touchThread);
  const reorderPanes = useAppStore((state) => state.reorderPanes);
  const openThread = useAppStore((state) => state.openThread);
  const openThreadSideBySide = useAppStore((state) => state.openThreadSideBySide);
  const replaceSecondPane = useAppStore((state) => state.replaceSecondPane);
  const insertPaneAtIndex = useAppStore((state) => state.insertPaneAtIndex);
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
              } catch (err) {
                console.error("[renderer] failed to create worktree:", err);
              }
            }

            const thread = createThread({
              projectId: project.id,
              agentKind,
              config,
              prompt,
              ...(worktreePath ? { worktreePath, worktreeBranch } : {}),
            });
            queueThreadLaunch(thread.id, prompt);
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
    const paneElements = view.panes
      .map((paneThreadId, paneIndex) => {
        const thread = threads.find((item) => item.id === paneThreadId);
        if (!thread) return null;
        const project = projects.find((item) => item.id === thread.projectId);
        if (!project) return null;
        const projectAgentStatuses = getProjectAgentStatuses(
          project.location,
          agentStatuses,
          wslAgentStatuses,
        );
        const agentStatus = projectAgentStatuses.find((status) => status.kind === thread.agentKind);
        const paneAlign =
          paneCount <= 1
            ? ("center" as const)
            : paneIndex === 0
              ? ("right" as const)
              : paneIndex === paneCount - 1
                ? ("left" as const)
                : ("center" as const);

        const dropIndicator: false | "replace" | "insert-left" | "insert-right" =
          paneDropTarget === paneThreadId
            ? "replace"
            : sidebarDropTarget?.kind === "replace" && sidebarDropTarget.paneIndex === paneIndex
              ? "replace"
              : sidebarDropTarget?.kind === "insert" && sidebarDropTarget.index === paneIndex
                ? "insert-left"
                : sidebarDropTarget?.kind === "insert" && sidebarDropTarget.index === paneIndex + 1
                  ? "insert-right"
                  : false;

        return (
          <ThreadView
            key={paneThreadId}
            thread={thread}
            agentStatus={agentStatus}
            isWsl={project.location.kind === "wsl"}
            showCloseButton={paneCount > 1}
            paneAlign={paneAlign}
            isDragging={paneDragSource === paneThreadId}
            paneDragActive={paneDragSource !== undefined || sidebarDragActive}
            dropIndicator={dropIndicator}
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
            onConfigChange={(config) => updateThreadConfig(thread.id, config)}
            pendingServerRequests={pendingServerRequests.filter(
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
                  canResumeWithConfig:
                    thread.canResumeWithConfig || thread.sessionRef !== undefined,
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
            {...(pendingThreadLaunches[thread.id] !== undefined
              ? { pendingLaunchPrompt: pendingThreadLaunches[thread.id] }
              : {})}
            onSubmitInput={async (prompt) => {
              await readBridge().sendThreadInput({
                threadId: thread.id,
                prompt,
                config: thread.config,
              });
              touchThread(thread.id);
            }}
          />
        );
      })
      .filter(Boolean);

    if (paneElements.length === 0) {
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

export function App() {
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
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
    // Only highlight project icon if active tab is a project-level tab (not worktree)
    const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
    if (activeTab?.worktreePath) return null;
    return s.activeProjectId;
  });
  const devTerminalTabs = useDevTerminalStore((s) => s.tabs);
  const terminalProjectIds = devTerminalTabs.reduce<string[]>((ids, t) => {
    if (!t.worktreePath && !ids.includes(t.projectId)) ids.push(t.projectId);
    return ids;
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gitReviewContext, setGitReviewContext] = useState<{
    projectId: string;
    worktreePath?: string | undefined;
  } | null>(null);
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
      const thread = threads.find((item) => item.id === input.threadId);
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
    let lastFetchTime = 0;

    async function pollGitStatus() {
      const t0 = Date.now();
      const gitStoreActions = useGitStore.getState();

      // Fetch from remote periodically so ahead/behind counts stay fresh
      const shouldFetch = t0 - lastFetchTime >= GIT_FETCH_INTERVAL_MS;
      if (shouldFetch) lastFetchTime = t0;

      for (const project of projects) {
        if (!isActive) return;

        // Background fetch (best-effort, don't block status polling)
        if (shouldFetch) {
          try {
            await readBridge().gitFetch({ projectLocation: project.location, remote: "origin", prune: false });
          } catch {
            // ignore — remote may be unreachable
          }
          if (!isActive) return;
        }

        // Main project status
        try {
          const pt = Date.now();
          const status = await readBridge().getGitStatus({
            projectLocation: project.location,
          });
          console.log(
            `[renderer] git status ${project.name} (${project.location.kind}): ${Date.now() - pt}ms`,
          );
          if (!isActive) return;
          gitStoreActions.setStatus(project.id, status);
        } catch {
          // Not a git repo or git not available
        }

        // Branches
        try {
          const branches = await readBridge().gitListBranches({
            projectLocation: project.location,
            includeRemote: true,
          });
          if (!isActive) return;
          gitStoreActions.setBranches(project.id, branches);
        } catch {
          // ignore
        }

        // Worktrees
        try {
          const { worktrees } = await readBridge().gitListWorktrees({
            projectLocation: project.location,
          });
          if (!isActive) return;
          gitStoreActions.setWorktrees(project.id, worktrees);

          // Poll status for each non-main worktree
          for (const wt of worktrees) {
            if (wt.isMain || !isActive) continue;
            try {
              const wtLocation = buildWorktreeLocation(project.location, wt.path);
              const wtStatus = await readBridge().getGitStatus({
                projectLocation: wtLocation,
              });
              if (!isActive) return;
              gitStoreActions.setWorktreeStatus(wt.path, wtStatus);
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      }
      console.log(`[renderer] git poll total: ${Date.now() - t0}ms (${projects.length} projects)`);
    }

    void pollGitStatus();
    const intervalId = setInterval(() => void pollGitStatus(), GIT_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [storeHydrated, projects]);

  const currentPaneIds = view.kind === "thread" ? view.panes : EMPTY_PANES;
  const currentProjectId =
    view.kind === "draft"
      ? view.projectId
      : view.kind === "thread"
        ? threads.find((thread) => thread.id === view.panes[0])?.projectId
        : undefined;

  useEffect(() => {
    if (!storeHydrated) return;

    for (const paneId of currentPaneIds) {
      const thread = threads.find((t) => t.id === paneId);
      if (!thread || thread.status !== "inactive") continue;
      const project = projects.find((p) => p.id === thread.projectId);
      if (!project) continue;
      reopenStoredThread({
        threadId: thread.id,
        projectLocation: project.location,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reopenStoredThread is a useEffectEvent
  }, [currentPaneIds, threads, projects, storeHydrated]);

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
      <div className="flex h-full min-h-0 flex-col">
        <OverlayHeader
          title="Lightcode"
          onTitleClick={() => startTransition(() => openHome())}
        >
          <div className="lightcode-overlay-header__controls">
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
                  <Dropdown.Item
                    id="wsl"
                    isDisabled={!wslAvailable}
                    textValue="Add WSL Project"
                  >
                    <TuxIcon className="size-4 shrink-0 text-muted" />
                    <Label>Add WSL Project</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </OverlayHeader>
        <div className="lightcode-overlay-body min-h-0 flex-1">
      <AppShell
        sidebar={
          <Sidebar
            projects={projects}
            threads={threads}
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
            onOpenThread={(threadId) => {
              const thread = threads.find((item) => item.id === threadId);
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
              const thread = threads.find((item) => item.id === threadId);
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
              const thread = threads.find((item) => item.id === threadId);
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
            onDeleteThread={(threadId) => {
              deleteThread(threadId);
              void readBridge()
                .closeThread({ threadId })
                .catch(() => undefined);
            }}
            onDeleteProject={(projectId) => {
              const projectThreadIds = threads
                .filter((t) => t.projectId === projectId)
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
            onOpenTerminal={(projectId) => {
              const project = projects.find((p) => p.id === projectId);
              if (!project) return;

              const store = useDevTerminalStore.getState();

              // If panel is already open for this project, toggle it off.
              if (store.isOpen && store.activeProjectId === projectId) {
                store.closePanel();
                return;
              }

              // Open/switch to this project.
              store.openPanel(projectId);

              // If the project already has tabs, activate the first one.
              const existingTab = store.tabs.find((t) => t.projectId === projectId);
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

              // Open/switch to this project.
              store.openPanel(projectId);

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
            activeWorktreeTerminalPath={(() => {
              if (!devTerminalOpen) return null;
              const activeTabId = useDevTerminalStore.getState().activeTabId;
              const activeTab = devTerminalTabs.find((t) => t.id === activeTabId);
              return activeTab?.worktreePath ?? null;
            })()}
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
        </div>
      </div>
      <OverlayShell open={settingsOpen}>
        <SettingsOverlay onClose={() => setSettingsOpen(false)} />
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
                  }
                : {})}
              onClose={() => setGitReviewContext(null)}
            />
          </Suspense>
        )}
      </OverlayShell>
    </AppProvider>
  );
}
