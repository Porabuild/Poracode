/**
 * Project-scoped `file:line[:column]` links for real terminal (PTY) output.
 *
 * `TerminalLinkProvider` renders these as an additive layer on top of the
 * wrapped HTTP URL links. A match is only turned into a link when it resolves
 * *inside the terminal's own project/worktree roots*: we reuse the existing
 * project-relative file-editor action (`openFileInEditor`) so a relative path
 * is read through the contained `readProjectFile` IPC. Absolute compiler paths
 * are relativized against the permitted root; protocol-looking text, `..`
 * traversal, and out-of-root paths are rejected. A terminal with no project
 * produces no file links and keeps URL-only behavior.
 */

import type { Project, ProjectLocation } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { getBasename, normalizeWindowsDrivePath } from "@/shared/pathUtils";
import { resolveProjectLocation } from "@/shared/worktree";
import { useAppStore } from "@/renderer/state/appStore";
import { getProjectMap, getThreadMap } from "@/renderer/state/useThread";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";

/** Upper bound for a line/column number (compiler output uses 1-based values). */
export const MAX_LINE_COLUMN = 999_999;

/** A project/worktree root in its native form plus the host's case rule. */
export interface ProjectRoot {
  path: string;
  caseInsensitive: boolean;
}

/** A validated, project-relative file reference found in a line of text. */
export interface TerminalFileRef {
  /** Offset of the link text's first character within the scanned line. */
  start: number;
  /** Exact visible link text (e.g. `src/foo.ts:12:5`). */
  text: string;
  /** Validated project-relative POSIX path passed to the file editor. */
  path: string;
  line: number;
  column?: number;
}

/** Injected into `TerminalLinkProvider` as its optional file-link layer. */
export interface TerminalFileLinkSource {
  findRefs(text: string): readonly TerminalFileRef[];
  activate(ref: TerminalFileRef): void;
}

interface TerminalProjectScope {
  project: Project;
  worktreePath?: string;
  worktreeBranch?: string;
  location: ProjectLocation;
}

/**
 * Immutable project/worktree identity supplied by a caller whose PTY is not a
 * Thread row (a DevTerminal tab shell opened via `terminal.toggle` /
 * `terminal.command.run`). The terminal's own scope, captured at mount — never
 * the currently selected project. Resolved by `projectId` at activation.
 */
export interface TerminalProjectFileScope {
  projectId: string;
  worktreePath?: string;
  worktreeBranch?: string;
}

// A maximal run of characters that could form a compiler `path:line[:column]`
// token. Whitespace, brackets and punctuation delimit candidates; the trailing
// `:line[:column]` and the validation below decide whether it is really a link.
const TOKEN_CHARS = /[A-Za-z0-9_@./\\:~-]+/g;
// Trailing `:line[:column]` with positive, bounded (1..999999) numbers.
const LINE_COLUMN_RE = /:([1-9]\d{0,5})(?::([1-9]\d{0,5}))?$/;
// A file name must end in an extension whose first character is a letter.
const FILE_EXTENSION_RE = /\.[A-Za-z][A-Za-z0-9]*$/;
// A leading `scheme:` of two or more letters, or any embedded `://`.
const PROTOCOL_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
// A Windows drive-absolute path (`C:\...` / `C:/...`) is not a URI scheme.
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/](?![\\/])/;
// A `..` segment anywhere in the path.
const TRAVERSAL_RE = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
// A Unicode letter/number adjacent to an ASCII token means TOKEN_CHARS split a
// non-Latin path-like run (e.g. `src/文件.ts:12` → `src/` + `.ts:12`). Reject
// such fragments so a partial token never becomes a bogus link.
const UNICODE_WORD_RE = /[\p{L}\p{N}]/u;

/** Require a clean token boundary (not glued to non-Latin prose/path chars). */
function hasCleanBoundaries(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : undefined;
  const after = end < text.length ? text[end] : undefined;
  if (before && UNICODE_WORD_RE.test(before)) return false;
  if (after && UNICODE_WORD_RE.test(after)) return false;
  return true;
}

/** Normalize separators to `/`, preserving a leading UNC `//`. */
function normalizeSlashes(value: string): string {
  const converted = normalizeWindowsDrivePath(value).replace(/\\/g, "/");
  const isUnc = converted.startsWith("//");
  const collapsed = converted.replace(/\/{2,}/g, "/");
  return isUnc ? `/${collapsed}` : collapsed;
}

/** Permitted roots for the terminal's effective (worktree-aware) location. */
export function permittedRoots(location: ProjectLocation): ProjectRoot[] {
  if (location.kind === "wsl") {
    return [
      { path: location.linuxPath, caseInsensitive: false },
      { path: location.uncPath, caseInsensitive: true },
    ];
  }
  return [{ path: location.path, caseInsensitive: location.kind === "windows" }];
}

/** Build a worktree-aware scope from an already-resolved project record. */
function scopeFor(
  project: Project,
  worktreePath?: string,
  worktreeBranch?: string,
): TerminalProjectScope {
  return {
    project,
    location: resolveProjectLocation(project.location, worktreePath),
    ...(worktreePath ? { worktreePath } : {}),
    ...(worktreeBranch ? { worktreeBranch } : {}),
  };
}

/**
 * Resolve the project/worktree that actually owns this PTY, from its thread
 * record — never the currently selected project. Returns null for plain
 * terminals (no thread/project) and Home, which keep URL-only behavior.
 */
export function resolveTerminalProjectScope(terminalId: string): TerminalProjectScope | null {
  const state = useAppStore.getState();
  const thread = getThreadMap(state.threads).get(terminalId);
  if (!thread?.projectId || isHomeProjectId(thread.projectId)) return null;
  const project = getProjectMap(state.projects).get(thread.projectId);
  if (!project || isHomeProjectId(project.id)) return null;
  return scopeFor(project, thread.worktreePath, thread.worktreeBranch);
}

/**
 * Resolve a DevTerminal tab shell from its explicit, immutable scope. The
 * project is looked up by THIS id (never the selected project); Home and an
 * unresolvable id keep URL-only behavior. Used when `terminalId` is a
 * `shell:<uuid>` rather than a thread id.
 */
export function resolveExplicitProjectScope(
  scope: TerminalProjectFileScope,
): TerminalProjectScope | null {
  if (!scope.projectId || isHomeProjectId(scope.projectId)) return null;
  const project = getProjectMap(useAppStore.getState().projects).get(scope.projectId);
  if (!project || isHomeProjectId(project.id)) return null;
  return scopeFor(project, scope.worktreePath, scope.worktreeBranch);
}

/** Whether `rawPath` looks like a URI/protocol rather than a filesystem path. */
function isProtocolLooking(rawPath: string): boolean {
  if (WINDOWS_DRIVE_RE.test(rawPath)) return false;
  return PROTOCOL_RE.test(rawPath) || rawPath.includes("://");
}

interface NormalizedRoot {
  normalized: string;
  caseInsensitive: boolean;
}

function normalizeRoot(root: ProjectRoot): NormalizedRoot {
  return {
    normalized: normalizeSlashes(root.path).replace(/\/+$/, ""),
    caseInsensitive: root.caseInsensitive,
  };
}

function isInsideRoot(path: string, root: NormalizedRoot): boolean {
  if (!root.normalized) return false;
  const candidate = root.caseInsensitive ? path.toLowerCase() : path;
  const base = root.caseInsensitive ? root.normalized.toLowerCase() : root.normalized;
  return candidate === base || candidate.startsWith(`${base}/`);
}

/**
 * Validate a matched path and return a project-relative POSIX path that is safe
 * to open through the file editor, or null when it must be rejected.
 */
function scopePath(rawPath: string, roots: readonly NormalizedRoot[]): string | null {
  if (isProtocolLooking(rawPath)) return null;

  let path = normalizeSlashes(rawPath);
  if (TRAVERSAL_RE.test(path)) return null;
  if (path.startsWith("~")) return null;
  while (path.startsWith("./")) path = path.slice(2);
  const basename = getBasename(path);
  const extMatch = FILE_EXTENSION_RE.exec(basename);
  // Require a non-empty stem. A bare `.ts`/`.json` is a fragment of a token that
  // TOKEN_CHARS split on a non-Latin char (e.g. `src/文件.ts:12`), not a file.
  if (!path || !extMatch || extMatch.index === 0) return null;

  const isDriveAbsolute = /^[A-Za-z]:\//.test(path);
  const isUnc = path.startsWith("//");
  const isPosixAbsolute = path.startsWith("/") && !isDriveAbsolute && !isUnc;

  if (isDriveAbsolute || isUnc || isPosixAbsolute) {
    const root = roots.find((candidate) => isInsideRoot(path, candidate));
    if (!root) return null; // absolute path outside the terminal's permitted roots
    const relative = path.slice(root.normalized.length).replace(/^\/+/, "");
    return relative || null;
  }
  // A relative path is inherently within the project root: the file editor reads
  // it through the contained `readProjectFile` IPC, never the external reader.
  return path.startsWith("/") ? null : path;
}

/**
 * Find validated `file:line[:column]` references in one line of ANSI-stripped
 * terminal text. Offsets are relative to `text` so the link provider can map
 * them back to buffer coordinates (reusing its wrapped/ANSI-aware mapper).
 */
export function findProjectFileRefs(
  text: string,
  roots: readonly ProjectRoot[],
): TerminalFileRef[] {
  if (!roots.length) return [];
  const normalizedRoots = roots.map(normalizeRoot);
  const tokenRe = new RegExp(TOKEN_CHARS.source, "g");
  const refs: TerminalFileRef[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text))) {
    const raw = match[0];
    // A token glued to non-Latin prose is a fragment of a larger path-like run
    // that TOKEN_CHARS split; never link the fragment (e.g. `.ts:12` from
    // `src/文件.ts:12`).
    if (!hasCleanBoundaries(text, match.index, match.index + raw.length)) continue;
    // Compiler output such as `src/foo.c:12:5: error` carries a trailing colon;
    // keep it out of the link text while still accepting the `:line[:column]`.
    const token = raw.replace(/[:.]+$/, "");
    const lineMatch = LINE_COLUMN_RE.exec(token);
    if (!lineMatch) continue;

    const line = Number.parseInt(lineMatch[1]!, 10);
    const column = lineMatch[2] ? Number.parseInt(lineMatch[2]!, 10) : undefined;
    if (line < 1 || line > MAX_LINE_COLUMN) continue;
    if (column !== undefined && (column < 1 || column > MAX_LINE_COLUMN)) continue;

    const path = scopePath(token.slice(0, lineMatch.index), normalizedRoots);
    if (!path) continue;

    refs.push({
      start: match.index,
      text: token,
      path,
      line,
      ...(column !== undefined ? { column } : {}),
    });
  }
  return refs;
}

/**
 * Build the file-link layer for one terminal. Thread-backed terminals resolve
 * their scope from the thread row; callers whose PTY is a DevTerminal tab shell
 * pass an explicit, immutable scope instead. Both paths resolve the Project by
 * the terminal's own id — never the selected project — and are read lazily so a
 * project that loads after mount still links correctly.
 */
export function createTerminalFileLinkSource(
  terminalId: string,
  explicitScope?: TerminalProjectFileScope,
): TerminalFileLinkSource {
  const resolveScope = () =>
    explicitScope
      ? resolveExplicitProjectScope(explicitScope)
      : resolveTerminalProjectScope(terminalId);
  return {
    findRefs(text) {
      const scope = resolveScope();
      if (!scope) return [];
      return findProjectFileRefs(text, permittedRoots(scope.location));
    },
    activate(ref) {
      const scope = resolveScope();
      if (!scope) return;
      // Column is parsed but the editor's reveal is line-only; open at the line.
      void openFileInEditor(
        scope.project,
        scope.worktreePath,
        scope.worktreeBranch,
        ref.path,
        ref.line,
      );
    },
  };
}
