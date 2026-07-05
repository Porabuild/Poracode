import {
  type AgentInstanceId,
  type AppView,
  type SessionRef,
  type Thread,
  type ThreadAttention,
  type ThreadConfig,
  type ThreadPresentationMode,
  type ThreadRuntimeSnapshot,
  type ThreadServerRequestId,
  type ThreadStatus,
  type ThreadStatusSource,
  areAgentSlashCommandsEqual,
  isThreadConfigEqual,
} from "@/shared/contracts";
import {
  reorderThreadBlockInProject,
  reorderThreadsInProject,
  type ReorderPlacement,
} from "../reorder";
import { makeThreadTitle, removePaneFromView, replacePaneInView, stripPlanMode } from "./helpers";
import {
  appendCompletedTurnIfClosed,
  deriveTurnTiming,
  type TurnCloseUpdate,
} from "./threadTurnHelpers";
import { recordThreadStarted } from "../usageRecorder";
import type { SliceCreator } from "./shared";

export interface ThreadSlice {
  threads: Thread[];
  /**
   * Per-thread snapshot of the supervisor's last-reported `session.config`.
   * Used to distinguish "supervisor truly changed the config" from "supervisor
   * echoed the same stale config in a status update". The composer mutates
   * `thread.config` locally for the next-turn draft; we must not let stale
   * echoes (which arrive on every status/attention change) overwrite that
   * draft. Only when this snapshot differs from `input.config` do we treat
   * the runtime as authoritative.
   */
  lastRuntimeConfigByThreadId: Record<string, ThreadConfig>;
  /**
   * Ephemeral timestamp (ms) of the last time each thread was visible in a
   * pane. Used by `sweepStaleThreads` so that opening an old thread resets its
   * unload clock without bumping `updatedAt` (which would reshuffle sidebar
   * sort). Not persisted — recreated as the user navigates after launch.
   */
  lastViewedAtByThreadId: Record<string, number>;
  markThreadsInactiveOnLaunch: () => void;
  createThread: (input: {
    threadId?: string;
    projectId: string;
    agentKind: Thread["agentKind"];
    agentInstanceId?: AgentInstanceId;
    config: ThreadConfig;
    prompt: string;
    /** Explicit title; defaults to a prompt-derived one when omitted. */
    title?: string;
    worktreePath?: string;
    worktreeBranch?: string;
    groupId?: string;
    groupName?: string;
    replacePaneId?: string;
    presentationMode?: ThreadPresentationMode;
    /** `false` adds the row without switching the active view to it (orchestrator-created children). */
    focus?: boolean;
    /** Orchestrator thread that created this one (metadata only). */
    parentThreadId?: string;
  }) => Thread;
  deleteThread: (threadId: string) => void;
  renameThread: (threadId: string, title: string) => void;
  setThreadWorktree: (threadId: string, worktreePath: string, worktreeBranch?: string) => void;
  updateThreadConfig: (threadId: string, config: ThreadConfig) => void;
  updateThreadRuntime: (
    threadId: string,
    input: {
      status: ThreadStatus;
      attention: ThreadAttention;
      config?: ThreadConfig;
      sessionRef?: SessionRef;
      slashCommands?: Thread["slashCommands"];
      canResumeWithConfig: boolean;
      threadStatusSource?: ThreadStatusSource;
      forceCloseActiveTurn?: boolean;
    },
  ) => void;
  archiveThread: (threadId: string) => void;
  unarchiveThread: (threadId: string) => void;
  markThreadDone: (threadId: string) => void;
  unmarkThreadDone: (threadId: string) => void;
  starThread: (threadId: string) => void;
  unstarThread: (threadId: string) => void;
  purgeStaleArchivedThreads: (maxAgeDays: number) => void;
  archiveOldDoneThreads: (maxAgeDays: number) => void;
  markThreadExited: (threadId: string) => void;
  touchThread: (threadId: string) => void;
  markThreadViewed: (threadId: string) => void;
  markThreadsViewed: (threadIds: readonly string[]) => void;
  reconcileRuntimeSnapshots: (snapshots: ThreadRuntimeSnapshot[]) => void;
  reorderThreads: (sourceId: string, targetId: string, placement: ReorderPlacement) => void;
  reorderThreadBlock: (blockIds: string[], targetId: string, placement: ReorderPlacement) => void;
}

export const createThreadSlice: SliceCreator<ThreadSlice> = (set) => ({
  threads: [],
  lastRuntimeConfigByThreadId: {},
  lastViewedAtByThreadId: {},
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
  createThread: ({
    threadId,
    projectId,
    agentKind,
    agentInstanceId,
    config,
    prompt,
    title,
    worktreePath,
    worktreeBranch,
    groupId,
    groupName,
    replacePaneId: replacePaneIdParam,
    presentationMode,
    focus,
    parentThreadId,
  }) => {
    const now = new Date().toISOString();
    const thread: Thread = {
      id: threadId ?? crypto.randomUUID(),
      projectId,
      title: title ?? makeThreadTitle(prompt),
      agentKind,
      ...(agentInstanceId ? { agentInstanceId } : {}),
      config,
      status: "launching",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: presentationMode ?? "terminal",
      threadStatusSource: (presentationMode ?? "terminal") !== "terminal" ? "server" : undefined,
      ...(worktreePath ? { worktreePath } : {}),
      ...(worktreeBranch ? { worktreeBranch } : {}),
      ...(groupId ? { groupId } : {}),
      ...(groupName ? { groupName } : {}),
      ...(parentThreadId ? { parentThreadId } : {}),
      createdAt: now,
      updatedAt: now,
      activeTurnStartedAt: now,
    };

    set((state) => {
      let nextView: AppView;
      if (focus === false) {
        // Add the row without stealing the user's current view (a fan-out of
        // orchestrator-created threads must not flip the active pane).
        nextView = state.view;
      } else if (replacePaneIdParam && state.view.kind === "thread") {
        const idx = state.view.panes.indexOf(replacePaneIdParam);
        if (idx !== -1) {
          nextView = replacePaneInView(state.view, replacePaneIdParam, thread.id);
        } else {
          nextView = { kind: "thread", panes: [thread.id] };
        }
      } else {
        nextView = { kind: "thread", panes: [thread.id] };
      }
      return {
        threads: [thread, ...state.threads],
        view: nextView,
        lastRuntimeConfigByThreadId: {
          ...state.lastRuntimeConfigByThreadId,
          [thread.id]: thread.config,
        },
      };
    });

    // Durable "thread started" usage fact (survives later delete/archive).
    recordThreadStarted(thread);
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
        nextView = removePaneFromView(state.view, threadId);
      }

      const { [threadId]: _droppedItemIds, ...runtimeItemIdsByThread } =
        state.runtimeItemIdsByThread;
      const { [threadId]: _droppedItems, ...runtimeItemsByIdByThread } =
        state.runtimeItemsByIdByThread;
      const { [threadId]: _droppedReqs, ...runtimeRequestsByThread } =
        state.runtimeRequestsByThread;
      const { [threadId]: _droppedContext, ...runtimeContextByThread } =
        state.runtimeContextByThread;
      const { [threadId]: _droppedVersion, ...runtimeStructuralVersionByThread } =
        state.runtimeStructuralVersionByThread;
      const { [threadId]: _droppedTurns, ...runtimeCompletedTurnsByThread } =
        state.runtimeCompletedTurnsByThread;
      const { [threadId]: _droppedRuntimeConfig, ...lastRuntimeConfigByThreadId } =
        state.lastRuntimeConfigByThreadId;
      const { [threadId]: _droppedLastViewed, ...lastViewedAtByThreadId } =
        state.lastViewedAtByThreadId;
      const { [threadId]: _droppedThreadDraft, ...threadDraftContents } = state.threadDraftContents;
      return {
        threads: nextThreads,
        threadDraftContents,
        pendingThreadLaunches: Object.fromEntries(
          Object.entries(state.pendingThreadLaunches).filter(([id]) => id !== threadId),
        ),
        pendingLaunchSegments: Object.fromEntries(
          Object.entries(state.pendingLaunchSegments).filter(([id]) => id !== threadId),
        ),
        runtimeItemIdsByThread,
        runtimeItemsByIdByThread,
        runtimeRequestsByThread,
        runtimeContextByThread,
        runtimeStructuralVersionByThread,
        runtimeCompletedTurnsByThread,
        lastRuntimeConfigByThreadId,
        lastViewedAtByThreadId,
        view: nextView,
      };
    }),
  renameThread: (threadId, title) =>
    set((state) => ({
      threads: state.threads.map((thread) =>
        thread.id === threadId ? { ...thread, title, updatedAt: new Date().toISOString() } : thread,
      ),
    })),
  setThreadWorktree: (threadId, worktreePath, worktreeBranch) =>
    set((state) => ({
      threads: state.threads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              worktreePath,
              ...(worktreeBranch ? { worktreeBranch } : {}),
              updatedAt: new Date().toISOString(),
            }
          : thread,
      ),
    })),
  updateThreadConfig: (threadId, config) =>
    set((state) => {
      let changed = false;
      const threads = state.threads.map((thread) => {
        if (thread.id !== threadId) return thread;
        const nextConfig = thread.presentationMode === "gui" ? config : stripPlanMode(config);
        if (isThreadConfigEqual(thread.config, nextConfig)) return thread;
        changed = true;
        return {
          ...thread,
          config: nextConfig,
          updatedAt: new Date().toISOString(),
        };
      });
      return changed ? { threads } : {};
    }),
  updateThreadRuntime: (threadId, input) =>
    set((state) => {
      let changed = false;
      let turnUpdate: TurnCloseUpdate = {
        runtimeCompletedTurnsByThread: state.runtimeCompletedTurnsByThread,
      };
      const isVisible = state.view.kind === "thread" && state.view.panes.includes(threadId);
      const nowIso = new Date().toISOString();

      // Treat `input.config` as authoritative only when the supervisor truly
      // changed it (compared to its last echoed value). Plain status/attention
      // updates re-send the same `session.config` and would otherwise wipe
      // the user's pending composer change while a turn is still working.
      const lastRuntimeConfig = state.lastRuntimeConfigByThreadId[threadId];
      const runtimeConfigChanged =
        input.config !== undefined &&
        (lastRuntimeConfig === undefined || !isThreadConfigEqual(lastRuntimeConfig, input.config));
      const nextLastRuntimeConfig = runtimeConfigChanged ? input.config : lastRuntimeConfig;

      const threads: Thread[] = state.threads.map((thread): Thread => {
        if (thread.id !== threadId) {
          return thread;
        }

        let effectiveStatus = input.status;
        let effectiveAttention = input.attention;
        if (
          input.status === "idle" &&
          (thread.status === "working" || thread.status === "finished") &&
          !isVisible
        ) {
          effectiveStatus = "finished";
        }

        const sessionRefChanged =
          input.sessionRef !== undefined &&
          thread.sessionRef?.providerSessionId !== input.sessionRef.providerSessionId;
        const nextSessionRef =
          input.sessionRef && sessionRefChanged ? input.sessionRef : thread.sessionRef;

        const statusSourceMatch =
          input.threadStatusSource === undefined ||
          thread.threadStatusSource === input.threadStatusSource;

        const configFromRuntime = runtimeConfigChanged ? input.config : undefined;
        const nextConfig =
          thread.presentationMode === "gui"
            ? (configFromRuntime ?? thread.config)
            : stripPlanMode(configFromRuntime ?? thread.config);
        const nextTurnTiming = deriveTurnTiming(thread, effectiveStatus, {
          enteredLiveAt: nowIso,
          nowIso,
        });
        const slashCommandsChanged =
          input.slashCommands !== undefined &&
          !areAgentSlashCommandsEqual(thread.slashCommands, input.slashCommands);

        if (
          thread.status === effectiveStatus &&
          thread.attention === effectiveAttention &&
          isThreadConfigEqual(thread.config, nextConfig) &&
          thread.canResumeWithConfig === input.canResumeWithConfig &&
          statusSourceMatch &&
          !slashCommandsChanged &&
          !sessionRefChanged &&
          thread.activeTurnStartedAt === nextTurnTiming.activeTurnStartedAt &&
          thread.lastTurnStartedAt === nextTurnTiming.lastTurnStartedAt &&
          thread.lastTurnEndedAt === nextTurnTiming.lastTurnEndedAt
        ) {
          return thread;
        }

        turnUpdate = appendCompletedTurnIfClosed(
          { ...state, ...turnUpdate },
          thread.id,
          thread,
          nextTurnTiming,
        );

        changed = true;
        return {
          ...thread,
          status: effectiveStatus,
          attention: effectiveAttention,
          config: nextConfig,
          canResumeWithConfig: input.canResumeWithConfig,
          ...(input.threadStatusSource !== undefined
            ? { threadStatusSource: input.threadStatusSource }
            : {}),
          ...(nextSessionRef ? { sessionRef: nextSessionRef } : {}),
          ...(input.slashCommands !== undefined ? { slashCommands: input.slashCommands } : {}),
          ...(input.status === "working" && thread.status !== "working"
            ? { updatedAt: nowIso }
            : {}),
          ...nextTurnTiming,
        };
      });

      const runtimeConfigMapPatch = runtimeConfigChanged
        ? {
            lastRuntimeConfigByThreadId: {
              ...state.lastRuntimeConfigByThreadId,
              [threadId]: nextLastRuntimeConfig!,
            },
          }
        : undefined;

      if (!changed) {
        return runtimeConfigMapPatch ?? {};
      }
      const turnsChanged =
        turnUpdate.runtimeCompletedTurnsByThread !== state.runtimeCompletedTurnsByThread;
      return {
        threads,
        ...(turnsChanged ? turnUpdate : {}),
        ...(runtimeConfigMapPatch ?? {}),
      };
    }),
  archiveThread: (threadId) =>
    set((state) => {
      const thread = state.threads.find((t) => t.id === threadId);
      if (!thread || thread.archived) return {};

      const threads = state.threads.map((t) =>
        t.id === threadId ? { ...t, archived: true, updatedAt: new Date().toISOString() } : t,
      );

      let nextView = state.view;
      if (state.view.kind === "thread") {
        nextView = removePaneFromView(state.view, threadId);
      }

      return { threads, view: nextView };
    }),
  unarchiveThread: (threadId) =>
    set((state) => {
      const thread = state.threads.find((t) => t.id === threadId);
      if (!thread || !thread.archived) return {};

      return {
        threads: state.threads.map((t) =>
          t.id === threadId ? { ...t, archived: false, updatedAt: new Date().toISOString() } : t,
        ),
      };
    }),
  markThreadDone: (threadId) =>
    set((state) => {
      const thread = state.threads.find((t) => t.id === threadId);
      if (!thread || thread.done) return {};

      const now = new Date().toISOString();
      const threads = state.threads.map((t) =>
        t.id === threadId ? { ...t, done: true, doneAt: now, starred: false } : t,
      );

      let nextView = state.view;
      if (state.view.kind === "thread") {
        nextView = removePaneFromView(state.view, threadId);
      }

      return { threads, view: nextView };
    }),
  unmarkThreadDone: (threadId) =>
    set((state) => {
      const thread = state.threads.find((t) => t.id === threadId);
      if (!thread || !thread.done) return {};
      return {
        threads: state.threads.map((t) =>
          t.id === threadId ? { ...t, done: false, doneAt: undefined } : t,
        ),
      };
    }),
  starThread: (threadId) =>
    set((state) => {
      const thread = state.threads.find((t) => t.id === threadId);
      if (!thread || thread.starred) return {};
      return {
        threads: state.threads.map((t) => (t.id === threadId ? { ...t, starred: true } : t)),
      };
    }),
  unstarThread: (threadId) =>
    set((state) => {
      const thread = state.threads.find((t) => t.id === threadId);
      if (!thread || !thread.starred) return {};
      return {
        threads: state.threads.map((t) => (t.id === threadId ? { ...t, starred: false } : t)),
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
  archiveOldDoneThreads: (maxAgeDays) =>
    set((state) => {
      if (maxAgeDays <= 0) return {};
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      let changed = false;
      const visiblePanes =
        state.view.kind === "thread" ? new Set(state.view.panes) : new Set<string>();

      const threads = state.threads.map((t) => {
        if (!t.done || t.archived || t.starred) return t;
        if (new Date(t.doneAt ?? t.updatedAt).getTime() > cutoff) return t;
        changed = true;
        return { ...t, archived: true };
      });

      if (!changed) return {};

      let nextView = state.view;
      if (state.view.kind === "thread") {
        for (const t of threads) {
          if (t.archived && visiblePanes.has(t.id) && nextView.kind === "thread") {
            nextView = removePaneFromView(nextView, t.id);
          }
        }
      }

      return { threads, view: nextView };
    }),
  markThreadExited: (threadId) =>
    set((state) => {
      let changed = false;
      let turnUpdate: TurnCloseUpdate = {
        runtimeCompletedTurnsByThread: state.runtimeCompletedTurnsByThread,
      };
      const nowIso = new Date().toISOString();

      const threads: Thread[] = state.threads.map((thread): Thread => {
        if (thread.id !== threadId) {
          return thread;
        }

        const nextTurnTiming = deriveTurnTiming(thread, "inactive", {
          enteredLiveAt: nowIso,
          nowIso,
        });

        if (
          thread.status === "inactive" &&
          thread.attention === "none" &&
          thread.activeTurnStartedAt === nextTurnTiming.activeTurnStartedAt &&
          thread.lastTurnStartedAt === nextTurnTiming.lastTurnStartedAt &&
          thread.lastTurnEndedAt === nextTurnTiming.lastTurnEndedAt
        ) {
          return thread;
        }

        turnUpdate = appendCompletedTurnIfClosed(
          { ...state, ...turnUpdate },
          thread.id,
          thread,
          nextTurnTiming,
        );

        changed = true;
        return {
          ...thread,
          status: "inactive",
          attention: "none",
          threadStatusSource: undefined,
          ...nextTurnTiming,
        };
      });

      const turnsChanged =
        turnUpdate.runtimeCompletedTurnsByThread !== state.runtimeCompletedTurnsByThread;
      if (!changed) {
        return turnsChanged ? turnUpdate : {};
      }
      return turnsChanged ? { threads, ...turnUpdate } : { threads };
    }),
  touchThread: (threadId) =>
    set((state) => ({
      threads: state.threads.map((thread) =>
        thread.id === threadId ? { ...thread, updatedAt: new Date().toISOString() } : thread,
      ),
    })),
  markThreadViewed: (threadId) =>
    set((state) => {
      const now = Date.now();
      if (state.lastViewedAtByThreadId[threadId] === now) return {};
      return {
        lastViewedAtByThreadId: {
          ...state.lastViewedAtByThreadId,
          [threadId]: now,
        },
      };
    }),
  markThreadsViewed: (threadIds) =>
    set((state) => {
      if (threadIds.length === 0) return {};
      const now = Date.now();
      let changed = false;
      let next = state.lastViewedAtByThreadId;
      for (const threadId of threadIds) {
        if (next[threadId] === now) continue;
        if (!changed) {
          next = { ...next };
          changed = true;
        }
        next[threadId] = now;
      }
      return changed ? { lastViewedAtByThreadId: next } : {};
    }),
  reconcileRuntimeSnapshots: (snapshots) =>
    set((state) => {
      const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.threadId, snapshot]));
      let changed = false;
      let turnUpdate: TurnCloseUpdate = {
        runtimeCompletedTurnsByThread: state.runtimeCompletedTurnsByThread,
      };
      const nowIso = new Date().toISOString();

      let lastRuntimeConfigByThreadId = state.lastRuntimeConfigByThreadId;
      let runtimeConfigMapChanged = false;

      function recordRuntimeConfig(threadId: string, config: ThreadConfig): void {
        const prev = lastRuntimeConfigByThreadId[threadId];
        if (prev !== undefined && isThreadConfigEqual(prev, config)) return;
        if (!runtimeConfigMapChanged) {
          lastRuntimeConfigByThreadId = { ...lastRuntimeConfigByThreadId };
          runtimeConfigMapChanged = true;
        }
        lastRuntimeConfigByThreadId[threadId] = config;
      }

      const threads = state.threads.map((thread) => {
        const snapshot = snapshotsById.get(thread.id);

        if (snapshot) {
          const lastRuntimeConfig = lastRuntimeConfigByThreadId[thread.id] ?? thread.config;
          const runtimeConfigChanged =
            snapshot.config !== undefined &&
            !isThreadConfigEqual(lastRuntimeConfig, snapshot.config);
          if (snapshot.config !== undefined) {
            recordRuntimeConfig(thread.id, snapshot.config);
          }
          const sessionRefChanged =
            (thread.sessionRef?.providerSessionId ?? "") !==
              (snapshot.sessionRef?.providerSessionId ?? "") ||
            (thread.sessionRef?.discoveredAt ?? "") !== (snapshot.sessionRef?.discoveredAt ?? "");

          const configFromRuntime = runtimeConfigChanged ? snapshot.config : undefined;
          const nextConfig =
            thread.presentationMode === "gui"
              ? (configFromRuntime ?? thread.config)
              : stripPlanMode(configFromRuntime ?? thread.config);
          const nextTurnTiming = deriveTurnTiming(thread, snapshot.status, {
            enteredLiveAt: thread.activeTurnStartedAt ?? thread.updatedAt ?? nowIso,
            nowIso,
          });
          const slashCommandsChanged = !areAgentSlashCommandsEqual(
            thread.slashCommands,
            snapshot.slashCommands,
          );

          if (
            thread.status === snapshot.status &&
            thread.attention === snapshot.attention &&
            isThreadConfigEqual(thread.config, nextConfig) &&
            thread.canResumeWithConfig === snapshot.canResumeWithConfig &&
            thread.threadStatusSource === snapshot.threadStatusSource &&
            thread.errorMessage === snapshot.errorMessage &&
            thread.activeTurnStartedAt === nextTurnTiming.activeTurnStartedAt &&
            thread.lastTurnStartedAt === nextTurnTiming.lastTurnStartedAt &&
            thread.lastTurnEndedAt === nextTurnTiming.lastTurnEndedAt &&
            !slashCommandsChanged &&
            !sessionRefChanged
          ) {
            return thread;
          }

          turnUpdate = appendCompletedTurnIfClosed(
            { ...state, ...turnUpdate },
            thread.id,
            thread,
            nextTurnTiming,
          );

          changed = true;
          return {
            ...thread,
            status: snapshot.status,
            attention: snapshot.attention,
            config: nextConfig,
            canResumeWithConfig: snapshot.canResumeWithConfig,
            ...(snapshot.threadStatusSource !== undefined
              ? { threadStatusSource: snapshot.threadStatusSource }
              : {}),
            ...(snapshot.errorMessage !== undefined ? { errorMessage: snapshot.errorMessage } : {}),
            ...(snapshot.sessionRef ? { sessionRef: snapshot.sessionRef } : {}),
            ...(snapshot.slashCommands !== undefined
              ? { slashCommands: snapshot.slashCommands }
              : {}),
            ...nextTurnTiming,
          };
        }

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

      const turnsChanged =
        turnUpdate.runtimeCompletedTurnsByThread !== state.runtimeCompletedTurnsByThread;
      const runtimeConfigPatch = runtimeConfigMapChanged
        ? { lastRuntimeConfigByThreadId }
        : undefined;
      if (!changed) {
        if (turnsChanged && runtimeConfigPatch) return { ...turnUpdate, ...runtimeConfigPatch };
        if (turnsChanged) return turnUpdate;
        return runtimeConfigPatch ?? {};
      }
      return {
        threads,
        ...(turnsChanged ? turnUpdate : {}),
        ...(runtimeConfigPatch ?? {}),
      };
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
});

export type { ThreadServerRequestId };
