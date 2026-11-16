import { normalizeWorktreePathForComparison } from "./worktree";
import { fnv1a32 } from "./fnv1a32";

/**
 * Stable PTY id for a worktree setup script.
 *
 * The host starts the shell and the desktop terminal tab watches the same id,
 * so both sides must derive it without a wire field. The id is not persisted.
 * Cleanup shells stay random: a second remove must not reuse a PTY that is
 * still exiting.
 */
export function worktreeScriptShellId(
  projectId: string,
  worktreePath: string,
  caseInsensitive: boolean,
): string {
  const comparable = normalizeWorktreePathForComparison(worktreePath, caseInsensitive);
  return `shell:worktree-setup:${fnv1a32(`${projectId}\0${comparable}`).toString(16).padStart(8, "0")}`;
}
