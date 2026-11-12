import { readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  isIgnoredWorkTreeFile,
  isKnownGitNoisePath,
  PROJECT_WATCH_DEBOUNCE_MS,
} from "./projectWatcherFilters.ts";
import type { ProjectWatchEvent, ProjectWatchScope } from "./projectWatcherProtocol.ts";

function gitDirectories(rootPath: string): string[] {
  const dotGit = join(rootPath, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return [dotGit];
    const pointer = /^gitdir:\s*(.+)\s*$/u.exec(readFileSync(dotGit, "utf8").trim());
    if (!pointer?.[1]) return [];
    const gitDir = resolve(rootPath, pointer[1]);
    let commonDir = gitDir;
    try {
      const commonPointer = readFileSync(join(gitDir, "commondir"), "utf8").trim();
      if (commonPointer) commonDir = resolve(gitDir, commonPointer);
    } catch {
      // A normal repository has no commondir indirection.
    }
    return [...new Set([gitDir, commonDir])];
  } catch {
    return [];
  }
}

/** Owns raw fs.watch callbacks, metadata discovery, filters and timers in the worker. */
export class ProjectWatchSubscription {
  private rootWatcher: FSWatcher | undefined;
  private readonly metadataWatchers = new Map<string, FSWatcher>();
  private gitDirs: string[] = [];
  private readonly timers = new Map<ProjectWatchScope, ReturnType<typeof setTimeout>>();
  private closed = false;
  private readonly id: number;
  private readonly rootPath: string;
  private readonly emit: (message: ProjectWatchEvent) => void;

  constructor(id: number, rootPath: string, emit: (message: ProjectWatchEvent) => void) {
    this.id = id;
    this.rootPath = rootPath;
    this.emit = emit;
  }

  start(): void {
    this.rootWatcher = watch(this.rootPath, { recursive: true }, (_type, filename) => {
      if (this.closed) return;
      // fs.watch can omit the path, including after an OS event-buffer overflow.
      // The missing paths may include Git metadata, so invalidate both scopes.
      if (!filename) {
        try {
          this.refreshMetadata();
        } catch (error) {
          this.fail(error);
          return;
        }
        this.schedule("git");
        this.schedule("worktree");
        return;
      }
      const name = filename.replaceAll("\\", "/");
      if (name === ".git" || name.startsWith(".git/")) {
        let changed = false;
        if (name === ".git" || name === ".git/commondir" || this.gitDirs.length === 0) {
          try {
            changed = this.refreshMetadata();
          } catch (error) {
            this.fail(error);
            return;
          }
        }
        if (name === ".git") {
          let isPointer = false;
          try {
            isPointer = statSync(join(this.rootPath, ".git")).isFile();
          } catch {
            /* Removed metadata. */
          }
          if (changed || isPointer) this.schedule("git");
        } else if (!isKnownGitNoisePath(name.slice(5))) this.schedule("git");
        return;
      }
      if (!isIgnoredWorkTreeFile(name)) this.schedule("worktree");
    });
    this.rootWatcher.on("error", (error) => this.fail(error));
    this.refreshMetadata();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.rootWatcher?.close();
    for (const watcher of this.metadataWatchers.values()) watcher.close();
    this.metadataWatchers.clear();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private refreshMetadata(): boolean {
    const dirs = gitDirectories(this.rootPath);
    const changed =
      dirs.length !== this.gitDirs.length ||
      dirs.some((path, index) => path !== this.gitDirs[index]);
    this.gitDirs = dirs;
    const external = new Set(
      this.gitDirs.filter((path) => {
        const rel = relative(this.rootPath, path);
        return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
      }),
    );
    for (const [path, watcher] of this.metadataWatchers) {
      if (!external.has(path)) {
        watcher.close();
        this.metadataWatchers.delete(path);
      }
    }
    for (const path of external) {
      if (this.metadataWatchers.has(path)) continue;
      const watcher = watch(path, { recursive: true }, (_type, filename) => {
        if (this.closed || this.metadataWatchers.get(path) !== watcher) return;
        const name = filename?.replaceAll("\\", "/");
        if (path !== this.gitDirs[0] && name?.startsWith("worktrees/")) return;
        if (name && isKnownGitNoisePath(name)) return;
        if (!name || name === "commondir") {
          try {
            this.refreshMetadata();
          } catch (error) {
            this.fail(error);
            return;
          }
        }
        this.schedule("git");
      });
      watcher.on("error", (error) => {
        if (this.metadataWatchers.get(path) === watcher) this.fail(error);
      });
      this.metadataWatchers.set(path, watcher);
    }
    return changed;
  }

  private fail(error: unknown): void {
    if (this.closed) return;
    this.emit({ id: this.id, kind: "error", error: String(error) });
    this.close();
  }

  private schedule(scope: ProjectWatchScope): void {
    if (this.closed) return;
    clearTimeout(this.timers.get(scope));
    this.timers.set(
      scope,
      setTimeout(() => {
        this.timers.delete(scope);
        if (!this.closed) this.emit({ id: this.id, kind: "changed", scope });
      }, PROJECT_WATCH_DEBOUNCE_MS),
    );
  }
}
