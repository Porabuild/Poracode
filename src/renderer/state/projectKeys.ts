import type { Project, ProjectLocation, Thread } from "@/shared/contracts";

function buildProjectLocationKey(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
    case "posix":
      return `${location.kind}:${location.path}`;
    case "wsl":
      return `${location.kind}:${location.distro}:${location.linuxPath}:${location.uncPath}`;
  }
}

export function buildActiveProjectsKey(projects: readonly Project[]): string {
  return projects
    .filter((project) => !project.disabled)
    .map((project) => `${project.id}:${buildProjectLocationKey(project.location)}`)
    .sort()
    .join("|");
}

const branchPrPrefetchThreadKeysCache = new WeakMap<
  readonly Thread[],
  ReadonlyMap<string, string>
>();

/**
 * Per-project identity of the thread fields the bulk branch-PR prefetch depends
 * on: which worktree branches a project shows (`applyPrefetchedPrData`) and
 * whether a thread is running (WSL poll eligibility; a finished turn may have
 * opened a PR). The `threads` array changes identity on every streamed runtime
 * update, so subscribing to it directly re-ran `gh pr list` for every project
 * on each throttle window while any agent was working.
 */
export function buildBranchPrPrefetchThreadKeys(
  threads: readonly Thread[],
): ReadonlyMap<string, string> {
  const cached = branchPrPrefetchThreadKeysCache.get(threads);
  if (cached) return cached;
  const entriesByProject = new Map<string, string[]>();
  for (const thread of threads) {
    const entry = [
      thread.id,
      thread.archived ? "1" : "0",
      thread.status === "inactive" ? "0" : "1",
      thread.worktreePath ?? "",
      thread.worktreeBranch ?? "",
    ].join("\0");
    const entries = entriesByProject.get(thread.projectId);
    if (entries) entries.push(entry);
    else entriesByProject.set(thread.projectId, [entry]);
  }
  const keys = new Map<string, string>();
  for (const [projectId, entries] of entriesByProject) {
    keys.set(projectId, entries.sort().join("\u0001"));
  }
  branchPrPrefetchThreadKeysCache.set(threads, keys);
  return keys;
}

const worktreeWatchThreadKeysCache = new WeakMap<readonly Thread[], ReadonlyMap<string, string>>();

/**
 * Per-project structural key of thread fields that determine which worktree
 * paths `getProjectActiveWorktreePaths` watches/polls. Volatile runtime updates
 * (turn timing, slashCommands, sessionConfigOptions, idle/finished transitions
 * that keep `threadIsProtected` identical) reuse the same string so
 * `syncActiveWorktrees` does not re-sort and rebuild sidebar rows on every
 * background thread tick.
 */
export function buildWorktreeWatchThreadKeys(
  threads: readonly Thread[],
): ReadonlyMap<string, string> {
  const cached = worktreeWatchThreadKeysCache.get(threads);
  if (cached) return cached;
  const entriesByProject = new Map<string, string[]>();
  for (const thread of threads) {
    const isProtected =
      thread.starred ||
      thread.status === "working" ||
      thread.status === "launching" ||
      thread.status === "needs_approval" ||
      thread.status === "needs_reply" ||
      thread.status === "error";
    const entry = [
      thread.id,
      thread.archived ? "1" : "0",
      thread.done ? "1" : "0",
      thread.starred ? "1" : "0",
      isProtected ? "1" : "0",
      thread.groupId ?? "",
      thread.worktreePath ?? "",
      thread.worktreeBranch ?? "",
      thread.updatedAt,
      thread.createdAt,
    ].join("\0");
    const entries = entriesByProject.get(thread.projectId);
    if (entries) entries.push(entry);
    else entriesByProject.set(thread.projectId, [entry]);
  }
  const keys = new Map<string, string>();
  for (const [projectId, entries] of entriesByProject) {
    keys.set(projectId, entries.join("\u0001"));
  }
  worktreeWatchThreadKeysCache.set(threads, keys);
  return keys;
}

/** Project ids whose key differs between two per-project key maps, including added/removed ones. */
export function diffProjectKeys(
  previous: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
): Set<string> {
  const changed = new Set<string>();
  for (const [projectId, key] of next) {
    if (previous.get(projectId) !== key) changed.add(projectId);
  }
  for (const projectId of previous.keys()) {
    if (!next.has(projectId)) changed.add(projectId);
  }
  return changed;
}

export function buildWslProjectDistrosKey(projects: readonly Project[]): string {
  return [
    ...new Set(
      projects.flatMap((project) =>
        !project.disabled && project.location.kind === "wsl" ? [project.location.distro] : [],
      ),
    ),
  ]
    .sort()
    .join("\0");
}

export function parseWslProjectDistrosKey(key: string): string[] {
  return key ? key.split("\0") : [];
}
