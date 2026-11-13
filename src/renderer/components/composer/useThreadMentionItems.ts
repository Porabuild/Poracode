import { useShallow } from "zustand/react/shallow";
import type { Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_NAME, isHomeProjectId } from "@/shared/homeScope";
import { getBasename } from "@/shared/pathUtils";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { normalizeWorktreePathForComparison } from "@/shared/worktree";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { useAppStore } from "@/renderer/state/appStore";
import { projectEnvironmentLabel } from "@/renderer/state/projectGroups/environmentLabels";
import { useProjectGroupIndex } from "@/renderer/state/projectGroups/useProjectGroups";
import { isProjectedRemoteEntityId } from "@/renderer/state/remoteProjection";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  useWorkspaceProjectFilter,
  useWorkspaceThreadFilter,
} from "@/renderer/state/workspaceSelectors";
import { resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import type { ThreadMentionItem } from "./MentionInput";

export type ThreadMentionScope =
  | { kind: "project"; projectId: string; currentWorktreePath?: string | undefined }
  | {
      kind: "workspace";
      projectId?: string | undefined;
      currentWorktreePath?: string | undefined;
    };

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

function getWorktreeRank(
  thread: ThreadMentionSnapshot,
  normalizedCurrentWorktree?: string,
): number {
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

function getThreadWorktreeName(thread: ThreadMentionSnapshot): string | undefined {
  if (!thread.worktreePath) return undefined;
  return (
    resolveWorktreeBranch(thread.projectId, thread.worktreePath, thread.worktreeBranch) ??
    getBasename(thread.worktreePath)
  );
}

interface ThreadMentionSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly workspaceId: string | undefined;
  readonly remoteServerId: string | undefined;
  readonly title: string;
  readonly updatedAt: string;
  readonly worktreePath: string | undefined;
  readonly worktreeBranch: string | undefined;
}

function sameThreadMentionSnapshot(a: ThreadMentionSnapshot, b: ThreadMentionSnapshot): boolean {
  return (
    a.id === b.id &&
    a.projectId === b.projectId &&
    a.workspaceId === b.workspaceId &&
    a.remoteServerId === b.remoteServerId &&
    a.title === b.title &&
    a.updatedAt === b.updatedAt &&
    a.worktreePath === b.worktreePath &&
    a.worktreeBranch === b.worktreeBranch
  );
}

let lastSourceThreads: readonly Thread[] | null = null;
let lastThreadMentionSnapshots: readonly ThreadMentionSnapshot[] = [];

function selectThreadMentionSnapshots(
  threads: readonly Thread[],
): readonly ThreadMentionSnapshot[] {
  if (threads === lastSourceThreads) return lastThreadMentionSnapshots;

  const next: ThreadMentionSnapshot[] = [];
  for (const thread of threads) {
    if (thread.archived) continue;
    next.push({
      id: thread.id,
      projectId: thread.projectId,
      workspaceId: thread.workspaceId,
      remoteServerId: thread.remoteServerId,
      title: thread.title,
      updatedAt: thread.updatedAt,
      worktreePath: thread.worktreePath,
      worktreeBranch: thread.worktreeBranch,
    });
  }

  lastSourceThreads = threads;
  if (
    next.length === lastThreadMentionSnapshots.length &&
    next.every((snapshot, index) =>
      sameThreadMentionSnapshot(lastThreadMentionSnapshots[index]!, snapshot),
    )
  ) {
    return lastThreadMentionSnapshots;
  }

  lastThreadMentionSnapshots = next;
  return next;
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
  const threads = useAppStore((state) => selectThreadMentionSnapshots(state.threads));
  const groupIndex = useProjectGroupIndex();
  const serverLabels = useRemoteServersStore(
    useShallow((state) => {
      const labels: Record<string, string> = {};
      for (const server of state.servers) {
        labels[remoteConnectionKey(server)] = desktopTitle(server.label);
      }
      return labels;
    }),
  );
  // Desktop settings govern local projects only; a remote environment resolves
  // its own built-in MCP snapshot on launch.
  const settingsGovernScope =
    !scope.projectId ||
    isBrowserClientRuntime() ||
    !isProjectedRemoteEntityId(scope.projectId, "project");
  const effectiveToolsAvailable =
    liveToolsAvailable ?? (settingsGovernScope ? mentionToolsAvailable : true);
  if (!effectiveToolsAvailable) return EMPTY_THREAD_MENTIONS;
  const projectsById = new Map<string, Project>(projects.map((project) => [project.id, project]));
  const scopeProjectIds =
    scope.kind === "project"
      ? new Set(
          groupIndex.groupByProjectId.get(scope.projectId)?.members.map((member) => member.id) ?? [
            scope.projectId,
          ],
        )
      : undefined;
  const normalizedCurrentWorktree = normalizePath(scope.currentWorktreePath);
  const getScopeRank = (thread: ThreadMentionSnapshot): number => {
    if (!isThreadVisible(thread)) return 2;
    if (scopeProjectIds?.has(thread.projectId)) return 0;
    const project = projectsById.get(thread.projectId);
    return project && !isProjectVisible(project) ? 2 : 1;
  };

  return threads
    .filter((thread) => {
      if (thread.id === excludeThreadId) return false;
      return (
        projectsById.has(thread.projectId) ||
        isHomeProjectId(thread.projectId) ||
        scopeProjectIds?.has(thread.projectId) === true
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
      const project = projectsById.get(thread.projectId);
      const desktopId =
        thread.remoteServerId ?? project?.remoteServerId ?? project?.location.remoteServerId;
      const serverName = desktopId ? serverLabels[desktopId] : undefined;
      const environmentName = desktopId
        ? project
          ? projectEnvironmentLabel(project, serverName)
          : (serverName ?? desktopId)
        : undefined;
      const worktreeName = getThreadWorktreeName(thread);
      const inScopeProject = scopeProjectIds?.has(thread.projectId) === true;
      return {
        threadId: thread.id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        ...(environmentName ? { environmentName } : {}),
        ...(worktreeName ? { worktreeName } : {}),
        ...(!inScopeProject
          ? {
              projectName:
                project?.name ?? (isHomeProjectId(thread.projectId) ? HOME_PROJECT_NAME : ""),
            }
          : {}),
      };
    });
}
