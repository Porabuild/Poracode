import { startTransition } from "react";
import { toast } from "@heroui/react";
import {
  isProjectInWorkspace,
  isThreadInWorkspace,
  type Project,
  type RemoteThreadCommand,
  type Thread,
} from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { friendlyError } from "@/shared/messages";
import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { shouldRelaunchThreadOnOpen } from "@/shared/threadRelaunch";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { readNativeVisualHostId } from "@/renderer/state/nativeVisualOwner";
import { useNativeVisualUiStore } from "@/renderer/state/nativeVisualUiStore";
import { hasHydratedThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { prepareRuntimeThreadReader } from "@/renderer/state/runtimeInterestHydration";
import { findExperimentByThreadId, useExperimentStore } from "@/renderer/state/experimentStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import {
  isApplyingHostOriginatedManagedRootMutation,
  managedRootOwner,
  sendManagedRootThreadCommand,
} from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import {
  dropPendingManagedRootLaunch,
  pinManagedRootThread,
  peekPendingManagedRootLaunch,
  trackPendingManagedRootThreadRemoval,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { refreshManagedRootCatalogSoon } from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { shouldConfirmThreadDelete } from "@/renderer/state/threadDeletePreference";
import {
  getActiveWorkspaceId,
  getKnownWorkspaceIds,
  getLastWorkspaceProjectId,
} from "@/renderer/state/workspaceStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import { useContinueInProviderStore } from "@/renderer/state/continueInProviderStore";
import { buildSidebarProjectRows } from "@/renderer/views/MainView/parts/Sidebar/parts/sidebarProjectRows";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads } from "@/renderer/utils/shellUtils";
import {
  auxiliaryThreadIds,
  useAuxiliaryThreadWindows,
} from "@/renderer/state/auxiliaryThreadWindows";
import { closePanelsForUnloadedThread } from "./panelActions";
import { getCurrentProjectId } from "./currentProject";
import { switchWorkspaceForProject } from "./workspaceActions";
import { deleteWorktreeGroup } from "./worktreeActions";
import {
  catalogEditPatch,
  applyCatalogPatchFields,
  dispatchOptimisticCatalogEdit,
} from "@/renderer/state/pendingCatalogEdits";

let openThreadRequestId = 0;
let threadRuntimeReopenEnabled = true;
const suppressedAutomaticThreadReopens = new Map<string, () => void>();
let cancelPendingThreadOpen: (() => void) | null = null;
const THREAD_OPEN_HISTORY_WAIT_MS = 150;

function allowAutomaticThreadReopen(threadId: string): void {
  suppressedAutomaticThreadReopens.get(threadId)?.();
  suppressedAutomaticThreadReopens.delete(threadId);
}

/** Browsing saved history must not trigger the restored-pane reconnect pass. */
export function suppressAutomaticThreadReopen(threadId: string): void {
  allowAutomaticThreadReopen(threadId);
  suppressedAutomaticThreadReopens.set(
    threadId,
    useAppStore.subscribe((state, previous) => {
      if (
        state.view.kind !== "thread" ||
        !state.view.panes.includes(threadId) ||
        state.pendingThreadLaunches[threadId] !== undefined ||
        state.connectingThreadIds[threadId] !== undefined ||
        (state.threads !== previous.threads &&
          state.threads.find((thread) => thread.id === threadId)?.status !== "inactive")
      )
        allowAutomaticThreadReopen(threadId);
    }),
  );
}

function nextThreadOpenRequest(): number {
  cancelPendingThreadOpen?.();
  cancelPendingThreadOpen = null;
  return ++openThreadRequestId;
}

/** Reserve navigation while an unopened search result resolves its host row. */
export function claimThreadNavigation(): () => boolean {
  const requestId = nextThreadOpenRequest();
  useAppStore.getState().setPendingActiveThread(null);
  return () => requestId === openThreadRequestId;
}

/**
 * Routes one thread content intent to whoever owns the row:
 *
 * - a projected remote row goes through the paired server's client;
 * - a root row (managed desktop, no projection) goes through the ONE managed
 *   loopback client as an explicit host command (B4: the renderer no longer
 *   writes catalog rows locally, so a local-only apply would be display-only);
 * - a command the host forwarded back for local mirroring never echoes: the
 *   caller's local path applies it.
 */
function dispatchRemoteThreadMutation(
  thread: Thread,
  command: (remoteThreadId: string) => RemoteThreadCommand,
  apply: () => void,
  onConfirmed?: () => void,
  onRejected?: (error: unknown) => void,
): boolean {
  const owner = remoteOwner(thread);
  const rootOwner = managedRootOwner(thread);
  if (!owner && (!rootOwner || isApplyingHostOriginatedManagedRootMutation())) return false;
  const oldView = useAppStore.getState().view;
  apply();
  const painted = useAppStore.getState().threads.find((row) => row.id === thread.id) ?? thread;
  const paintedView = useAppStore.getState().view;
  const rollbackPatch = catalogEditPatch(thread, painted);
  // Runtime status is live authority, even while a content command is pending.
  // Acknowledging a finished turn must never mask the next turn's working event.
  const { status: _status, ...patch } = rollbackPatch;
  const release = rootOwner ? pinManagedRootThread(rootOwner.threadId) : () => {};
  void dispatchOptimisticCatalogEdit({
    kind: "thread",
    row: thread,
    patch,
    apply: () => {},
    serverGeneratedFields: ["updatedAt", "archivedAt", "doneAt"],
    write: () =>
      owner
        ? useRemoteServersStore
            .getState()
            .sendThreadCommand(owner.desktopId, command(owner.remoteId))
        : sendManagedRootThreadCommand(command(rootOwner!.threadId)),
    restore: (base) =>
      useAppStore.setState((state) => ({
        threads: state.threads.map((row) =>
          row.id === thread.id
            ? {
                ...applyCatalogPatchFields(row, base, patch),
                ...(rollbackPatch.status && row.status === painted.status
                  ? { status: thread.status }
                  : {}),
              }
            : row,
        ),
        ...(state.view === paintedView ? { view: oldView } : {}),
      })),
  })
    .then(() => {
      onConfirmed?.();
      if (rootOwner) refreshManagedRootCatalogSoon();
    })
    .catch((error) => {
      toast.danger(friendlyError(error));
      onRejected?.(error);
      if (rootOwner) refreshManagedRootCatalogSoon();
    })
    .finally(release);
  return true;
}

export function setThreadRuntimeReopenEnabled(enabled: boolean): void {
  threadRuntimeReopenEnabled = enabled;
}

function discardReplacedDraftContents(targetProjectId: string): void {
  const store = useAppStore.getState();
  const view = store.view;
  if (view.kind === "draft") {
    if (view.projectId !== targetProjectId) store.discardDraftContent(view.projectId);
    return;
  }
  if (view.kind !== "thread") return;
  for (const paneId of view.panes) {
    const draftProjectId = parseDraftProjectId(paneId);
    if (draftProjectId && draftProjectId !== targetProjectId) {
      store.discardDraftContent(draftProjectId);
    }
  }
}

/**
 * Which project a new thread starts in when the caller names none. Every
 * candidate is checked against the active workspace: a workspace switch has to
 * change what "new thread" means, or the fresh draft lands in work the user just
 * navigated away from. The remembered pick comes second so returning to a
 * workspace resumes its last project, while the project currently on screen
 * still wins when it belongs to this workspace.
 */
function resolveNewThreadProjectId(): string | undefined {
  const store = useAppStore.getState();
  const knownWorkspaceIds = new Set(
    (useSharedSettings.getState().workspaces ?? []).map((workspace) => workspace.id),
  );
  const activeWorkspaceId = getActiveWorkspaceId();
  const isVisible = (project: Project) =>
    (isHomeProject(project) || !project.disabled) &&
    isProjectInWorkspace(project, activeWorkspaceId, knownWorkspaceIds);
  const visibleId = (projectId: string | undefined) =>
    store.projects.find((project) => project.id === projectId && isVisible(project))?.id;

  return (
    visibleId(getCurrentProjectId()) ??
    visibleId(getLastWorkspaceProjectId()) ??
    (useSharedSettings.getState().homeScopeEnabled
      ? store.projects.find(isHomeProject)?.id
      : undefined) ??
    store.projects.find((project) => !isHomeProject(project) && isVisible(project))?.id ??
    // Nothing in this workspace: better a draft in another workspace's project
    // than dropping the user back on Home with no way to type.
    store.projects.find((project) => !project.disabled && !isHomeProject(project))?.id
  );
}

export function openNewThread(projectId?: string): void {
  nextThreadOpenRequest();
  const targetProjectId = projectId ?? resolveNewThreadProjectId();
  startTransition(() => {
    if (!targetProjectId) {
      useAppStore.getState().openHome();
      return;
    }
    const mode = useSharedSettings.getState().newThreadMode;
    const view = useAppStore.getState().view;
    if (mode === "panel" && view.kind === "thread" && view.panes.length > 0) {
      useAppStore.getState().openDraftSideBySide(targetProjectId);
    } else {
      discardReplacedDraftContents(targetProjectId);
      useAppStore.getState().openDraft(targetProjectId);
    }
  });
}

export function openNewThreadSideBySide(projectId: string): void {
  nextThreadOpenRequest();
  startTransition(() => {
    useAppStore.getState().openDraftSideBySide(projectId);
  });
}

export function openNewThreadInWorktree(input: {
  projectId: string;
  worktreePath: string;
  worktreeBranch: string;
}): void {
  nextThreadOpenRequest();
  startTransition(() => {
    const store = useAppStore.getState();
    store.setPendingDraftWorktreeSelection(input.projectId, {
      branch: input.worktreeBranch,
      baseBranch: input.worktreeBranch,
      isWorktree: true,
      worktreePath: input.worktreePath,
    });
    const mode = useSharedSettings.getState().newThreadMode;
    const view = useAppStore.getState().view;
    if (mode === "panel" && view.kind === "thread" && view.panes.length > 0) {
      useAppStore.getState().openDraftSideBySide(input.projectId);
    } else {
      discardReplacedDraftContents(input.projectId);
      useAppStore.getState().openDraft(input.projectId);
    }
  });
}

export function openThread(
  threadId: string,
  options?: {
    focusComposer?: boolean;
    standalone?: boolean;
    switchWorkspace?: boolean;
    reopenRuntime?: boolean;
  },
): void {
  const requestId = nextThreadOpenRequest();
  allowAutomaticThreadReopen(threadId);
  const store = useAppStore.getState();
  const thread = store.threads.find((item) => item.id === threadId);
  if (thread && options?.switchWorkspace) {
    switchWorkspaceForProject(thread.projectId);
  }
  const owner = remoteOwner(thread);
  if (owner) {
    store.setPendingActiveThread(threadId);
    startTransition(() => {
      if (options?.reopenRuntime === false) suppressAutomaticThreadReopen(threadId);
      if (options?.standalone) store.openThreadStandalone(threadId);
      else store.openThread(threadId);
      store.setPendingActiveThread(null);
      if (options?.focusComposer !== false) store.requestComposerFocus(threadId);
    });
    // Same open pipeline as local: hydrate remote history, then if still
    // inactive queue the empty-prompt reopen. ThreadView runs
    // performInitialThreadLaunch, which uses remote startThread instead of
    // local IPC — the only intentional difference.
    void useRemoteServersStore
      .getState()
      .openRemoteThread(owner.desktopId, owner.remoteId)
      .then((opened) => {
        // Reopen only when this open actually applied. A superseded open (the
        // user already clicked another thread) or a failed one (host
        // unreachable — the relaunch would fail noisily) resolves false.
        if (opened && threadRuntimeReopenEnabled && options?.reopenRuntime !== false)
          reopenStoredThread(threadId);
      });
    return;
  }
  const standalone = options?.standalone ?? findExperimentByThreadId(threadId) !== undefined;

  // Phase 1 (urgent): flip the optimistic active-thread id in its own cheap
  // commit so the sidebar row highlights immediately. This does not touch
  // `view.panes`, so it does not trigger the heavy pane remount. Snapshot the
  // current view so the deferred swap can bail if the user navigates elsewhere
  // within the frame (setPendingActiveThread leaves `view`'s reference intact).
  store.setPendingActiveThread(threadId);
  const viewAtSchedule = store.view;

  // Phase 2 (deferred): perform the real pane swap that mounts the target
  // thread. Kept behind a frame so the highlight paints first; the previous
  // pane stays visible until the new one mounts (no blank flash).
  const applyOpen = (reopenRuntime = true) => {
    // Superseded by a newer openThread — that call owns the pending id and will
    // clear it, so leave it untouched here.
    if (requestId !== openThreadRequestId) return false;
    // The user navigated somewhere else (Home/Draft/another pane) during the
    // frame; honor that instead of clobbering it, and drop the stale highlight.
    if (useAppStore.getState().view !== viewAtSchedule) {
      useAppStore.getState().setPendingActiveThread(null);
      return false;
    }

    startTransition(() => {
      const nextStore = useAppStore.getState();
      if (options?.reopenRuntime === false) suppressAutomaticThreadReopen(threadId);
      if (standalone) nextStore.openThreadStandalone(threadId);
      else nextStore.openThread(threadId);
      // Clear in the same auto-batched commit as the pane swap so the highlight
      // hands off to `view.panes` without a flicker.
      nextStore.setPendingActiveThread(null);
      // Opening a thread on the desktop is a handoff to its composer. GUI
      // panes deliberately keep their DOM slot mounted across thread switches,
      // so mount-time autofocus alone cannot cover this path.
      if (options?.focusComposer !== false) {
        useAppStore.getState().requestComposerFocus(threadId);
      }
      // Late-rendering items (virtualizer measurement, hydration, streaming) can
      // leave the chat slightly above the bottom on reopen. Re-arm stick-to-bottom
      // so any post-mount growth keeps the view pinned.
      if (thread?.presentationMode === "gui") {
        useAppStore.getState().requestChatScrollToBottom(threadId);
      }
    });

    if (
      reopenRuntime &&
      options?.reopenRuntime !== false &&
      threadRuntimeReopenEnabled &&
      thread?.status === "inactive"
    ) {
      reopenStoredThread(threadId);
    }
    return true;
  };

  // Prepare the first chunk before replacing the current pane when it is fast.
  // A slow host read must still reveal the pane's existing loading state.
  // Retain its live stream too, so the mounted reader adopts this baseline
  // across the interest grace period instead of starting a second recovery.
  if (thread?.presentationMode === "gui" && !hasHydratedThreadRuntimeItems(threadId)) {
    let unsubscribe = () => {};
    let active = true;
    let opened = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const retire = () => {
      active = false;
      clearTimeout(timeoutId);
      unsubscribe();
      if (cancelPendingThreadOpen === cancel) cancelPendingThreadOpen = null;
    };
    const reader = prepareRuntimeThreadReader(threadId, retire);
    const cancel = () => {
      if (!active) return;
      retire();
      reader.release();
      if (requestId === openThreadRequestId) {
        useAppStore.getState().setPendingActiveThread(null);
      }
    };
    cancelPendingThreadOpen = cancel;
    unsubscribe = useAppStore.subscribe((state, previous) => {
      const departed = opened
        ? state.view.kind !== "thread" || !state.view.panes.includes(threadId)
        : state.view !== viewAtSchedule;
      if (
        departed ||
        (state.threads !== previous.threads &&
          !state.threads.some((candidate) => candidate.id === threadId))
      )
        cancel();
    });
    const finishOpen = (reopenRuntime: boolean) => {
      if (!active || opened) return;
      clearTimeout(timeoutId);
      opened = true;
      if (!applyOpen(reopenRuntime)) return cancel();
    };
    timeoutId = setTimeout(() => finishOpen(false), THREAD_OPEN_HISTORY_WAIT_MS);
    const finishRead = () => {
      if (!opened) return finishOpen(true);
      // The pane can adopt the reader while the baseline is still pending.
      // Reconnect only after that read settles, while this navigation still
      // owns the visible pane; a late read must not restart a departed thread.
      const state = useAppStore.getState();
      if (
        requestId === openThreadRequestId &&
        state.view.kind === "thread" &&
        state.view.panes.includes(threadId) &&
        threadRuntimeReopenEnabled &&
        options?.reopenRuntime !== false
      ) {
        reopenStoredThread(threadId);
      }
    };
    void reader.ready.then(finishRead, finishRead);
    return;
  }
  // Defer the heavy pane swap one frame so the urgent highlight commit paints
  // first. requestAnimationFrame alone is not enough: Chromium parks rAF
  // entirely for occluded windows, which would stall the open until the window
  // is next visible (e.g. thread opens driven from the mobile remote). The
  // timeout fallback keeps the swap flowing (throttled timers still fire) while
  // the rAF path preserves the paint-first ordering when visible.
  let applied = false;
  let frameId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const applyOnce = () => {
    if (applied) return;
    applied = true;
    if (frameId !== null) cancelAnimationFrame(frameId);
    if (timeoutId !== null) clearTimeout(timeoutId);
    applyOpen();
  };
  frameId = requestAnimationFrame(applyOnce);
  if (!applied) timeoutId = setTimeout(applyOnce, 50);
}

/**
 * Open the thread immediately before/after the current one in the sidebar's
 * visible order (the "Next chat" / "Previous chat" shortcuts). Navigation is
 * scoped to the current thread's project and wraps around at the ends. The order
 * mirrors the sidebar exactly — same sort mode and starred/recent grouping — but
 * with worktree groups expanded and the "See more" cap lifted so every
 * non-archived thread is reachable, even ones not currently rendered.
 */
export function switchToAdjacentThread(current: Thread, direction: "next" | "previous"): void {
  const store = useAppStore.getState();
  const knownWorkspaceIds = getKnownWorkspaceIds();
  const activeWorkspaceId = getActiveWorkspaceId();
  const auxiliaryIds = useAuxiliaryThreadWindows.getState().hiddenThreadIds;
  const projectThreads = store.threads.filter(
    (thread) =>
      !auxiliaryIds.has(thread.id) &&
      thread.projectId === current.projectId &&
      !thread.archived &&
      // Home threads filed under other workspaces are hidden from the sidebar,
      // so the shortcuts must not wrap into them either.
      isThreadInWorkspace(thread, activeWorkspaceId, knownWorkspaceIds),
  );
  if (projectThreads.length < 2) return;

  const orderedIds = buildSidebarProjectRows({
    projectId: current.projectId,
    projectThreads,
    sortMode: usePanelStore.getState().threadSortMode,
    collapsedWorktrees: {},
    expandAllGroups: true,
    visibleLimit: Number.MAX_SAFE_INTEGER,
  }).flatMap((row) => (row.kind === "thread" ? [row.thread.id] : []));

  const index = orderedIds.indexOf(current.id);
  if (index === -1) return;
  const delta = direction === "next" ? 1 : -1;
  const nextId = orderedIds[(index + delta + orderedIds.length) % orderedIds.length];
  if (nextId && nextId !== current.id) openThread(nextId);
}

export function reopenStoredThread(threadId: string): void {
  allowAutomaticThreadReopen(threadId);
  const store = useAppStore.getState();
  const thread = store.threads.find((item) => item.id === threadId);
  if (!thread) return;
  if (
    !shouldRelaunchThreadOnOpen(thread) ||
    store.pendingThreadLaunches[thread.id] !== undefined ||
    store.connectingThreadIds[thread.id] !== undefined
  ) {
    return;
  }

  const isGuiReconnect = thread.presentationMode === "gui";
  // Match ThreadSessionManager.sendThreadInput's inactive/no-session refusal.
  // Opening a saved pane must not silently start a fresh GUI session under
  // its existing transcript.
  if (isGuiReconnect && !thread.sessionRef && !thread.canResumeWithConfig) return;
  startTransition(() => {
    store.updateThreadRuntime(thread.id, {
      status: isGuiReconnect ? "idle" : "launching",
      attention: "none",
      ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      canResumeWithConfig: thread.canResumeWithConfig || thread.sessionRef !== undefined,
    });
    if (isGuiReconnect) store.beginThreadConnecting(thread.id);
  });
  // Local and remote share this queue; performInitialThreadLaunch picks the
  // host (local bridge vs remote client.startThread).
  store.queueThreadLaunch(thread.id, "");
}

export async function unloadStoredThread(
  threadId: string,
  options?: { closeThreadPane?: boolean; keepSidePanels?: boolean },
): Promise<void> {
  const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
  if (!thread || thread.status === "inactive") {
    return;
  }

  const view = useAppStore.getState().view;
  const inVisiblePane = view.kind === "thread" && view.panes.includes(threadId);

  const owner = remoteOwner(thread);
  await readBridge().closeThread({ threadId });
  if (owner) await useRemoteServersStore.getState().refreshServer(owner.desktopId);
  startTransition(() => {
    useAppStore.getState().markThreadExited(threadId);
    if (inVisiblePane && !options?.keepSidePanels) {
      closePanelsForUnloadedThread(thread);
    }
    if (options?.closeThreadPane && inVisiblePane) {
      useAppStore.getState().closePane(threadId);
    }
  });
}

export function sweepStaleThreads(): void {
  const staleThreadUnloadMinutes = useSharedSettings.getState().staleThreadUnloadMinutes;
  if (staleThreadUnloadMinutes <= 0) return;

  const store = useAppStore.getState();
  const visibleThreadIds = new Set(store.view.kind === "thread" ? store.view.panes : []);
  for (const id of auxiliaryThreadIds()) visibleThreadIds.add(id);
  if (store.view.kind === "experiment") {
    const experiment = useExperimentStore.getState().experiments[store.view.experimentId];
    for (const candidate of experiment?.candidates ?? []) {
      visibleThreadIds.add(candidate.threadId);
    }
  }
  const staleBefore = Date.now() - staleThreadUnloadMinutes * 60_000;

  for (const thread of store.threads) {
    if (visibleThreadIds.has(thread.id) || thread.status !== "idle" || !thread.sessionRef) {
      continue;
    }
    const updatedAtMs = new Date(thread.updatedAt).getTime();
    const lastViewedAtMs = store.lastViewedAtByThreadId[thread.id] ?? 0;
    const lastActiveMs = Math.max(updatedAtMs, lastViewedAtMs);
    if (lastActiveMs > staleBefore) {
      continue;
    }

    void unloadStoredThread(thread.id).catch(() => undefined);
  }
}

export function archiveThread(threadId: string): void {
  if (findExperimentByThreadId(threadId)) return;
  const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
  if (
    thread &&
    dispatchRemoteThreadMutation(
      thread,
      (remoteThreadId) => ({
        kind: "archive",
        threadId: remoteThreadId,
      }),
      () => useAppStore.getState().archiveThread(threadId),
    )
  )
    return;
  void unloadStoredThread(threadId).catch(() => undefined);
  useAppStore.getState().archiveThread(threadId);
}

export function unarchiveThread(threadId: string): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((candidate) => candidate.id === threadId);
  if (!thread) return;
  if (
    dispatchRemoteThreadMutation(
      thread,
      (remoteThreadId) => ({ kind: "unarchive", threadId: remoteThreadId }),
      () => useAppStore.getState().unarchiveThread(threadId),
    )
  )
    return;
  store.unarchiveThread(threadId);
}

export function unloadThread(threadId: string): void {
  void unloadStoredThread(threadId, { closeThreadPane: true }).catch((error) =>
    toast.danger(friendlyError(error)),
  );
}

/**
 * Marks a thread done: unloads its runtime, drops the worktree's terminal tabs
 * once no live thread is left there, and flips the store flag. When this was
 * the worktree's last open thread, the sidebar worktree group is now fully
 * done and gets collapsed. Shared by the manual affordances (context menu,
 * sidebar Done button) and the PR-merge automation.
 */
export function markThreadDone(threadId: string): void {
  if (findExperimentByThreadId(threadId)) return;
  const store = useAppStore.getState();
  const thread = store.threads.find((t) => t.id === threadId);
  if (!thread || thread.done) return;
  if (
    dispatchRemoteThreadMutation(
      thread,
      (remoteThreadId) => ({ kind: "set-done", threadId: remoteThreadId, done: true }),
      () => useAppStore.getState().markThreadDone(threadId),
      () => cleanupDoneThread(threadId),
    )
  )
    return;

  store.markThreadDone(threadId);
  cleanupDoneThread(threadId);
}

/** Confirmation-only, idempotent cleanup for a thread whose visible flag may already be painted. */
export function cleanupDoneThread(threadId: string): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((row) => row.id === threadId);
  if (!thread?.done) return;
  void unloadStoredThread(threadId, { keepSidePanels: true }).catch(() => undefined);
  const worktreePath = thread.worktreePath;
  const isLastOpenWorktreeThread =
    worktreePath !== undefined &&
    store.threads.every(
      (t) => t.id === threadId || t.worktreePath !== worktreePath || t.done || t.archived,
    );
  if (worktreePath && isLastOpenWorktreeThread) {
    useSidebarUiStore.getState().setWorktreeCollapsed(worktreePath, true);
    const termStore = useDevTerminalStore.getState();
    const removedTabIds = termStore.removeTabsForWorktree(worktreePath);
    void closeThreads(removedTabIds);
    if (termStore.source === "project" && termStore.activeWorktreePath === worktreePath) {
      termStore.closePanel();
    }
  }
}

export function toggleMarkThreadDone(threadId: string): void {
  if (findExperimentByThreadId(threadId)) return;
  const store = useAppStore.getState();
  const thread = store.threads.find((t) => t.id === threadId);
  if (!thread) return;
  const done = !thread.done;
  if (
    dispatchRemoteThreadMutation(
      thread,
      (remoteThreadId) => ({ kind: "set-done", threadId: remoteThreadId, done }),
      () => {
        const nextStore = useAppStore.getState();
        if (done) nextStore.markThreadDone(threadId);
        else nextStore.unmarkThreadDone(threadId);
      },
      () => {
        if (done) cleanupDoneThread(threadId);
      },
    )
  )
    return;
  if (thread.done) {
    store.unmarkThreadDone(threadId);
  } else {
    markThreadDone(threadId);
  }
}

export function toggleStarThread(threadId: string): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((t) => t.id === threadId);
  if (!thread) return;
  const starred = !thread.starred;
  if (
    dispatchRemoteThreadMutation(
      thread,
      (remoteThreadId) => ({ kind: "set-starred", threadId: remoteThreadId, starred }),
      () => {
        const nextStore = useAppStore.getState();
        if (starred) nextStore.starThread(threadId);
        else nextStore.unstarThread(threadId);
      },
    )
  )
    return;
  if (thread.starred) {
    store.unstarThread(threadId);
  } else {
    store.starThread(threadId);
  }
}

export function renameThread(threadId: string, title: string): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((candidate) => candidate.id === threadId);
  if (
    thread &&
    dispatchRemoteThreadMutation(
      thread,
      (remoteThreadId) => ({ kind: "rename", threadId: remoteThreadId, title }),
      () => useAppStore.getState().renameThread(threadId, title),
    )
  )
    return;
  store.renameThread(threadId, title);
}

/**
 * Tag a thread with worktree metadata. Local threads update the store (and
 * persist via the app DB); remote projected threads go through the host's
 * existing `set-worktree` command so the durable row is updated on the machine
 * that owns the project.
 */
export async function setThreadWorktree(
  threadId: string,
  worktreePath: string,
  worktreeBranch?: string,
  options?: { isNewWorktree?: boolean; preserveProvisioning?: boolean },
): Promise<void> {
  const store = useAppStore.getState();
  const thread = store.threads.find((candidate) => candidate.id === threadId);
  if (!thread) return;

  const apply = () => {
    useAppStore.getState().setThreadWorktree(threadId, worktreePath, worktreeBranch, {
      ...(options?.preserveProvisioning ? { preserveProvisioning: true } : {}),
    });
  };

  const owner = remoteOwner(thread);
  if (owner) {
    await useRemoteServersStore.getState().sendThreadCommand(owner.desktopId, {
      kind: "set-worktree",
      threadId: owner.remoteId,
      worktreePath,
      ...(worktreeBranch ? { worktreeBranch } : {}),
      ...(options?.isNewWorktree ? { isNewWorktree: true } : {}),
    });
  } else {
    const rootOwner = managedRootOwner(thread);
    if (rootOwner && !isApplyingHostOriginatedManagedRootMutation()) {
      const release = pinManagedRootThread(rootOwner.threadId);
      try {
        await sendManagedRootThreadCommand({
          kind: "set-worktree",
          threadId: rootOwner.threadId,
          worktreePath,
          ...(worktreeBranch ? { worktreeBranch } : {}),
          ...(options?.isNewWorktree ? { isNewWorktree: true } : {}),
        });
        refreshManagedRootCatalogSoon();
      } finally {
        release();
      }
    }
  }
  apply();
}

/** Clear the unread completion marker without navigating the source desktop. */
export function acknowledgeThread(threadId: string): void {
  const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
  const apply = () => {
    useAppStore.setState((state) => {
      const current = state.threads.find((item) => item.id === threadId);
      if (current?.status !== "finished") return {};
      return {
        threads: state.threads.map((item) =>
          item.id === threadId ? { ...item, status: "idle" as const } : item,
        ),
      };
    });
  };
  if (
    thread &&
    dispatchRemoteThreadMutation(
      thread,
      (remoteThreadId) => ({ kind: "acknowledge", threadId: remoteThreadId }),
      apply,
    )
  )
    return;
  apply();
}

function deleteThreadOnly(
  threadId: string,
  record?: Thread,
  completion?: { resolve: () => void; reject: (error: unknown) => void },
): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((candidate) => candidate.id === threadId) ?? record;
  const rootOwner = thread ? managedRootOwner(thread) : undefined;
  const pendingLaunch = peekPendingManagedRootLaunch(threadId);
  const visualHostId = thread ? readNativeVisualHostId(thread) : undefined;
  const visualThreadId = thread?.remoteId ?? threadId;
  const forgetVisuals = () =>
    useNativeVisualUiStore.getState().forgetThread(visualHostId, visualThreadId);
  const persistedProvisioning =
    store.provisioningWorktreeThreadIds[threadId] === true &&
    rootOwner !== undefined &&
    (pendingLaunch?.metadataCreated === true || pendingLaunch?.metadataCreationUncertain === true);
  if (store.provisioningWorktreeThreadIds[threadId] === true && !persistedProvisioning) {
    store.deleteThread(threadId);
    completion?.resolve();
    return;
  }
  const removal = persistedProvisioning ? Promise.withResolvers<boolean>() : undefined;
  if (removal) trackPendingManagedRootThreadRemoval(threadId, removal.promise);
  const confirmRemoteDelete = () => {
    forgetVisuals();
    // A successful explicit delete is authoritative resolution of any
    // retained uncertain launch episode. Keep the marker until command
    // success so a refused or ambiguous delete can still replay the exact
    // original launch operation.
    if (rootOwner) dropPendingManagedRootLaunch(rootOwner.threadId);
    if (persistedProvisioning) useAppStore.getState().deleteThread(threadId);
    removal?.resolve(true);
    void readBridge()
      .closeSideChatPanel?.(threadId)
      .catch((error: unknown) => toast.danger(friendlyError(error)));
    completion?.resolve();
  };
  if (
    thread &&
    dispatchRemoteThreadMutation(
      thread,
      (remoteThreadId) => ({ kind: "delete", threadId: remoteThreadId }),
      () => useAppStore.getState().archiveThread(threadId),
      confirmRemoteDelete,
      (error) => {
        removal?.resolve(false);
        completion?.reject(error);
      },
    )
  )
    return;
  // A host-originated delete is already authoritative and deliberately
  // bypasses command echo. Retire any locally retained uncertain launch just
  // as the successful user-command path does.
  if (rootOwner) dropPendingManagedRootLaunch(rootOwner.threadId);
  if (isApplyingHostOriginatedManagedRootMutation()) forgetVisuals();
  removal?.resolve(true);
  store.deleteThread(threadId);
  void readBridge()
    .closeSideChatPanel?.(threadId)
    .catch((error: unknown) => toast.danger(friendlyError(error)));
  void readBridge()
    .closeThread({ threadId })
    .catch(() => undefined);
  if (completion)
    void readBridge()
      .dbDeleteThread(threadId)
      .then(() => {
        forgetVisuals();
        completion.resolve();
      }, completion.reject);
}

/** Dispose a retained auxiliary row even when it is outside the loaded catalog page. */
export function deleteThreadRecord(thread: Thread): Promise<void> {
  return new Promise((resolve, reject) => deleteThreadOnly(thread.id, thread, { resolve, reject }));
}

/** True when `threadId` is the only thread still using `worktreePath`. */
function ownsWorktreeAlone(threadId: string, worktreePath: string): boolean {
  return !useAppStore
    .getState()
    .threads.some(
      (candidate) => candidate.worktreePath === worktreePath && candidate.id !== threadId,
    );
}

/**
 * Deletes a thread, also removing its worktree directory when this was the last
 * thread using it. Confirmation is the caller's job — see `requestDeleteThread`
 * for the interactive entry point.
 */
export function deleteThread(threadId: string, worktreePath?: string, projectId?: string): void {
  if (findExperimentByThreadId(threadId)) return;
  // No worktree, or siblings still use it — drop the thread and keep the directory.
  if (!worktreePath || !ownsWorktreeAlone(threadId, worktreePath)) {
    deleteThreadOnly(threadId);
    return;
  }

  const project = useAppStore.getState().projects.find((p) => p.id === projectId);
  if (!project) {
    useAppStore.getState().deleteThread(threadId);
    return;
  }
  deleteWorktreeGroup(project.id, worktreePath, [threadId]);
}

export function deleteThreadsAndOwnedWorktrees(threads: readonly Thread[]): void {
  const selectedThreadIds = new Set(threads.map((thread) => thread.id));
  const allThreads = useAppStore.getState().threads;
  const deletedWorktrees = new Set<string>();

  for (const thread of threads) {
    if (!thread.worktreePath) {
      deleteThread(thread.id);
      continue;
    }

    const worktreeKey = `${thread.projectId}\0${thread.worktreePath}`;
    if (deletedWorktrees.has(worktreeKey)) continue;

    const siblings = allThreads.filter(
      (candidate) =>
        candidate.projectId === thread.projectId && candidate.worktreePath === thread.worktreePath,
    );
    if (siblings.every((candidate) => selectedThreadIds.has(candidate.id))) {
      deletedWorktrees.add(worktreeKey);
      deleteWorktreeGroup(
        thread.projectId,
        thread.worktreePath,
        siblings.map((candidate) => candidate.id),
      );
    } else {
      deleteThread(thread.id);
    }
  }
}

/**
 * Sidebar-initiated delete: asks first unless the user turned confirmation off,
 * then routes through `deleteThread`. Every thread is confirmed the same way,
 * whether or not it owns a worktree — the popover only names the worktree when
 * deleting this thread is what would take the directory with it.
 */
export function requestDeleteThread(
  threadId: string,
  worktreePath: string | undefined,
  projectId: string | undefined,
  options?: {
    anchorPosition?: { x: number; y: number };
    returnFocusElement?: HTMLElement;
  },
): void {
  if (findExperimentByThreadId(threadId)) return;
  if (!shouldConfirmThreadDelete()) {
    deleteThread(threadId, worktreePath, projectId);
    return;
  }

  const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
  // Named in the confirmation only when this delete is what removes the directory.
  const worktreeToRemove =
    worktreePath !== undefined &&
    projectId !== undefined &&
    ownsWorktreeAlone(threadId, worktreePath)
      ? {
          worktreePath,
          worktreeBranch:
            resolveWorktreeBranch(projectId, worktreePath, thread?.worktreeBranch) ??
            worktreePath.split(/[/\\]/).pop() ??
            worktreePath,
        }
      : {};
  useWorktreeDeleteStore.getState().setDialog({
    kind: "single-thread",
    threadId,
    ...(projectId !== undefined ? { projectId } : {}),
    ...worktreeToRemove,
    anchorPosition: options?.anchorPosition ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    },
    ...(options?.returnFocusElement ? { returnFocusElement: options.returnFocusElement } : {}),
  });
}

/**
 * Open the thread and ask its pane to raise the handoff dialog. The dialog
 * lives in the thread pane (it needs the pane's agent statuses and project
 * location), so the sidebar can only record the request and let the pane act
 * on it once mounted.
 */
export function continueInProvider(threadId: string): void {
  openThread(threadId);
  useContinueInProviderStore.getState().request(threadId);
}

export function reopenPaneThreadsIfInactive(): void {
  if (!threadRuntimeReopenEnabled) return;
  const store = useAppStore.getState();
  if (store.view.kind !== "thread") return;
  for (const paneId of store.view.panes) {
    if (isDraftPaneId(paneId) || suppressedAutomaticThreadReopens.has(paneId)) continue;
    const thread = store.threads.find((t) => t.id === paneId);
    if (!thread || thread.status !== "inactive") continue;
    reopenStoredThread(thread.id);
  }
}
