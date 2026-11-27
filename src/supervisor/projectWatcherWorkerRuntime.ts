import { readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  isIgnoredWorkTreeFile,
  isKnownGitNoisePath,
  PROJECT_WATCH_DEBOUNCE_MS,
} from "./projectWatcherFilters.ts";
import type { ProjectWatchEvent, ProjectWatchScope } from "./projectWatcherProtocol.ts";

/**
 * macOS FSEvents registers asynchronously and can miss changes right after
 * `ready`. Revalidate Git state once after attachment to cover that window.
 */
const GIT_ATTACH_REVALIDATION_MS = 500;

/** Known HEAD fingerprint or the "missing" sentinel; undefined means unreadable. */
type HeadStamp = string | undefined;

interface HeadAttachCheck {
  path: string;
  stamp: string;
  timer: ReturnType<typeof setTimeout>;
}

function readHeadStamp(headPath: string): HeadStamp {
  try {
    const stat = statSync(headPath, { bigint: true, throwIfNoEntry: false });
    if (!stat) return "missing";
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  } catch {
    return undefined;
  }
}

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
  // One bounded late-Git discovery revalidation, Darwin only.
  private gitDiscoveryTimer: ReturnType<typeof setTimeout> | undefined;
  // One bounded HEAD revalidation per attachment, Darwin only.
  private headAttachCheck: HeadAttachCheck | undefined;

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
    if (process.platform === "darwin") {
      const primary = this.gitDirs[0];
      if (!primary) {
        // A repository whose `.git` is created immediately after `ready` can
        // be missed while the root FSEvents watcher is still registering.
        this.scheduleGitDiscoveryCheck();
      } else if (!this.metadataWatchers.has(primary)) {
        // Ordinary (internal) `.git` dirs are covered only by the root watcher;
        // external primaries already armed their attach check above.
        const stamp = readHeadStamp(join(primary, "HEAD"));
        if (stamp !== undefined) this.scheduleHeadAttachCheck(primary, stamp);
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearGitDiscoveryCheck();
    this.cancelHeadAttachCheck();
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
    if (this.headAttachCheck && dirs[0] !== this.headAttachCheck.path) {
      this.cancelHeadAttachCheck();
    }
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
      const isPrimary = path === dirs[0];
      // Snapshot HEAD immediately before attaching: a freshly registered macOS
      // watcher does not replay writes that land during registration.
      const stamp =
        process.platform === "darwin" && isPrimary ? readHeadStamp(join(path, "HEAD")) : undefined;
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
      if (process.platform === "darwin" && isPrimary && stamp !== undefined) {
        this.scheduleHeadAttachCheck(path, stamp);
      }
    }
    // A real event that discovers Git supersedes the pending startup check:
    // guarantee the notification even when the only delivered path was noise.
    if (this.gitDiscoveryTimer !== undefined && dirs.length > 0) {
      this.clearGitDiscoveryCheck();
      if (!this.timers.has("git")) this.schedule("git");
    }
    return changed;
  }

  /** One bounded revalidation for a `.git`/HEAD created right after `ready`. */
  private scheduleGitDiscoveryCheck(): void {
    this.clearGitDiscoveryCheck();
    const timer = setTimeout(() => {
      this.gitDiscoveryTimer = undefined;
      if (this.closed || this.gitDirs.length !== 0) return;
      let changed: boolean;
      try {
        changed = this.refreshMetadata();
      } catch (error) {
        this.fail(error);
        return;
      }
      if (changed && this.gitDirs.length !== 0 && !this.timers.has("git")) {
        this.schedule("git");
      }
    }, GIT_ATTACH_REVALIDATION_MS);
    if (typeof timer.unref === "function") timer.unref();
    this.gitDiscoveryTimer = timer;
  }

  private clearGitDiscoveryCheck(): void {
    if (this.gitDiscoveryTimer === undefined) return;
    clearTimeout(this.gitDiscoveryTimer);
    this.gitDiscoveryTimer = undefined;
  }

  /** One bounded HEAD fingerprint reconciliation for a newly discovered primary gitDir. */
  private scheduleHeadAttachCheck(path: string, stamp: string): void {
    this.cancelHeadAttachCheck();
    const timer = setTimeout(() => {
      const check = this.headAttachCheck;
      this.headAttachCheck = undefined;
      if (!check || this.closed) return;
      if (this.gitDirs[0] !== check.path) return;
      const fresh = readHeadStamp(join(check.path, "HEAD"));
      if (fresh === undefined || fresh === check.stamp) return;
      if (this.timers.has("git")) return;
      this.schedule("git");
    }, GIT_ATTACH_REVALIDATION_MS);
    if (typeof timer.unref === "function") timer.unref();
    this.headAttachCheck = { path, stamp, timer };
  }

  private cancelHeadAttachCheck(): void {
    if (this.headAttachCheck === undefined) return;
    clearTimeout(this.headAttachCheck.timer);
    this.headAttachCheck = undefined;
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
        if (this.closed) return;
        // A delivered Git event already covers the current HEAD state; refresh
        // the attach stamp so the one-shot probe cannot emit a duplicate.
        if (scope === "git" && this.headAttachCheck) {
          const fresh = readHeadStamp(join(this.headAttachCheck.path, "HEAD"));
          if (fresh !== undefined) this.headAttachCheck.stamp = fresh;
        }
        this.emit({ id: this.id, kind: "changed", scope });
      }, PROJECT_WATCH_DEBOUNCE_MS),
    );
  }
}
