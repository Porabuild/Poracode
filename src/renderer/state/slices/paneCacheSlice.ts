import type { AppView, Thread } from "@/shared/contracts";
import { isDraftPaneId } from "@/shared/paneId";
import type { SliceCreator } from "./shared";

/**
 * Keep-alive cache for terminal-presentation thread panes.
 *
 * Thread panes unmount on switch. The xterm instance is stashed and the
 * outgoing surface remounts in `AgentTerminalHost` so the local buffer
 * survives (main-buffer scrollback and alt-screen frames). This slice tracks
 * which thread panes to keep alive, LRU-capped so WebGL contexts and buffer
 * memory stay bounded.
 *
 * A pane is added when a thread is created into a pane or opened, and the
 * panes it replaces stay in the cache so switching away does not dispose
 * their xterm. It is removed when the thread is deleted/archived/done
 * (terminal should dispose) or when the LRU cap forces eviction of the
 * oldest hidden pane. `closePane` does NOT evict — closing a pane doesn't
 * kill the thread, so its terminal stays alive.
 */
export interface PaneCacheSlice {
  /** Ordered thread ids to keep alive, most-recently-opened last. */
  keepAlivePaneIds: string[];
}

/** Max hidden terminal panes to keep alive (Chromium ~16 WebGL contexts). */
export const MAX_KEEP_ALIVE_PANES = 8;

export function touchKeepAliveIds(
  current: readonly string[],
  threadIds: string | readonly string[],
  visiblePaneIds: readonly string[],
): string[] {
  const ids = typeof threadIds === "string" ? [threadIds] : threadIds;
  const next = [...current];
  for (const id of ids) {
    const index = next.indexOf(id);
    if (index !== -1) next.splice(index, 1);
    next.push(id);
  }
  const visible = new Set(visiblePaneIds);
  while (next.length > MAX_KEEP_ALIVE_PANES) {
    const index = next.findIndex((id) => !visible.has(id));
    if (index === -1) break;
    next.splice(index, 1);
  }
  return next;
}

export function removeKeepAliveId(current: readonly string[], threadId: string): string[] {
  return current.filter((id) => id !== threadId);
}

function isKeepAliveTerminalPane(
  threads: readonly Pick<Thread, "id" | "presentationMode">[],
  paneId: string,
): boolean {
  if (isDraftPaneId(paneId)) return false;
  const thread = threads.find((candidate) => candidate.id === paneId);
  return thread !== undefined && thread.presentationMode !== "gui";
}

/**
 * Store patch that records the opened thread(s) and every terminal pane the
 * current view is about to hide. Switching A → B must keep A mounted; only
 * touching B left the outgoing xterm to unmount and drop scrollback.
 */
export function keepAlivePatch(
  state: {
    keepAlivePaneIds: readonly string[];
    view: AppView;
    threads: readonly Pick<Thread, "id" | "presentationMode">[];
  },
  threadIds: string | readonly string[],
): { keepAlivePaneIds: string[] } | Record<string, never> {
  const opened = typeof threadIds === "string" ? [threadIds] : threadIds;
  const currentPanes = state.view.kind === "thread" ? state.view.panes : [];
  const ids = [...currentPanes, ...opened].filter((id) =>
    isKeepAliveTerminalPane(state.threads, id),
  );
  if (ids.length === 0) return {};
  return {
    keepAlivePaneIds: touchKeepAliveIds(state.keepAlivePaneIds, ids, currentPanes),
  };
}

export const createPaneCacheSlice: SliceCreator<PaneCacheSlice> = () => ({
  keepAlivePaneIds: [],
});
