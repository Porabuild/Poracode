import type { Project, Thread } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  useWorkspaceProjectFilter,
  useWorkspaceThreadFilter,
} from "@/renderer/state/workspaceSelectors";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import type { ThreadMentionItem } from "./MentionInput";

export type ThreadMentionScope =
  | { kind: "project"; projectId: string; currentWorktreePath?: string | undefined }
  | { kind: "workspace"; currentWorktreePath?: string | undefined };

/**
 * Whether current settings leave the built-in `read_thread` tool callable — the
 * launch-time half of the answer, from the same settings the launch snapshot is
 * resolved from. A live session's own snapshot is the other half.
 */
import { readThreadToolEnabled } from "@/shared/providerHandoff";
export { readThreadToolEnabled };

function recencyValue(updatedAt: string): number {
  const value = Date.parse(updatedAt);
  return Number.isNaN(value) ? 0 : value;
}

function normalizePath(p: string | undefined): string | undefined {
  return p ? normalizeWorktreePathForComparison(p, true) : undefined;
}

function getWorktreeRank(thread: Thread, normalizedCurrentWorktree?: string): number {
  // Current-worktree threads first, then other worktrees, then main-checkout
  // chats — worktree chats are prioritized even without a current worktree.
  if (
    normalizedCurrentWorktree &&
    normalizePath(thread.worktreePath) === normalizedCurrentWorktree
  ) {
    return 0;
  }
  return thread.worktreePath ? 1 : 2;
}

function getThreadWorktreeName(thread: Thread): string | undefined {
  if (!thread.worktreePath) return undefined;
  return (
    resolveWorktreeBranch(thread.projectId, thread.worktreePath, thread.worktreeBranch) ??
    getBasename(thread.worktreePath)
  );
}

const EMPTY_THREAD_MENTIONS: ThreadMentionItem[] = [];

/**
 * Threads available to the composer across projects and workspaces, ranked by
 * current scope, worktree, and recency. Workspace visibility affects priority,
 * not availability.
 * Empty unless the built-in app-controls MCP server and its `read_thread` tool
 * are enabled — a mention resolves to an instruction telling the agent to call
 * `read_thread`, so offering chips without the tool would silently break them.
 */
export function useThreadMentionItems(
  scope: ThreadMentionScope,
  excludeThreadId?: string,
  liveToolsAvailable?: boolean,
): ThreadMentionItem[] {
  const isProjectVisible = useWorkspaceProjectFilter();
  const isThreadVisible = useWorkspaceThreadFilter();
  const mentionToolsAvailable = useSharedSettings(readThreadToolEnabled);
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  if (!(liveToolsAvailable ?? mentionToolsAvailable)) return EMPTY_THREAD_MENTIONS;
  const projectsById = new Map<string, Project>(projects.map((project) => [project.id, project]));
  const normalizedCurrentWorktree = normalizePath(scope.currentWorktreePath);
  const getScopeRank = (thread: Thread): number => {
    if (!isThreadVisible(thread)) return 2;
    if (scope.kind === "project" && thread.projectId === scope.projectId) return 0;
    const project = projectsById.get(thread.projectId);
    return project && !isProjectVisible(project) ? 2 : 1;
  };

  return threads
    .filter((thread) => {
      if (thread.archived || thread.id === excludeThreadId) return false;
      return (
        projectsById.has(thread.projectId) ||
        (scope.kind === "project" && thread.projectId === scope.projectId)
      );
    })
    .toSorted((a, b) => {
      const scopeRank = getScopeRank(a) - getScopeRank(b);
      if (scopeRank !== 0) return scopeRank;
      const rankA = getWorktreeRank(a, normalizedCurrentWorktree);
      const rankB = getWorktreeRank(b, normalizedCurrentWorktree);
      if (rankA !== rankB) return rankA - rankB;
      return recencyValue(b.updatedAt) - recencyValue(a.updatedAt);
    })
    .map((thread) => {
      const worktreeName = getThreadWorktreeName(thread);
      return {
        threadId: thread.id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        ...(worktreeName ? { worktreeName } : {}),
        ...(scope.kind === "workspace" || thread.projectId !== scope.projectId
          ? { projectName: projectsById.get(thread.projectId)?.name ?? "" }
          : {}),
      };
    });
}
