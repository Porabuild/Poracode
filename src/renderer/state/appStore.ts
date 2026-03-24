import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  AgentStatus,
  AppView,
  Project,
  ProjectLocation,
  SessionRef,
  ThemeMode,
  Thread,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadRuntimeSnapshot,
  ThreadStatus,
} from "../../shared/contracts";
import { getProjectName } from "../../shared/wsl";
import { reorderIds, reorderThreadsInProject, type ReorderPlacement } from "./reorder";

function makeThreadTitle(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  if (normalized.length <= 42) {
    return normalized;
  }
  return `${normalized.slice(0, 39)}...`;
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
  themeMode: ThemeMode;
  projects: Project[];
  threads: Thread[];
  pendingServerRequests: PendingThreadServerRequest[];
  agentStatuses: AgentStatus[];
  wslDistros: string[];
  view: AppView;
  setThemeMode: (themeMode: ThemeMode) => void;
  setAgentStatuses: (statuses: AgentStatus[]) => void;
  setWslDistros: (distros: string[]) => void;
  markThreadsInactiveOnLaunch: () => void;
  addProject: (location: ProjectLocation, nameOverride?: string) => Project;
  openDraft: (projectId: string) => void;
  openHome: () => void;
  openThread: (threadId: string) => void;
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
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
      themeMode: "system",
      projects: [],
      threads: [],
      pendingServerRequests: [],
      agentStatuses: [],
      wslDistros: [],
      view: { kind: "home" },
      setThemeMode: (themeMode) => set({ themeMode }),
      setAgentStatuses: (agentStatuses) => set({ agentStatuses }),
      setWslDistros: (wslDistros) => set({ wslDistros }),
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
      openDraft: (projectId) => set({ view: { kind: "draft", projectId } }),
      openHome: () => set({ view: { kind: "home" } }),
      openThread: (threadId) => set({ view: { kind: "thread", threadId } }),
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
          view: { kind: "thread", threadId: thread.id },
        }));

        return thread;
      },
      deleteThread: (threadId) =>
        set((state) => {
          const nextThreads = state.threads.filter((thread) => thread.id !== threadId);

          if (nextThreads.length === state.threads.length) {
            return {};
          }

          const nextView =
            state.view.kind === "thread" && state.view.threadId === threadId
              ? { kind: "home" as const }
              : state.view;

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
            thread.id === threadId
              ? { ...thread, updatedAt: new Date().toISOString() }
              : thread,
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
    }),
    {
      name: "lightcode-app-state",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const state = persistedState as Partial<AppStoreState> & { threads?: Thread[] };

        return {
          ...state,
          threads: (state.threads ?? []).map(migrateThreadStatus),
        };
      },
      merge: (persistedState, currentState) => {
        const state = persistedState as Partial<AppStoreState> & { threads?: Thread[] };

        return {
          ...currentState,
          ...state,
          threads: (state.threads ?? currentState.threads).map(normalizeStoredThreadStatus),
        };
      },
      partialize: (state) => ({
        themeMode: state.themeMode,
        projects: state.projects,
        threads: state.threads,
        view: state.view,
      }),
    },
  ),
);
