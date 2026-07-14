import { startTransition } from "react";
import type { Thread } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { findExperimentByThreadId, useExperimentStore } from "@/renderer/state/experimentStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
} from "@/renderer/state/chatRuntimePersister";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import { readWorktreeDeletePref } from "@/renderer/views/MainView/parts/Sidebar/parts/DeleteWorktreeDialog";
import { buildSidebarProjectRows } from "@/renderer/views/MainView/parts/Sidebar/parts/sidebarProjectRows";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import { closeThreads } from "@/renderer/utils/shellUtils";
import { closePanelsForUnloadedThread } from "./panelActions";
import { getCurrentProjectId } from "./currentProject";
import { performWorktreeRemoval } from "./worktreeActions";

let openThreadRequestId = 0;

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

export function openNewThread(projectId?: string): void {
  openThreadRequestId += 1;
  const store = useAppStore.getState();
  const targetProjectId =
    projectId ??
    getCurrentProjectId() ??
    (useSharedSettings.getState().homeScopeEnabled
      ? store.projects.find(isHomeProject)?.id
      : undefined) ??
    store.projects.find((project) => !project.disabled && !isHomeProject(project))?.id;
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
  openThreadRequestId += 1;
  startTransition(() => {
    useAppStore.getState().openDraftSideBySide(projectId);
  });
}

export function openNewThreadInWorktree(input: {
  projectId: string;
  worktreePath: string;
  worktreeBranch: string;
}): void {
  openThreadRequestId += 1;
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
  options?: { focusComposer?: boolean; standalone?: boolean },
): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((item) => item.id === threadId);
  const standalone = options?.standalone ?? findExperimentByThreadId(threadId) !== undefined;
  const requestId = ++openThreadRequestId;
  const threadIdsToHydrate = getGuiThreadIdsToHydrateBeforeOpen(threadId, standalone);

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
  const applyOpen = () => {
    // Superseded by a newer openThread — that call owns the pending id and will
    // clear it, so leave it untouched here.
    if (requestId !== openThreadRequestId) return;
    // The user navigated somewhere else (Home/Draft/another pane) during the
    // frame; honor that instead of clobbering it, and drop the stale highlight.
    if (useAppStore.getState().view !== viewAtSchedule) {
      useAppStore.getState().setPendingActiveThread(null);
      return;
    }

    startTransition(() => {
      const nextStore = useAppStore.getState();
      if (standalone) nextStore.openThreadStandalone(threadId);
      else nextStore.openThread(threadId);
      // Clear in the same auto-batched commit as the pane swap so the highlight
      // hands off to `view.panes` without a flicker.
      nextStore.setPendingActiveThread(null);
      if (options?.focusComposer) {
        useAppStore.getState().requestComposerFocus(threadId);
      }
      // Late-rendering items (virtualizer measurement, hydration, streaming) can
      // leave the chat slightly above the bottom on reopen. Re-arm stick-to-bottom
      // so any post-mount growth keeps the view pinned.
      if (thread?.presentationMode === "gui") {
        useAppStore.getState().requestChatScrollToBottom(threadId);
      }
    });

    if (thread?.status === "inactive") {
      reopenStoredThread(threadId);
    }
  };

  if (threadIdsToHydrate.length > 0) {
    // Hydration already yields (awaited), so the highlight paints during the
    // SQLite fetch — no extra frame needed before the swap.
    void Promise.all(threadIdsToHydrate.map((id) => hydrateThreadRuntimeItems(id))).then(
      applyOpen,
      applyOpen,
    );
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
  const projectThreads = store.threads.filter(
    (thread) => thread.projectId === current.projectId && !thread.archived,
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

function getGuiThreadIdsToHydrateBeforeOpen(threadId: string, standalone = false): string[] {
  const state = useAppStore.getState();
  const clickedThread = state.threads.find((thread) => thread.id === threadId);
  if (!clickedThread) return [];

  let candidates = [clickedThread];
  if (!standalone && clickedThread.groupId) {
    const groupThreads = state.threads.filter(
      (thread) => thread.groupId === clickedThread.groupId && !thread.done && !thread.archived,
    );
    if (groupThreads.length >= 2) {
      candidates = groupThreads;
    }
  }

  return candidates
    .filter(
      (thread) => thread.presentationMode === "gui" && !hasHydratedThreadRuntimeItems(thread.id),
    )
    .map((thread) => thread.id);
}

export function reopenStoredThread(threadId: string): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((item) => item.id === threadId);
  if (!thread) return;
  if (thread.status !== "inactive" || store.pendingThreadLaunches[thread.id] !== undefined) {
    return;
  }

  const isGuiReconnect = thread.presentationMode === "gui" && thread.sessionRef !== undefined;
  startTransition(() => {
    store.updateThreadRuntime(thread.id, {
      status: isGuiReconnect ? "idle" : "launching",
      attention: "none",
      ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      canResumeWithConfig: thread.canResumeWithConfig || thread.sessionRef !== undefined,
    });
  });
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

  await readBridge().closeThread({ threadId });
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
  void unloadStoredThread(threadId).catch(() => undefined);
  useAppStore.getState().archiveThread(threadId);
}

export function unloadThread(threadId: string): void {
  void unloadStoredThread(threadId, { closeThreadPane: true }).catch(() => undefined);
}

export function toggleMarkThreadDone(threadId: string): void {
  if (findExperimentByThreadId(threadId)) return;
  const store = useAppStore.getState();
  const thread = store.threads.find((t) => t.id === threadId);
  if (!thread) return;
  if (thread.done) {
    store.unmarkThreadDone(threadId);
  } else {
    void unloadStoredThread(threadId, { keepSidePanels: true }).catch(() => undefined);
    const worktreePath = thread.worktreePath;
    const isLastOpenWorktreeThread =
      worktreePath !== undefined &&
      store.threads.every(
        (t) => t.id === threadId || t.worktreePath !== worktreePath || t.done || t.archived,
      );
    if (worktreePath && isLastOpenWorktreeThread) {
      const termStore = useDevTerminalStore.getState();
      const removedTabIds = termStore.removeTabsForWorktree(worktreePath);
      void closeThreads(removedTabIds);
      if (termStore.isOpen && termStore.activeWorktreePath === worktreePath) {
        termStore.closePanel();
      }
    }
    store.markThreadDone(threadId);
  }
}

export function toggleStarThread(threadId: string): void {
  const store = useAppStore.getState();
  const thread = store.threads.find((t) => t.id === threadId);
  if (!thread) return;
  if (thread.starred) {
    store.unstarThread(threadId);
  } else {
    store.starThread(threadId);
  }
}

export function renameThread(threadId: string, title: string): void {
  useAppStore.getState().renameThread(threadId, title);
}

function deleteThreadOnly(threadId: string): void {
  useAppStore.getState().deleteThread(threadId);
  void readBridge()
    .closeThread({ threadId })
    .catch(() => undefined);
}

export function deleteThread(threadId: string, worktreePath?: string, projectId?: string): void {
  if (findExperimentByThreadId(threadId)) return;
  if (!worktreePath) {
    deleteThreadOnly(threadId);
    return;
  }

  const allThreads = useAppStore.getState().threads;
  const siblings = allThreads.filter((t) => t.worktreePath === worktreePath && t.id !== threadId);

  // Other threads still use this worktree — delete the thread without offering worktree removal.
  if (siblings.length > 0) {
    deleteThreadOnly(threadId);
    return;
  }

  const pref = readWorktreeDeletePref();
  if (pref === "thread-only") {
    deleteThreadOnly(threadId);
    return;
  }

  if (pref === "thread-and-worktree") {
    const thread = allThreads.find((t) => t.id === threadId);
    useAppStore.getState().deleteThread(threadId);

    const project = useAppStore.getState().projects.find((p) => p.id === projectId);
    if (project) {
      void (async () => {
        await closeThreads([threadId]);
        await performWorktreeRemoval(project, worktreePath, thread?.worktreeBranch);
      })();
    }
    return;
  }

  const thread = allThreads.find((t) => t.id === threadId);
  useWorktreeDeleteStore.getState().setDialog({
    kind: "single-thread",
    threadId,
    projectId: projectId!,
    worktreePath,
    worktreeBranch:
      resolveWorktreeBranch(projectId!, worktreePath, thread?.worktreeBranch) ??
      worktreePath.split(/[/\\]/).pop() ??
      worktreePath,
  });
}

export function continueInProvider(threadId: string): void {
  openThread(threadId);
}

export function reopenPaneThreadsIfInactive(): void {
  const store = useAppStore.getState();
  if (store.view.kind !== "thread") return;
  for (const paneId of store.view.panes) {
    if (isDraftPaneId(paneId)) continue;
    const thread = store.threads.find((t) => t.id === paneId);
    if (!thread || thread.status !== "inactive") continue;
    reopenStoredThread(thread.id);
  }
}
