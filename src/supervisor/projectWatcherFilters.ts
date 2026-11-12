export const PROJECT_WATCH_DEBOUNCE_MS = 300;

const IGNORED_PREFIXES = [
  "node_modules/",
  ".poracode/worktrees/",
  ".next/",
  "dist/",
  "build/",
  ".turbo/",
  "__pycache__/",
  ".venv/",
  "target/debug/",
  "target/release/",
  ".tmp/",
];

const IGNORED_NESTED_SEGMENTS = [
  "/node_modules/",
  "/.next/",
  "/.turbo/",
  "/__pycache__/",
  "/.venv/",
  "/target/debug/",
  "/target/release/",
  "/.tmp/",
];

// Mirrored in native/git-helper/src/watch.rs; both paths use the same fixtures.
export function isIgnoredWorkTreeFile(name: string): boolean {
  if (name === ".git" || name.startsWith(".git/") || name.includes("/.git/")) return true;
  if (IGNORED_PREFIXES.some((p) => name.startsWith(p))) return true;
  return IGNORED_NESTED_SEGMENTS.some((seg) => name.includes(seg));
}

export function isKnownGitNoisePath(value: string): boolean {
  return (
    value === "FETCH_HEAD" ||
    value === "index" ||
    value === "index.lock" ||
    /^worktrees\/[^/]+$/.test(value) ||
    /^worktrees\/[^/]+\/index$/.test(value) ||
    /^worktrees\/[^/]+\/index\.lock$/.test(value) ||
    /^\.watchman-cookie-/.test(value) ||
    value.startsWith("logs/") ||
    value.startsWith("objects/")
  );
}

export function isRecoverableGitPath(name: string): boolean {
  if (name === ".git") return true;
  if (!name.startsWith(".git/")) return false;
  return !isKnownGitNoisePath(name.slice(".git/".length));
}
