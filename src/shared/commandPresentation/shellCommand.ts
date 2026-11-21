import { splitShellWords } from "./shellSyntax";

const MAX_TITLE_LEN = 120;

const MAX_COMMAND_CACHE_ENTRIES = 512;

const extractedCommandCache = new Map<string, string>();

export function summarizeShellCommand(full: string): string {
  return finalizeTitle(readCachedExtractedCommand(full));
}

export function readCachedExtractedCommand(full: string): string {
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

export function extractShellCommand(full: string): string {
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

function unescapePosixDoubleQuoted(s: string): string {
  return s.replace(/\\([$`"\\])/g, "$1");
}

function extractPowerShellCommandShellWord(s: string): string | null {
  const words = splitShellWords(s);
  const commandIndex = words.findIndex((word) => word.toLowerCase() === "-command");
  const command = commandIndex >= 0 ? words[commandIndex + 1] : undefined;
  return command && command.trim().length > 0 ? command : null;
}

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

function stripLeadingCdSemicolon(s: string): string {
  return s.replace(/^\s*cd\s+(?:"[^"]*"|'[^']*'|[^;]+?)\s*;\s*/i, "").trim();
}

function lastAmpersandSegment(s: string): string | null {
  const parts = s.split(/\s+&&\s+/);
  if (parts.length < 2) return null;
  return parts[parts.length - 1]!.trim();
}

function looksLikeBareExecutable(segment: string): boolean {
  const t = segment.trim();
  return /^"[^"]+\.(exe|bat|cmd)"/i.test(t) && !/\s-Command\b/i.test(t) && !/\s-c\s/i.test(t);
}

function trimCommandCache<T>(cache: Map<string, T>): void {
  while (cache.size > MAX_COMMAND_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}

export function basenameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

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
