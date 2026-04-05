import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import type { ProjectLocation } from "../shared/contracts";

const DEBOUNCE_MS = 300;

interface WatcherEntry {
  gitWatcher: FSWatcher | null;
  workTreeWatcher: FSWatcher | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  projectId: string;
}

/**
 * Watches git repositories for changes and emits debounced notifications.
 *
 * Two watchers per project:
 * 1. `.git` directory — catches stage, commit, branch switch, fetch, merge
 * 2. Working tree — catches file edits, new files, deletions
 *
 * Both are debounced into a single callback per project.
 */
export class GitWatcher {
  private readonly watchers = new Map<string, WatcherEntry>();

  constructor(private readonly onChanged: (projectId: string) => void) {}

  /**
   * Start watching a project. Idempotent — calling with the same projectId
   * replaces the previous watcher.
   */
  watch(projectId: string, location: ProjectLocation): void {
    // Stop existing watcher for this project
    this.unwatch(projectId);

    // WSL projects use UNC paths that fs.watch may not support reliably.
    // For WSL we skip file watching — the renderer will fall back to polling.
    if (location.kind === "wsl") {
      return;
    }

    const repoPath = location.path;
    const gitDir = join(repoPath, ".git");

    const entry: WatcherEntry = {
      gitWatcher: null,
      workTreeWatcher: null,
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
          // Skip .git directory changes (handled by gitWatcher)
          if (name === ".git" || name.startsWith(".git/")) return;
          // Skip common large/noisy directories
          if (
            name.startsWith("node_modules/") ||
            name.startsWith(".next/") ||
            name.startsWith("dist/") ||
            name.startsWith("build/") ||
            name.startsWith(".turbo/") ||
            name.startsWith("__pycache__/") ||
            name.startsWith(".venv/")
          ) {
            return;
          }
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

  /** Stop watching a project. */
  unwatch(projectId: string): void {
    const entry = this.watchers.get(projectId);
    if (!entry) return;

    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.gitWatcher?.close();
    entry.workTreeWatcher?.close();
    this.watchers.delete(projectId);
  }

  /** Stop all watchers. */
  dispose(): void {
    for (const [projectId] of this.watchers) {
      this.unwatch(projectId);
    }
  }
}
