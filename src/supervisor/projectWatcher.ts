import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import type { WslBridgeClient, WslLocation } from "./wsl/bridge/client";

const DEBOUNCE_MS = 300;

export interface ProjectWatcherCallbacks {
  /** Fires when `.git` metadata (refs, index, HEAD, worktrees/*) changes. */
  onGitChanged: (projectId: string) => void;
  /** Fires when working-tree files change. */
  onTreeChanged: (projectId: string) => void;
}

type WslUnsubscribe = () => Promise<void>;
type WslSchedule = { onGit: () => void; onTree: () => void };

interface WatcherEntry {
  gitWatcher: FSWatcher | null;
  workTreeWatcher: FSWatcher | null;
  wslUnsubscribe: WslUnsubscribe | null;
  gitDebounceTimer: ReturnType<typeof setTimeout> | null;
  treeDebounceTimer: ReturnType<typeof setTimeout> | null;
  projectId: string;
  location: ProjectLocation;
  wslSchedule?: WslSchedule;
}

interface WorktreeWatcherEntry {
  watcher: FSWatcher | null;
  wslUnsubscribe: WslUnsubscribe | null;
  gitDebounceTimer: ReturnType<typeof setTimeout> | null;
  treeDebounceTimer: ReturnType<typeof setTimeout> | null;
  projectId: string;
  wslLocation?: WslLocation;
  wslLinuxPath?: string;
  wslSchedule?: WslSchedule;
}

const IGNORED_PREFIXES = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  ".turbo/",
  "__pycache__/",
  ".venv/",
];

function isIgnoredWorkTreeFile(name: string): boolean {
  if (name === ".git" || name.startsWith(".git/")) return true;
  return IGNORED_PREFIXES.some((p) => name.startsWith(p));
}

const WSL_IGNORE_DIRS = [
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  "__pycache__",
  ".venv",
];

function isKnownGitNoisePath(value: string): boolean {
  return (
    value === "FETCH_HEAD" ||
    value === "index" ||
    value === "index.lock" ||
    /^worktrees\/[^/]+\/index$/.test(value) ||
    /^worktrees\/[^/]+\/index\.lock$/.test(value) ||
    /^\.watchman-cookie-/.test(value) ||
    value.startsWith("logs/") ||
    value.startsWith("objects/")
  );
}

/**
 * Read the project root's `.gitignore` and pick out entries that are plain
 * top-level directory names (`build/`, `dist`, `.venv`, …). Those can be
 * added to the watcher's `ignore` list so their events never cross the
 * bridge in the first place.
 *
 * Deliberately minimal: no nested `.gitignore`, no wildcard globs, no
 * negations, no leading `/` patterns. The watcher's `ignore` can only
 * exclude top-level directories, and parcel-watcher has no glob support,
 * so these are the only entries that translate cleanly.
 */
async function readGitignoreTopLevelDirs(
  client: WslBridgeClient,
  location: WslLocation,
  linuxPath: string,
): Promise<string[]> {
  try {
    const result = await client.readFile(location, `${linuxPath}/.gitignore`, {
      maxBytes: 64 * 1024,
    });
    if ("tooLarge" in result && result.tooLarge) return [];
    if (!("contentBase64" in result)) return [];
    const text = Buffer.from(result.contentBase64, "base64").toString("utf8");
    const dirs: string[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("!")) continue;
      // Reject anything with glob metacharacters or path separators beyond a
      // trailing slash — we only know how to suppress plain top-level dirs.
      const stripped = line.endsWith("/") ? line.slice(0, -1) : line;
      if (/[*?[\]]/.test(stripped)) continue;
      if (stripped.includes("/")) continue;
      if (!stripped) continue;
      dirs.push(stripped);
    }
    return dirs;
  } catch {
    return [];
  }
}

/**
 * Watches a project for filesystem changes and emits debounced notifications
 * on two channels: `.git` metadata and the working tree.
 *
 * Native projects use `fs.watch` (recursive) on both the repo root and
 * `.git`. WSL projects delegate to `WslBridgeClient.watch()`, which asks
 * the per-distro bridge server to subscribe with parcel-watcher or a
 * fallback — no separate wsl-watcher child process any more.
 */
export class ProjectWatcher {
  private readonly watchers = new Map<string, WatcherEntry>();
  private readonly worktreeWatchers = new Map<string, WorktreeWatcherEntry>();
  private wslClient: WslBridgeClient | undefined;

  constructor(private readonly callbacks: ProjectWatcherCallbacks) {}

  /** Late-bound so the supervisor can wire the bridge client after boot. */
  setWslClient(client: WslBridgeClient): void {
    this.wslClient = client;
  }

  /**
   * Start watching a project. Idempotent — calling with the same projectId
   * replaces the previous watcher.
   */
  watch(projectId: string, location: ProjectLocation): void {
    void this.unwatch(projectId);

    const entry: WatcherEntry = {
      gitWatcher: null,
      workTreeWatcher: null,
      wslUnsubscribe: null,
      gitDebounceTimer: null,
      treeDebounceTimer: null,
      projectId,
      location,
    };

    const scheduleGitNotify = () => {
      if (entry.gitDebounceTimer) clearTimeout(entry.gitDebounceTimer);
      entry.gitDebounceTimer = setTimeout(() => {
        entry.gitDebounceTimer = null;
        this.callbacks.onGitChanged(projectId);
      }, DEBOUNCE_MS);
    };
    const scheduleTreeNotify = () => {
      if (entry.treeDebounceTimer) clearTimeout(entry.treeDebounceTimer);
      entry.treeDebounceTimer = setTimeout(() => {
        entry.treeDebounceTimer = null;
        this.callbacks.onTreeChanged(projectId);
      }, DEBOUNCE_MS);
    };

    if (location.kind === "wsl") {
      entry.wslSchedule = { onGit: scheduleGitNotify, onTree: scheduleTreeNotify };
      this.watchers.set(projectId, entry);
      void this.startWslSubscription(entry, location, location.linuxPath, entry.wslSchedule);
      return;
    }

    const repoPath = location.path;
    const gitDir = join(repoPath, ".git");

    try {
      entry.gitWatcher = watch(gitDir, { recursive: true }, (_eventType, filename) => {
        // Windows fs.watch coalesces bursts into filename-less events, which
        // we cannot filter — they cause a refresh→write→event→refresh loop.
        // Real isolated changes always deliver a filename, so drop the rest.
        if (!filename) return;
        const name = filename.replace(/\\/g, "/");
        if (isKnownGitNoisePath(name)) return;
        scheduleGitNotify();
      });
      entry.gitWatcher.on("error", () => {
        entry.gitWatcher?.close();
        entry.gitWatcher = null;
      });
    } catch {
      // .git directory may not exist yet or may not be watchable
    }

    try {
      entry.workTreeWatcher = watch(repoPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        const name = filename.replace(/\\/g, "/");
        if (isIgnoredWorkTreeFile(name)) return;
        scheduleTreeNotify();
      });
      entry.workTreeWatcher.on("error", () => {
        entry.workTreeWatcher?.close();
        entry.workTreeWatcher = null;
      });
    } catch {
      // Working tree may not be watchable
    }

    this.watchers.set(projectId, entry);
  }

  /**
   * Update the set of watched worktree directories for a project.
   * Diffs against existing watchers — only adds/removes what changed.
   * All worktree watchers emit the parent projectId.
   */
  watchWorktrees(projectId: string, worktreePaths: string[]): void {
    const desired = new Set(worktreePaths);

    for (const [path, entry] of this.worktreeWatchers) {
      if (entry.projectId === projectId && !desired.has(path)) {
        void this.closeWorktreeWatcher(path);
      }
    }

    const mainEntry = this.watchers.get(projectId);
    const location = mainEntry?.location;

    for (const wtPath of worktreePaths) {
      if (this.worktreeWatchers.has(wtPath)) continue;

      const entry: WorktreeWatcherEntry = {
        watcher: null,
        wslUnsubscribe: null,
        gitDebounceTimer: null,
        treeDebounceTimer: null,
        projectId,
      };

      const scheduleGitNotify = () => {
        if (entry.gitDebounceTimer) clearTimeout(entry.gitDebounceTimer);
        entry.gitDebounceTimer = setTimeout(() => {
          entry.gitDebounceTimer = null;
          this.callbacks.onGitChanged(projectId);
        }, DEBOUNCE_MS);
      };
      const scheduleTreeNotify = () => {
        if (entry.treeDebounceTimer) clearTimeout(entry.treeDebounceTimer);
        entry.treeDebounceTimer = setTimeout(() => {
          entry.treeDebounceTimer = null;
          this.callbacks.onTreeChanged(projectId);
        }, DEBOUNCE_MS);
      };

      if (location?.kind === "wsl") {
        entry.wslLocation = location;
        entry.wslLinuxPath = wtPath;
        entry.wslSchedule = { onGit: scheduleGitNotify, onTree: scheduleTreeNotify };
        this.worktreeWatchers.set(wtPath, entry);
        void this.startWslWorktreeSubscription(entry, location, wtPath, entry.wslSchedule);
        continue;
      }

      try {
        entry.watcher = watch(wtPath, { recursive: true }, (_eventType, filename) => {
          if (filename) {
            const name = filename.replace(/\\/g, "/");
            if (isIgnoredWorkTreeFile(name)) return;
          }
          scheduleTreeNotify();
        });
        entry.watcher.on("error", () => {
          entry.watcher?.close();
          entry.watcher = null;
        });
      } catch {
        // Worktree path may not exist or may not be watchable
      }

      this.worktreeWatchers.set(wtPath, entry);
    }
  }

  /** Stop watching a project and its worktrees. */
  async unwatch(projectId: string): Promise<void> {
    const entry = this.watchers.get(projectId);
    if (entry) {
      if (entry.gitDebounceTimer) clearTimeout(entry.gitDebounceTimer);
      if (entry.treeDebounceTimer) clearTimeout(entry.treeDebounceTimer);
      entry.gitWatcher?.close();
      entry.workTreeWatcher?.close();
      if (entry.wslUnsubscribe) {
        await entry.wslUnsubscribe().catch(() => undefined);
      }
      this.watchers.delete(projectId);
    }

    for (const [path, wtEntry] of this.worktreeWatchers) {
      if (wtEntry.projectId === projectId) {
        await this.closeWorktreeWatcher(path);
      }
    }
  }

  /** Stop watching all project worktrees. */
  async unwatchAllWorktrees(projectId: string): Promise<void> {
    for (const [path, wtEntry] of this.worktreeWatchers) {
      if (wtEntry.projectId === projectId) {
        await this.closeWorktreeWatcher(path);
      }
    }
  }

  /** Stop watching a specific worktree directory. */
  async unwatchWorktree(path: string): Promise<void> {
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    for (const [wtPath] of this.worktreeWatchers) {
      if (wtPath.replace(/\\/g, "/").toLowerCase() === normalized) {
        await this.closeWorktreeWatcher(wtPath);
      }
    }
  }

  /** Stop all watchers. */
  async dispose(): Promise<void> {
    for (const [projectId] of this.watchers) {
      await this.unwatch(projectId);
    }
  }

  handleWslBridgeExit(distro: string): void {
    for (const entry of this.watchers.values()) {
      if (entry.location.kind !== "wsl" || entry.location.distro !== distro || !entry.wslSchedule) {
        continue;
      }
      entry.wslUnsubscribe = null;
      void this.startWslSubscription(
        entry,
        entry.location,
        entry.location.linuxPath,
        entry.wslSchedule,
      );
    }

    for (const entry of this.worktreeWatchers.values()) {
      if (entry.wslLocation?.distro !== distro || !entry.wslLinuxPath || !entry.wslSchedule) {
        continue;
      }
      entry.wslUnsubscribe = null;
      void this.startWslWorktreeSubscription(
        entry,
        entry.wslLocation,
        entry.wslLinuxPath,
        entry.wslSchedule,
      );
    }
  }

  private async closeWorktreeWatcher(path: string): Promise<void> {
    const entry = this.worktreeWatchers.get(path);
    if (!entry) return;
    if (entry.gitDebounceTimer) clearTimeout(entry.gitDebounceTimer);
    if (entry.treeDebounceTimer) clearTimeout(entry.treeDebounceTimer);
    entry.watcher?.close();
    if (entry.wslUnsubscribe) {
      await entry.wslUnsubscribe().catch(() => undefined);
    }
    this.worktreeWatchers.delete(path);
  }

  private async startWslSubscription(
    entry: WatcherEntry,
    location: WslLocation,
    linuxPath: string,
    schedule: { onGit: () => void; onTree: () => void },
  ): Promise<void> {
    const subscription = await this.subscribeWsl(location, linuxPath, schedule);
    if (!subscription) return;
    if (!this.watchers.has(entry.projectId) || this.watchers.get(entry.projectId) !== entry) {
      // Entry was already unwatched while we awaited — tear down immediately.
      await subscription.unsubscribe().catch(() => undefined);
      return;
    }
    entry.wslUnsubscribe = subscription.unsubscribe;
  }

  private async startWslWorktreeSubscription(
    entry: WorktreeWatcherEntry,
    location: WslLocation,
    linuxPath: string,
    schedule: { onGit: () => void; onTree: () => void },
  ): Promise<void> {
    const worktreeLocation: WslLocation = {
      kind: "wsl",
      distro: location.distro,
      linuxPath,
      uncPath: toWslUncPath(location.distro, linuxPath),
    };
    const subscription = await this.subscribeWsl(worktreeLocation, linuxPath, schedule);
    if (!subscription) return;
    let stillActive = false;
    for (const [, wtEntry] of this.worktreeWatchers) {
      if (wtEntry === entry) {
        stillActive = true;
        break;
      }
    }
    if (!stillActive) {
      await subscription.unsubscribe().catch(() => undefined);
      return;
    }
    entry.wslUnsubscribe = subscription.unsubscribe;
  }

  private async subscribeWsl(
    location: WslLocation,
    linuxPath: string,
    schedule: { onGit: () => void; onTree: () => void },
  ): Promise<{ unsubscribe: WslUnsubscribe } | null> {
    const client = this.wslClient;
    if (!client) return null;
    const gitignoreDirs = await readGitignoreTopLevelDirs(client, location, linuxPath);
    const ignore = [...WSL_IGNORE_DIRS, ...gitignoreDirs];
    const gitPath = `${linuxPath}/.git`;
    const paths: { path: string; scope: "git" | "worktree" }[] = [
      { path: linuxPath, scope: "worktree" },
    ];
    const gitStat = await client.stat(location, [gitPath], { follow: true }).catch(() => null);
    if (gitStat?.stats[0]?.isDirectory) {
      paths.push({ path: gitPath, scope: "git" });
    }
    try {
      return await client.watch(
        location,
        {
          paths,
          ignore,
        },
        (event) => {
          if (event.scope === "git") {
            if (event.paths.length === 0) return;
            const onlyNoise = event.paths.every((p) => isKnownGitNoisePath(p));
            if (onlyNoise) return;
            schedule.onGit();
            return;
          }
          if (event.scope === "worktree") {
            if (event.paths.length === 0) {
              schedule.onTree();
              return;
            }
            // `.git/...` writes (e.g. our own `git status` creating
            // `.git/index.lock`) leak into worktree-scope events because the
            // worktree path is the parent of `.git`. Those are already covered
            // by the dedicated git-scope subscription with noise filtering, so
            // drop them here to avoid a refresh→lock-write→refresh loop.
            const treePaths = event.paths.filter((p) => p !== ".git" && !p.startsWith(".git/"));
            if (treePaths.length === 0) return;
            schedule.onTree();
            return;
          }
          // Unknown scope — fire both conservatively.
          schedule.onGit();
          schedule.onTree();
        },
      );
    } catch {
      return null;
    }
  }
}
