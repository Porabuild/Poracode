import { createContext, useContext } from "react";

/**
 * Touch adaptation for the git-review file list. On the desktop the per-file
 * and per-group actions live behind hover; a touch device has no hover, so the
 * mobile shell installs this context and the rows expose the same actions
 * through a long-press action sheet instead (see the shared `useLongPress`
 * hook). When the context is absent (the desktop default) the rows render their
 * original hover affordances unchanged.
 */

export interface GitTouchFileTarget {
  readonly path: string;
  readonly staged: boolean;
  readonly status: string;
  readonly insertions: number;
  readonly deletions: number;
}

export interface GitTouchGroupTarget {
  readonly title: string;
  readonly staged: boolean;
}

export interface GitTouchActions {
  /** Open the action menu for a single file row (stage/unstage, revert, …). */
  openFileMenu(target: GitTouchFileTarget): void;
  /** Open the action menu for a group header (stage all, revert all, …). */
  openGroupMenu(target: GitTouchGroupTarget): void;
}

const GitTouchContext = createContext<GitTouchActions | null>(null);

export const GitTouchProvider = GitTouchContext.Provider;

export function useGitTouch(): GitTouchActions | null {
  return useContext(GitTouchContext);
}
