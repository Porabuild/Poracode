import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ImportableSession, ImportedSessionProvider } from "@/shared/contracts";
import { isSameFolderPath } from "@/shared/pathUtils";
import type { ImportHome } from "./homes";
import { getSessionImportProvider } from "./providers";
import { readPrefix } from "@/shared/sessionImport/io";
import type { SessionHead, SessionImportProvider } from "@/shared/sessionImport/provider";

/**
 * Discovery reads as little of each transcript as it can get away with. A real
 * store is large — a developer's `~/.codex/sessions` alone runs to gigabytes
 * across thousands of rollouts — so parsing every file to build a list costs
 * tens of seconds and re-reads the whole store on each open. Instead:
 *
 *   1. enumerate + `stat` (no file bodies) and sort by recency,
 *   2. pull id / cwd / start time out of a small head chunk,
 *   3. read a preview only for the sessions that survive the filters and fall
 *      inside the returned page.
 *
 * Message counts are deliberately absent: an exact count needs the whole file,
 * which is the cost this design exists to avoid. The count is reported after an
 * import instead, when the transcript is parsed anyway.
 */

/** Enough for `session_meta` / the first conversation lines, never a whole file. */
const HEAD_CHUNK_BYTES = 128 * 1024;
/** Codex prefixes a session with injected context that can itself be tens of KB. */
const PREVIEW_CHUNK_BYTES = 512 * 1024;
/** Preview lines are a list affordance, not a document. */
const PREVIEW_MAX_CHARS = 200;
/** Sessions returned per scan. The UI pages; the disk does not. */
const DEFAULT_LIMIT = 200;
/**
 * Cap on each of the module-level memos below. Everything a scan reads off
 * disk — a head, a preview, a title — is memoised per transcript, so bounding
 * by entry count keeps a long-running main process from holding one entry per
 * transcript it has ever seen. The values are small (a head is a handful of
 * strings, a preview at most {@link PREVIEW_MAX_CHARS}); the file *bytes*
 * they were derived from are never kept.
 */
const SCAN_MEMO_LIMIT = 4000;

interface ScanMemo<T> {
  /** `hit` distinguishes "not memoised" from "memoised as `undefined`". */
  recall: (key: string) => { hit: boolean; value: T | undefined };
  remember: (key: string, value: T) => void;
}

/**
 * A bounded memo scoped to the module rather than one
 * `scanImportableSessions` call, so a rescan — which a query triggers on
 * every debounced keystroke — reuses what the previous scan already paid to
 * read instead of re-reading the same files on the Electron main thread.
 * Insertion order doubles as recency: a hit is moved to the end, so evicting
 * from the front is an LRU eviction.
 */
function createScanMemo<T>(limit: number): ScanMemo<T> {
  const entries = new Map<string, T>();
  return {
    recall: (key) => {
      if (!entries.has(key)) return { hit: false, value: undefined };
      const value = entries.get(key) as T;
      entries.delete(key);
      entries.set(key, value);
      return { hit: true, value };
    },
    remember: (key, value) => {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > limit) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey !== undefined) entries.delete(oldestKey);
      }
    },
  };
}

/**
 * Keyed by file path + `mtimeMs` + size, so a rewritten transcript is a new
 * key and is read again rather than serving whatever the old bytes said for
 * the life of the main process. Size as well as mtime because a filesystem
 * with a coarse timestamp can report the same tick for two writes close
 * together, and it costs nothing: the `stat` that reports the mtime reports
 * the size in the same call.
 */
function memoKey(file: DiscoveredFile): string {
  return `${file.path}:${file.mtimeMs}:${file.size}`;
}

/** One head per transcript, the candidate pass's whole per-file disk cost. */
const headCache = createScanMemo<SessionHead | undefined>(SCAN_MEMO_LIMIT);
/** One preview per transcript, read only for sessions that reach the page. */
const previewCache = createScanMemo<string>(SCAN_MEMO_LIMIT);
/** A title read is a real file read for Claude (`readClaudeTitle`'s tail seek). */
const titleCache = createScanMemo<string | undefined>(SCAN_MEMO_LIMIT);

interface DiscoveredFile {
  readonly home: ImportHome;
  readonly path: string;
  readonly mtimeMs: number;
  readonly size: number;
}

function walkFiles(root: string, accept: (name: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && accept(entry.name)) found.push(path);
    }
  };
  walk(root);
  return found;
}

function sessionFilesFor(home: ImportHome): string[] {
  const provider = getSessionImportProvider(home.provider);
  return walkFiles(join(home.dir, provider.transcriptRoot), provider.acceptFile);
}

function parseHead(file: DiscoveredFile): SessionHead | undefined {
  const prefix = readPrefix(file.path, HEAD_CHUNK_BYTES).text;
  return prefix
    ? getSessionImportProvider(file.home.provider).readHead(prefix, file.path)
    : undefined;
}

/**
 * The candidate pass's one read per transcript — the single biggest cost of a
 * scan at a few hundred files, and repaid in full on every debounced
 * keystroke before this memo existed.
 */
function readHead(file: DiscoveredFile): SessionHead | undefined {
  const key = memoKey(file);
  const cached = headCache.recall(key);
  if (cached.hit) return cached.value;
  const head = parseHead(file);
  headCache.remember(key, head);
  return head;
}

/**
 * The account a session belongs to. Normally the home it was found in — but a
 * Claude transcript names its owner, and Claude Desktop writes every
 * conversation to the base home whatever login it holds. When that owner is a
 * configured profile, the session is that profile's: it is listed under it and
 * imports there (the transcript gets copied into the profile's home). The home
 * the file sits in wins a tie, so a base-home session whose login also has a
 * profile stays with the base home.
 */
function ownerAgentKind(
  file: DiscoveredFile,
  head: SessionHead,
  homes: readonly ImportHome[],
): string {
  if (!head.accountId || file.home.accountId === head.accountId) return file.home.agentKind;
  const owner = homes.find(
    (home) => home.provider === file.home.provider && home.accountId === head.accountId,
  );
  return owner?.agentKind ?? file.home.agentKind;
}

/**
 * First thing the user actually typed inside `prefix`, or `undefined` when
 * this much of the file held nothing — which is what tells the caller a
 * deeper read might still find something.
 */
function firstUserText(prefix: string, provider: ImportedSessionProvider): string | undefined {
  for (const line of prefix.split(/\r?\n/u)) {
    if (line.length === 0) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const raw = getSessionImportProvider(provider).userText(entry);
    if (raw === undefined) continue;
    const text = getSessionImportProvider(provider).cleanUserText(raw).replace(/\s+/gu, " ").trim();
    if (text.length === 0) continue;
    return text.length > PREVIEW_MAX_CHARS ? `${text.slice(0, PREVIEW_MAX_CHARS)}…` : text;
  }
  return undefined;
}

/**
 * First thing the user actually typed, read from the head of the file only.
 *
 * Reads the same 128 KB the candidate pass read rather than 512 KB outright:
 * a session's first user turn is almost always inside it, so the deep read
 * that exists for the rare transcript whose injected preamble runs past the
 * head chunk is paid only by that transcript. Memoised per transcript so a
 * rescan does not repeat either read.
 */
function readPreview(file: DiscoveredFile): string {
  const key = memoKey(file);
  const cached = previewCache.recall(key);
  if (cached.hit) return cached.value ?? "";
  const head = readPrefix(file.path, HEAD_CHUNK_BYTES);
  let text = firstUserText(head.text, file.home.provider);
  if (text === undefined && head.cut) {
    text = firstUserText(readPrefix(file.path, PREVIEW_CHUNK_BYTES).text, file.home.provider);
  }
  const preview = text ?? "";
  previewCache.remember(key, preview);
  return preview;
}

/**
 * Discover importable transcripts across the given homes, newest first. Never
 * throws: an unreadable file or a missing home is skipped so one bad session
 * cannot hide the rest of a user's history.
 */
export interface ImportScanFacets {
  /** Every provider, account and folder the scan saw, page limit or not. */
  readonly providers: ImportedSessionProvider[];
  readonly accounts: string[];
  readonly folders: string[];
}

export interface ImportScanResult {
  readonly sessions: ImportableSession[];
  readonly facets: ImportScanFacets;
  /** Whether more sessions survived the filters than the page limit could hold. */
  readonly truncated: boolean;
}

interface SessionCandidate {
  readonly file: DiscoveredFile;
  readonly head: SessionHead;
  readonly id: string;
  readonly agentKind: string;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function scanImportableSessions(input: {
  homes: readonly ImportHome[];
  cwd?: string;
  provider?: ImportedSessionProvider;
  agentKind?: string;
  /**
   * Matched case-insensitively against the title (the provider's own index,
   * already cheap) and the folder — never the preview, which would cost a
   * 512 KB read per candidate. Applied before the page is cut so it searches
   * every session the filters allow, not just the returned page.
   */
  query?: string;
  limit?: number;
  /** Injectable so a scan can memoise or fake folder checks. Defaults to `existsSync`. */
  exists?: (path: string) => boolean;
  /** Injectable so folder comparison is testable on any machine. Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
}): ImportScanResult {
  const exists = input.exists ?? existsSync;
  const platform = input.platform ?? process.platform;
  // A scan checks the same cwd repeatedly across sessions that share a
  // folder; the cache is local to this call so a folder created between
  // scans is still seen next time.
  const existsCache = new Map<string, boolean>();
  const cachedExists = (path: string): boolean => {
    let value = existsCache.get(path);
    if (value === undefined) {
      value = exists(path);
      existsCache.set(path, value);
    }
    return value;
  };
  const titleReaders = new Map<string, ReturnType<SessionImportProvider["createTitleReader"]>>();
  const titleFor = (file: DiscoveredFile, sessionId: string): string | undefined => {
    const key = JSON.stringify([file.home.provider, file.home.dir]);
    let readTitle = titleReaders.get(key);
    if (!readTitle) {
      readTitle = getSessionImportProvider(file.home.provider).createTitleReader(file.home.dir);
      titleReaders.set(key, readTitle);
    }
    return readTitle(file.path, sessionId);
  };
  const cachedTitleFor = (candidate: SessionCandidate): string | undefined => {
    if (!getSessionImportProvider(candidate.file.home.provider).titleFromTranscript) {
      return titleFor(candidate.file, candidate.head.providerSessionId);
    }
    const key = memoKey(candidate.file);
    const cached = titleCache.recall(key);
    if (cached.hit) return cached.value;
    const title = titleFor(candidate.file, candidate.head.providerSessionId);
    titleCache.remember(key, title);
    return title;
  };
  const files: DiscoveredFile[] = [];
  for (const home of input.homes) {
    if (input.provider && home.provider !== input.provider) continue;
    for (const path of sessionFilesFor(home)) {
      let stats: import("node:fs").Stats;
      try {
        stats = statSync(path);
      } catch {
        continue;
      }
      files.push({ home, path, mtimeMs: stats.mtimeMs, size: stats.size });
    }
  }
  files.sort((left, right) => right.mtimeMs - left.mtimeMs);

  // Heads first, for every file: they cost a small read each and are what the
  // filters and the facet lists are made of. Reading them all is what lets a
  // folder whose sessions are old still be offered and still be listed — the
  // page limit below counts sessions that survived the filters, so cutting
  // before them would hide most of a quiet folder's history.
  const candidates: SessionCandidate[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const head = readHead(file);
    if (!head) continue;
    if (head.excluded) continue;
    const id = `${file.home.provider}:${head.providerSessionId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    candidates.push({ file, head, id, agentKind: ownerAgentKind(file, head, input.homes) });
  }

  const matchesProvider = (candidate: SessionCandidate) =>
    !input.provider || candidate.file.home.provider === input.provider;
  const matchesAccount = (candidate: SessionCandidate) =>
    !input.agentKind || candidate.agentKind === input.agentKind;
  const matchesCwd = (candidate: SessionCandidate) =>
    !input.cwd || isSameFolderPath(candidate.head.cwd, input.cwd, platform === "win32");
  const query = input.query?.trim().toLowerCase();
  // The folder is already in memory — free to test. Only fall through to the
  // title, a real file read for Claude, when the folder didn't already match.
  const matchesQuery = (candidate: SessionCandidate) =>
    !query ||
    (candidate.head.cwd ?? "").toLowerCase().includes(query) ||
    (cachedTitleFor(candidate) ?? "").toLowerCase().includes(query);

  // Each facet offers the values that still have sessions under the *other*
  // filters, so picking a provider never leaves an unreachable folder listed.
  const under = (...predicates: Array<(candidate: SessionCandidate) => boolean>) =>
    candidates.filter((candidate) => predicates.every((predicate) => predicate(candidate)));
  const facets: ImportScanFacets = {
    providers: sortedUnique(
      under(matchesAccount, matchesCwd).map((candidate) => candidate.file.home.provider),
    ) as ImportedSessionProvider[],
    accounts: sortedUnique(
      under(matchesProvider, matchesCwd).map((candidate) => candidate.agentKind),
    ),
    folders: sortedUnique(
      under(matchesProvider, matchesAccount)
        .map((candidate) => candidate.head.cwd)
        .filter((cwd): cwd is string => cwd !== undefined),
    ),
  };

  const limit = input.limit ?? DEFAULT_LIMIT;
  const survivors = under(matchesProvider, matchesAccount, matchesCwd, matchesQuery);
  const truncated = survivors.length > limit;
  const sessions: ImportableSession[] = [];
  for (const candidate of survivors.slice(0, limit)) {
    const { file, head } = candidate;
    const preview = readPreview(file);
    const title = cachedTitleFor(candidate);
    sessions.push({
      id: candidate.id,
      provider: file.home.provider,
      agentKind: candidate.agentKind,
      providerSessionId: head.providerSessionId,
      path: file.path,
      ...(head.cwd ? { cwd: head.cwd } : {}),
      ...(head.startedAt ? { startedAt: head.startedAt } : {}),
      updatedAt: new Date(file.mtimeMs).toISOString(),
      preview,
      ...(title ? { title } : {}),
      ...(head.model ? { model: head.model } : {}),
      cwdExists: head.cwd !== undefined && cachedExists(head.cwd),
    });
  }
  return { sessions, facets, truncated };
}
