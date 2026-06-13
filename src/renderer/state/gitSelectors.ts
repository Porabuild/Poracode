import { useShallow } from "zustand/shallow";
import type { GitFileChange, PrData } from "@/shared/contracts";
import { createArrayKeyedMap } from "./derivations";
import { useGitStore } from "./gitStore";

function buildPathMap(files: GitFileChange[]): Map<string, GitFileChange> {
  const map = new Map<string, GitFileChange>();
  for (const f of files) map.set(f.path, f);
  return map;
}

const getStagedFile = createArrayKeyedMap<GitFileChange, string, GitFileChange>(buildPathMap);
const getUnstagedFile = createArrayKeyedMap<GitFileChange, string, GitFileChange>(buildPathMap);

/**
 * `useShallow` isolates re-renders to rows whose own fields changed — siblings
 * whose entries didn't move in the array still see a stable shallow-equal value.
 */
export function useGitFile(
  storeKey: string,
  path: string,
  isWorktree: boolean,
): GitFileChange | undefined {
  return useGitStore(
    useShallow((s) => {
      const status = isWorktree ? s.worktreeStatuses[storeKey] : s.statuses[storeKey];
      if (!status) return undefined;
      return getStagedFile(status.staged, path) ?? getUnstagedFile(status.unstaged, path);
    }),
  );
}

/** Sentinel key for the project's main-branch PR (no worktree). */
export function buildBranchPrKey(projectId: string): string {
  return `__branch:${projectId}`;
}

/** Resolve the prData lookup key — worktree path takes precedence. */
export function resolvePrKey(projectId: string, worktreePath: string | undefined): string {
  return worktreePath ?? buildBranchPrKey(projectId);
}

/**
 * Key for a PR discovered by the bulk branch-PR prefetch (`ghListPrs`), addressed
 * by branch name. Distinct from {@link buildBranchPrKey} (the checked-out main
 * branch) and worktree-path keys, so branch-selector rows can show PR status for
 * remote/local branches that aren't checked out as a worktree.
 */
export function buildBranchNamePrKey(projectId: string, branch: string): string {
  return `__branchname:${projectId}:${branch}`;
}

type PrField<K extends keyof PrData> = PrData[K] | undefined;

function makePrFieldSelector<K extends keyof PrData>(field: K) {
  return function usePrField(key: string | undefined): PrField<K> {
    return useGitStore((s) => (key ? s.prData[key]?.[field] : undefined));
  };
}

export const usePrNumber = makePrFieldSelector("number");
export const usePrState = makePrFieldSelector("state");
export const usePrTitle = makePrFieldSelector("title");
export const usePrUrl = makePrFieldSelector("url");
export const usePrChecksStatus = makePrFieldSelector("checksStatus");
export const usePrMergeStateStatus = makePrFieldSelector("mergeStateStatus");
export const usePrMergeable = makePrFieldSelector("mergeable");
export const usePrBaseBranch = makePrFieldSelector("baseBranch");
export const usePrViewerDidAuthor = makePrFieldSelector("viewerDidAuthor");

export function useHasPr(key: string | undefined): boolean {
  return useGitStore((s) => Boolean(key && s.prData[key]));
}

export function useSourceBranch(key: string | undefined): string | null | undefined {
  return useGitStore((s) => (key ? s.worktreeSourceInfo[key]?.sourceBranch : undefined));
}

export function useCommitsAhead(key: string | undefined): number {
  return useGitStore((s) => (key ? (s.worktreeSourceInfo[key]?.commitsAhead ?? 0) : 0));
}

export function useSourceAhead(key: string | undefined): number {
  return useGitStore((s) => (key ? (s.worktreeSourceInfo[key]?.sourceAhead ?? 0) : 0));
}
