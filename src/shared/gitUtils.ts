import type { GitBranchInfo } from "./contracts/git";

/**
 * Lock files that should be ignored in diff totals and skipped by default in diff views
 * because they are usually very large and not intended for manual review.
 */
export const LOCK_FILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "Cargo.lock",
  "go.sum",
  "composer.lock",
  "Pipfile.lock",
  "poetry.lock",
  "Gemfile.lock",
];

export function isLockFile(path: string): boolean {
  if (!path) return false;
  const basename = path.split(/[\\/]/).pop() ?? path;
  return LOCK_FILES.includes(basename);
}

/**
 * Convert a proven remote-tracking ref to the branch name expected by hosting
 * APIs. Ambiguous slash-containing local branch names are preserved.
 */
export function branchNameFromRemoteRef(
  ref: string,
  branches: readonly GitBranchInfo[] = [],
): string {
  const fullRemotePrefix = "refs/remotes/";
  if (ref.startsWith(fullRemotePrefix)) {
    const qualified = ref.slice(fullRemotePrefix.length);
    const slash = qualified.indexOf("/");
    return slash > 0 ? qualified.slice(slash + 1) : ref;
  }
  if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);

  if (branches.some((branch) => !branch.isRemote && branch.name === ref)) return ref;
  return (
    branches.find(
      (branch) => branch.isRemote && branch.remote && `${branch.remote}/${branch.name}` === ref,
    )?.name ?? ref
  );
}
