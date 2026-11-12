import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { ProjectWatcherClient } from "./projectWatcherClient";
import {
  isIgnoredWorkTreeFile,
  isKnownGitNoisePath,
  isRecoverableGitPath,
  PROJECT_WATCH_DEBOUNCE_MS as DEBOUNCE_MS,
} from "./projectWatcherFilters";
import type { WslBridgeClient, WslLocation } from "./wsl/bridge/client";

export { isIgnoredWorkTreeFile } from "./projectWatcherFilters";

export interface ProjectWatcherCallbacks {
  /** Fires when `.git` metadata (refs, index, HEAD, worktrees/*) changes. */
  onGitChanged: (projectId: string, worktreePath?: string) => void;
  /** Fires when working-tree files change. */
  onTreeChanged: (projectId: string, worktreePath?: string) => void;
}

type WslUnsubscribe = () => Promise<void>;
type WslSchedule = { onGit: () => void; onTree: () => void };

interface WatcherEntry {
  localUnsubscribe: (() => void) | null;
  wslUnsubscribe: WslUnsubscribe | null;
  gitDebounceTimer: ReturnType<typeof setTimeout> | null;
  treeDebounceTimer: ReturnType<typeof setTimeout> | null;
  projectId: string;
  location: ProjectLocation;
  wslSchedule?: WslSchedule;
  wslSubscriptionPending?: boolean;
}

interface WorktreeWatcherEntry {
  localUnsubscribe: (() => void) | null;
  localReady?: Promise<void>;
  wslUnsubscribe: WslUnsubscribe | null;
  gitDebounceTimer: ReturnType<typeof setTimeout> | null;
  treeDebounceTimer: ReturnType<typeof setTimeout> | null;
  projectId: string;
  wslLocation?: WslLocation;
  wslLinuxPath?: string;
  wslSchedule?: WslSchedule;
  wslSubscriptionPending?: boolean;
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
 * Native projects offload callbacks, filtering and debounce to the native
 * helper or bundled worker. WSL projects delegate to `WslBridgeClient.watch()`, which asks
 * the per-distro bridge server to subscribe with parcel-watcher or a
 * fallback — no separate wsl-watcher child process any more.
 */
export class ProjectWatcher {
  private readonly watchers = new Map<string, WatcherEntry>();
  private readonly worktreeWatchers = new Map<string, WorktreeWatcherEntry>();
  private readonly localClient = new ProjectWatcherClient();
  private wslClient: WslBridgeClient | undefined;

  constructor(private readonly callbacks: ProjectWatcherCallbacks) {}

  /** Late-bound so the supervisor can wire the bridge client after boot. */
  setWslClient(client: WslBridgeClient): void {
    this.wslClient = client;
  }

  /** True when at least one watched project lives inside a WSL distro. */
  hasWslProjects(): boolean {
    return this.getWslDistros().length > 0;
  }

  /** Distinct WSL distros backing watched (non-disabled) projects. */
  getWslDistros(): string[] {
    return [
      ...new Set(
        [...this.watchers.values()].flatMap((entry) =>
          entry.location.kind === "wsl" ? [entry.location.distro] : [],
        ),
      ),
    ];
  }

  /**
   * Start watching a project. Idempotent — calling with the same projectId
   * replaces the previous watcher.
   */
  watch(projectId: string, location: ProjectLocation): Promise<void> {
    void this.unwatch(projectId);

    const entry: WatcherEntry = {
      localUnsubscribe: null,
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
      return Promise.resolve();
    }

    this.watchers.set(projectId, entry);
    const subscription = this.localClient.watch(
      location.path,
      (scope) => {
        if (this.watchers.get(projectId) !== entry) return;
        if (scope === "git") this.callbacks.onGitChanged(projectId);
        else this.callbacks.onTreeChanged(projectId);
      },
      () => {
        if (this.watchers.get(projectId) === entry) this.watchers.delete(projectId);
      },
    );
    entry.localUnsubscribe = subscription.unsubscribe;
    return subscription.ready.catch((error: unknown) => {
      if (this.watchers.get(projectId) === entry) {
        this.watchers.delete(projectId);
        entry.localUnsubscribe?.();
      }
      throw error;
    });
  }

  /**
   * Update the set of watched worktree directories for a project.
   * Diffs against existing watchers — only adds/removes what changed.
   * All worktree watchers emit the parent projectId.
   */
  watchWorktrees(projectId: string, worktreePaths: string[]): Promise<void> {
    const desired = new Set(worktreePaths);
    const ready: Promise<void>[] = [];

    for (const [path, entry] of this.worktreeWatchers) {
      if (entry.projectId === projectId && !desired.has(path)) {
        void this.closeWorktreeWatcher(path);
      }
    }

    const mainEntry = this.watchers.get(projectId);
    const location = mainEntry?.location;

    for (const wtPath of worktreePaths) {
      const existing = this.worktreeWatchers.get(wtPath);
      if (existing) {
        if (existing.localReady) ready.push(existing.localReady);
        continue;
      }

      const entry: WorktreeWatcherEntry = {
        localUnsubscribe: null,
        wslUnsubscribe: null,
        gitDebounceTimer: null,
        treeDebounceTimer: null,
        projectId,
      };

      const scheduleGitNotify = () => {
        if (entry.gitDebounceTimer) clearTimeout(entry.gitDebounceTimer);
        entry.gitDebounceTimer = setTimeout(() => {
          entry.gitDebounceTimer = null;
          this.callbacks.onGitChanged(projectId, wtPath);
        }, DEBOUNCE_MS);
      };
      const scheduleTreeNotify = () => {
        if (entry.treeDebounceTimer) clearTimeout(entry.treeDebounceTimer);
        entry.treeDebounceTimer = setTimeout(() => {
          entry.treeDebounceTimer = null;
          this.callbacks.onTreeChanged(projectId, wtPath);
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

      this.worktreeWatchers.set(wtPath, entry);
      const subscription = this.localClient.watch(
        wtPath,
        (scope) => {
          if (this.worktreeWatchers.get(wtPath) !== entry) return;
          if (scope === "git") this.callbacks.onGitChanged(projectId, wtPath);
          else this.callbacks.onTreeChanged(projectId, wtPath);
        },
        () => {
          if (this.worktreeWatchers.get(wtPath) === entry) this.worktreeWatchers.delete(wtPath);
        },
      );
      entry.localUnsubscribe = subscription.unsubscribe;
      entry.localReady = subscription.ready.catch((error: unknown) => {
        if (this.worktreeWatchers.get(wtPath) === entry) {
          this.worktreeWatchers.delete(wtPath);
          entry.localUnsubscribe?.();
        }
        throw error;
      });
      ready.push(entry.localReady);
    }
    return Promise.all(ready).then(() => {});
  }

  /** Stop watching a project and its worktrees. */
  async unwatch(projectId: string): Promise<void> {
    const worktreeEntries = [...this.worktreeWatchers].filter(
      ([, worktreeEntry]) => worktreeEntry.projectId === projectId,
    );
    for (const [path] of worktreeEntries) {
      this.worktreeWatchers.delete(path);
    }

    const entry = this.watchers.get(projectId);
    if (entry) {
      // Remove the captured entry before the first await. A replacement watch
      // for the same projectId must not be deleted when this teardown resumes.
      this.watchers.delete(projectId);
      if (entry.gitDebounceTimer) clearTimeout(entry.gitDebounceTimer);
      if (entry.treeDebounceTimer) clearTimeout(entry.treeDebounceTimer);
      entry.localUnsubscribe?.();
      if (entry.wslUnsubscribe) {
        await entry.wslUnsubscribe().catch((error) => {
          console.warn(`[watcher] WSL unsubscribe failed for project ${projectId}:`, error);
        });
      }
    }

    for (const [path, worktreeEntry] of worktreeEntries) {
      await this.closeWorktreeWatcherEntry(path, worktreeEntry);
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
    for (const [path] of this.worktreeWatchers) await this.closeWorktreeWatcher(path);
    await this.localClient.dispose();
  }

  handleWslBridgeExit(distro: string): void {
    this.restoreWslSubscriptions(distro, false);
  }

  handleWslBridgeResume(distro: string): void {
    this.restoreWslSubscriptions(distro, true);
  }

  private restoreWslSubscriptions(distro: string, skipPending: boolean): void {
    for (const entry of this.watchers.values()) {
      if (entry.location.kind !== "wsl" || entry.location.distro !== distro || !entry.wslSchedule) {
        continue;
      }
      if (skipPending && entry.wslSubscriptionPending) continue;
      entry.wslUnsubscribe = null;
      entry.wslSchedule.onGit();
      entry.wslSchedule.onTree();
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
      if (skipPending && entry.wslSubscriptionPending) continue;
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
    // Match project watcher ownership: async teardown must not delete a
    // replacement registered for the same path.
    this.worktreeWatchers.delete(path);
    await this.closeWorktreeWatcherEntry(path, entry);
  }

  private async closeWorktreeWatcherEntry(
    path: string,
    entry: WorktreeWatcherEntry,
  ): Promise<void> {
    if (entry.gitDebounceTimer) clearTimeout(entry.gitDebounceTimer);
    if (entry.treeDebounceTimer) clearTimeout(entry.treeDebounceTimer);
    entry.localUnsubscribe?.();
    if (entry.wslUnsubscribe) {
      await entry.wslUnsubscribe().catch((error) => {
        console.warn(`[watcher] WSL worktree unsubscribe failed for ${path}:`, error);
      });
    }
  }

  private async startWslSubscription(
    entry: WatcherEntry,
    location: WslLocation,
    linuxPath: string,
    schedule: { onGit: () => void; onTree: () => void },
  ): Promise<void> {
    entry.wslSubscriptionPending = true;
    try {
      const subscription = await this.subscribeWsl(location, linuxPath, schedule);
      if (!subscription) return;
      if (!this.watchers.has(entry.projectId) || this.watchers.get(entry.projectId) !== entry) {
        // Entry was already unwatched while we awaited — tear down immediately.
        await subscription.unsubscribe().catch((error) => {
          console.warn("[watcher] WSL unsubscribe failed during teardown:", error);
        });
        return;
      }
      entry.wslUnsubscribe = subscription.unsubscribe;
    } finally {
      entry.wslSubscriptionPending = false;
    }
  }

  private async startWslWorktreeSubscription(
    entry: WorktreeWatcherEntry,
    location: WslLocation,
    linuxPath: string,
    schedule: { onGit: () => void; onTree: () => void },
  ): Promise<void> {
    entry.wslSubscriptionPending = true;
    try {
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
        await subscription.unsubscribe().catch((error) => {
          console.warn("[watcher] WSL worktree unsubscribe failed during teardown:", error);
        });
        return;
      }
      entry.wslUnsubscribe = subscription.unsubscribe;
    } finally {
      entry.wslSubscriptionPending = false;
    }
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
    const gitStat = await client.stat(location, [gitPath], { follow: true }).catch((error) => {
      console.warn(`[watcher] WSL stat failed for ${gitPath}:`, error);
      return null;
    });
    let hasGitScope = false;
    if (gitStat?.stats[0]?.isDirectory) {
      paths.push({ path: gitPath, scope: "git" });
      hasGitScope = true;
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
            if (!hasGitScope && event.paths.some((p) => isRecoverableGitPath(p))) {
              schedule.onGit();
            }
            // `.git/...` writes (e.g. our own `git status` creating
            // `.git/index.lock`) leak into worktree-scope events because the
            // worktree path is the parent of `.git`. Those are already covered
            // by the dedicated git-scope subscription with noise filtering, so
            // drop them here to avoid a refresh→lock-write→refresh loop.
            const treePaths = event.paths.filter(
              (p) => p !== ".git" && !p.startsWith(".git/") && !isIgnoredWorkTreeFile(p),
            );
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
