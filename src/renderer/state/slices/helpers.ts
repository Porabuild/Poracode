import type {
  AppView,
  Thread,
  ThreadAttention,
  ThreadConfig,
  ThreadStatus,
} from "@/shared/contracts";
import {
  buildPaneLayoutFromLegacy,
  collectPaneIds,
  insertPaneInLayout,
  removePaneFromLayout,
  replacePaneIdInLayout,
  type PaneLayout,
} from "@/shared/paneLayout";
import {
  addToRowLayout,
  insertRowInLayout,
  paneIndexToRowCol,
  removeIndicesFromRowLayout,
} from "@/shared/rowLayout";
import {
  migratePaneSizeStorage,
  preservePaneSizeStorageForLayoutChange,
} from "@/renderer/components/layout/paneSizeStorage";
import type { SavedGroupLayout } from "./types";

/**
 * Plan mode is a launch-time intent, not a persistent thread property.
 * Strip it so a thread that was first launched in plan mode resumes with default permission.
 */
export function stripPlanMode(config: ThreadConfig): ThreadConfig {
  if (config.mode !== "plan") {
    return config;
  }
  const { mode: _omit, ...rest } = config;
  return rest;
}

export { makeThreadTitle } from "@/shared/threadTitle";

export function normalizeStoredThreadStatus(thread: Thread): Thread {
  if (thread.status === "inactive") {
    return thread;
  }

  return {
    ...thread,
    status: "inactive",
    attention: "none",
  };
}

/**
 * Transition any "finished" threads that are now visible in panes back to "idle".
 * Returns updated array if any thread changed, or null if nothing changed.
 *
 * Deliberately does NOT clear `done`: opening a thread is not an undone action.
 * `done` only flips back on an explicit unmark or on real activity (status
 * transitions to "working" in updateThreadRuntime).
 */
export function clearFinished(threads: Thread[], panes: string[]): Thread[] | null {
  let changed = false;
  const result = threads.map((t) => {
    if (!panes.includes(t.id)) return t;
    if (t.status === "finished") {
      changed = true;
      return { ...t, status: "idle" as ThreadStatus };
    }
    return t;
  });
  return changed ? result : null;
}

/** Compute the next rowLayout after removing panes at the given flat indices. */
export function rowLayoutAfterRemove(
  view: { rowLayout?: number[]; panes: string[] },
  removedIndices: Set<number>,
): number[] | undefined {
  if (!view.rowLayout) return undefined;
  const result = removeIndicesFromRowLayout(view.rowLayout, removedIndices);
  return result.length > 0 ? result : undefined;
}

export function rowLayoutAfterInsert(
  rowLayout: number[] | undefined,
  paneCountBeforeInsert: number,
  insertIndex: number,
  edge?: "left" | "right" | "top" | "bottom",
): number[] | undefined {
  if (!edge) {
    return rowLayout;
  }

  const clampedIndex = Math.max(0, Math.min(paneCountBeforeInsert, insertIndex));
  const baseLayout = rowLayout ?? (paneCountBeforeInsert > 1 ? [paneCountBeforeInsert] : undefined);

  if (baseLayout) {
    if (edge === "top" || edge === "bottom") {
      const targetIndex = Math.min(clampedIndex, paneCountBeforeInsert - 1);
      const { row } = paneIndexToRowCol(baseLayout, targetIndex);
      return insertRowInLayout(baseLayout, edge === "top" ? row : row + 1);
    }

    const targetPaneIndex = edge === "right" ? Math.max(0, clampedIndex - 1) : clampedIndex;
    return addToRowLayout(baseLayout, Math.min(targetPaneIndex, paneCountBeforeInsert - 1));
  }

  if (edge === "top" || edge === "bottom") {
    return [1, 1];
  }

  return undefined;
}

/** Build the view update for pane removals, preserving rowLayout. */
export function viewAfterPaneRemoval(
  view: { kind: "thread"; panes: [string, ...string[]]; rowLayout?: number[] },
  remaining: string[],
  removedIndices: Set<number>,
): AppView {
  if (remaining.length === 0) return { kind: "home" as const };
  const rl = rowLayoutAfterRemove(view, removedIndices);
  return {
    ...view,
    panes: remaining as [string, ...string[]],
    ...(rl ? { rowLayout: rl } : {}),
  };
}

export function currentPaneLayout(view: Extract<AppView, { kind: "thread" }>): PaneLayout {
  return view.paneLayout ?? buildPaneLayoutFromLegacy(view.panes, view.rowLayout);
}

export function saveGroupLayout(state: {
  view: AppView;
  groupLayouts: Record<string, SavedGroupLayout>;
}): Record<string, SavedGroupLayout> {
  if (state.view.kind !== "thread" || !state.view.activeGroupId) return state.groupLayouts;
  return {
    ...state.groupLayouts,
    [state.view.activeGroupId]: {
      panes: [...state.view.panes],
      ...(state.view.paneLayout ? { paneLayout: state.view.paneLayout } : {}),
    },
  };
}

/**
 * Build the thread view that restores a group's saved panes + paneLayout.
 * - Drops saved pane ids that no longer exist in the group's active threads.
 * - Appends any active group threads missing from the saved list.
 * - Reconciles paneLayout the same way (drops invalid leaves, appends missing).
 * Used by both openGroupView (sidebar group icon) and openThread (clicking a
 * thread that belongs to a group) so layout restore is symmetric.
 */
export function restoreGroupView(
  groupId: string,
  groupThreads: Thread[],
  saved: SavedGroupLayout | undefined,
): Extract<AppView, { kind: "thread" }> | null {
  if (groupThreads.length === 0) return null;

  if (saved) {
    const validIds = new Set(groupThreads.map((t) => t.id));
    const restoredPanes = saved.panes.filter((id) => validIds.has(id));
    for (const t of groupThreads) {
      if (!restoredPanes.includes(t.id)) restoredPanes.push(t.id);
    }
    if (restoredPanes.length > 0) {
      let paneLayout = saved.paneLayout;
      if (paneLayout) {
        const savedPaneIds = collectPaneIds(paneLayout);
        for (const paneId of savedPaneIds) {
          if (validIds.has(paneId)) continue;
          const nextLayout = removePaneFromLayout(paneLayout, paneId);
          if (!nextLayout) {
            paneLayout = undefined;
            break;
          }
          paneLayout = nextLayout;
        }

        if (paneLayout) {
          const layoutPaneIds = new Set(collectPaneIds(paneLayout));
          for (const paneId of restoredPanes) {
            if (layoutPaneIds.has(paneId)) continue;
            paneLayout = insertPaneInLayout(
              paneLayout,
              paneLayout.kind === "split" && paneLayout.axis === "vertical"
                ? { path: [], axis: "vertical", index: paneLayout.children.length }
                : { path: [], axis: "vertical", index: 1 },
              paneId,
            );
            layoutPaneIds.add(paneId);
          }

          return {
            kind: "thread",
            panes: collectPaneIds(paneLayout) as [string, ...string[]],
            paneLayout,
            activeGroupId: groupId,
          };
        }
      }

      return {
        kind: "thread",
        panes: restoredPanes as [string, ...string[]],
        activeGroupId: groupId,
      };
    }
  }

  return {
    kind: "thread",
    panes: groupThreads.map((t) => t.id) as [string, ...string[]],
    activeGroupId: groupId,
  };
}

export function viewFromPaneLayout(
  layout: ReturnType<typeof removePaneFromLayout>,
  activeGroupId?: string,
): AppView {
  if (!layout) return { kind: "home" };
  return {
    kind: "thread",
    panes: collectPaneIds(layout),
    paneLayout: layout,
    ...(activeGroupId ? { activeGroupId } : {}),
  };
}

export function replacePaneInView(
  view: Extract<AppView, { kind: "thread" }>,
  oldPaneId: string,
  newPaneId: string,
): Extract<AppView, { kind: "thread" }> {
  // Split-size proportions are persisted under a key derived from the pane id
  // list, so a pane id swap (e.g., draft → real thread) would otherwise reset
  // the user's custom sizes back to an equal split.
  migratePaneSizeStorage(oldPaneId, newPaneId);

  const layout = replacePaneIdInLayout(currentPaneLayout(view), oldPaneId, newPaneId);
  return {
    kind: "thread",
    panes: collectPaneIds(layout),
    paneLayout: layout,
    ...(view.activeGroupId ? { activeGroupId: view.activeGroupId } : {}),
  };
}

export function removePaneFromView(
  view: Extract<AppView, { kind: "thread" }>,
  paneId: string,
): AppView {
  const previousLayout = currentPaneLayout(view);
  if (view.paneLayout) {
    const layout = removePaneFromLayout(view.paneLayout, paneId);
    if (layout) preservePaneSizeStorageForLayoutChange(previousLayout, layout);
    return viewFromPaneLayout(layout, view.activeGroupId);
  }

  const idx = view.panes.indexOf(paneId);
  const remaining = view.panes.filter((id) => id !== paneId);
  if (remaining.length === 0) return { kind: "home" };
  const nextView = viewAfterPaneRemoval(view, remaining, new Set(idx !== -1 ? [idx] : []));
  if (nextView.kind === "thread") {
    preservePaneSizeStorageForLayoutChange(previousLayout, currentPaneLayout(nextView));
  }
  return nextView;
}

export type { AppView, Thread, ThreadAttention, ThreadStatus };
