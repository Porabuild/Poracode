import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { ArrowRight, FolderPlus, Server } from "lucide-react";
import { toWslUncPath } from "../shared/wsl";
import { readBridge } from "./bridge";
import { Button, Chip } from "./components/common";
import { AppShell } from "./components/layout/AppShell";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ThreadDraftView } from "./components/thread/ThreadDraftView";
import { ThreadView } from "./components/thread/ThreadView";
import { AppProvider } from "./components/ui/provider";
import { useAppStore } from "./state/appStore";

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

function HomeView() {
  const projects = useAppStore((state) => state.projects);
  const agentStatuses = useAppStore((state) => state.agentStatuses);
  const openDraft = useAppStore((state) => state.openDraft);
  const latestProject = projects[0];
  const installedAgents = agentStatuses.filter((status) => status.installed);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="lightcode-window-header flex shrink-0 items-center justify-between border-b border-[color:var(--border)] px-6 py-4">
        <p className="text-sm font-semibold tracking-tight text-foreground">New thread</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Chip size="sm" variant="secondary">
            {installedAgents.length} agent{installedAgents.length === 1 ? "" : "s"} ready
          </Chip>
          {latestProject ? (
            <Chip color="accent" size="sm" variant="soft">
              {latestProject.name}
            </Chip>
          ) : null}
        </div>
      </header>

      <div className="flex h-full min-h-0 flex-col px-8 py-8">
        <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col justify-center">
          <div className="flex flex-1 flex-col justify-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
              <div className="size-6 rounded-full border border-white/75" />
            </div>
            <div className="mt-6 space-y-2">
              <h1 className="text-5xl font-semibold tracking-tight text-foreground">
                Let&apos;s build
              </h1>
              <p className="text-4xl font-medium tracking-tight text-muted">
                {latestProject?.name ?? "lightcode"}
              </p>
            </div>
            <p className="mt-4 max-w-[620px] text-base text-muted">
              {latestProject
                ? "Open a draft for the current workspace and launch a real CLI-backed thread."
                : "Add a Windows or WSL project from the sidebar to start a real terminal-native thread."}
            </p>
            <div className="mt-10 w-full max-w-[860px] border-t border-[color:var(--border)] pt-6">
              {latestProject ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip size="sm" variant="secondary">
                        {latestProject.location.kind === "windows" ? (
                          <FolderPlus className="size-3.5" />
                        ) : (
                          <Server className="size-3.5" />
                        )}
                        {latestProject.location.kind === "windows"
                          ? "Windows"
                          : latestProject.location.distro}
                      </Chip>
                      <Chip size="sm" variant="secondary">
                        {installedAgents[0]?.label ?? "No agent detected"}
                      </Chip>
                    </div>
                    <p className="text-sm text-muted">
                      Launch directly into the live workspace view and keep the terminal as the
                      source of truth.
                    </p>
                  </div>

                  <Button className="rounded-full px-4" onPress={() => openDraft(latestProject.id)}>
                    Start thread
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted">
                    Use the project controls in the sidebar to add a workspace before starting a
                    thread.
                  </p>
                </div>
              )}
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
  const removeThreadServerRequest = useAppStore((state) => state.removeThreadServerRequest);
  const updateThreadConfig = useAppStore((state) => state.updateThreadConfig);
  const updateThreadRuntime = useAppStore((state) => state.updateThreadRuntime);

  if (view.kind === "draft") {
    const project = projects.find((item) => item.id === view.projectId);
    if (!project) {
      return <HomeView />;
    }
    return (
      <ThreadDraftView
        project={project}
        agentStatuses={agentStatuses}
        onStart={({ agentKind, config, prompt }) => {
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
        }}
        onSubmitInput={async (prompt) => {
          await readBridge().sendThreadInput({
            threadId: thread.id,
            prompt,
            config: thread.config,
          });
        }}
      />
    );
  }

  return <HomeView />;
}

export function App() {
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const themeMode = useAppStore((state) => state.themeMode);
  const view = useAppStore((state) => state.view);
  const wslDistros = useAppStore((state) => state.wslDistros);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const setAgentStatuses = useAppStore((state) => state.setAgentStatuses);
  const setWslDistros = useAppStore((state) => state.setWslDistros);
  const markThreadsInactiveOnLaunch = useAppStore((state) => state.markThreadsInactiveOnLaunch);
  const addProject = useAppStore((state) => state.addProject);
  const openDraft = useAppStore((state) => state.openDraft);
  const openThread = useAppStore((state) => state.openThread);
  const openHome = useAppStore((state) => state.openHome);
  const deleteThread = useAppStore((state) => state.deleteThread);
  const reconcileRuntimeSnapshots = useAppStore((state) => state.reconcileRuntimeSnapshots);
  const reorderProjects = useAppStore((state) => state.reorderProjects);
  const reorderThreads = useAppStore((state) => state.reorderThreads);
  const updateThreadRuntime = useAppStore((state) => state.updateThreadRuntime);
  const [storeHydrated, setStoreHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const reopenStoredThread = useEffectEvent(
    (input: { threadId: string; projectLocation: (typeof projects)[number]["location"] }) => {
      const thread = threads.find((item) => item.id === input.threadId);
      if (!thread) {
        return;
      }

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
      .getAgentStatuses()
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

        startTransition(() => {
          reconcileRuntimeSnapshots(snapshots);
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
    markThreadsInactiveOnLaunch,
    reconcileRuntimeSnapshots,
    setAgentStatuses,
    setWslDistros,
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
            themeMode={themeMode}
            wslDistros={wslDistros}
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
            onThemeModeChange={(mode) => {
              startTransition(() => {
                setThemeMode(mode);
              });
            }}
            onAddWindowsProject={() => {
              void readBridge()
                .pickFolder()
                .then((path) => {
                  if (!path) {
                    return;
                  }
                  startTransition(() => {
                    addProject({
                      kind: "windows",
                      path,
                    });
                  });
                });
            }}
            onAddWslProject={(distro, linuxPath) => {
              startTransition(() => {
                addProject({
                  kind: "wsl",
                  distro,
                  linuxPath,
                  uncPath: toWslUncPath(distro, linuxPath),
                });
              });
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
              void readBridge()
                .closeThread({ threadId })
                .catch(() => undefined)
                .finally(() => {
                  startTransition(() => {
                    deleteThread(threadId);
                  });
                });
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
    </AppProvider>
  );
}
