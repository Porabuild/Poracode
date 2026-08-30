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

const EMPTY_PROJECTS: readonly Project[] = [];
const EMPTY_THREAD_MENTIONS: ThreadMentionItem[] = [];

/**
 * Threads available to the composer, already filtered and recency-ranked.
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
  const mentionToolsAvailable = useSharedSettings(
    (state) =>
      state.disabledBuiltInMcpServers["app-controls"] !== true &&
      !(state.disabledBuiltInMcpTools["app-controls"] ?? []).includes("read_thread"),
  );
  const projects = useAppStore((state) =>
    scope.kind === "workspace" ? state.projects : EMPTY_PROJECTS,
  );
  const threads = useAppStore((state) => state.threads);
  if (!(liveToolsAvailable ?? mentionToolsAvailable)) return EMPTY_THREAD_MENTIONS;
  const projectsById = new Map<string, Project>(projects.map((project) => [project.id, project]));
  const normalizedCurrentWorktree = normalizePath(scope.currentWorktreePath);

  return threads
    .filter((thread) => {
      if (thread.archived || thread.id === excludeThreadId) return false;
      // Home threads carry their own workspace tag; the visibility rule applies
      // in both scopes so partitioned Home threads never leak into a mention list.
      if (!isThreadVisible(thread)) return false;
      if (scope.kind === "project") return thread.projectId === scope.projectId;
      const project = projectsById.get(thread.projectId);
      return project !== undefined && isProjectVisible(project);
    })
    .toSorted((a, b) => {
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
        ...(scope.kind === "workspace"
          ? { projectName: projectsById.get(thread.projectId)?.name ?? "" }
          : {}),
      };
    });
}
