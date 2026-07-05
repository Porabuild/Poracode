import { readdir } from "node:fs/promises";
import micromatch from "micromatch";
import type {
  ProjectLocation,
  ProjectTreeEntry,
  SearchConfigPayload,
  SearchProjectTreePayload,
  SearchProjectTreeResult,
} from "@/shared/contracts";
import { getProjectFsPath } from "@/shared/wsl";
import { execGit, getLocationIdentity } from "./git";
import type { WslBridgeClient } from "./wsl/bridge/client";

const CACHE_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 4;
const MAX_SEARCH_INDEX_SIZE = 50_000;

interface CachedSearchIndex {
  entries: ProjectTreeEntry[];
  createdAt: number;
}

function joinRelativePath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function cacheKeyForSearchConfig(config: SearchConfigPayload): string {
  return [...config.excludePatterns].sort().join(",");
}

/**
 * Split exclude globs into two buckets:
 * - `ignoreNames`: simple `**\/<name>` (or `**\/<name>/**`) patterns that we
 *   can prune at walk time by skipping the dirent name. Big perf win for
 *   `node_modules`-shaped trees.
 * - `residualPatterns`: anything more complex; applied via micromatch after
 *   the index is built.
 */
function partitionExcludePatterns(patterns: string[]): {
  ignoreNames: string[];
  residualPatterns: string[];
} {
  const ignoreNames: string[] = [];
  const residualPatterns: string[] = [];
  for (const p of patterns) {
    const m = p.match(/^\*\*\/([^/*?[\]]+)(?:\/\*\*)?$/);
    if (m) ignoreNames.push(m[1]!);
    else residualPatterns.push(p);
  }
  return { ignoreNames, residualPatterns };
}

function expandDirPatterns(patterns: string[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    out.push(p);
    if (!/(\/\*\*|\*)$/.test(p)) out.push(`${p}/**`);
  }
  return out;
}

/**
 * True if any segment of the path equals one of the ignored names. Used to
 * apply name-based excludes to the git ls-files output (which doesn't
 * support per-segment skipping the way our walker does).
 */
function pathHitsIgnoredName(path: string, ignored: Set<string>): boolean {
  if (ignored.size === 0) return false;
  for (const segment of path.split("/")) {
    if (ignored.has(segment)) return true;
  }
  return false;
}

/**
 * Self-contained search-index subsystem extracted from `ProjectTreeService`.
 * Holds its own bounded LRU cache and talks to the outside world through the
 * WSL bridge client, the git service (`execGit`/`getLocationIdentity`), and a
 * `resolveEntryPath` callback supplied by the host service (that helper is
 * shared with non-search code, so it is threaded in rather than moved).
 *
 * Ranking, cache keying, and walk/git index building are byte-for-byte
 * identical to the pre-extraction implementation.
 */
export class ProjectSearchIndex {
  private cache = new Map<string, CachedSearchIndex>();
  private wslClient: WslBridgeClient | undefined;

  constructor(
    private readonly resolveEntryPath: (location: ProjectLocation, path: string) => string,
  ) {}

  /** Late-born so the supervisor can wire the bridge client after boot. */
  setWslClient(client: WslBridgeClient): void {
    this.wslClient = client;
  }

  private requireWslClient(): WslBridgeClient {
    if (!this.wslClient) {
      throw new Error("WSL bridge unavailable.");
    }
    return this.wslClient;
  }

  async searchProjectTree(payload: SearchProjectTreePayload): Promise<SearchProjectTreeResult> {
    const query = payload.query.trim().toLowerCase();
    if (!query) return { entries: [] };

    const config = payload.searchConfig ?? { useIgnoreFiles: true, excludePatterns: [] };
    const { entries } = await this.getOrBuildSearchIndex(payload.projectLocation, config);
    return {
      entries: this.rankEntries(entries, query, payload.limit),
    };
  }

  async getOrBuildSearchIndex(
    location: ProjectLocation,
    config: SearchConfigPayload,
  ): Promise<{ entries: ProjectTreeEntry[] }> {
    const key = `${getLocationIdentity(location)}|${cacheKeyForSearchConfig(config)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return { entries: cached.entries };
    }

    const entries = await this.buildSearchIndex(location, config);
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { entries, createdAt: Date.now() });
    return { entries };
  }

  private async buildSearchIndex(
    location: ProjectLocation,
    config: SearchConfigPayload,
  ): Promise<ProjectTreeEntry[]> {
    const { ignoreNames, residualPatterns } = partitionExcludePatterns(config.excludePatterns);
    // `.git` is always skipped here too — it's locked at the schema level.
    const ignoreSet = new Set<string>([".git", ...ignoreNames]);

    let raw: ProjectTreeEntry[] | undefined;
    if (config.useIgnoreFiles) {
      raw = await this.buildIndexFromGit(location, ignoreSet);
    }
    if (!raw) {
      raw = await this.buildIndexFromWalk(location, ignoreSet);
    }

    if (residualPatterns.length === 0) return raw;
    const filterPatterns = expandDirPatterns(residualPatterns);
    return raw.filter((entry) => !micromatch.isMatch(entry.path, filterPatterns, { dot: true }));
  }

  /**
   * Build the search index from `git ls-files`, which honors `.gitignore`
   * automatically. Returns `undefined` if the project isn't a git repo or
   * git isn't available — the caller falls back to a filesystem walk.
   */
  private async buildIndexFromGit(
    location: ProjectLocation,
    ignoreSet: Set<string>,
  ): Promise<ProjectTreeEntry[] | undefined> {
    let raw: string;
    try {
      raw = await execGit(location, ["ls-files", "--cached", "--others", "--exclude-standard"]);
    } catch {
      return undefined;
    }

    const filePaths = raw
      .split("\n")
      .filter(Boolean)
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => !pathHitsIgnoredName(p, ignoreSet))
      .slice(0, MAX_SEARCH_INDEX_SIZE);

    const entries: ProjectTreeEntry[] = [];
    const dirSet = new Set<string>();

    for (const fp of filePaths) {
      const lastSlash = fp.lastIndexOf("/");
      entries.push({
        path: fp,
        name: lastSlash >= 0 ? fp.slice(lastSlash + 1) : fp,
        type: "file",
      });
      const parts = fp.split("/");
      for (let i = 1; i < parts.length; i++) {
        dirSet.add(parts.slice(0, i).join("/"));
      }
    }

    for (const dp of dirSet) {
      const lastSlash = dp.lastIndexOf("/");
      entries.push({
        path: dp,
        name: lastSlash >= 0 ? dp.slice(lastSlash + 1) : dp,
        type: "directory",
        hasChildren: true,
      });
    }

    return entries;
  }

  private async buildIndexFromWalk(
    location: ProjectLocation,
    ignoreSet: Set<string>,
  ): Promise<ProjectTreeEntry[]> {
    if (location.kind === "wsl") {
      const { entries } = await this.requireWslClient().find(location, {
        maxEntries: MAX_SEARCH_INDEX_SIZE,
        ignore: Array.from(ignoreSet),
      });
      return entries.map((entry) => {
        if (entry.type === "directory") {
          return { path: entry.path, name: entry.name, type: "directory", hasChildren: true };
        }
        return { path: entry.path, name: entry.name, type: "file" };
      });
    }

    const rootPath = getProjectFsPath(location);
    const stack = [""];
    const results: ProjectTreeEntry[] = [];

    while (stack.length > 0 && results.length < MAX_SEARCH_INDEX_SIZE) {
      const directoryPath = stack.pop()!;
      const fullPath = directoryPath ? this.resolveEntryPath(location, directoryPath) : rootPath;
      const entries = await readdir(fullPath, { withFileTypes: true }).catch((error) => {
        console.warn(`[project-tree] failed to read directory ${fullPath}:`, error);
        return [] as import("node:fs").Dirent[];
      });
      for (const entry of entries) {
        if (ignoreSet.has(entry.name)) continue;
        const path = joinRelativePath(directoryPath, entry.name);
        if (entry.isDirectory()) {
          results.push({ path, name: entry.name, type: "directory", hasChildren: true });
          if (results.length >= MAX_SEARCH_INDEX_SIZE) break;
          stack.push(path);
          continue;
        }
        results.push({ path, name: entry.name, type: "file" });
        if (results.length >= MAX_SEARCH_INDEX_SIZE) break;
      }
    }
    return results;
  }

  rankEntries(entries: ProjectTreeEntry[], query: string, limit: number): ProjectTreeEntry[] {
    const scored: { entry: ProjectTreeEntry; score: number }[] = [];
    for (const entry of entries) {
      const nameLower = entry.name.toLowerCase();
      const pathLower = entry.path.toLowerCase();
      let score = 0;
      if (nameLower.startsWith(query)) score = 3;
      else if (nameLower.includes(query)) score = 2;
      else if (pathLower.includes(query)) score = 1;
      if (score > 0) scored.push({ entry, score });
    }

    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.entry.type !== b.entry.type) return a.entry.type === "file" ? -1 : 1;
      if (a.entry.path.length !== b.entry.path.length) {
        return a.entry.path.length - b.entry.path.length;
      }
      return a.entry.path.localeCompare(b.entry.path, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    return scored.slice(0, limit).map((item) => item.entry);
  }

  invalidateCaches(location: ProjectLocation): void {
    const prefix = `${getLocationIdentity(location)}|`;
    for (const key of this.cache.keys()) {
      if (key === getLocationIdentity(location) || key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Drop all cached search indexes. Called on tree-change events from the
   * watcher — cheap because the cache is bounded to MAX_CACHE_ENTRIES.
   */
  invalidateAllCaches(): void {
    this.cache.clear();
  }
}
