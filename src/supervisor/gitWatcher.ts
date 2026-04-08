import { watch, type FSWatcher } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import type { ProjectLocation } from "../shared/contracts";
import { getWslCommand } from "./agents/base";

const DEBOUNCE_MS = 300;

interface WatcherEntry {
  gitWatcher: FSWatcher | null;
  workTreeWatcher: FSWatcher | null;
  wslProcess: ChildProcess | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  projectId: string;
  location: ProjectLocation;
}

interface WorktreeWatcherEntry {
  watcher: FSWatcher | null;
  wslProcess: ChildProcess | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  projectId: string;
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

/**
 * Watches git repositories for changes and emits debounced notifications.
 *
 * Two watchers per project:
 * 1. `.git` directory — catches stage, commit, branch switch, fetch, merge
 * 2. Working tree — catches file edits, new files, deletions
 *
 * Worktree directories get their own working-tree watchers. Git state changes
 * for worktrees are stored in the main repo's `.git/worktrees/` directory,
 * so the main `.git` watcher already catches those.
 *
 * Both are debounced into a single callback per project.
 *
 * WSL projects use a spawned `inotifywait` process inside the WSL distro
 * (with a polling fallback) because Node's `fs.watch` does not work on
 * WSL UNC paths.
 */
export class GitWatcher {
  private readonly watchers = new Map<string, WatcherEntry>();
  private readonly worktreeWatchers = new Map<string, WorktreeWatcherEntry>();

  constructor(private readonly onChanged: (projectId: string) => void) {}

  /**
   * Start watching a project. Idempotent — calling with the same projectId
   * replaces the previous watcher.
   */
  watch(projectId: string, location: ProjectLocation): void {
    // Stop existing watcher for this project
    this.unwatch(projectId);

    const entry: WatcherEntry = {
      gitWatcher: null,
      workTreeWatcher: null,
      wslProcess: null,
      debounceTimer: null,
      projectId,
      location,
    };

    const scheduleNotify = () => {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.debounceTimer = setTimeout(() => {
        entry.debounceTimer = null;
        this.onChanged(projectId);
      }, DEBOUNCE_MS);
    };

    if (location.kind === "wsl") {
      entry.wslProcess = this.spawnWslWatcher(location.distro, location.linuxPath, scheduleNotify);
      this.watchers.set(projectId, entry);
      return;
    }

    const repoPath = location.path;
    const gitDir = join(repoPath, ".git");

    // Watch .git directory recursively for internal git state changes
    try {
      entry.gitWatcher = watch(gitDir, { recursive: true }, (_eventType, filename) => {
        // Filter out noisy files that don't affect status
        if (filename) {
          const name = filename.replace(/\\/g, "/");
          // Skip FETCH_HEAD updates (written on every fetch, rarely useful)
          // Skip gc/pack files that don't affect working state
          if (name === "FETCH_HEAD" || name.startsWith("objects/") || name.startsWith("logs/")) {
            return;
          }
        }
        scheduleNotify();
      });
      entry.gitWatcher.on("error", () => {
        // Watcher died — clean up silently
        entry.gitWatcher?.close();
        entry.gitWatcher = null;
      });
    } catch {
      // .git directory may not exist yet or may not be watchable
    }

    // Watch working tree for file changes
    try {
      entry.workTreeWatcher = watch(repoPath, { recursive: true }, (_eventType, filename) => {
        if (filename) {
          const name = filename.replace(/\\/g, "/");
          if (isIgnoredWorkTreeFile(name)) return;
        }
        scheduleNotify();
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

    // Remove stale worktree watchers for this project
    for (const [path, entry] of this.worktreeWatchers) {
      if (entry.projectId === projectId && !desired.has(path)) {
        this.closeWorktreeWatcher(path);
      }
    }

    // Look up the stored location to determine WSL distro
    const mainEntry = this.watchers.get(projectId);
    const location = mainEntry?.location;

    // Add watchers for new paths
    for (const wtPath of worktreePaths) {
      if (this.worktreeWatchers.has(wtPath)) continue;

      const entry: WorktreeWatcherEntry = {
        watcher: null,
        wslProcess: null,
        debounceTimer: null,
        projectId,
      };

      const scheduleNotify = () => {
        if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
        entry.debounceTimer = setTimeout(() => {
          entry.debounceTimer = null;
          this.onChanged(projectId);
        }, DEBOUNCE_MS);
      };

      if (location?.kind === "wsl") {
        entry.wslProcess = this.spawnWslWatcher(location.distro, wtPath, scheduleNotify);
      } else {
        try {
          entry.watcher = watch(wtPath, { recursive: true }, (_eventType, filename) => {
            if (filename) {
              const name = filename.replace(/\\/g, "/");
              if (isIgnoredWorkTreeFile(name)) return;
            }
            scheduleNotify();
          });
          entry.watcher.on("error", () => {
            entry.watcher?.close();
            entry.watcher = null;
          });
        } catch {
          // Worktree path may not exist or may not be watchable
        }
      }

      this.worktreeWatchers.set(wtPath, entry);
    }
  }

  /** Stop watching a project and its worktrees. */
  unwatch(projectId: string): void {
    const entry = this.watchers.get(projectId);
    if (entry) {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.gitWatcher?.close();
      entry.workTreeWatcher?.close();
      entry.wslProcess?.kill();
      this.watchers.delete(projectId);
    }

    // Also clean up worktree watchers for this project
    for (const [path, wtEntry] of this.worktreeWatchers) {
      if (wtEntry.projectId === projectId) {
        this.closeWorktreeWatcher(path);
      }
    }
  }

  /** Stop watching all project worktrees. */
  unwatchAllWorktrees(projectId: string): void {
    for (const [path, wtEntry] of this.worktreeWatchers) {
      if (wtEntry.projectId === projectId) {
        this.closeWorktreeWatcher(path);
      }
    }
  }

  /** Stop watching a specific worktree directory. */
  unwatchWorktree(path: string): void {
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    for (const [wtPath, entry] of this.worktreeWatchers) {
      if (wtPath.replace(/\\/g, "/").toLowerCase() === normalized) {
        this.closeWorktreeWatcher(wtPath);
      }
    }
  }

  /** Stop all watchers. */
  dispose(): void {
    for (const [projectId] of this.watchers) {
      this.unwatch(projectId);
    }
  }

  private closeWorktreeWatcher(path: string): void {
    const entry = this.worktreeWatchers.get(path);
    if (!entry) return;
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.watcher?.close();
    entry.wslProcess?.kill();
    this.worktreeWatchers.delete(path);
  }

  /**
   * Spawn a `wsl.exe` process running `inotifywait` (or a polling fallback)
   * inside the given WSL distro. Calls `onEvent` on each stdout line.
   */
  private spawnWslWatcher(distro: string, linuxPath: string, onEvent: () => void): ChildProcess {
    // Try inotifywait for native inotify events; fall back to 5s polling
    // if inotify-tools is not installed.
    const script = [
      "if command -v inotifywait >/dev/null 2>&1; then",
      "  inotifywait -m -r -q -e modify,create,delete,move .git . \\",
      "    --exclude '(node_modules|\\.next|dist|build|__pycache__|\\.venv|\\.git/objects|\\.git/logs|\\.git/FETCH_HEAD)'",
      "else",
      "  while true; do echo poll; sleep 5; done",
      "fi",
    ].join("\n");

    const child = spawn(
      getWslCommand(),
      ["-d", distro, "--cd", linuxPath, "--", "bash", "-c", script],
      {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      },
    );

    let buf = "";
    child.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop()!;
      if (lines.length > 0) onEvent();
    });

    child.on("error", () => {
      // wsl.exe could not be started — degrade to no watching
    });

    return child;
  }
}
