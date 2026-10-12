import { normalizeWorktreePathForComparison } from "./worktree";

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
  return `shell:worktree-setup:${fnv1a(`${projectId}\0${comparable}`)}`;
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
