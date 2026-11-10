/**
 * Derives a short, human-facing title for verbose shell wrappers (e.g. PowerShell
 * `-Command '…'`, leading `cd … &&`, or `-c "…"`), used in chat command rows.
 */
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import {
  parsePowerShellGetContentView,
  parseSelectObjectLineWindow,
  splitPowerShellPipeline,
  splitPowerShellWords,
  type PowerShellFileView,
} from "./powerShellViewScript";

const MAX_TITLE_LEN = 120;

export type CommandIntentKind =
  | "check"
  | "command"
  | "git"
  | "install"
  | "list"
  | "package"
  | "search"
  | "view";

export interface CommandIntentDisplay {
  title: string;
  kind: CommandIntentKind;
  parts?: { prefix: string; path: string; filePath?: boolean };
}

const MAX_COMMAND_CACHE_ENTRIES = 512;
const extractedCommandCache = new Map<string, string>();
const commandDisplayCache = new Map<string, { locale: string; display: CommandIntentDisplay }>();

export function summarizeShellCommand(full: string): string {
  return finalizeTitle(readCachedExtractedCommand(full));
}

function readCachedExtractedCommand(full: string): string {
  const cached = extractedCommandCache.get(full);
  if (cached !== undefined) {
    extractedCommandCache.delete(full);
    extractedCommandCache.set(full, cached);
    return cached;
  }
  const command = extractShellCommand(full);
  extractedCommandCache.set(full, command);
  trimCommandCache(extractedCommandCache);
  return command;
}

function extractShellCommand(full: string): string {
  const s = full.trim().replace(/\r\n/g, "\n");
  if (!s) return "(command)";

  let work = s;
  for (let i = 0; i < 4; i++) {
    const fromPs = extractPowerShellQuotedCommand(work);
    if (fromPs) return collapseWhitespace(fromPs.trim());

    const fromAnyQuote = extractDashCQuoted(work);
    if (fromAnyQuote) return collapseWhitespace(fromAnyQuote.trim());

    const nextAmp = stripLeadingCdAnd(work);
    const nextSemi = stripLeadingCdSemicolon(work);
    const next = nextAmp !== work ? nextAmp : nextSemi !== work ? nextSemi : work;
    if (next === work) break;
    work = next;
  }

  const tail = lastAmpersandSegment(work);
  if (tail && tail.length < work.length) {
    const nested = extractPowerShellQuotedCommand(tail) ?? extractDashCQuoted(tail) ?? null;
    if (nested) return collapseWhitespace(nested.trim());
    if (!looksLikeBareExecutable(tail)) return collapseWhitespace(tail.trim());
  }

  return collapseWhitespace(work.trim());
}

export function finalizeTitle(s: string): string {
  const t = collapseWhitespace(s.trim());
  if (t.length <= MAX_TITLE_LEN) return t;
  return `${t.slice(0, MAX_TITLE_LEN - 1)}…`;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ");
}

function extractPowerShellQuotedCommand(s: string): string | null {
  const re = /-Command\s+'((?:''|[^'])*)'/i;
  const m = re.exec(s);
  if (m?.[1] != null) {
    const next = s[m.index + m[0].length];
    if (next === "'" || next === '"') {
      const joined = extractPowerShellCommandShellWord(s);
      if (joined) return joined;
    }
    return m[1]!.replace(/''/g, "'");
  }
  const reDq = /-Command\s+"((?:\\.|[^"\\])*)"/i;
  const m2 = reDq.exec(s);
  if (m2?.[1] != null) return unescapePosixDoubleQuoted(m2[1]);
  return null;
}

/**
 * POSIX double-quote unescaping for `pwsh -Command "…"`: backslash is special
 * only before `$`, `` ` ``, `"`, `\` (and newline). Anything else — notably `\n`
 * inside Windows paths like `C:\node` — stays literal.
 */
function unescapePosixDoubleQuoted(s: string): string {
  return s.replace(/\\([$`"\\])/g, "$1");
}

function extractPowerShellCommandShellWord(s: string): string | null {
  const words = splitShellWords(s);
  const commandIndex = words.findIndex((word) => word.toLowerCase() === "-command");
  const command = commandIndex >= 0 ? words[commandIndex + 1] : undefined;
  return command && command.trim().length > 0 ? command : null;
}

/** `-c '…'` / `-c "…"` (pwsh/bash). */
function extractDashCQuoted(s: string): string | null {
  const reSq = /(?:^|[\s;])-[A-Za-z]*c\s+'((?:\\.|[^'])*)'/i;
  const m = reSq.exec(s);
  if (m?.[1] != null) return m[1]!.replace(/\\'/g, "'");
  const reDq = /(?:^|[\s;])-[A-Za-z]*c\s+"((?:\\.|[^"\\])*)"/i;
  const m2 = reDq.exec(s);
  if (m2?.[1] != null) return m2[1]!.replace(/\\"/g, '"');
  return null;
}

function stripLeadingCdAnd(s: string): string {
  return s.replace(/^\s*cd\s+(?:"[^"]*"|'[^']*'|[^&]+?)\s*&&\s*/i, "").trim();
}

/** PowerShell: `cd "…"; command` */
function stripLeadingCdSemicolon(s: string): string {
  return s.replace(/^\s*cd\s+(?:"[^"]*"|'[^']*'|[^;]+?)\s*;\s*/i, "").trim();
}

function lastAmpersandSegment(s: string): string | null {
  const parts = s.split(/\s+&&\s+/);
  if (parts.length < 2) return null;
  return parts[parts.length - 1]!.trim();
}

/** Last `&&` segment is only a quoted exe — keep summarizing outer string. */
function looksLikeBareExecutable(segment: string): boolean {
  const t = segment.trim();
  return /^"[^"]+\.(exe|bat|cmd)"/i.test(t) && !/\s-Command\b/i.test(t) && !/\s-c\s/i.test(t);
}

const CHECK_SCRIPTS = new Set([
  "lint",
  "typecheck",
  "typecheck:compat",
  "test",
  "fmt",
  "format",
  "fmt:check",
]);

/**
 * One-line label for the command row: heuristic “intent” when we recognize the
 * tool, otherwise the shortened shell line. Payload has no separate title field today.
 */
export function humanIntentTitle(fullCommandLine: string): string {
  return commandIntentDisplay(fullCommandLine).title;
}

export function commandIntentDisplay(fullCommandLine: string): CommandIntentDisplay {
  const locale = i18n.locale;
  const cached = commandDisplayCache.get(fullCommandLine);
  if (cached?.locale === locale) {
    commandDisplayCache.delete(fullCommandLine);
    commandDisplayCache.set(fullCommandLine, cached);
    return cached.display;
  }
  const command = readCachedExtractedCommand(fullCommandLine);
  const short = finalizeTitle(command);
  const display = intentFromSummarizedCommand(command) ?? {
    title: `${i18n._(msg`Run`)}: ${short}`,
    kind: "command",
  };
  commandDisplayCache.set(fullCommandLine, { locale, display });
  trimCommandCache(commandDisplayCache);
  return display;
}

function trimCommandCache<T>(cache: Map<string, T>): void {
  while (cache.size > MAX_COMMAND_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}

/** Localized "View" / "View <line-range>" display prefix (line range is data). */
export function viewPrefix(lines?: string): string {
  return lines ? `${i18n._(msg`View`)} ${formatLineRange(lines)}: ` : `${i18n._(msg`View`)}: `;
}

function intentFromSummarizedCommand(t: string): CommandIntentDisplay | null {
  const trimmed = t.trim();

  const powerShellFileView = parsePowerShellGetContentView(trimmed);
  if (powerShellFileView) {
    if (powerShellFileView.aggregateLabel) {
      const prefix = viewPrefix();
      return { title: `${prefix}${powerShellFileView.aggregateLabel}`, kind: "view" };
    }
    const prefix = viewPrefix(powerShellFileView.lines);
    const label = powerShellFileView.lines
      ? powerShellFileView.path
      : basenameFromPath(powerShellFileView.path);
    return {
      title: `${prefix}${label}`,
      parts: {
        prefix,
        path: powerShellFileView.path,
        filePath: !powerShellFileView.path.includes("$"),
      },
      kind: "view",
    };
  }

  const typeCmd = /^type\s+(.+)$/i.exec(trimmed);
  if (typeCmd) {
    const p = typeCmd[1]!.trim().replace(/^['"]|['"]$/g, "");
    const prefix = viewPrefix();
    return {
      title: `${prefix}${basenameFromPath(p)}`,
      parts: { prefix, path: p, filePath: true },
      kind: "view",
    };
  }

  const sedView = parseSedView(trimmed);
  if (sedView) {
    const prefix = viewPrefix(sedView.lines);
    return {
      title: `${prefix}${sedView.path}`,
      parts: { prefix, path: sedView.path },
      kind: "view",
    };
  }

  const pipedFileView = parsePipedFileView(trimmed);
  if (pipedFileView) {
    const prefix = viewPrefix(pipedFileView.lines);
    return {
      title: `${prefix}${pipedFileView.path}`,
      parts: { prefix, path: pipedFileView.path },
      kind: "view",
    };
  }

  const headFileView = parseHeadFileView(trimmed);
  if (headFileView) {
    const prefix = viewPrefix(headFileView.lines);
    return {
      title: `${prefix}${headFileView.path}`,
      parts: { prefix, path: headFileView.path },
      kind: "view",
    };
  }

  const grepFileView = parseGrepLikeFileView(trimmed);
  if (grepFileView) {
    const prefix = viewPrefix(grepFileView.lines);
    const label = grepFileView.lines ? grepFileView.path : basenameFromPath(grepFileView.path);
    return {
      title: `${prefix}${label}`,
      parts: { prefix, path: grepFileView.path, filePath: true },
      kind: "view",
    };
  }

  const grepLike = parseGrepLikeSearch(trimmed);
  if (grepLike) {
    return { title: grepLikeSearchTitle(grepLike), kind: "search" };
  }

  const findSearch = parseFindSearch(trimmed);
  if (findSearch) {
    if (findSearch.pattern) {
      return {
        title: `${i18n._(msg`Search`)}: "${findSearch.pattern}"`,
        kind: "search",
      };
    }
    return {
      title: `${i18n._(msg`Search`)}: ${findSearch.scope}`,
      kind: "search",
    };
  }

  const listDir = parseListDirectory(trimmed);
  if (listDir) {
    return { title: `${i18n._(msg`List`)}: ${listDir}`, kind: "list" };
  }

  const run = /^(pnpm|npm|yarn)\s+run\s+(\S+)/i.exec(trimmed);
  if (run) {
    const pm = run[1]!.toLowerCase();
    const script = run[2]!.replace(/['",]/g, "");
    if (CHECK_SCRIPTS.has(script)) {
      return { title: `${i18n._(msg`Check`)}: ${pm} run ${script}`, kind: "check" };
    }
    return { title: `${i18n._(msg`Run`)}: ${pm} run ${script}`, kind: "command" };
  }

  const packageManager = parsePackageManager(trimmed);
  if (packageManager) return packageManager;

  const exec = /^(pnpm|npm)\s+exec\s+(.+)$/i.exec(trimmed);
  if (exec) {
    const rest = exec[2]!.trim();
    if (/^oxfmt\b/i.test(rest)) return { title: i18n._(msg`Format files`), kind: "command" };
    const shortRest = rest.length > 72 ? `${rest.slice(0, 71)}…` : rest;
    return { title: `${i18n._(msg`Run`)}: ${shortRest}`, kind: "command" };
  }

  if (/^git\s+/i.test(trimmed)) {
    const gitLabel = i18n._(msg`Git`);
    return {
      title:
        trimmed.length > 72 ? `${gitLabel}: ${trimmed.slice(0, 71)}…` : `${gitLabel}: ${trimmed}`,
      kind: "git",
    };
  }

  return null;
}

/**
 * Scope display rule shared with provider-classified actions: an absolute
 * path (drive letter, `/`, `\\`, `~`) shows its basename; anything else shows
 * verbatim.
 */
export function scopeDisplayPath(path: string): string {
  return isAbsoluteScopePath(path) ? basenameFromPath(path) : path;
}

function isAbsoluteScopePath(path: string): boolean {
  return (
    /^[A-Za-z]:[\\/]/.test(path) ||
    path.startsWith("/") ||
    path.startsWith("\\\\") ||
    path.startsWith("~")
  );
}

function grepLikeSearchTitle(search: GrepLikeSearch): string {
  const query = search.patterns[0]!;
  const extra = search.patterns.length > 1 ? ` +${search.patterns.length - 1}` : "";
  const rawScope =
    search.scopes.length === 1 && search.scopes[0] !== "." ? search.scopes[0]! : undefined;
  const scope = rawScope ? scopeDisplayPath(rawScope) : undefined;
  if (scope) return `${i18n._(msg`Search: "${query}" in ${scope}`)}${extra}`;
  return `${i18n._(msg`Search`)}: "${query}"${extra}`;
}

interface SedView {
  path: string;
  lines: string;
}

interface GrepLikeSearch {
  patterns: string[];
  scopes: string[];
}

const GREP_LIKE_EXECUTABLES = new Set([
  "rg",
  "ripgrep",
  "grep",
  "egrep",
  "fgrep",
  "ggrep",
  "rgrep",
]);

const RIPGREP_EXECUTABLES = new Set(["rg", "ripgrep"]);

/** ripgrep options whose separate (non-`=`) form consumes the next word. */
const RIPGREP_VALUE_OPTIONS = new Set([
  "-A",
  "-B",
  "-C",
  "-m",
  "-j",
  "-M",
  "-t",
  "-T",
  "-g",
  "-E",
  "-d",
  "-r",
  "--context",
  "--after-context",
  "--before-context",
  "--max-count",
  "--threads",
  "--max-columns",
  "--type",
  "--type-not",
  "--glob",
  "--iglob",
  "--encoding",
  "--max-depth",
  "--max-filesize",
  "--sort",
  "--sortr",
  "--color",
  "--colors",
  "--context-separator",
  "--field-match-separator",
  "--path-separator",
  "--replace",
  "--pre",
  "--pre-glob",
  "--type-add",
  "--ignore-file",
  "--engine",
]);

/** grep/egrep/fgrep options whose separate (non-`=`) form consumes the next word. */
const GREP_VALUE_OPTIONS = new Set([
  "-A",
  "-B",
  "-C",
  "-m",
  "-d",
  "-D",
  "--context",
  "--after-context",
  "--before-context",
  "--max-count",
  "--include",
  "--exclude",
  "--exclude-dir",
  "--label",
  "--directories",
  "--devices",
  "--color",
]);

/**
 * Whether `word` is an option that consumes the following word as its value.
 * Attached forms (`-C2`, `--context=2`, `--color=auto`) never consume.
 */
function grepLikeOptionConsumesValue(word: string, executable: string): boolean {
  if (word.startsWith("--") && word.includes("=")) return false;
  const options = RIPGREP_EXECUTABLES.has(executable) ? RIPGREP_VALUE_OPTIONS : GREP_VALUE_OPTIONS;
  return options.has(word);
}

interface PipedFileView {
  path: string;
  lines: string;
}

interface FindSearch {
  scope: string;
  pattern: string | undefined;
}

function parseSedView(command: string): SedView | null {
  // Codex commonly batches several reads into one shell invocation:
  // `sed ... first.ts; sed ... second.ts`. Parse only the first statement so
  // its `;` separator does not become part of the displayed path (and turn a
  // highlightable `.ts` extension into the unknown `.ts;` extension).
  const words = splitShellWords(firstShellStatement(command));
  if (words.length < 3) return null;
  const executable = words[0]!.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "sed" && executable !== "gsed") return null;

  let script: string | undefined;
  let path: string | undefined;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") continue;
    if (word === "-e") {
      script = words[++i];
      continue;
    }
    if (word.startsWith("-")) continue;
    if (script === undefined) {
      script = word;
      continue;
    }
    path = word;
    break;
  }

  if (!script || !path || path === "-") return null;
  const range = /^(\d+)(?:,(\d+))?p$/.exec(script.trim());
  if (!range) return null;
  const start = range[1]!;
  const end = range[2];
  return { path, lines: end ? `${start}-${end}` : start };
}

function firstShellStatement(input: string): string {
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === ";") return input.slice(0, i).trim();
  }

  return input;
}

function formatLineRange(lines: string): string {
  return lines.replace(/-/g, ":");
}

function parsePipedFileView(command: string): PipedFileView | null {
  const parts = splitShellPipeline(command);
  if (parts.length < 2) return null;
  const path = extractPipedReadableFilePath(splitShellWords(parts[0]!));
  if (!path) return null;

  const sedPart = parts.find((part, index) => {
    if (index === 0) return false;
    const executable = splitShellWords(part)[0]?.split(/[/\\]/).pop()?.toLowerCase();
    return executable === "sed" || executable === "gsed";
  });
  if (!sedPart) return null;

  const sed = parseSedView(`${sedPart} ${path}`);
  return sed ? { path, lines: sed.lines } : null;
}

/**
 * `head -100 file`, `head -n 40 file`, or `cat file | head -100`. `head` always
 * reads from the top, so the window is `1..N` (default 10). Byte windows (`-c`)
 * aren't line-addressable and fall through to the generic command label.
 */
function parseHeadFileView(command: string): PipedFileView | null {
  const parts = splitShellPipeline(command);
  // A filter between the reader and head (`cat f | grep x | head`) changes what
  // head sees, so only the direct `<reader> | head` and bare `head file` forms
  // map cleanly to a 1..N window of a single file. An empty pipeline (blank or
  // pipe-only command) has no segment to inspect.
  if (parts.length === 0 || parts.length > 2) return null;
  const invocation = parseHeadInvocation(splitShellWords(parts[parts.length - 1]!));
  if (!invocation) return null;

  const path =
    parts.length === 2 ? extractPipedReadableFilePath(splitShellWords(parts[0]!)) : invocation.path;
  if (!path) return null;
  return { path, lines: invocation.lines };
}

function parseHeadInvocation(words: string[]): { path: string | undefined; lines: string } | null {
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "head" && executable !== "ghead") return null;

  let count = 10; // `head`'s default line count
  let path: string | undefined;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") {
      path = words[i + 1] ?? path;
      break;
    }
    const legacy = /^-(\d+)$/.exec(word);
    if (legacy) {
      count = Number(legacy[1]);
      continue;
    }
    if (word === "-n" || word === "--lines") {
      const value = readNonNegativeInteger(words[++i]);
      if (value === undefined) return null;
      count = value;
      continue;
    }
    const attached = /^-n(\d+)$/.exec(word) ?? /^--lines=(\d+)$/.exec(word);
    if (attached) {
      count = Number(attached[1]);
      continue;
    }
    // Byte windows aren't line-addressable (covers -c, -c200, -c-200, --bytes, --bytes=N).
    if (/^-c/.test(word) || /^--bytes(=|$)/.test(word)) return null;
    if (word === "-") continue; // explicit stdin
    if (/^\d*>/.test(word)) continue; // shell redirection (e.g. 2>/dev/null), not a path
    if (word.startsWith("-")) continue; // -q/-v/-z and other flags
    // First file operand. Keep scanning so trailing flags still apply (GNU permutes
    // operands and options, e.g. `head file -n 40`).
    if (path === undefined) path = word;
  }

  if (count <= 0) return null;
  return { path, lines: count === 1 ? "1" : `1-${count}` };
}

function parseGrepLikeFileView(command: string): PowerShellFileView | null {
  const parts = splitPowerShellPipeline(command);
  const words = splitPowerShellWords(parts[0] ?? command);
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase() ?? "";
  const path = extractGrepLikeFileViewPath(words, executable);
  if (!path) return null;

  const lines = parts
    .slice(1)
    .map((part) => parseSelectObjectLineWindow(splitPowerShellWords(part)))
    .find((lineWindow): lineWindow is string => !!lineWindow);
  return { path, ...(lines ? { lines } : {}) };
}

function extractGrepLikeFileViewPath(words: string[], executable: string): string | undefined {
  if (!executable || !GREP_LIKE_EXECUTABLES.has(executable)) return undefined;

  const patterns: string[] = [];
  const paths: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") {
      if (patterns.length === 0) {
        const next = words[++i];
        if (next) patterns.push(next);
      } else {
        paths.push(...words.slice(i + 1));
      }
      break;
    }
    if (word === "-e" || word === "--regexp" || word === "-f" || word === "--file") {
      const value = words[++i];
      if (value) patterns.push(value);
      continue;
    }
    if (word.startsWith("--regexp=")) {
      patterns.push(word.slice("--regexp=".length));
      continue;
    }
    if (word.startsWith("--file=")) {
      patterns.push(word.slice("--file=".length));
      continue;
    }
    if (grepLikeOptionConsumesValue(word, executable)) {
      i++;
      continue;
    }
    if (word.startsWith("-")) continue;
    if (patterns.length === 0) {
      patterns.push(word);
      continue;
    }
    paths.push(word);
  }

  const pattern = patterns[0];
  return pattern && isAllLinesRegex(pattern) && paths.length === 1 ? paths[0] : undefined;
}

function isAllLinesRegex(pattern: string): boolean {
  return pattern.replace(/^'+/u, "") === "^";
}

function readNonNegativeInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

function extractPipedReadableFilePath(words: string[]): string | undefined {
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "cat" && executable !== "type" && executable !== "nl") return undefined;

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") return words[i + 1];
    if (word.startsWith("-")) {
      if (executable === "nl" && consumesNlOptionValue(word)) i++;
      continue;
    }
    if (/^\d*>/.test(word)) continue;
    return word;
  }
  return undefined;
}

function consumesNlOptionValue(option: string): boolean {
  return (
    /^-(b|d|f|h|i|l|n|s|v|w)$/.test(option) ||
    /^--(body-numbering|section-delimiter|footer-numbering|header-numbering|line-increment|join-blank-lines|number-format|number-separator|starting-line-number|number-width)$/.test(
      option,
    )
  );
}

function parseGrepLikeSearch(command: string): GrepLikeSearch | null {
  const words = splitShellWords(splitShellPipeline(command)[0] ?? command);
  if (words.length < 2) return null;
  const executable = words[0]!.split(/[/\\]/).pop()?.toLowerCase();
  if (!executable || !GREP_LIKE_EXECUTABLES.has(executable)) return null;

  const patterns: string[] = [];
  const paths: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") {
      if (patterns.length === 0) {
        const next = words[++i];
        if (next) patterns.push(next);
      } else {
        paths.push(...words.slice(i + 1));
      }
      break;
    }
    if (word === "-e" || word === "--regexp" || word === "-f" || word === "--file") {
      const value = words[++i];
      if (value) patterns.push(value);
      continue;
    }
    if (word.startsWith("--regexp=")) {
      patterns.push(word.slice("--regexp=".length));
      continue;
    }
    if (word.startsWith("--file=")) {
      patterns.push(word.slice("--file=".length));
      continue;
    }
    if (grepLikeOptionConsumesValue(word, executable)) {
      i++;
      continue;
    }
    if (word.startsWith("-")) continue;
    if (patterns.length === 0) {
      patterns.push(word);
      continue;
    }
    paths.push(word);
  }

  if (patterns.length === 0) return null;
  return { patterns, scopes: paths };
}

function parseFindSearch(command: string): FindSearch | null {
  const words = splitShellWords(splitShellPipeline(command)[0] ?? command);
  if (words.length < 2) return null;
  const executable = words[0]!.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "find" && executable !== "gfind") return null;

  const scopes: string[] = [];
  let pattern: string | undefined;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "-name" || word === "-iname" || word === "-path" || word === "-regex") {
      pattern = words[++i];
      continue;
    }
    if (word.startsWith("-")) {
      const nextConsumesValue =
        word === "-maxdepth" ||
        word === "-mindepth" ||
        word === "-type" ||
        word === "-perm" ||
        word === "-mtime" ||
        word === "-size";
      if (nextConsumesValue) i++;
      continue;
    }
    if (word === "-o" || word === "(" || word === ")") continue;
    if (!word.startsWith("!")) scopes.push(word);
  }

  if (scopes.length === 0) return null;
  return { scope: scopes.join(" "), pattern };
}

function parseListDirectory(command: string): string | null {
  const words = splitShellWords(splitShellPipeline(command)[0] ?? command);
  if (words.length < 2) return null;
  const executable = words[0]!.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "ls" && executable !== "dir") return null;

  const path = words.find((word, index) => index > 0 && !word.startsWith("-"));
  return path ?? ".";
}

function parsePackageManager(command: string): CommandIntentDisplay | null {
  const words = splitShellWords(command);
  if (words.length < 1) return null;
  const pm = words[0]?.toLowerCase();
  if (pm !== "pnpm" && pm !== "npm" && pm !== "yarn") return null;
  const firstArg = words[1]?.toLowerCase();
  if (firstArg === "--version" || firstArg === "-v") {
    return { title: `${i18n._(msg`Package manager`)}: ${pm} ${firstArg}`, kind: "package" };
  }

  const sub = words.find((word, index) => index > 0 && !word.startsWith("-"))?.toLowerCase();
  if (!sub) return null;
  if (sub === "install" || sub === "add") {
    return { title: `${i18n._(msg`Install packages`)}: ${pm} ${sub}`, kind: "install" };
  }
  if (sub === "list" || sub === "ls") {
    return { title: `${i18n._(msg`List packages`)}: ${pm} ${sub}`, kind: "list" };
  }
  if (sub === "config") {
    const action = words.find((word, index) => index > 1 && !word.startsWith("-")) ?? "";
    const configLabel = i18n._(msg`Package config`);
    return {
      title: action ? `${configLabel}: ${pm} config ${action}` : `${configLabel}: ${pm}`,
      kind: "package",
    };
  }
  if (sub === "version") {
    return { title: `${i18n._(msg`Package manager`)}: ${pm} ${sub}`, kind: "package" };
  }
  return null;
}

function splitShellPipeline(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const ch of command) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      current += ch;
      quote = ch;
      continue;
    }
    if (ch === "|") {
      const part = current.trim();
      if (part.length > 0) parts.push(part);
      current = "";
      continue;
    }
    current += ch;
  }

  const tail = current.trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}

function splitShellWords(input: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (current.length > 0) words.push(current);
  return words;
}

export function basenameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
