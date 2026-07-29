import type { ProviderUsageResponse, Thread } from "@/shared/contracts";
import {
  remoteThreadsChangedEventSchema,
  type RemoteAgentStatuses,
  type RemoteShellSnapshot,
} from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { resetDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { resetGitReviewActionStore } from "@/renderer/state/gitReviewActionStore";
import { useGitReadModelStore } from "@/renderer/state/gitReadModelStore";
import { projectGitReadModelIntoLegacyStore } from "@/renderer/state/gitReadModelLegacyProjection";
import { resetGitStoreCache } from "@/renderer/state/gitStore";
import { useNotesStore } from "@/renderer/state/notesStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { resetProjectTreeStore } from "@/renderer/state/projectTreeStore";
import { useGitSummariesStore } from "./gitSummaries";
import { useDesktopPanelStore } from "./desktopPanelStore";
import { emitTerminalExited, emitTerminalReset } from "./terminalFeed";
import { notifyLiveActivityThreadState } from "./push/liveActivityController";
import {
  applyThreadSnapshot,
  clearPendingRuntimeEvents,
  dispatchRemoteSupervisorEvent as dispatchRemoteSupervisorEventCore,
  isThreadVisible,
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

function reuseSnapshotRows<T extends { readonly id: string }>(current: T[], incoming: T[]): T[] {
  if (current.length === 0) return incoming.length === 0 ? current : incoming;
  const currentById = new Map(current.map((row) => [row.id, row]));
  let changed = current.length !== incoming.length;
  const next = incoming.map((row, index) => {
    const existing = currentById.get(row.id);
    const resolved = existing && JSON.stringify(existing) === JSON.stringify(row) ? existing : row;
    if (resolved !== current[index]) changed = true;
    return resolved;
  });
  return changed ? next : current;
}

export function applyShellSnapshot(snapshot: RemoteShellSnapshot): void {
  useAppStore.setState((current) => {
    const currentById = new Map(current.threads.map((thread) => [thread.id, thread]));
    // "finished" is a client-side derivation (an unwatched turn completed —
    // the badge that clears when the user opens the thread); the server only
    // ever persists "idle". A raw replace would strip the badge on the very
    // next shell refresh, so keep the local "finished" until the thread is
    // opened or genuinely changes state.
    const incomingThreads = snapshot.threads.map((incoming) => {
      // Some hosts can persist `finished` long enough for a shell/history
      // refresh to race the open action. A visible thread has already been
      // acknowledged on this client, so do not resurrect its unread badge.
      if (incoming.status === "finished" && isThreadVisible(current.view, incoming.id)) {
        return { ...incoming, status: "idle" as const };
      }
      if (incoming.status !== "idle") return incoming;
      return currentById.get(incoming.id)?.status === "finished"
        ? { ...incoming, status: "finished" as const }
        : incoming;
    });
    const projects = reuseSnapshotRows(current.projects, snapshot.projects);
    const threads = reuseSnapshotRows(current.threads, incomingThreads);
    return projects === current.projects && threads === current.threads
      ? current
      : { projects, threads };
  });
  if (snapshot.gitSummariesByThread) {
    useGitSummariesStore.getState().setAll(snapshot.gitSummariesByThread);
  }
  if (snapshot.gitState) {
    useGitReadModelStore.getState().replaceSnapshot(snapshot.gitState);
    projectGitReadModelIntoLegacyStore(snapshot.gitState);
  }
}

/** Drop everything tied to the previous desktop when switching/unpairing. */
export function resetRemoteStores(): void {
  clearPendingRuntimeEvents();
  // Renderer workspace stores are process-global because Electron has one
  // local desktop. The PWA can switch among several desktops, so none of their
  // cached notes, files, Git state, drafts, or terminal tabs may cross that
  // identity boundary.
  useNotesStore.getState().resetSession();
  useFileEditorStore.getState().clearSession();
  resetProjectTreeStore();
  resetGitStoreCache();
  resetGitReviewActionStore();
  resetDevTerminalStore();
  useDesktopPanelStore.getState().reset();
  useGitSummariesStore.getState().reset();
  useGitReadModelStore.getState().reset();
  useProviderUsageStore.getState().setSnapshots([]);
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

export function applyProviderUsage(response: ProviderUsageResponse): void {
  useProviderUsageStore.getState().setSnapshots(response.snapshots);
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
  onGitState: (patch) => {
    const store = useGitReadModelStore.getState();
    store.applyPatch(patch);
    projectGitReadModelIntoLegacyStore(useGitReadModelStore.getState());
  },
};

export function dispatchRemoteSupervisorEvent(value: unknown): void {
  const threadMetadataEvent = remoteThreadsChangedEventSchema.safeParse(value);
  if (threadMetadataEvent.success && threadMetadataEvent.data.viewedThreadIds) {
    const viewed = new Set(threadMetadataEvent.data.viewedThreadIds);
    useAppStore.setState((current) => {
      let changed = false;
      const threads = current.threads.map((thread) => {
        if (!viewed.has(thread.id) || thread.status !== "finished") return thread;
        changed = true;
        return { ...thread, status: "idle" as const };
      });
      return changed ? { threads } : {};
    });
    return;
  }
  dispatchRemoteSupervisorEventCore(value, mobileDispatchHooks);
}
