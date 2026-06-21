import type { GitAddWorktreePayload, Project, Thread } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { buildWorktreeLocation } from "@/shared/worktree";
import { useAppStore } from "@/renderer/state/appStore";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { useGitSummariesStore } from "./gitSummaries";
import type { RemoteSession } from "./remoteContext";
import type { ThreadAction } from "./useRemoteDesktop";
import type { GitTarget } from "./views/GitView";

/**
 * Decides whether starting this draft requires creating a new worktree, and if
 * so builds the `gitAddWorktree` payload (mirrors desktop's handleDraftStart).
 * Returns null when no worktree is created — either a plain project-root thread
 * or one targeting an *existing* worktree (which the caller uses directly).
 */
export function buildGitAddWorktreePayload(
  project: Project,
  input: DraftStartInput,
): GitAddWorktreePayload | null {
  // Existing worktree → reuse it; no branch → project-root thread.
  if (input.existingWorktreePath || !input.worktreeBranch) return null;
  return {
    projectLocation: project.location,
    branch: input.worktreeBranch,
    createBranch: input.worktreeIsNewBranch ?? false,
    ...(input.worktreeBaseBranch ? { startPoint: input.worktreeBaseBranch } : {}),
    ...(project.scripts?.worktreeCopyPatterns
      ? { copyIgnoredPatterns: project.scripts.worktreeCopyPatterns }
      : {}),
    transferUncommitted: input.worktreeTransferUncommitted ?? false,
    // "Worktree + changes" copies (keeps on source); a plain move clears it.
    keepChangesInSource: input.worktreeTransferUncommitted ?? false,
  };
}

/**
 * Preselect an existing worktree in the shared draft store so the new-thread
 * composer opens targeting it (the composer reads `pendingDraftWorktreeSelection`
 * on mount). Mirrors desktop's `openNewThreadInWorktree`; the caller navigates
 * to `/new` after. For an existing worktree, the base branch is its own branch.
 */
export function preselectWorktreeDraft(input: {
  readonly projectId: string;
  readonly worktreePath: string;
  readonly worktreeBranch: string;
}): void {
  useAppStore.getState().setPendingDraftWorktreeSelection(input.projectId, {
    branch: input.worktreeBranch,
    baseBranch: input.worktreeBranch,
    isWorktree: true,
    worktreePath: input.worktreePath,
  });
  useAppStore.getState().openDraft(input.projectId);
}

/** Extract the thread id from a `/thread/:id` pathname (decoded), or null. */
export function threadIdFromPath(pathname: string): string | null {
  const match = /^\/thread\/(.+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Apply a thread action and, when it removes the thread (archive/delete),
 * invoke `onRemoved` so the caller can route away from the now-gone thread.
 */
export function runThreadAction(
  remote: RemoteSession,
  thread: Thread | null,
  action: ThreadAction,
  onRemoved: () => void,
): void {
  if (!thread) return;
  void remote.applyThreadAction(thread, action);
  if (action.kind === "archive" || action.kind === "delete") {
    onRemoved();
  }
}

/**
 * Reconstruct the fullscreen git-panel target for a thread from the live
 * session + cached git summaries (mirrors the old App.openGit). Returns null
 * when the thread or its project is not loaded yet.
 */
export function buildGitTarget(remote: RemoteSession, threadId: string): GitTarget | null {
  const thread = remote.threads.find((entry) => entry.id === threadId);
  if (!thread) return null;
  const project = remote.projects.find((entry) => entry.id === thread.projectId);
  if (!project) return null;
  const summary = useGitSummariesStore.getState().byThread[threadId];
  const worktreePath = thread.worktreePath ?? undefined;
  if (worktreePath) {
    return {
      project,
      statusKey: worktreePath,
      worktreePath,
      worktreeBranch: summary?.branch,
      locationOverride: buildWorktreeLocation(project.location, worktreePath),
    };
  }
  return { project };
}

/**
 * Pick the project the mobile new-thread draft composer should show. Mirrors
 * the desktop ProjectSwitchMenu's filter: Home is stored with `disabled: true`
 * as an internal marker (not a user-disabled project), so it stays selectable
 * while genuinely disabled projects are dropped.
 *
 * Resolution order: an explicit pick (e.g. choosing Home from the embedded
 * switcher), then the active thread's project, then the first *real* project —
 * Home is only the default when nothing else is available, so a fresh
 * new-thread screen doesn't open on Home for everyone (Home sorts first).
 */
export function selectDraftProject(
  projects: readonly Project[],
  selection: {
    readonly draftProjectId: string | null;
    readonly selectedThreadProjectId: string | null | undefined;
  },
): Project | null {
  const selectable = projects.filter((project) => isHomeProject(project) || !project.disabled);
  return (
    selectable.find((project) => project.id === selection.draftProjectId) ??
    selectable.find((project) => project.id === selection.selectedThreadProjectId) ??
    selectable.find((project) => !isHomeProject(project)) ??
    selectable[0] ??
    null
  );
}
