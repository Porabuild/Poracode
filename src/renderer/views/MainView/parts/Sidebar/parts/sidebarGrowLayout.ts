import type { Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { buildSidebarProjectRows, estimateSidebarProjectListHeightPx } from "./sidebarProjectRows";
import type { ThreadSortMode } from "./sortMode";

/** Matches Tailwind `max-h-80` / 20rem used for capped project thread lists. */
export const SIDEBAR_THREAD_LIST_MAX_HEIGHT_PX = 320;

export function countProjectThreads(threads: Thread[], projectId: string): number {
  return threads.filter((thread) => thread.projectId === projectId && !thread.archived).length;
}

function projectListHeightPx(input: {
  projectId: string;
  threads: Thread[];
  sortMode: ThreadSortMode;
  collapsedWorktrees: Record<string, boolean>;
}): number {
  const projectThreads = input.threads.filter(
    (thread) => thread.projectId === input.projectId && !thread.archived,
  );
  const rows = buildSidebarProjectRows({
    projectId: input.projectId,
    projectThreads,
    sortMode: input.sortMode,
    collapsedWorktrees: input.collapsedWorktrees,
  });
  return estimateSidebarProjectListHeightPx(rows);
}

export function resolveGrowableProjectId(input: {
  projectExpansionTokens: Array<string | number>;
  collapsedProjects: Record<string, boolean>;
  collapsedWorktrees: Record<string, boolean>;
  homeScopeEnabled: boolean;
  sortMode: ThreadSortMode;
  threads: Thread[];
}): string | null {
  const expandedProjectIds: string[] = [];

  for (let i = 0; i < input.projectExpansionTokens.length; i += 2) {
    const projectId = input.projectExpansionTokens[i] as string;
    const isDisabled = input.projectExpansionTokens[i + 1] === 1;
    const isCollapsed = input.collapsedProjects[projectId] ?? false;

    if (isHomeProjectId(projectId)) {
      if (input.homeScopeEnabled && !isCollapsed) {
        expandedProjectIds.push(projectId);
      }
      continue;
    }

    if (!isDisabled && !isCollapsed) {
      expandedProjectIds.push(projectId);
    }
  }

  if (expandedProjectIds.length <= 1) {
    return expandedProjectIds[0] ?? null;
  }

  const overflowProjectIds = expandedProjectIds.filter(
    (projectId) =>
      projectListHeightPx({
        projectId,
        threads: input.threads,
        sortMode: input.sortMode,
        collapsedWorktrees: input.collapsedWorktrees,
      }) > SIDEBAR_THREAD_LIST_MAX_HEIGHT_PX,
  );

  return overflowProjectIds.length === 1 ? overflowProjectIds[0]! : null;
}

export function resolveProjectThreadListMaxHeight(input: {
  growableProjectId: string | null;
  projectId: string;
  itemContentHeightPx: number;
}): string | undefined {
  if (input.itemContentHeightPx <= SIDEBAR_THREAD_LIST_MAX_HEIGHT_PX) {
    return undefined;
  }

  if (input.growableProjectId === input.projectId) {
    return `${input.itemContentHeightPx}px`;
  }

  return `${SIDEBAR_THREAD_LIST_MAX_HEIGHT_PX}px`;
}
