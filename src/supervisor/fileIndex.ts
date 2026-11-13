import micromatch from "micromatch";
import type {
  FileEntry,
  ProjectLocation,
  SearchConfigPayload,
  SearchProjectFilesPayload,
  SearchProjectFilesResult,
} from "@/shared/contracts";
import { execGit, getLocationIdentity } from "./git";
import { GIT_DEFAULT_TIMEOUT } from "./git/exec";
import { admitGitProcess } from "./git/gitProcessAdmission";
import {
  areSearchExcludePatternsNativeCompatible,
  invalidateNativeSearchCache,
  isNativeGitHelperActive,
  queryNativeSearchFiles,
} from "./git/gitNativeHelperClient";

const MAX_INDEX_SIZE = 100_000;
const CACHE_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 4;

const entryPathCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

interface CachedIndex {
  entries: FileEntry[];
  createdAt: number;
}

const LEGACY_CONFIG: SearchConfigPayload = {
  useIgnoreFiles: true,
  excludePatterns: [],
};

export class FileIndexService {
  private cache = new Map<string, CachedIndex>();
  private nativeWarmTimestamps = new Map<string, number>();

  async searchProjectFiles(payload: SearchProjectFilesPayload): Promise<SearchProjectFilesResult> {
    const { projectLocation, query, limit } = payload;
    const config = payload.searchConfig ?? LEGACY_CONFIG;

    if (
      projectLocation.kind !== "wsl" &&
      isNativeGitHelperActive() &&
      areSearchExcludePatternsNativeCompatible(config.excludePatterns)
    ) {
      const nativeResult = await this.tryNativeSearchFiles(projectLocation, query, limit, config);
      if (nativeResult) {
        return nativeResult;
      }
    }

    const { entries } = await this.getOrBuildIndex(projectLocation, config);

    if (!query) {
      return { entries: entries.slice(0, limit), totalIndexed: entries.length };
    }

    const results = this.rankEntries(entries, query.toLowerCase(), limit);
    return { entries: results, totalIndexed: entries.length };
  }

  private async tryNativeSearchFiles(
    location: ProjectLocation & { kind: "posix" | "windows" },
    query: string,
    limit: number,
    config: SearchConfigPayload,
  ): Promise<SearchProjectFilesResult | null> {
    const key = `${getLocationIdentity(location)}|${cacheKeyForConfig(config)}`;
    const warmSince = this.nativeWarmTimestamps.get(key);
    const isWarm = warmSince !== undefined && Date.now() - warmSince < CACHE_TTL_MS;

    const ticket = !isWarm
      ? await admitGitProcess("short", {
          units: 1,
          environment: location.kind,
          subcommand: "ls-files",
        })
      : null;
    let result: SearchProjectFilesResult | null;
    try {
      result = await queryNativeSearchFiles({
        rootPath: location.path,
        query,
        limit,
        useIgnoreFiles: config.useIgnoreFiles,
        excludePatterns: config.excludePatterns,
        timeoutMs: GIT_DEFAULT_TIMEOUT,
      });
    } finally {
      ticket?.release();
    }
    if (!result) return null;

    if (isWarm) {
      this.nativeWarmTimestamps.delete(key);
      this.nativeWarmTimestamps.set(key, warmSince);
    } else {
      if (this.nativeWarmTimestamps.size >= MAX_CACHE_ENTRIES) {
        const oldest = this.nativeWarmTimestamps.keys().next().value;
        if (oldest !== undefined) this.nativeWarmTimestamps.delete(oldest);
      }
      this.nativeWarmTimestamps.set(key, Date.now());
    }
    return result;
  }

  /**
   * Drop any cached index for the given project location. Called when
   * search settings change so the next search rebuilds with the new config.
   */
  invalidateCacheForLocation(location: ProjectLocation): void {
    const prefix = `${getLocationIdentity(location)}|`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
    for (const key of this.nativeWarmTimestamps.keys()) {
      if (key.startsWith(prefix)) {
        this.nativeWarmTimestamps.delete(key);
      }
    }
    if (location.kind !== "wsl") {
      invalidateNativeSearchCache(location.path);
    }
  }

  private async getOrBuildIndex(
    location: ProjectLocation,
    config: SearchConfigPayload,
  ): Promise<{ entries: FileEntry[] }> {
    const key = `${getLocationIdentity(location)}|${cacheKeyForConfig(config)}`;
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      // Move to end for LRU ordering
      this.cache.delete(key);
      this.cache.set(key, cached);
      return { entries: cached.entries };
    }

    const entries = await this.buildIndex(location, config);

    // Evict oldest if at capacity
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(key, { entries, createdAt: Date.now() });
    return { entries };
  }

  private async buildIndex(
    location: ProjectLocation,
    config: SearchConfigPayload,
  ): Promise<FileEntry[]> {
    const args = ["ls-files", "--cached", "--others"];
    if (config.useIgnoreFiles) args.push("--exclude-standard");

    let raw: string;
    try {
      raw = await execGit(location, args);
    } catch {
      // Not a git repo or git not available
      return [];
    }

    let filePaths = raw
      .split("\n")
      .filter(Boolean)
      // Normalize backslashes to forward slashes (some Windows git configs emit backslashes)
      .map((p) => p.replace(/\\/g, "/"));

    if (config.excludePatterns.length > 0) {
      filePaths = micromatch.not(filePaths, expandDirPatterns(config.excludePatterns), {
        dot: true,
      });
    }

    if (filePaths.length > MAX_INDEX_SIZE) {
      filePaths = filePaths.slice(0, MAX_INDEX_SIZE);
    }

    // Derive directories from file paths
    const dirSet = new Set<string>();
    for (const fp of filePaths) {
      const parts = fp.split("/");
      for (let i = 1; i < parts.length; i++) {
        dirSet.add(parts.slice(0, i).join("/"));
      }
    }

    const entries: FileEntry[] = [];

    for (const fp of filePaths) {
      const lastSlash = fp.lastIndexOf("/");
      entries.push({
        path: fp,
        name: lastSlash >= 0 ? fp.slice(lastSlash + 1) : fp,
        type: "file",
      });
    }

    for (const dp of dirSet) {
      const lastSlash = dp.lastIndexOf("/");
      entries.push({
        path: dp,
        name: lastSlash >= 0 ? dp.slice(lastSlash + 1) : dp,
        type: "directory",
      });
    }

    entries.sort((a, b) => entryPathCollator.compare(a.path, b.path));
    return entries;
  }

  private rankEntries(entries: FileEntry[], query: string, limit: number): FileEntry[] {
    const scored: { entry: FileEntry; score: number }[] = [];

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
      // Files before directories at same score
      if (a.entry.type !== b.entry.type) return a.entry.type === "file" ? -1 : 1;
      // Shorter paths first
      if (a.entry.path.length !== b.entry.path.length)
        return a.entry.path.length - b.entry.path.length;
      return entryPathCollator.compare(a.entry.path, b.entry.path);
    });

    return scored.slice(0, limit).map((s) => s.entry);
  }
}

function cacheKeyForConfig(config: SearchConfigPayload): string {
  const sorted = [...config.excludePatterns].sort().join(",");
  return `${config.useIgnoreFiles ? "i" : "n"}:${sorted}`;
}

/**
 * VS Code's `search.exclude` treats a directory pattern like `**\/node_modules`
 * as also matching everything beneath it. micromatch does not, so we expand
 * `P` into `[P, P/**]` unless the pattern already ends in a wildcard segment.
 */
function expandDirPatterns(patterns: string[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    out.push(p);
    if (!/(\/\*\*|\*)$/.test(p)) {
      out.push(`${p}/**`);
    }
  }
  return out;
}
