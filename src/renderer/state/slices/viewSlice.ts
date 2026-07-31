import type { AppView } from "@/shared/contracts";
import { makeDraftPaneId } from "@/shared/paneId";
import {
  adjustInsertTargetForRemoval,
  buildPaneLayoutFromLegacy,
  collectPaneIds,
  findPaneSlotId,
  insertPaneInLayout,
  removePaneFromLayout,
  splitPaneInLayout,
  swapPaneIdsInLayout,
  type PaneLayoutInsertTarget,
} from "@/shared/paneLayout";
import {
  preservePaneSizeStorageForLayoutChange,
  swapPaneIdsInStorage,
} from "@/renderer/components/layout/paneSizeStorage";
import { reorderIds, type ReorderPlacement } from "../reorder";
import {
  clearFinishedAndDone,
  currentPaneLayout,
  removePaneFromView,
  replacePaneInView,
  restoreGroupView,
  rowLayoutAfterInsert,
  rowLayoutAfterRemove,
  saveGroupLayout,
} from "./helpers";
import type { SavedGroupLayout } from "./types";
import type { SliceCreator } from "./shared";
import { usePanelStore } from "../panelStore";

export interface ViewSlice {
  view: AppView;
  focusedPaneId: string | null;
  pendingComposerFocusThreadId: string | null;
  chatScrollToBottomTokens: Record<string, number>;
  /**
   * Optimistic, urgent active-thread id used only for instant sidebar-row
   * highlighting on click. Decoupled from `view.panes` (which drives the heavy
   * pane remount) so the highlight can paint a frame before the blocking mount.
   * Non-null only while an `openThread` switch is in flight.
   */
  pendingActiveThreadId: string | null;
  groupLayouts: Record<string, SavedGroupLayout>;
  setFocusedPane: (paneId: string) => void;
  requestComposerFocus: (threadId: string) => void;
  clearComposerFocusRequest: (threadId: string) => void;
  requestChatScrollToBottom: (threadId: string) => void;
  setPendingActiveThread: (threadId: string | null) => void;
  openDraft: (projectId: string) => void;
  openDraftSideBySide: (projectId: string) => void;
  openHome: () => void;
  openPullRequests: () => void;
  openGitHubActions: (projectId?: string, runId?: number) => void;
  openSchedules: () => void;
  openExperiment: (experimentId: string, projectId: string) => void;
  openThread: (threadId: string) => void;
  openThreadStandalone: (threadId: string) => void;
  openThreadSideBySide: (threadId: string) => void;
  openGroupView: (groupId: string) => void;
  openGroupGrid: (groupId: string) => void;
  closeGroupView: () => void;
  replaceSecondPane: (threadId: string) => void;
  replacePaneAtIndex: (threadId: string, index: number) => void;
  insertPaneAtIndex: (
    threadId: string,
    index: number,
    edge?: "left" | "right" | "top" | "bottom",
  ) => void;
  movePaneToIndex: (
    paneId: string,
    targetIndex: number,
    edge?: "left" | "right" | "top" | "bottom",
  ) => void;
  replacePaneById: (threadId: string, targetPaneId: string) => void;
  splitPaneById: (
    threadId: string,
    targetPaneId: string,
    edge: "left" | "right" | "top" | "bottom",
  ) => void;
  insertPaneAtLayoutTarget: (threadId: string, target: PaneLayoutInsertTarget) => void;
  movePaneToLayoutTarget: (
    paneId: string,
    target: PaneLayoutInsertTarget | { paneId: string; edge: "left" | "right" | "top" | "bottom" },
  ) => void;
  swapPanes: (firstPaneId: string, secondPaneId: string) => void;
  closePane: (threadId: string) => void;
  replacePaneId: (oldId: string, newId: string) => void;
  reorderPanes: (sourceId: string, targetId: string, placement: ReorderPlacement) => void;
}

export const createViewSlice: SliceCreator<ViewSlice> = (set) => ({
  view: { kind: "home" },
  focusedPaneId: null,
  pendingComposerFocusThreadId: null,
  chatScrollToBottomTokens: {},
  pendingActiveThreadId: null,
  groupLayouts: {},
  setFocusedPane: (paneId) => set({ focusedPaneId: paneId }),
  requestComposerFocus: (threadId) => set({ pendingComposerFocusThreadId: threadId }),
  clearComposerFocusRequest: (threadId) =>
    set((state) =>
      state.pendingComposerFocusThreadId === threadId ? { pendingComposerFocusThreadId: null } : {},
    ),
  requestChatScrollToBottom: (threadId) =>
    set((state) => ({
      chatScrollToBottomTokens: {
        ...state.chatScrollToBottomTokens,
        [threadId]: (state.chatScrollToBottomTokens[threadId] ?? 0) + 1,
      },
    })),
  setPendingActiveThread: (threadId) => set({ pendingActiveThreadId: threadId }),
  openDraft: (projectId) => set({ view: { kind: "draft", projectId } }),
  openDraftSideBySide: (projectId) =>
    set((state) => {
      if (state.view.kind !== "thread") {
        return { view: { kind: "draft", projectId } };
      }
      if (state.view.activeGroupId) {
        return { groupLayouts: saveGroupLayout(state), view: { kind: "draft", projectId } };
      }
      const draftPaneId = makeDraftPaneId(projectId);
      const existing = state.view.panes;
      if (state.view.paneLayout) {
        const previousLayout = currentPaneLayout(state.view);
        const layout = insertPaneInLayout(
          state.view.paneLayout,
          {
            path: [],
            axis: "vertical",
            index:
              state.view.paneLayout.kind === "split" && state.view.paneLayout.axis === "vertical"
                ? state.view.paneLayout.children.length
                : 1,
          },
          draftPaneId,
        );
        preservePaneSizeStorageForLayoutChange(previousLayout, layout);
        return {
          view: {
            kind: "thread",
            panes: collectPaneIds(layout),
            paneLayout: layout,
          },
        };
      }
      const rl = state.view.rowLayout;
      const newRl = rl ? [...rl.slice(0, -1), rl[rl.length - 1]! + 1] : undefined;
      const nextPanes = [...existing, draftPaneId] as [string, ...string[]];
      const nextView: AppView = {
        ...state.view,
        panes: nextPanes,
        ...(newRl ? { rowLayout: newRl } : {}),
      };
      preservePaneSizeStorageForLayoutChange(
        currentPaneLayout(state.view),
        currentPaneLayout(nextView),
      );
      return {
        view: nextView,
      };
    }),
  openHome: () => set({ view: { kind: "home" } }),
  openPullRequests: () => set({ view: { kind: "pullRequests" } }),
  openGitHubActions: (projectId, runId) =>
    usePanelStore.getState().setGitHubActionsContext({
      ...(projectId ? { projectId } : {}),
      ...(runId ? { runId } : {}),
    }),
  openSchedules: () => set({ view: { kind: "schedules" } }),
  openExperiment: (experimentId, projectId) =>
    set((state) => ({
      ...(state.view.kind === "thread" && state.view.activeGroupId
        ? { groupLayouts: saveGroupLayout(state) }
        : {}),
      view: { kind: "experiment", experimentId, projectId },
    })),
  openThreadStandalone: (threadId) =>
    set((state) => {
      const nextView: AppView = { kind: "thread", panes: [threadId] };
      const cleared = clearFinishedAndDone(state.threads, [threadId]);
      return {
        ...(state.view.kind === "thread" && state.view.activeGroupId
          ? { groupLayouts: saveGroupLayout(state) }
          : {}),
        view: nextView,
        ...(cleared ? { threads: cleared } : {}),
      };
    }),
  openThread: (threadId) =>
    set((state) => {
      if (state.view.kind === "thread" && state.view.activeGroupId) {
        const thread = state.threads.find((t) => t.id === threadId);
        if (thread?.groupId === state.view.activeGroupId) {
          if (state.view.panes.includes(threadId)) {
            const cleared = clearFinishedAndDone(state.threads, [threadId]);
            return cleared ? { threads: cleared } : {};
          }
          const layout = currentPaneLayout(state.view);
          const insertTarget =
            layout.kind === "split" && layout.axis === "vertical"
              ? {
                  path: [] as number[],
                  axis: "vertical" as const,
                  index: layout.children.length,
                }
              : { path: [] as number[], axis: "vertical" as const, index: 1 };
          const newLayout = insertPaneInLayout(layout, insertTarget, threadId);
          preservePaneSizeStorageForLayoutChange(layout, newLayout);
          const nextView: AppView = {
            kind: "thread",
            panes: collectPaneIds(newLayout),
            paneLayout: newLayout,
            activeGroupId: state.view.activeGroupId,
          };
          const cleared = clearFinishedAndDone(state.threads, nextView.panes);
          return cleared ? { view: nextView, threads: cleared } : { view: nextView };
        }
        const nextView: AppView = { kind: "thread", panes: [threadId] };
        const cleared = clearFinishedAndDone(state.threads, [threadId]);
        const gl = saveGroupLayout(state);
        return cleared
          ? { groupLayouts: gl, view: nextView, threads: cleared }
          : { groupLayouts: gl, view: nextView };
      }

      const clickedThread = state.threads.find((t) => t.id === threadId);
      if (clickedThread?.groupId) {
        const gl = state.view.kind === "thread" ? saveGroupLayout(state) : state.groupLayouts;
        const groupId = clickedThread.groupId;
        const groupThreads = state.threads.filter(
          (t) => t.groupId === groupId && !t.done && !t.archived,
        );
        if (groupThreads.length >= 2) {
          const nextView = restoreGroupView(groupId, groupThreads, gl[groupId]);
          if (nextView) {
            const cleared = clearFinishedAndDone(state.threads, nextView.panes);
            return cleared
              ? { groupLayouts: gl, view: nextView, threads: cleared }
              : { groupLayouts: gl, view: nextView };
          }
        }
      }

      if (state.view.kind === "thread") {
        if (state.view.panes.includes(threadId)) {
          const cleared = clearFinishedAndDone(state.threads, [threadId]);
          return cleared ? { threads: cleared } : {};
        }
        const nextView = replacePaneInView(state.view, state.view.panes[0]!, threadId);
        const nextPanes = nextView.kind === "thread" ? nextView.panes : [threadId];
        const cleared = clearFinishedAndDone(state.threads, nextPanes);
        return cleared ? { view: nextView, threads: cleared } : { view: nextView };
      }
      const nextView: AppView = { kind: "thread", panes: [threadId] };
      const cleared = clearFinishedAndDone(state.threads, [threadId]);
      return cleared ? { view: nextView, threads: cleared } : { view: nextView };
    }),
  openThreadSideBySide: (threadId) =>
    set((state) => {
      if (state.view.kind !== "thread") {
        const nextView: AppView = { kind: "thread", panes: [threadId] };
        const cleared = clearFinishedAndDone(state.threads, [threadId]);
        return cleared ? { view: nextView, threads: cleared } : { view: nextView };
      }
      const existing = state.view.panes;
      if (existing.includes(threadId)) {
        const cleared = clearFinishedAndDone(state.threads, [threadId]);
        return cleared ? { threads: cleared } : {};
      }
      if (state.view.paneLayout) {
        const previousLayout = currentPaneLayout(state.view);
        const layout = insertPaneInLayout(
          state.view.paneLayout,
          {
            path: [],
            axis: "vertical",
            index:
              state.view.paneLayout.kind === "split" && state.view.paneLayout.axis === "vertical"
                ? state.view.paneLayout.children.length
                : 1,
          },
          threadId,
        );
        preservePaneSizeStorageForLayoutChange(previousLayout, layout);
        const panes = collectPaneIds(layout);
        const nextView: AppView = {
          kind: "thread",
          panes,
          paneLayout: layout,
          ...(state.view.activeGroupId ? { activeGroupId: state.view.activeGroupId } : {}),
        };
        const cleared = clearFinishedAndDone(state.threads, panes);
        return cleared ? { view: nextView, threads: cleared } : { view: nextView };
      }
      const nextPanes = [...existing, threadId] as [string, ...string[]];
      const rl = state.view.rowLayout;
      const newRl = rl ? [...rl.slice(0, -1), rl[rl.length - 1]! + 1] : undefined;
      const nextView: AppView = {
        ...state.view,
        panes: nextPanes,
        ...(newRl ? { rowLayout: newRl } : {}),
      };
      preservePaneSizeStorageForLayoutChange(
        currentPaneLayout(state.view),
        currentPaneLayout(nextView),
      );
      const cleared = clearFinishedAndDone(state.threads, nextPanes);
      return cleared ? { view: nextView, threads: cleared } : { view: nextView };
    }),
  openGroupView: (groupId) =>
    set((state) => {
      const gl = saveGroupLayout(state);
      const groupThreads = state.threads.filter(
        (t) => t.groupId === groupId && !t.done && !t.archived,
      );
      const nextView = restoreGroupView(
        groupId,
        groupThreads,
        gl[groupId] ?? state.groupLayouts[groupId],
      );
      if (!nextView) return {};
      const cleared = clearFinishedAndDone(state.threads, nextView.panes);
      return cleared
        ? { groupLayouts: gl, view: nextView, threads: cleared }
        : { groupLayouts: gl, view: nextView };
    }),
  openGroupGrid: (groupId) =>
    set((state) => {
      const groupLayouts = saveGroupLayout(state);
      const panes = state.threads
        .filter((thread) => thread.groupId === groupId && !thread.done && !thread.archived)
        .map((thread) => thread.id);
      if (panes.length === 0) return {};
      const rowLayout =
        panes.length > 3 ? [Math.ceil(panes.length / 2), Math.floor(panes.length / 2)] : undefined;
      const paneLayout = buildPaneLayoutFromLegacy(panes, rowLayout);
      const nonEmptyPanes = panes as [string, ...string[]];
      const view: AppView = {
        kind: "thread",
        panes: nonEmptyPanes,
        paneLayout,
        activeGroupId: groupId,
      };
      const threads = clearFinishedAndDone(state.threads, nonEmptyPanes);
      return threads ? { groupLayouts, view, threads } : { groupLayouts, view };
    }),
  closeGroupView: () =>
    set((state) => {
      if (state.view.kind !== "thread" || !state.view.activeGroupId) return {};
      return { groupLayouts: saveGroupLayout(state), view: { kind: "home" } };
    }),
  replaceSecondPane: (threadId) =>
    set((state) => {
      if (state.view.kind !== "thread" || state.view.panes.length < 2) {
        return {};
      }
      if (state.view.panes.includes(threadId)) {
        return {};
      }
      const nextView = replacePaneInView(state.view, state.view.panes[1]!, threadId);
      const nextPanes = nextView.kind === "thread" ? nextView.panes : [threadId];
      const cleared = clearFinishedAndDone(state.threads, nextPanes);
      return cleared ? { view: nextView, threads: cleared } : { view: nextView };
    }),
  replacePaneAtIndex: (threadId, index) =>
    set((state) => {
      if (state.view.kind !== "thread") {
        const nextView: AppView = { kind: "thread", panes: [threadId] };
        const cleared = clearFinishedAndDone(state.threads, [threadId]);
        return cleared ? { view: nextView, threads: cleared } : { view: nextView };
      }
      const existing = state.view.panes;
      if (existing.includes(threadId) || index < 0 || index >= existing.length) {
        return {};
      }
      const nextView = replacePaneInView(state.view, existing[index]!, threadId);
      const nextPanes = nextView.panes;
      const cleared = clearFinishedAndDone(state.threads, nextPanes);
      return cleared ? { view: nextView, threads: cleared } : { view: nextView };
    }),
  insertPaneAtIndex: (threadId, index, edge) =>
    set((state) => {
      if (state.view.kind !== "thread") {
        const nextView: AppView = { kind: "thread", panes: [threadId] };
        const cleared = clearFinishedAndDone(state.threads, [threadId]);
        return cleared ? { view: nextView, threads: cleared } : { view: nextView };
      }
      const existing = state.view.panes;
      if (existing.includes(threadId)) {
        return {};
      }
      const clampedIndex = Math.max(0, Math.min(existing.length, index));
      const nextPanes = [...existing];
      nextPanes.splice(clampedIndex, 0, threadId);
      const newRl = rowLayoutAfterInsert(state.view.rowLayout, existing.length, clampedIndex, edge);

      const nextView: AppView = {
        ...state.view,
        panes: nextPanes as [string, ...string[]],
        ...(newRl ? { rowLayout: newRl } : {}),
      };
      preservePaneSizeStorageForLayoutChange(
        currentPaneLayout(state.view),
        currentPaneLayout(nextView),
      );
      const cleared = clearFinishedAndDone(state.threads, nextPanes);
      return cleared ? { view: nextView, threads: cleared } : { view: nextView };
    }),
  movePaneToIndex: (paneId, targetIndex, edge) =>
    set((state) => {
      if (state.view.kind !== "thread") return {};
      const existing = state.view.panes;
      const sourceIndex = existing.indexOf(paneId);
      if (sourceIndex === -1) return {};
      const nextPanes = [...existing];
      nextPanes.splice(sourceIndex, 1);
      const adjustedIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const clampedIndex = Math.max(0, Math.min(nextPanes.length, adjustedIndex));
      nextPanes.splice(clampedIndex, 0, paneId);
      const remainingLayout = rowLayoutAfterRemove(state.view, new Set([sourceIndex]));
      const nextRowLayout = rowLayoutAfterInsert(
        remainingLayout,
        nextPanes.length - 1,
        clampedIndex,
        edge,
      );
      const nextView: AppView = {
        ...state.view,
        panes: nextPanes as [string, ...string[]],
        ...(nextRowLayout ? { rowLayout: nextRowLayout } : {}),
      };
      preservePaneSizeStorageForLayoutChange(
        currentPaneLayout(state.view),
        currentPaneLayout(nextView),
      );
      return {
        view: nextView,
      };
    }),
  replacePaneById: (threadId, targetPaneId) =>
    set((state) => {
      if (state.view.kind !== "thread") {
        const nextView: AppView = { kind: "thread", panes: [threadId] };
        const cleared = clearFinishedAndDone(state.threads, [threadId]);
        return cleared ? { view: nextView, threads: cleared } : { view: nextView };
      }
      if (state.view.panes.includes(threadId) || !state.view.panes.includes(targetPaneId)) {
        return {};
      }
      const nextView = replacePaneInView(state.view, targetPaneId, threadId);
      const panes = nextView.kind === "thread" ? nextView.panes : [threadId];
      const cleared = clearFinishedAndDone(state.threads, panes);
      return cleared ? { view: nextView, threads: cleared } : { view: nextView };
    }),
  splitPaneById: (threadId, targetPaneId, edge) =>
    set((state) => {
      if (state.view.kind !== "thread") {
        const nextView: AppView = { kind: "thread", panes: [threadId] };
        const cleared = clearFinishedAndDone(state.threads, [threadId]);
        return cleared ? { view: nextView, threads: cleared } : { view: nextView };
      }
      if (state.view.panes.includes(threadId) || !state.view.panes.includes(targetPaneId)) {
        return {};
      }
      const previousLayout = currentPaneLayout(state.view);
      const layout = splitPaneInLayout(previousLayout, targetPaneId, threadId, edge);
      preservePaneSizeStorageForLayoutChange(previousLayout, layout);
      const panes = collectPaneIds(layout);
      const nextView: AppView = {
        kind: "thread",
        panes,
        paneLayout: layout,
        ...(state.view.activeGroupId ? { activeGroupId: state.view.activeGroupId } : {}),
      };
      const cleared = clearFinishedAndDone(state.threads, panes);
      return cleared ? { view: nextView, threads: cleared } : { view: nextView };
    }),
  insertPaneAtLayoutTarget: (threadId, target) =>
    set((state) => {
      if (state.view.kind !== "thread") {
        const nextView: AppView = { kind: "thread", panes: [threadId] };
        const cleared = clearFinishedAndDone(state.threads, [threadId]);
        return cleared ? { view: nextView, threads: cleared } : { view: nextView };
      }
      if (state.view.panes.includes(threadId)) return {};
      const previousLayout = currentPaneLayout(state.view);
      const layout = insertPaneInLayout(previousLayout, target, threadId);
      preservePaneSizeStorageForLayoutChange(previousLayout, layout);
      const panes = collectPaneIds(layout);
      const nextView: AppView = {
        kind: "thread",
        panes,
        paneLayout: layout,
        ...(state.view.activeGroupId ? { activeGroupId: state.view.activeGroupId } : {}),
      };
      const cleared = clearFinishedAndDone(state.threads, panes);
      return cleared ? { view: nextView, threads: cleared } : { view: nextView };
    }),
  movePaneToLayoutTarget: (paneId, target) =>
    set((state) => {
      if (state.view.kind !== "thread") return {};
      if (!state.view.panes.includes(paneId)) return {};
      if ("paneId" in target && target.paneId === paneId) return {};

      const layout = currentPaneLayout(state.view);
      const slotId = findPaneSlotId(layout, paneId) ?? paneId;
      const layoutWithoutPane = removePaneFromLayout(layout, paneId);
      if (!layoutWithoutPane) {
        return {};
      }

      const nextLayout =
        "paneId" in target
          ? splitPaneInLayout(layoutWithoutPane, target.paneId, paneId, target.edge, slotId)
          : insertPaneInLayout(
              layoutWithoutPane,
              adjustInsertTargetForRemoval(layout, paneId, target),
              paneId,
              slotId,
            );
      preservePaneSizeStorageForLayoutChange(layout, nextLayout);
      return {
        view: {
          kind: "thread",
          panes: collectPaneIds(nextLayout),
          paneLayout: nextLayout,
          ...(state.view.activeGroupId ? { activeGroupId: state.view.activeGroupId } : {}),
        },
      };
    }),
  swapPanes: (firstPaneId, secondPaneId) =>
    set((state) => {
      if (state.view.kind !== "thread") return {};
      if (
        !state.view.panes.includes(firstPaneId) ||
        !state.view.panes.includes(secondPaneId) ||
        firstPaneId === secondPaneId
      ) {
        return {};
      }
      // Rewrite stored split sizes so each slot keeps its width after the swap.
      // The storage key is derived from the pane id list, so the layout swap
      // alone would shift the key and lose the user's custom proportions.
      swapPaneIdsInStorage(firstPaneId, secondPaneId);
      const layout = swapPaneIdsInLayout(currentPaneLayout(state.view), firstPaneId, secondPaneId);
      return {
        view: {
          kind: "thread",
          panes: collectPaneIds(layout),
          paneLayout: layout,
          ...(state.view.activeGroupId ? { activeGroupId: state.view.activeGroupId } : {}),
        },
      };
    }),
  closePane: (threadId) =>
    set((state) => {
      if (state.view.kind !== "thread") {
        return {};
      }
      const activeGid = state.view.activeGroupId;
      if (activeGid) {
        const threads = state.threads.map((t) =>
          t.id === threadId && t.groupId === activeGid
            ? { ...t, groupId: undefined, groupName: undefined }
            : t,
        );
        const nextView = removePaneFromView(state.view, threadId);
        if (nextView.kind === "thread" && nextView.panes.length <= 1) {
          const lastId = nextView.panes[0];
          const dissolvedThreads = threads.map((t) =>
            t.id === lastId && t.groupId === activeGid
              ? { ...t, groupId: undefined, groupName: undefined }
              : t,
          );
          return {
            threads: dissolvedThreads,
            view: { kind: "thread" as const, panes: nextView.panes } satisfies AppView,
          };
        }
        return { threads, view: nextView };
      }
      return { view: removePaneFromView(state.view, threadId) };
    }),
  replacePaneId: (oldId, newId) =>
    set((state) => {
      if (state.view.kind !== "thread") {
        return {};
      }
      const idx = state.view.panes.indexOf(oldId);
      if (idx === -1) return {};
      const nextView = replacePaneInView(state.view, oldId, newId);
      const nextPanes = nextView.kind === "thread" ? nextView.panes : [newId];
      const cleared = clearFinishedAndDone(state.threads, nextPanes);
      return cleared ? { view: nextView, threads: cleared } : { view: nextView };
    }),
  reorderPanes: (sourceId, targetId, placement) =>
    set((state) => {
      if (state.view.kind !== "thread") return {};
      const reordered = reorderIds(state.view.panes, sourceId, targetId, placement);
      if (reordered === state.view.panes) return {};
      return { view: { ...state.view, panes: reordered as [string, ...string[]] } };
    }),
});
