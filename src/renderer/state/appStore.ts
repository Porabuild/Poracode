import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDbStorage } from "./dbStorage";
import type {
  AgentStatus,
  AppView,
  Project,
  ProjectDraftConfig,
  ProjectLocation,
  SessionRef,
  Thread,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  TerminalPrompt,
  ThreadRuntimeSnapshot,
  ThreadStatus,
} from "../../shared/contracts";
import { getProjectName } from "../../shared/wsl";
import { reorderIds, reorderThreadsInProject, type ReorderPlacement } from "./reorder";

function makeThreadTitle(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117)}...`;
}

function normalizeStoredThreadStatus(thread: Thread): Thread {
  if (thread.status === "inactive") {
    return thread;
  }

  return {
    ...thread,
    status: "inactive",
    attention: "none",
  };
}

function migrateThreadStatus(thread: Thread | (Thread & { status: string })): Thread {
  const legacyStatus = String(thread.status);

  if (legacyStatus === "exited") {
    return {
      ...thread,
      status: "inactive",
      attention: "none",
    };
  }

  if (legacyStatus === "running") {
    return {
      ...thread,
      status: "working",
    };
  }

  return thread;
}

export interface PendingThreadServerRequest {
  threadId: string;
  requestId: ThreadServerRequestId;
  method: string;
  params: unknown;
  receivedAt: string;
}

interface AppStoreState {
  projects: Project[];
  threads: Thread[];
  pendingServerRequests: PendingThreadServerRequest[];
  agentStatuses: AgentStatus[];
  wslAgentStatuses: AgentStatus[];
  view: AppView;
  setAgentStatuses: (statuses: AgentStatus[]) => void;
  setWslAgentStatuses: (statuses: AgentStatus[]) => void;
  markThreadsInactiveOnLaunch: () => void;
  addProject: (location: ProjectLocation, nameOverride?: string) => Project;
  updateProjectDraftConfig: (projectId: string, draftConfig: ProjectDraftConfig) => void;
  openDraft: (projectId: string) => void;
  openHome: () => void;
  openThread: (threadId: string) => void;
  openThreadSideBySide: (threadId: string) => void;
  replaceSecondPane: (threadId: string) => void;
  closePane: (threadId: string) => void;
  createThread: (input: {
    projectId: string;
    agentKind: Thread["agentKind"];
    config: ThreadConfig;
    prompt: string;
  }) => Thread;
  deleteThread: (threadId: string) => void;
  updateThreadConfig: (threadId: string, config: ThreadConfig) => void;
  updateThreadRuntime: (
    threadId: string,
    input: {
      status: ThreadStatus;
      attention: ThreadAttention;
      config?: ThreadConfig;
      sessionRef?: SessionRef;
      canResumeWithConfig: boolean;
      terminalPrompt?: TerminalPrompt;
    },
  ) => void;
  addThreadServerRequest: (input: {
    threadId: string;
    requestId: ThreadServerRequestId;
    method: string;
    params: unknown;
  }) => void;
  removeThreadServerRequest: (threadId: string, requestId: ThreadServerRequestId) => void;
  clearThreadServerRequests: (threadId: string) => void;
  markThreadExited: (threadId: string) => void;
  touchThread: (threadId: string) => void;
  reconcileRuntimeSnapshots: (snapshots: ThreadRuntimeSnapshot[]) => void;
  reorderProjects: (sourceId: string, targetId: string, placement: ReorderPlacement) => void;
  reorderThreads: (sourceId: string, targetId: string, placement: ReorderPlacement) => void;
  reorderPanes: (sourceId: string, targetId: string, placement: ReorderPlacement) => void;
}

/**
 * One-time migration: if SQLite is empty (first run after upgrade), read
 * legacy localStorage data and seed the DB via the Zustand merge callback.
 * Returns the legacy state or undefined if nothing to migrate.
 */
function readLegacyLocalStorage(): Partial<AppStoreState> | undefined {
  const parse = (raw: string | null) => {
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as { state?: Partial<AppStoreState> };
      return parsed?.state;
    } catch {
      return undefined;
    }
  };

  const win =
    parse(localStorage.getItem("lightcode-app-v2")) ??
    parse(localStorage.getItem("lightcode-env-windows")) ??
    parse(localStorage.getItem("lightcode-app-state"));
  const wsl = parse(localStorage.getItem("lightcode-env-wsl"));

  if (!win && !wsl) return undefined;

  const seenProjects = new Set<string>();
  const seenThreads = new Set<string>();
  const projects: Project[] = [];
  const threads: Thread[] = [];

  for (const source of [win, wsl]) {
    if (!source) continue;
    for (const p of (source.projects as Project[] | undefined) ?? []) {
      if (!seenProjects.has(p.id)) {
        seenProjects.add(p.id);
        projects.push(p);
      }
    }
    for (const t of (source.threads as Thread[] | undefined) ?? []) {
      if (!seenThreads.has(t.id)) {
        seenThreads.add(t.id);
        threads.push(t);
      }
    }
  }

  if (projects.length === 0 && threads.length === 0) return undefined;

  const view = win?.view ?? wsl?.view ?? { kind: "home" };
  return { projects, threads, view } as Partial<AppStoreState>;
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
      projects: [],
      threads: [],
      pendingServerRequests: [],
      agentStatuses: [],
      wslAgentStatuses: [],
      view: { kind: "home" },
      setAgentStatuses: (agentStatuses) => set({ agentStatuses }),
      setWslAgentStatuses: (wslAgentStatuses) => set({ wslAgentStatuses }),
      markThreadsInactiveOnLaunch: () =>
        set((state) => {
          let changed = false;

          const threads = state.threads.map((thread) => {
            if (thread.status === "inactive" || thread.status === "error") {
              return thread;
            }

            changed = true;
            return {
              ...thread,
              status: "inactive" as ThreadStatus,
              attention: "none" as ThreadAttention,
            };
          });

          return changed ? { threads } : {};
        }),
      addProject: (location, nameOverride) => {
        const project: Project = {
          id: crypto.randomUUID(),
          name: nameOverride?.trim() || getProjectName(location),
          location,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          projects: [project, ...state.projects],
        }));

        return project;
      },
      updateProjectDraftConfig: (projectId, draftConfig) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId ? { ...project, lastDraftConfig: draftConfig } : project,
          ),
        })),
      openDraft: (projectId) => set({ view: { kind: "draft", projectId } }),
      openHome: () => set({ view: { kind: "home" } }),
      openThread: (threadId) =>
        set((state) => {
          if (state.view.kind === "thread") {
            if (state.view.panes.includes(threadId)) {
              return {};
            }
            return {
              view: {
                kind: "thread",
                panes: [threadId, ...state.view.panes.slice(1)] as [string, ...string[]],
              },
            };
          }
          return { view: { kind: "thread", panes: [threadId] } };
        }),
      openThreadSideBySide: (threadId) =>
        set((state) => {
          if (state.view.kind !== "thread") {
            return { view: { kind: "thread", panes: [threadId] } };
          }
          const existing = state.view.panes;
          if (existing.includes(threadId)) {
            return {};
          }
          if (existing.length >= 3) {
            return {
              view: {
                kind: "thread",
                panes: [existing[0]!, existing[1]!, threadId],
              },
            };
          }
          return {
            view: {
              kind: "thread",
              panes: [...existing, threadId] as [string, ...string[]],
            },
          };
        }),
      replaceSecondPane: (threadId) =>
        set((state) => {
          if (state.view.kind !== "thread" || state.view.panes.length < 2) {
            return {};
          }
          if (state.view.panes.includes(threadId)) {
            return {};
          }
          const panes = [...state.view.panes];
          panes[1] = threadId;
          return {
            view: { kind: "thread", panes: panes as [string, ...string[]] },
          };
        }),
      closePane: (threadId) =>
        set((state) => {
          if (state.view.kind !== "thread") {
            return {};
          }
          const remaining = state.view.panes.filter((id) => id !== threadId);
          if (remaining.length === 0) {
            return { view: { kind: "home" } };
          }
          return {
            view: { kind: "thread", panes: remaining as [string, ...string[]] },
          };
        }),
      createThread: ({ projectId, agentKind, config, prompt }) => {
        const now = new Date().toISOString();
        const thread: Thread = {
          id: crypto.randomUUID(),
          projectId,
          title: makeThreadTitle(prompt),
          agentKind,
          config,
          status: "launching",
          attention: "none",
          canResumeWithConfig: false,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          threads: [thread, ...state.threads],
          view: { kind: "thread", panes: [thread.id] },
        }));

        return thread;
      },
      deleteThread: (threadId) =>
        set((state) => {
          const nextThreads = state.threads.filter((thread) => thread.id !== threadId);

          if (nextThreads.length === state.threads.length) {
            return {};
          }

          let nextView = state.view;
          if (state.view.kind === "thread") {
            const remaining = state.view.panes.filter((id) => id !== threadId);
            nextView =
              remaining.length === 0
                ? { kind: "home" as const }
                : { kind: "thread" as const, panes: remaining as [string, ...string[]] };
          }

          return {
            threads: nextThreads,
            pendingServerRequests: state.pendingServerRequests.filter(
              (request) => request.threadId !== threadId,
            ),
            view: nextView,
          };
        }),
      updateThreadConfig: (threadId, config) =>
        set((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  config,
                  updatedAt: new Date().toISOString(),
                }
              : thread,
          ),
        })),
      updateThreadRuntime: (threadId, input) =>
        set((state) => {
          let changed = false;

          const threads: Thread[] = state.threads.map((thread): Thread => {
            if (thread.id !== threadId) {
              return thread;
            }

            const sessionRefChanged =
              input.sessionRef !== undefined &&
              (thread.sessionRef?.providerSessionId !== input.sessionRef.providerSessionId ||
                thread.sessionRef?.discoveredAt !== input.sessionRef.discoveredAt);

            if (
              thread.status === input.status &&
              thread.attention === input.attention &&
              JSON.stringify(thread.config) === JSON.stringify(input.config ?? thread.config) &&
              thread.canResumeWithConfig === input.canResumeWithConfig &&
              !sessionRefChanged
            ) {
              return thread;
            }

            changed = true;
            return {
              ...thread,
              status: input.status,
              attention: input.attention,
              config: input.config ?? thread.config,
              canResumeWithConfig: input.canResumeWithConfig,
              ...(input.sessionRef ? { sessionRef: input.sessionRef } : {}),
              terminalPrompt: input.terminalPrompt,
              ...(input.status === "working" && thread.status !== "working"
                ? { updatedAt: new Date().toISOString() }
                : {}),
            };
          });

          return changed ? { threads } : {};
        }),
      addThreadServerRequest: (input) =>
        set((state) => {
          const nextRequest: PendingThreadServerRequest = {
            threadId: input.threadId,
            requestId: input.requestId,
            method: input.method,
            params: input.params,
            receivedAt: new Date().toISOString(),
          };
          const pendingServerRequests = [
            ...state.pendingServerRequests.filter(
              (request) =>
                request.threadId !== input.threadId || request.requestId !== input.requestId,
            ),
            nextRequest,
          ];

          return { pendingServerRequests };
        }),
      removeThreadServerRequest: (threadId, requestId) =>
        set((state) => ({
          pendingServerRequests: state.pendingServerRequests.filter(
            (request) => request.threadId !== threadId || request.requestId !== requestId,
          ),
        })),
      clearThreadServerRequests: (threadId) =>
        set((state) => ({
          pendingServerRequests: state.pendingServerRequests.filter(
            (request) => request.threadId !== threadId,
          ),
        })),
      markThreadExited: (threadId) =>
        set((state) => {
          let changed = false;

          const threads: Thread[] = state.threads.map((thread): Thread => {
            if (thread.id !== threadId) {
              return thread;
            }

            if (thread.status === "inactive" && thread.attention === "none") {
              return thread;
            }

            changed = true;
            return {
              ...thread,
              status: "inactive",
              attention: "none",
            };
          });

          return changed
            ? {
                threads,
                pendingServerRequests: state.pendingServerRequests.filter(
                  (request) => request.threadId !== threadId,
                ),
              }
            : {
                pendingServerRequests: state.pendingServerRequests.filter(
                  (request) => request.threadId !== threadId,
                ),
              };
        }),
      touchThread: (threadId) =>
        set((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === threadId ? { ...thread, updatedAt: new Date().toISOString() } : thread,
          ),
        })),
      reconcileRuntimeSnapshots: (snapshots) =>
        set((state) => {
          const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.threadId, snapshot]));
          let changed = false;

          const threads = state.threads.map((thread) => {
            const snapshot = snapshotsById.get(thread.id);

            if (snapshot) {
              const sessionRefChanged =
                (thread.sessionRef?.providerSessionId ?? "") !==
                  (snapshot.sessionRef?.providerSessionId ?? "") ||
                (thread.sessionRef?.discoveredAt ?? "") !==
                  (snapshot.sessionRef?.discoveredAt ?? "");

              if (
                thread.status === snapshot.status &&
                thread.attention === snapshot.attention &&
                JSON.stringify(thread.config) ===
                  JSON.stringify(snapshot.config ?? thread.config) &&
                thread.canResumeWithConfig === snapshot.canResumeWithConfig &&
                !sessionRefChanged
              ) {
                return thread;
              }

              changed = true;
              return {
                ...thread,
                status: snapshot.status,
                attention: snapshot.attention,
                config: snapshot.config ?? thread.config,
                canResumeWithConfig: snapshot.canResumeWithConfig,
                ...(snapshot.sessionRef ? { sessionRef: snapshot.sessionRef } : {}),
              };
            }

            // Preserve threads that are already terminal or still being started —
            // the supervisor may not have registered a session yet for "launching"
            // threads, so resetting them to "inactive" would trigger a false
            // auto-reopen loop.
            if (
              thread.status === "inactive" ||
              thread.status === "error" ||
              thread.status === "launching"
            ) {
              return thread;
            }

            changed = true;
            return {
              ...thread,
              status: "inactive" as ThreadStatus,
              attention: "none" as ThreadAttention,
            };
          });

          return changed ? { threads } : {};
        }),
      reorderProjects: (sourceId, targetId, placement) =>
        set((state) => {
          const projectIds = state.projects.map((project) => project.id);
          const reorderedIds = reorderIds(projectIds, sourceId, targetId, placement);

          if (reorderedIds === projectIds) {
            return {};
          }

          const projectsById = new Map(state.projects.map((project) => [project.id, project]));
          const projects = reorderedIds
            .map((id) => projectsById.get(id))
            .filter((project): project is Project => project !== undefined);

          return { projects };
        }),
      reorderThreads: (sourceId, targetId, placement) =>
        set((state) => {
          const threads = reorderThreadsInProject(state.threads, sourceId, targetId, placement);

          if (threads === state.threads) {
            return {};
          }

          return { threads };
        }),
      reorderPanes: (sourceId, targetId, placement) =>
        set((state) => {
          if (state.view.kind !== "thread") return {};
          const reordered = reorderIds(state.view.panes, sourceId, targetId, placement);
          if (reordered === state.view.panes) return {};
          return { view: { kind: "thread", panes: reordered as [string, ...string[]] } };
        }),
    }),
    {
      name: "lightcode-app-v2",
      version: 4,
      storage: createDbStorage(),
      migrate: (persistedState) => {
        const state = persistedState as Partial<AppStoreState> & {
          threads?: Thread[];
          view?: AppView | { kind: "thread"; threadId: string };
        };

        let view = state.view as AppView | undefined;
        if (view && view.kind === "thread" && "threadId" in view && !("panes" in view)) {
          view = {
            kind: "thread",
            panes: [(view as unknown as { threadId: string }).threadId],
          };
        }

        return {
          ...state,
          threads: (state.threads ?? []).map(migrateThreadStatus),
          view,
        };
      },
      merge: (persistedState, currentState) => {
        // If SQLite returned nothing, try localStorage migration.
        const state =
          (persistedState != null
            ? (persistedState as Partial<AppStoreState> & { threads?: Thread[] })
            : readLegacyLocalStorage()) ?? ({} as Partial<AppStoreState>);

        return {
          ...currentState,
          ...state,
          threads: (state.threads ?? currentState.threads).map(normalizeStoredThreadStatus),
        };
      },
      partialize: (state) => ({
        projects: state.projects,
        threads: state.threads,
        view: state.view,
      }),
    },
  ),
);
