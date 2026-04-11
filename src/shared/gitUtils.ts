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
