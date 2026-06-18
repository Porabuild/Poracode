import { useMemo } from "react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useShallow } from "zustand/shallow";
import type { GitBranchInfo, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProject } from "@/renderer/state/useThread";

export function getActiveWorktreeBranchNames(
  threads: readonly Thread[],
  projectId: string,
): string[] {
  const branches = new Set<string>();
  for (const thread of threads) {
    if (thread.projectId === projectId && !thread.archived && thread.worktreeBranch) {
      branches.add(thread.worktreeBranch);
    }
  }
  return Array.from(branches).sort();
}

export function useBranchList(params: { projectId: string; search: string }) {
  const { projectId, search } = params;
  const branchData = useGitStore((s) => s.branches[projectId]);
  const worktrees = useGitStore((s) => s.worktrees[projectId]);
  const projectThreads = useAppStore(
    useShallow((s) =>
      s.threads.filter((t) => t.projectId === projectId && !t.archived && t.worktreeBranch),
    ),
  );
  const projectLocation = useProject(projectId)?.location;

  const threadsByBranch = useMemo(() => {
    const map = new Map<string, Thread[]>();
    for (const t of projectThreads) {
      const branch = t.worktreeBranch;
      if (!branch) continue;
      const list = map.get(branch);
      if (list) list.push(t);
      else map.set(branch, [t]);
    }
    return map;
  }, [projectThreads]);
  const worktreeBranches = useMemo(
    () => new Set(worktrees?.filter((w) => !w.isMain).map((w) => w.branch) ?? []),
    [worktrees],
  );
  const branchWorktreePath = useMemo(
    () =>
      new Map(worktrees?.filter((w) => !w.isMain && w.branch).map((w) => [w.branch, w.path]) ?? []),
    [worktrees],
  );

  const { items, hasLocal, hasRemote } = useMemo(() => {
    const allBranches = branchData?.branches ?? [];
    const seen = new Set<string>();
    const deduped: GitBranchInfo[] = [];
    for (const branch of allBranches) {
      if (!branch.isRemote && !seen.has(branch.name)) {
        seen.add(branch.name);
        deduped.push(branch);
      }
    }
    for (const branch of allBranches) {
      if (branch.isRemote && !seen.has(branch.name)) {
        seen.add(branch.name);
        deduped.push(branch);
      }
    }

    const normalizedSearch = search.trim().toLowerCase();
    const allLocal: GitBranchInfo[] = [];
    const allRemote: GitBranchInfo[] = [];
    for (const branch of deduped) {
      if (normalizedSearch && !branch.name.toLowerCase().includes(normalizedSearch)) {
        continue;
      }
      if (branch.isRemote) {
        allRemote.push(branch);
      } else {
        allLocal.push(branch);
      }
    }

    const containsLocal = allLocal.length > 0;
    const containsRemote = allRemote.length > 0;
    const list: BranchListItem[] = [];
    if (containsLocal) {
      list.push({ type: "header", id: "header-local", name: msg`Local` });
      allLocal.forEach((b) => list.push({ type: "branch", id: b.name, branch: b }));
    }
    if (containsRemote) {
      list.push({ type: "header", id: "header-remote", name: msg`Remote` });
      allRemote.forEach((b) => list.push({ type: "branch", id: b.name, branch: b }));
    }
    return { items: list, hasLocal: containsLocal, hasRemote: containsRemote };
  }, [branchData?.branches, search]);

  return {
    items,
    hasLocal,
    hasRemote,
    worktreeBranches,
    branchWorktreePath,
    threadsByBranch,
    projectLocation,
  };
}

export type BranchListItem =
  | { type: "header"; id: string; name: MessageDescriptor }
  | { type: "branch"; id: string; branch: GitBranchInfo };
