import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { ArrowRight, FolderOpen, Plus, TerminalSquare } from "lucide-react";
import { parseWslUncPath } from "../shared/wsl";
import { readBridge } from "./bridge";
import { CodexStatusIcon, getStatusTone } from "./components/providers";
import { AppShell } from "./components/layout/AppShell";
import { SettingsOverlay } from "./components/settings/SettingsOverlay";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ThreadDraftView } from "./components/thread/ThreadDraftView";
import { ThreadView } from "./components/thread/ThreadView";
import { AppProvider } from "./components/ui/provider";
import { useAppStore } from "./state/appStore";
import { useSharedSettings } from "./state/sharedSettingsStore";

// ── Module-level IPC listener ───────────────────────────────────
// Subscribes to supervisor events as soon as the module loads,
// completely outside React's lifecycle.  This guarantees events are
// never missed due to useEffect timing, StrictMode double-mounts,
// or startTransition batching.
readBridge().onSupervisorEvent((event) => {
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
});

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
                      const codexTone =
                        thread.agentKind === "codex" ? getStatusTone(thread) : undefined;

                      return (
                        <button
                          key={thread.id}
                          className="group flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                          onClick={() => openThread(thread.id)}
                          type="button"
                        >
                          {thread.agentKind === "codex" ? (
                            <CodexStatusIcon
                              className="size-4 shrink-0"
                              tone={codexTone ?? "inactive"}
                            />
                          ) : (
                            <TerminalSquare className="size-4 shrink-0 text-muted" />
                          )}
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {thread.title}
                          </p>
                          {project ? (
                            <span className="shrink-0 text-xs text-muted">{project.name}</span>
                          ) : null}
                          <span className="shrink-0 text-xs text-muted">
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
  const agentStatuses = useAppStore((state) => state.agentStatuses);
  const createThread = useAppStore((state) => state.createThread);
  const updateProjectDraftConfig = useAppStore((state) => state.updateProjectDraftConfig);
  const removeThreadServerRequest = useAppStore((state) => state.removeThreadServerRequest);
  const updateThreadConfig = useAppStore((state) => state.updateThreadConfig);
  const updateThreadRuntime = useAppStore((state) => state.updateThreadRuntime);
  const touchThread = useAppStore((state) => state.touchThread);

  if (view.kind === "draft") {
    const project = projects.find((item) => item.id === view.projectId);
    if (!project) {
      return <HomeView />;
    }
    return (
      <ThreadDraftView
        project={project}
        agentStatuses={agentStatuses}
        {...(project.lastDraftConfig ? { lastDraftConfig: project.lastDraftConfig } : {})}
        onStart={({ agentKind, config, prompt }) => {
          updateProjectDraftConfig(project.id, {
            agentKind,
            model: config.model,
            effort: config.effort,
            mode: config.mode,
            approvalPolicy: config.approvalPolicy,
            sandboxMode: config.sandboxMode,
          });

          const thread = createThread({
            projectId: project.id,
            agentKind,
            config,
            prompt,
          });

          void readBridge()
            .startThread({
              threadId: thread.id,
              projectLocation: project.location,
              agentKind,
              config,
              prompt,
            })
            .catch(() => {
              startTransition(() => {
                updateThreadRuntime(thread.id, {
                  status: "error",
                  attention: "error",
                  canResumeWithConfig: false,
                });
              });
            });
        }}
      />
    );
  }

  if (view.kind === "thread") {
    const thread = threads.find((item) => item.id === view.threadId);
    if (!thread) {
      return <HomeView />;
    }
    const project = projects.find((item) => item.id === thread.projectId);
    if (!project) {
      return <HomeView />;
    }
    const agentStatus = agentStatuses.find((status) => status.kind === thread.agentKind);
    return (
      <ThreadView
        thread={thread}
        agentStatus={agentStatus}
        onConfigChange={(config) => updateThreadConfig(thread.id, config)}
        pendingServerRequests={pendingServerRequests.filter(
          (request) => request.threadId === thread.id,
        )}
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
  }

  return <HomeView />;
}

export function App() {
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const view = useAppStore((state) => state.view);
  const setAgentStatuses = useAppStore((state) => state.setAgentStatuses);
  const markThreadsInactiveOnLaunch = useAppStore((state) => state.markThreadsInactiveOnLaunch);
  const environmentMode = useSharedSettings((state) => state.environmentMode);
  const [wslDistros, setWslDistros] = useState<string[]>([]);
  const addProject = useAppStore((state) => state.addProject);
  const openDraft = useAppStore((state) => state.openDraft);
  const openThread = useAppStore((state) => state.openThread);
  const openHome = useAppStore((state) => state.openHome);
  const deleteThread = useAppStore((state) => state.deleteThread);
  const reconcileRuntimeSnapshots = useAppStore((state) => state.reconcileRuntimeSnapshots);
  const reorderProjects = useAppStore((state) => state.reorderProjects);
  const reorderThreads = useAppStore((state) => state.reorderThreads);
  const updateThreadRuntime = useAppStore((state) => state.updateThreadRuntime);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storeHydrated, setStoreHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const [reopenAttempted] = useState(() => new Set<string>());
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

      void readBridge()
        .startThread({
          threadId: thread.id,
          projectLocation: input.projectLocation,
          agentKind: thread.agentKind,
          config: thread.config,
          prompt: "",
          ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
        })
        .catch(() => {
          startTransition(() => {
            updateThreadRuntime(thread.id, {
              status: "error",
              attention: "error",
              ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
              canResumeWithConfig: thread.canResumeWithConfig || thread.sessionRef !== undefined,
            });
          });
        });
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
      return;
    }

    let isActive = true;

    startTransition(() => {
      markThreadsInactiveOnLaunch();
    });

    void readBridge()
      .getAgentStatuses({ environmentMode })
      .then((statuses) => {
        if (!isActive) {
          return;
        }

        startTransition(() => {
          setAgentStatuses(statuses);
        });
      });

    void readBridge()
      .getThreadSnapshots()
      .then((snapshots) => {
        if (!isActive) {
          return;
        }

        // After a reload (including environment switches)
        // normalizeStoredThreadStatus already set every thread to
        // "inactive".  Only reconcile the selected thread so stale
        // sessions don't get resurrected.  Close the rest so orphaned
        // PTYs don't leak in the supervisor.
        const selectedId =
          useAppStore.getState().view.kind === "thread"
            ? useAppStore.getState().view.threadId
            : undefined;
        const storeThreadIds = new Set(
          useAppStore.getState().threads.map((t) => t.id),
        );

        for (const snapshot of snapshots) {
          if (snapshot.threadId !== selectedId && storeThreadIds.has(snapshot.threadId)) {
            void readBridge().closeThread({ threadId: snapshot.threadId }).catch(() => undefined);
          }
        }

        startTransition(() => {
          reconcileRuntimeSnapshots(
            selectedId ? snapshots.filter((s) => s.threadId === selectedId) : [],
          );
        });
      });

    void readBridge()
      .listWslDistros()
      .then((distros) => {
        if (!isActive) {
          return;
        }

        startTransition(() => {
          setWslDistros(distros);
        });
      });

    return () => {
      isActive = false;
    };
  }, [
    environmentMode,
    markThreadsInactiveOnLaunch,
    reconcileRuntimeSnapshots,
    setAgentStatuses,
    storeHydrated,
  ]);

  const currentProjectId =
    view.kind === "draft"
      ? view.projectId
      : view.kind === "thread"
        ? threads.find((thread) => thread.id === view.threadId)?.projectId
        : undefined;
  const currentThread =
    view.kind === "thread" ? threads.find((thread) => thread.id === view.threadId) : undefined;
  const currentProject = currentThread
    ? projects.find((project) => project.id === currentThread.projectId)
    : undefined;

  useEffect(() => {
    if (
      !storeHydrated ||
      !currentThread ||
      !currentProject ||
      currentThread.status !== "inactive"
    ) {
      return;
    }

    reopenStoredThread({
      threadId: currentThread.id,
      projectLocation: currentProject.location,
    });
  }, [currentProject, currentThread, reopenStoredThread, storeHydrated]);

  return (
    <AppProvider>
      <AppShell
        sidebar={
          <Sidebar
            projects={projects}
            threads={threads}
            currentProjectId={currentProjectId}
            currentThreadId={view.kind === "thread" ? view.threadId : undefined}
            environmentMode={environmentMode}
            wslAvailable={wslDistros.length > 0}
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
            onAddProject={() => {
              if (environmentMode === "wsl") {
                void (
                  wslDistros.length > 0
                    ? Promise.resolve(wslDistros)
                    : readBridge().listWslDistros()
                )
                  .then((distros) => {
                    const distro = distros[0];
                    const defaultPath = distro ? `\\\\wsl.localhost\\${distro}\\home` : undefined;
                    return readBridge().pickFolder(defaultPath);
                  })
                  .then((selectedPath) => {
                    if (!selectedPath) return;
                    const parsed = parseWslUncPath(selectedPath);
                    if (!parsed) return;
                    startTransition(() => {
                      addProject({
                        kind: "wsl",
                        distro: parsed.distro,
                        linuxPath: parsed.linuxPath,
                        uncPath: selectedPath,
                      });
                    });
                  });
              } else {
                void readBridge()
                  .pickFolder()
                  .then((path) => {
                    if (!path) return;
                    startTransition(() => {
                      addProject({ kind: "windows", path });
                    });
                  });
              }
            }}
            onSwitchMode={() => {
              const next = environmentMode === "windows" ? "wsl" : "windows";
              useSharedSettings.getState().setEnvironmentMode(next);
              window.location.reload();
            }}
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
            onDeleteThread={(threadId) => {
              deleteThread(threadId);
              void readBridge()
                .closeThread({ threadId })
                .catch(() => undefined);
            }}
            onOpenHome={() => {
              startTransition(() => {
                openHome();
              });
            }}
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
          />
        }
        content={<AppContent />}
      />
      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
    </AppProvider>
  );
}
