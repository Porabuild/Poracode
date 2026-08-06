import type { SliceCreator } from "./shared";

/**
 * Keep-alive cache for terminal-presentation thread panes.
 *
 * Thread panes unmount on switch, which disposes the xterm instance and loses
 * the terminal's buffer (scrollback for main-buffer TUIs like Command Code /
 * Claude no-flicker, and the alt-screen frame for Codex / Gemini). Keeping
 * hidden panes mounted (`invisible`, like the dev-terminal tabs) preserves
 * both. This slice tracks which thread panes to keep alive, LRU-capped so
 * WebGL contexts and buffer memory stay bounded.
 *
 * A pane is added when a thread is opened in a pane; it is removed when the
 * thread is deleted/archived/done (terminal should dispose) or when the LRU
 * cap forces eviction of the oldest hidden pane. `closePane` does NOT evict
 * — closing a pane doesn't kill the thread, so its terminal stays alive.
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

export const createPaneCacheSlice: SliceCreator<PaneCacheSlice> = () => ({
  keepAlivePaneIds: [],
});
