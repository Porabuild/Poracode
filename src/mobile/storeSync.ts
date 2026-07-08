import type { Thread } from "@/shared/contracts";
import type { RemoteAgentStatuses, RemoteShellSnapshot } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useGitSummariesStore } from "./gitSummaries";
import { emitTerminalExited, emitTerminalReset } from "./terminalFeed";
import { notifyLiveActivityThreadState } from "./push/liveActivityController";
import {
  applyThreadSnapshot,
  clearPendingRuntimeEvents,
  dispatchRemoteSupervisorEvent as dispatchRemoteSupervisorEventCore,
  type RemoteDispatchHooks,
} from "@/renderer/state/remote";
import { createInitialRuntimeEventState } from "@/renderer/state/slices/runtimeEventSlice";
import { createInitialSubAgentOverlayState } from "@/renderer/state/slices/subAgentOverlaySlice";
import { createInitialPendingSteerState } from "@/renderer/state/slices/pendingSteerSlice";

/**
 * Feeds remote snapshots and live WebSocket events into the same Zustand
 * stores the desktop renderer uses, so reused components (ChatPane,
 * ThreadComposerSection, ThreadDraftView, sidebar selectors) work unchanged.
 * This module is the mobile counterpart of the renderer's IPC listeners in
 * `src/renderer/app.tsx` and the DB hydration in `chatRuntimePersister`.
 *
 * The core snapshot/event mutations live in the shared
 * `@/renderer/state/remote` module (also consumed by the desktop-as-client
 * remote-servers store); this PWA module layers the mobile-only side effects
 * (Live Activity push, terminal feed fan-out, mobile git-summaries store) on
 * top of {@link dispatchRemoteSupervisorEvent} via its dispatch hooks, and
 * owns the PWA-only shell/agent-status/reset helpers.
 */

export { applyThreadSnapshot };

export function applyShellSnapshot(snapshot: RemoteShellSnapshot): void {
  useAppStore.setState((current) => {
    const currentById = new Map(current.threads.map((thread) => [thread.id, thread]));
    return {
      projects: snapshot.projects,
      // "finished" is a client-side derivation (an unwatched turn completed —
      // the badge that clears when the user opens the thread); the server only
      // ever persists "idle". A raw replace would strip the badge on the very
      // next shell refresh, so keep the local "finished" until the thread is
      // opened or genuinely changes state.
      threads: snapshot.threads.map((incoming) => {
        if (incoming.status !== "idle") return incoming;
        return currentById.get(incoming.id)?.status === "finished"
          ? { ...incoming, status: "finished" as const }
          : incoming;
      }),
    };
  });
  if (snapshot.gitSummariesByThread) {
    useGitSummariesStore.getState().setAll(snapshot.gitSummariesByThread);
  }
}

/** Drop everything tied to the previous desktop when switching/unpairing. */
export function resetRemoteStores(): void {
  clearPendingRuntimeEvents();
  useGitSummariesStore.getState().reset();
  useAppStore.setState({
    projects: [],
    threads: [],
    // Spread the slices' own initial state so every per-thread runtime map is
    // cleared — a hand-listed subset here previously leaked runtimeOpenTurn,
    // fileCheckpoint(s|Turns) and openSubAgent maps across desktop switches
    // (stale "running" badges + unbounded growth).
    ...createInitialRuntimeEventState(),
    ...createInitialSubAgentOverlayState(),
    ...createInitialPendingSteerState(),
  });
}

export function applyAgentStatuses(statuses: RemoteAgentStatuses): void {
  const store = useAgentStatusesStore.getState();
  store.setAgentStatuses(statuses.windows);
  store.setWslAgentStatuses(statuses.wsl);
}

/**
 * Resolve the thread's title/project from the store and feed the transition to
 * the Live Activity controller. The controller is inert unless the native app
 * configured a desktop context, so this is a cheap no-op on web/PWA.
 */
function driveLiveActivity(threadId: string, status: string, knownThread?: Thread): void {
  const state = useAppStore.getState();
  const thread = knownThread ?? state.threads.find((entry) => entry.id === threadId);
  if (!thread) return;
  const project = state.projects.find((entry) => entry.id === thread.projectId);
  void notifyLiveActivityThreadState({
    threadId,
    status,
    title: thread.title,
    project: project?.name ?? "",
  });
}

/**
 * Mobile dispatch hooks: layer the PWA's Live Activity, terminal-feed and
 * git-summaries side effects on top of the shared core mutation. The desktop
 * remote-servers store calls the shared core without hooks, so these fan-outs
 * never fire on the desktop-as-client path.
 */
const mobileDispatchHooks: RemoteDispatchHooks = {
  onThreadState: ({ threadId, status, oldThread }) =>
    driveLiveActivity(threadId, status, oldThread),
  onThreadReset: (threadId) => emitTerminalReset(threadId),
  onThreadExited: ({ threadId, exitCode }) => emitTerminalExited(threadId, exitCode),
  onGitSummaries: (summaries) => useGitSummariesStore.getState().setAll(summaries),
};

export function dispatchRemoteSupervisorEvent(value: unknown): void {
  dispatchRemoteSupervisorEventCore(value, mobileDispatchHooks);
}
