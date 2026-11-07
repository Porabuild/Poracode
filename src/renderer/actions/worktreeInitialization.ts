import type { Project } from "@/shared/contracts";
import { primeWorktreeGitState, runWorktreeSetupScript } from "./worktreeLaunchActions";

/**
 * Shared follow-up for creating a thread in a worktree and moving one there,
 * on whichever host owns the project: this client runs the project's setup
 * script in an eager shell on that host, with prompt gating and success
 * cleanup, exactly once.
 *
 * `trackGitState: false` skips watching and reading the new worktree's git status, for
 * a worktree that belongs to no thread: the host only accepts a worktree location that
 * is registered through a thread, and refuses (HTTP 403) a status read of any other.
 */
export function initializeCreatedWorktree(
  project: Project,
  worktreePath: string,
  options: { trackGitState?: boolean } = {},
): void {
  if (options.trackGitState !== false) void primeWorktreeGitState(project, worktreePath);
  const setupScript = project.scripts?.setupScript;
  if (setupScript) void runWorktreeSetupScript(project, worktreePath, setupScript);
}
