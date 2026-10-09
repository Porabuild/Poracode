import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  matchesImportQuery,
  type ImportableSession,
  type ListImportableSessionsPayload,
  type ListImportableSessionsResult,
} from "@/shared/contracts";
import { isSameFolderPath } from "@/shared/pathUtils";
import {
  readFileLines,
  readTailLines,
  type SessionImportSource,
  type SessionImportSummary,
} from "../agents/base/sessionImport";

export interface SessionImportStore {
  readonly agentKind: string;
  readonly source: SessionImportSource;
}

export interface SessionImportScanLimits {
  /** Transcripts enumerated per scan; the newest survive the cut. */
  maxFiles: number;
  /** Bytes a provider may read from the start of one transcript. */
  headBytes: number;
  /** Bytes a provider may read from the end of one transcript. */
  tailBytes: number;
  /** Uncached bytes one scan may read; later transcripts wait for the next scan. */
  scanBytes: number;
  /** Sessions returned per page. */
  pageSize: number;
  /** Summaries remembered across scans, keyed by path + mtime + size. */
  cacheEntries: number;
  /** Parallel file reads. */
  concurrency: number;
}

export const DEFAULT_SCAN_LIMITS: SessionImportScanLimits = {
  maxFiles: 20_000,
  headBytes: 256 * 1024,
  tailBytes: 64 * 1024,
  scanBytes: 256 * 1024 * 1024,
  pageSize: 200,
  cacheEntries: 20_000,
  concurrency: 16,
};

const PREVIEW_MAX_CHARS = 200;
const MAX_WALK_DEPTH = 8;

interface DiscoveredFile {
  readonly store: SessionImportStore;
  readonly path: string;
  readonly mtimeMs: number;
  readonly size: number;
}

interface Candidate {
  readonly file: DiscoveredFile;
  readonly summary: SessionImportSummary;
}

class Superseded extends Error {}

function compactLine(text: string | undefined): string | undefined {
  const line = text?.replace(/\s+/gu, " ").trim();
  if (!line) return undefined;
  return line.length > PREVIEW_MAX_CHARS ? `${line.slice(0, PREVIEW_MAX_CHARS)}…` : line;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/**
 * Async, bounded discovery of importable transcripts. Each `list` call
 * supersedes the previous one, which stops at its next checkpoint; whatever it
 * already summarized stays cached, so a rescan per keystroke only re-reads
 * files whose mtime or size changed.
 */
export class SessionImportScanner {
  private generation = 0;
  private readonly summaries = new Map<string, SessionImportSummary | null>();

  constructor(
    private readonly getStores: () => readonly SessionImportStore[],
    private readonly limits: SessionImportScanLimits = DEFAULT_SCAN_LIMITS,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async list(payload: ListImportableSessionsPayload): Promise<ListImportableSessionsResult> {
    const generation = ++this.generation;
    const checkpoint = () => {
      if (generation !== this.generation) throw new Superseded();
    };
    try {
      return await this.scan(payload, checkpoint);
    } catch (error) {
      if (error instanceof Superseded) {
        return {
          sessions: [],
          facets: { agentKinds: [], folders: [] },
          truncated: false,
          superseded: true,
        };
      }
      throw error;
    }
  }

  private async scan(
    payload: ListImportableSessionsPayload,
    checkpoint: () => void,
  ): Promise<ListImportableSessionsResult> {
    const { files, capped } = await this.discover(this.getStores(), checkpoint);
    const { candidates, exhausted } = await this.summarizeAll(files, checkpoint);
    const titles = await this.readTitles(candidates, checkpoint);
    const sessions = candidates.map((candidate) => this.toSession(candidate, titles));

    const caseInsensitive = this.platform === "win32";
    const byAgent = (session: ImportableSession) =>
      !payload.agentKind || session.agentKind === payload.agentKind;
    const byFolder = (session: ImportableSession) =>
      !payload.cwd || isSameFolderPath(session.cwd, payload.cwd, caseInsensitive);
    const matched = sessions.filter(
      (session) =>
        byAgent(session) && byFolder(session) && matchesImportQuery(session, payload.query),
    );
    const page = matched.slice(0, this.limits.pageSize);
    await this.markMissingFolders(page, checkpoint);
    return {
      sessions: page,
      facets: {
        agentKinds: sortedUnique(sessions.filter(byFolder).map((session) => session.agentKind)),
        folders: sortedUnique(
          sessions.filter(byAgent).flatMap((session) => (session.cwd ? [session.cwd] : [])),
        ),
      },
      truncated: capped || exhausted || matched.length > page.length,
    };
  }

  private async discover(
    stores: readonly SessionImportStore[],
    checkpoint: () => void,
  ): Promise<{ files: DiscoveredFile[]; capped: boolean }> {
    const paths: Array<{ store: SessionImportStore; path: string }> = [];
    let capped = false;
    const walk = async (store: SessionImportStore, dir: string, depth: number) => {
      checkpoint();
      if (depth > MAX_WALK_DEPTH || capped) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(store, path, depth + 1);
        } else if (entry.isFile() && store.source.acceptFile(entry.name)) {
          if (paths.length >= this.limits.maxFiles) {
            capped = true;
            return;
          }
          paths.push({ store, path });
        }
        if (capped) return;
      }
    };
    for (const store of stores) {
      for (const root of store.source.roots) await walk(store, root, 0);
    }
    const files: DiscoveredFile[] = [];
    await this.forEachConcurrent(paths, checkpoint, async ({ store, path }) => {
      try {
        const stats = await stat(path);
        files.push({ store, path, mtimeMs: stats.mtimeMs, size: stats.size });
      } catch {
        // Removed between readdir and stat.
      }
    });
    return { files: files.toSorted((a, b) => b.mtimeMs - a.mtimeMs), capped };
  }

  private async summarizeAll(
    files: readonly DiscoveredFile[],
    checkpoint: () => void,
  ): Promise<{ candidates: Candidate[]; exhausted: boolean }> {
    const summaries = new Map<DiscoveredFile, SessionImportSummary>();
    let bytesRead = 0;
    let exhausted = false;
    await this.forEachConcurrent(files, checkpoint, async (file) => {
      const key = `${file.path}\0${file.mtimeMs}\0${file.size}`;
      let summary = this.summaries.get(key);
      if (summary === undefined) {
        if (bytesRead >= this.limits.scanBytes) {
          exhausted = true;
          return;
        }
        bytesRead += Math.min(file.size, this.limits.headBytes + this.limits.tailBytes);
        summary = (await this.summarize(file)) ?? null;
        this.remember(key, summary);
      }
      if (summary) summaries.set(file, summary);
    });
    // Newest first, one row per provider session (a store can hold copies).
    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const file of files) {
      const summary = summaries.get(file);
      if (!summary) continue;
      const id = `${file.store.agentKind}:${summary.providerSessionId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push({ file, summary });
    }
    return { candidates, exhausted };
  }

  private async summarize(file: DiscoveredFile): Promise<SessionImportSummary | undefined> {
    try {
      return await file.store.source.summarize({
        path: file.path,
        headLines: () => readFileLines(file.path, this.limits.headBytes),
        tailLines: () => readTailLines(file.path, this.limits.tailBytes),
      });
    } catch {
      // One unreadable transcript must not hide the rest.
      return undefined;
    }
  }

  private remember(key: string, summary: SessionImportSummary | null): void {
    this.summaries.set(key, summary);
    if (this.summaries.size > this.limits.cacheEntries) {
      const oldest = this.summaries.keys().next().value;
      if (oldest !== undefined) this.summaries.delete(oldest);
    }
  }

  private async readTitles(
    candidates: readonly Candidate[],
    checkpoint: () => void,
  ): Promise<Map<SessionImportStore, ReadonlyMap<string, string>>> {
    const titles = new Map<SessionImportStore, ReadonlyMap<string, string>>();
    for (const store of new Set(candidates.map((candidate) => candidate.file.store))) {
      checkpoint();
      if (!store.source.readTitles) continue;
      titles.set(store, await store.source.readTitles().catch(() => new Map<string, string>()));
    }
    return titles;
  }

  private toSession(
    { file, summary }: Candidate,
    titles: ReadonlyMap<SessionImportStore, ReadonlyMap<string, string>>,
  ): ImportableSession {
    const title = compactLine(
      titles.get(file.store)?.get(summary.providerSessionId) ?? summary.title,
    );
    return {
      id: `${file.store.agentKind}:${summary.providerSessionId}`,
      agentKind: file.store.agentKind,
      providerSessionId: summary.providerSessionId,
      path: file.path,
      ...(summary.cwd ? { cwd: summary.cwd } : {}),
      ...(summary.startedAt ? { startedAt: summary.startedAt } : {}),
      updatedAt: new Date(file.mtimeMs).toISOString(),
      preview: compactLine(summary.preview) ?? "",
      ...(title ? { title } : {}),
      ...(summary.model ? { model: summary.model } : {}),
      cwdExists: false,
    };
  }

  private async markMissingFolders(
    sessions: ImportableSession[],
    checkpoint: () => void,
  ): Promise<void> {
    const exists = new Map<string, Promise<boolean>>();
    for (const session of sessions) {
      if (!session.cwd) continue;
      let check = exists.get(session.cwd);
      if (!check) {
        check = access(session.cwd).then(
          () => true,
          () => false,
        );
        exists.set(session.cwd, check);
      }
      session.cwdExists = await check;
    }
    checkpoint();
  }

  private async forEachConcurrent<T>(
    items: readonly T[],
    checkpoint: () => void,
    run: (item: T) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        checkpoint();
        const item = items[next++] as T;
        await run(item);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(this.limits.concurrency, items.length) }, worker),
    );
  }
}
