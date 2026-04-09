import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDbStorage } from "./dbStorage";
import type {
  AgentStatus,
  AppView,
  Project,
  ProjectDraftConfig,
  ProjectLocation,
  ProjectScripts,
  PromptSegment,
  SessionRef,
  Thread,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadRuntimeSnapshot,
  ThreadStatus,
} from "../../shared/contracts";
import type { Attachment } from "../components/composer/useAttachments";
import { getProjectName } from "../../shared/wsl";
import {
  reorderIds,
  reorderThreadBlockInProject,
  reorderThreadsInProject,
  type ReorderPlacement,
} from "./reorder";

export function makeThreadTitle(prompt: string): string {
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

export interface PendingThreadServerRequest {
  threadId: string;
  requestId: ThreadServerRequestId;
  method: string;
  params: unknown;
  receivedAt: string;
}

export interface DraftContent {
  segments: PromptSegment[];
  attachments: Attachment[];
}

interface AppStoreState {
  projects: Project[];
  threads: Thread[];
  pendingServerRequests: PendingThreadServerRequest[];
  pendingThreadLaunches: Record<string, string>;
  pendingLaunchSegments: Record<string, PromptSegment[]>;
  draftContents: Record<string, DraftContent>;
  agentStatuses: AgentStatus[];
  wslAgentStatuses: AgentStatus[];
  view: AppView;
  setAgentStatuses: (statuses: AgentStatus[]) => void;
  setWslAgentStatuses: (statuses: AgentStatus[]) => void;
  markThreadsInactiveOnLaunch: () => void;
  addProject: (location: ProjectLocation, nameOverride?: string) => Project;
  deleteProject: (projectId: string) => void;
  updateProjectDraftConfig: (projectId: string, draftConfig: ProjectDraftConfig) => void;
  updateProjectScripts: (projectId: string, scripts: ProjectScripts) => void;
  renameProject: (projectId: string, name: string) => void;
  openDraft: (projectId: string) => void;
  openHome: () => void;
  openThread: (threadId: string) => void;
  openThreadSideBySide: (threadId: string) => void;
  replaceSecondPane: (threadId: string) => void;
  insertPaneAtIndex: (threadId: string, index: number) => void;
  closePane: (threadId: string) => void;
  createThread: (input: {
    projectId: string;
    agentKind: Thread["agentKind"];
    config: ThreadConfig;
    prompt: string;
    worktreePath?: string;
    worktreeBranch?: string;
  }) => Thread;
  queueThreadLaunch: (threadId: string, prompt: string, segments?: PromptSegment[]) => void;
  consumeThreadLaunch: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  renameThread: (threadId: string, title: string) => void;
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
  archiveThread: (threadId: string) => void;
  unarchiveThread: (threadId: string) => void;
  purgeStaleArchivedThreads: (maxAgeDays: number) => void;
  markThreadExited: (threadId: string) => void;
  touchThread: (threadId: string) => void;
  reconcileRuntimeSnapshots: (snapshots: ThreadRuntimeSnapshot[]) => void;
  reorderProjects: (sourceId: string, targetId: string, placement: ReorderPlacement) => void;
  reorderThreads: (sourceId: string, targetId: string, placement: ReorderPlacement) => void;
  reorderThreadBlock: (blockIds: string[], targetId: string, placement: ReorderPlacement) => void;
  reorderPanes: (sourceId: string, targetId: string, placement: ReorderPlacement) => void;
  saveDraftContent: (projectId: string, content: DraftContent) => void;
  clearDraftContent: (projectId: string) => void;
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
      projects: [],
      threads: [],
      pendingServerRequests: [],
      pendingThreadLaunches: {},
      pendingLaunchSegments: {},
      draftContents: {},
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
      deleteProject: (projectId) =>
        set((state) => {
          const nextProjects = state.projects.filter((project) => project.id !== projectId);

          if (nextProjects.length === state.projects.length) {
            return {};
          }

          const projectThreadIds = new Set(
            state.threads
              .filter((thread) => thread.projectId === projectId)
              .map((thread) => thread.id),
          );

          const nextThreads = state.threads.filter((thread) => thread.projectId !== projectId);

          const nextPendingServerRequests = state.pendingServerRequests.filter(
            (request) => !projectThreadIds.has(request.threadId),
          );
          const nextPendingThreadLaunches = Object.fromEntries(
            Object.entries(state.pendingThreadLaunches).filter(
              ([threadId]) => !projectThreadIds.has(threadId),
            ),
          );
          const nextPendingLaunchSegments = Object.fromEntries(
            Object.entries(state.pendingLaunchSegments).filter(
              ([threadId]) => !projectThreadIds.has(threadId),
            ),
          );

          const { [projectId]: _draft, ...nextDraftContents } = state.draftContents;

          let nextView = state.view;
          if (state.view.kind === "draft" && state.view.projectId === projectId) {
            nextView = { kind: "home" };
          } else if (state.view.kind === "thread") {
            const remaining = state.view.panes.filter((id) => !projectThreadIds.has(id));
            nextView =
              remaining.length === 0
                ? { kind: "home" as const }
                : { kind: "thread" as const, panes: remaining as [string, ...string[]] };
          }

          return {
            projects: nextProjects,
            threads: nextThreads,
            pendingServerRequests: nextPendingServerRequests,
            pendingThreadLaunches: nextPendingThreadLaunches,
            pendingLaunchSegments: nextPendingLaunchSegments,
            draftContents: nextDraftContents,
            view: nextView,
          };
        }),
      updateProjectDraftConfig: (projectId, draftConfig) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId ? { ...project, lastDraftConfig: draftConfig } : project,
          ),
        })),
      updateProjectScripts: (projectId, scripts) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId ? { ...project, scripts } : project,
          ),
        })),
      renameProject: (projectId, name) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId ? { ...project, name } : project,
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
      insertPaneAtIndex: (threadId, index) =>
        set((state) => {
          if (state.view.kind !== "thread") {
            return { view: { kind: "thread", panes: [threadId] } };
          }
          const existing = state.view.panes;
          if (existing.includes(threadId) || existing.length >= 3) {
            return {};
          }
          const panes = [...existing];
          panes.splice(Math.max(0, Math.min(panes.length, index)), 0, threadId);
          return { view: { kind: "thread", panes: panes as [string, ...string[]] } };
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
      createThread: ({ projectId, agentKind, config, prompt, worktreePath, worktreeBranch }) => {
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
          archived: false,
          ...(worktreePath ? { worktreePath } : {}),
          ...(worktreeBranch ? { worktreeBranch } : {}),
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          threads: [thread, ...state.threads],
          view: { kind: "thread", panes: [thread.id] },
        }));

        return thread;
      },
      queueThreadLaunch: (threadId, prompt, segments) =>
        set((state) => ({
          pendingThreadLaunches: {
            ...state.pendingThreadLaunches,
            [threadId]: prompt,
          },
          ...(segments
            ? {
                pendingLaunchSegments: {
                  ...state.pendingLaunchSegments,
                  [threadId]: segments,
                },
              }
            : {}),
        })),
      consumeThreadLaunch: (threadId) =>
        set((state) => {
          if (!(threadId in state.pendingThreadLaunches)) {
            return {};
          }

          const { [threadId]: _removed, ...pendingThreadLaunches } = state.pendingThreadLaunches;
          const { [threadId]: _removedSeg, ...pendingLaunchSegments } = state.pendingLaunchSegments;
          return { pendingThreadLaunches, pendingLaunchSegments };
        }),
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
            pendingThreadLaunches: Object.fromEntries(
              Object.entries(state.pendingThreadLaunches).filter(([id]) => id !== threadId),
            ),
            pendingLaunchSegments: Object.fromEntries(
              Object.entries(state.pendingLaunchSegments).filter(([id]) => id !== threadId),
            ),
            view: nextView,
          };
        }),
      renameThread: (threadId, title) =>
        set((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === threadId
              ? { ...thread, title, updatedAt: new Date().toISOString() }
              : thread,
          ),
        })),
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
      archiveThread: (threadId) =>
        set((state) => {
          const thread = state.threads.find((t) => t.id === threadId);
          if (!thread || thread.archived) return {};

          const threads = state.threads.map((t) =>
            t.id === threadId ? { ...t, archived: true, updatedAt: new Date().toISOString() } : t,
          );

          let nextView = state.view;
          if (state.view.kind === "thread") {
            const remaining = state.view.panes.filter((id) => id !== threadId);
            nextView =
              remaining.length === 0
                ? { kind: "home" as const }
                : { kind: "thread" as const, panes: remaining as [string, ...string[]] };
          }

          return { threads, view: nextView };
        }),
      unarchiveThread: (threadId) =>
        set((state) => {
          const thread = state.threads.find((t) => t.id === threadId);
          if (!thread || !thread.archived) return {};

          return {
            threads: state.threads.map((t) =>
              t.id === threadId
                ? { ...t, archived: false, updatedAt: new Date().toISOString() }
                : t,
            ),
          };
        }),
      purgeStaleArchivedThreads: (maxAgeDays) =>
        set((state) => {
          const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
          const nextThreads = state.threads.filter(
            (t) => !t.archived || new Date(t.updatedAt).getTime() > cutoff,
          );
          if (nextThreads.length === state.threads.length) return {};
          return { threads: nextThreads };
        }),
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
      reorderThreadBlock: (blockIds, targetId, placement) =>
        set((state) => {
          const threads = reorderThreadBlockInProject(state.threads, blockIds, targetId, placement);

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
      saveDraftContent: (projectId, content) =>
        set((state) => ({
          draftContents: { ...state.draftContents, [projectId]: content },
        })),
      clearDraftContent: (projectId) =>
        set((state) => {
          if (!(projectId in state.draftContents)) return {};
          const { [projectId]: _, ...rest } = state.draftContents;
          return { draftContents: rest };
        }),
    }),
    {
      name: "lightcode-app-v2",
      version: 4,
      storage: createDbStorage(),
      merge: (persistedState, currentState) => {
        const state =
          (persistedState as Partial<AppStoreState> & { threads?: Thread[] } | undefined) ??
          ({} as Partial<AppStoreState>);

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
