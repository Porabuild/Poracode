/**
 * Derives a short, human-facing title for verbose shell wrappers (e.g. PowerShell
 * `-Command '…'`, leading `cd … &&`, or `-c "…"`), used in chat command rows.
 */
import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";

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

export function summarizeShellCommand(full: string): string {
  return finalizeTitle(extractShellCommand(full));
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

function finalizeTitle(s: string): string {
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
  if (m?.[1] != null) return m[1]!.replace(/''/g, "'");
  const reDq = /-Command\s+"((?:\\.|[^"\\])*)"/i;
  const m2 = reDq.exec(s);
  if (m2?.[1] != null) return m2[1]!.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  return null;
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
  const command = extractShellCommand(fullCommandLine);
  const short = finalizeTitle(command);
  return (
    intentFromSummarizedCommand(command) ?? {
      title: `${i18n._(msg`Run`)}: ${short}`,
      kind: "command",
    }
  );
}

/** Localized "View" / "View <line-range>" display prefix (line range is data). */
function viewPrefix(lines?: string): string {
  return lines ? `${i18n._(msg`View`)} ${formatLineRange(lines)}: ` : `${i18n._(msg`View`)}: `;
}

function intentFromSummarizedCommand(t: string): CommandIntentDisplay | null {
  const trimmed = t.trim();

  const powerShellFileView = parsePowerShellGetContentView(trimmed);
  if (powerShellFileView) {
    const prefix = viewPrefix(powerShellFileView.lines);
    const label = powerShellFileView.lines
      ? powerShellFileView.path
      : basenameFromPath(powerShellFileView.path);
    return {
      title: `${prefix}${label}`,
      parts: { prefix, path: powerShellFileView.path, filePath: true },
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
    return {
      title: `${i18n._(msg`Search`)}: "${grepLike.pattern}"`,
      kind: "search",
    };
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

interface SedView {
  path: string;
  lines: string;
}

interface GrepLikeSearch {
  pattern: string;
  scope: string | undefined;
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

interface PipedFileView {
  path: string;
  lines: string;
}

interface PowerShellFileView {
  path: string;
  lines?: string;
}

interface FindSearch {
  scope: string;
  pattern: string | undefined;
}

function parseSedView(command: string): SedView | null {
  const words = splitShellWords(command);
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

function formatLineRange(lines: string): string {
  return lines.replace("-", ":");
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

function parseGrepLikeFileView(command: string): PowerShellFileView | null {
  const parts = splitPowerShellPipeline(command);
  const path = extractGrepLikeFileViewPath(splitPowerShellWords(parts[0] ?? command));
  if (!path) return null;

  const lines = parts
    .slice(1)
    .map((part) => parseSelectObjectLineWindow(splitPowerShellWords(part)))
    .find((lineWindow): lineWindow is string => !!lineWindow);
  return { path, ...(lines ? { lines } : {}) };
}

function parsePowerShellGetContentView(command: string): PowerShellFileView | null {
  const indexedView = parsePowerShellIndexedGetContentView(command);
  if (indexedView) return indexedView;

  const parts = splitPowerShellPipeline(command);
  const path = extractPowerShellGetContentPath(splitPowerShellWords(parts[0] ?? command));
  if (!path) return null;

  const lines = parts
    .slice(1)
    .map((part) => parseSelectObjectLineWindow(splitPowerShellWords(part)))
    .find((lineWindow): lineWindow is string => !!lineWindow);
  return { path, ...(lines ? { lines } : {}) };
}

function parsePowerShellIndexedGetContentView(command: string): PowerShellFileView | null {
  const match =
    /^\s*(\$\w+)\s*=\s*((?:Get-Content|gc)\b.*?)\s*;\s*(\$\w+)\s*\[\s*(\d+)\s*\.\.\s*(\d+)\s*\]/i.exec(
      command,
    );
  if (!match || match[1]!.toLowerCase() !== match[3]!.toLowerCase()) return null;

  const path = extractPowerShellGetContentPath(splitPowerShellWords(match[2]!));
  const startIndex = readNonNegativeInteger(match[4]);
  const endIndex = readNonNegativeInteger(match[5]);
  if (!path || startIndex === undefined || endIndex === undefined || endIndex < startIndex)
    return null;

  return { path, lines: `${startIndex + 1}-${endIndex + 1}` };
}

function extractGrepLikeFileViewPath(words: string[]): string | undefined {
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase();
  if (!executable || !GREP_LIKE_EXECUTABLES.has(executable)) return undefined;

  let pattern: string | undefined;
  const paths: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") {
      if (pattern === undefined) {
        pattern = words[++i];
      } else {
        paths.push(...words.slice(i + 1));
      }
      break;
    }
    if (word === "-e" || word === "--regexp" || word === "-f" || word === "--file") {
      pattern = words[++i] ?? pattern;
      continue;
    }
    if (word.startsWith("--regexp=")) {
      pattern = word.slice("--regexp=".length);
      continue;
    }
    if (word.startsWith("--file=")) {
      pattern = word.slice("--file=".length);
      continue;
    }
    if (word === "-g" || word === "--glob" || word === "--type" || word === "-t") {
      i++;
      continue;
    }
    if (word.startsWith("-")) continue;
    if (pattern === undefined) {
      pattern = word;
      continue;
    }
    paths.push(word);
  }

  return pattern && isAllLinesRegex(pattern) && paths.length === 1 ? paths[0] : undefined;
}

function isAllLinesRegex(pattern: string): boolean {
  return pattern.replace(/^'+/u, "") === "^";
}

function extractPowerShellGetContentPath(words: string[]): string | undefined {
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "get-content" && executable !== "gc") return undefined;

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const lower = word.toLowerCase();
    if (lower === "-path" || lower === "-literalpath") return words[i + 1];
    if (lower.startsWith("-path:")) return word.slice("-Path:".length);
    if (lower.startsWith("-literalpath:")) return word.slice("-LiteralPath:".length);
    if (word.startsWith("-")) {
      if (getContentOptionConsumesValue(lower)) i++;
      continue;
    }
    return word;
  }
  return undefined;
}

function getContentOptionConsumesValue(option: string): boolean {
  return (
    option === "-encoding" ||
    option === "-filter" ||
    option === "-include" ||
    option === "-exclude" ||
    option === "-readcount" ||
    option === "-totalcount" ||
    option === "-tail" ||
    option === "-delimiter" ||
    option === "-stream" ||
    option === "-credential"
  );
}

function parseSelectObjectLineWindow(words: string[]): string | undefined {
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "select-object" && executable !== "select") return undefined;

  let skip = 0;
  let first: number | undefined;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const lower = word.toLowerCase();
    if (lower === "-skip") {
      skip = readNonNegativeInteger(words[++i]) ?? skip;
      continue;
    }
    if (lower.startsWith("-skip:")) {
      skip = readNonNegativeInteger(word.slice("-Skip:".length)) ?? skip;
      continue;
    }
    if (lower === "-first") {
      first = readNonNegativeInteger(words[++i]) ?? first;
      continue;
    }
    if (lower.startsWith("-first:")) {
      first = readNonNegativeInteger(word.slice("-First:".length)) ?? first;
    }
  }
  if (first === undefined) return undefined;
  const start = skip + 1;
  return `${start}-${start + first - 1}`;
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

  let pattern: string | undefined;
  const paths: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    if (word === "--") {
      if (pattern === undefined) {
        pattern = words[++i];
      } else {
        paths.push(...words.slice(i + 1));
      }
      break;
    }
    if (word === "-e" || word === "--regexp" || word === "-f" || word === "--file") {
      pattern = words[++i] ?? pattern;
      continue;
    }
    if (word.startsWith("--regexp=")) {
      pattern = word.slice("--regexp=".length);
      continue;
    }
    if (word.startsWith("--file=")) {
      pattern = word.slice("--file=".length);
      continue;
    }
    if (word === "-g" || word === "--glob" || word === "--type" || word === "-t") {
      i++;
      continue;
    }
    if (word.startsWith("-")) continue;
    if (pattern === undefined) {
      pattern = word;
      continue;
    }
    paths.push(word);
  }

  if (!pattern) return null;
  return { pattern, scope: paths.length > 0 ? paths.join(" ") : undefined };
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

function splitPowerShellPipeline(command: string): string[] {
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
    if (ch === "`") {
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

function splitPowerShellWords(input: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "`") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (quote === "'" && ch === "'" && input[i + 1] === "'") {
        current += "'";
        i++;
        continue;
      }
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

function basenameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
