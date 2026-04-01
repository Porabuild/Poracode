import type {
  FileEntry,
  ProjectLocation,
  SearchProjectFilesPayload,
  SearchProjectFilesResult,
} from "../shared/contracts";
import { createGit, getLocationIdentity } from "./git";

const MAX_INDEX_SIZE = 25_000;
const CACHE_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 4;

interface CachedIndex {
  entries: FileEntry[];
  createdAt: number;
}

export class FileIndexService {
  private cache = new Map<string, CachedIndex>();

  async searchProjectFiles(payload: SearchProjectFilesPayload): Promise<SearchProjectFilesResult> {
    const { projectLocation, query, limit } = payload;
    const { entries } = await this.getOrBuildIndex(projectLocation);

    if (!query) {
      return { entries: entries.slice(0, limit), totalIndexed: entries.length };
    }

    const results = this.rankEntries(entries, query.toLowerCase(), limit);
    return { entries: results, totalIndexed: entries.length };
  }

  private async getOrBuildIndex(location: ProjectLocation): Promise<{ entries: FileEntry[] }> {
    const key = getLocationIdentity(location);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      // Move to end for LRU ordering
      this.cache.delete(key);
      this.cache.set(key, cached);
      return { entries: cached.entries };
    }

    const entries = await this.buildIndex(location);

    // Evict oldest if at capacity
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(key, { entries, createdAt: Date.now() });
    return { entries };
  }

  private async buildIndex(location: ProjectLocation): Promise<FileEntry[]> {
    const git = createGit(location);

    let raw: string;
    try {
      raw = await git.raw(["ls-files", "--cached", "--others", "--exclude-standard"]);
    } catch {
      // Not a git repo or git not available
      return [];
    }

    let filePaths = raw
      .split("\n")
      .filter(Boolean)
      // Normalize backslashes to forward slashes (some Windows git configs emit backslashes)
      .map((p) => p.replace(/\\/g, "/"));

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

    entries.sort((a, b) => a.path.localeCompare(b.path));
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
      return a.entry.path.localeCompare(b.entry.path);
    });

    return scored.slice(0, limit).map((s) => s.entry);
  }
}
