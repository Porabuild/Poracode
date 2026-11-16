/**
 * PowerShell command-text scanning and `Get-Content` view-script
 * classification for chat command rows.
 *
 * A multi-statement PowerShell script counts as a "view" only when every
 * top-level statement is a path assignment, a Get-Content pipeline (optional
 * Select-Object tail), or an output expression built from allowlisted
 * cmdlets. Anything else (Get-ChildItem, rg, git, …) makes the whole command
 * a `Run:` row.
 *
 * Self-contained: imports nothing from sibling modules so `commandSummary`
 * can depend on this file without a cycle.
 */

export interface PowerShellFileView {
  path: string;
  lines?: string;
  /** Multi-file script view: render `View: <aggregateLabel>` with no parts. */
  aggregateLabel?: string;
}

const PS_GET_CONTENT_COMMAND = /^(?:Get-Content|gc)\b/i;
const PS_SELECT_COMMAND = /^(?:Select-Object|select)\b/i;

/** Cmdlets allowed inside a PowerShell view script (spec E.5 allowlist). */
const PS_VIEW_CMDLETS = new Set([
  "get-content",
  "gc",
  "select-object",
  "select",
  "join-path",
  "get-location",
  "write-output",
  "write-host",
  "echo",
  "out-string",
  "foreach-object",
]);

/** Language keywords permitted in view-script control flow. */
const PS_VIEW_KEYWORDS = new Set([
  "foreach",
  "for",
  "if",
  "elseif",
  "else",
  "while",
  "do",
  "until",
  "switch",
  "try",
  "catch",
  "finally",
  "return",
  "throw",
  "begin",
  "process",
  "end",
  "param",
  "function",
  "filter",
  "data",
  "dynamicparam",
  "in",
  "trap",
  "using",
  "var",
  "break",
  "continue",
  "exit",
]);

type PsViewStatement =
  | { assignPath: { name: string; path: string } }
  | { content: { paths: string[]; lines?: string }; contentVar?: string }
  | { expression: true };

export function parsePowerShellGetContentView(command: string): PowerShellFileView | null {
  const indexedView = parsePowerShellIndexedGetContentView(command);
  if (indexedView) return indexedView;
  return parsePowerShellScriptGetContentView(command);
}

function parsePowerShellScriptGetContentView(command: string): PowerShellFileView | null {
  const statements = splitPsTopLevel(command, isPsStatementSeparator, { comments: true });
  const variables = new Map<string, string>();
  const paths: string[] = [];
  let selectLines: string | undefined;
  let contentVar: string | undefined;

  for (const rawStatement of statements) {
    const statement = rawStatement.trim();
    if (!statement) continue;
    const classified = classifyPowerShellViewStatement(statement, variables);
    if (!classified) return null;
    if ("assignPath" in classified) {
      variables.set(classified.assignPath.name, classified.assignPath.path);
      continue;
    }
    if ("content" in classified) {
      paths.push(...classified.content.paths);
      if (classified.content.lines && selectLines === undefined) {
        selectLines = classified.content.lines;
      }
      if (classified.contentVar) contentVar = classified.contentVar;
    }
  }

  if (paths.length === 0) return null;
  if (paths.some((path) => !isResolvedPsViewPath(path))) return null;
  if (paths.length > 1) {
    return {
      path: "",
      aggregateLabel: paths.map((path) => basenameFromPath(path)).join(", "),
    };
  }
  const path = paths[0]!;
  const lines =
    selectLines ??
    parsePowerShellForeachLineRanges(command) ??
    parsePowerShellSliceLines(command, contentVar);
  return { path, ...(lines ? { lines } : {}) };
}

function classifyPowerShellViewStatement(
  statement: string,
  variables: ReadonlyMap<string, string>,
): PsViewStatement | null {
  const assignment = /^(\$\w+)\s*=(?!=)\s*([\s\S]+)$/.exec(statement);
  if (assignment) {
    const name = assignment[1]!.slice(1).toLowerCase();
    const rhs = assignment[2]!.trim();
    const content = parsePsGetContentPipeline(rhs, variables);
    if (content === null) return null;
    if (content) return { content, contentVar: name };
    const path = resolvePsPathExpr(rhs, variables);
    if (path !== undefined && isResolvedPsViewPath(path) && !isBarePsCmdletPath(path)) {
      return { assignPath: { name, path } };
    }
    return null;
  }

  const content = parsePsGetContentPipeline(statement, variables);
  if (content === null) return null;
  if (content) return { content };
  return isAllowedPsOutputExpr(statement) ? { expression: true } : null;
}

/**
 * Parses `Get-Content <args> (| Select-Object <args>)*`. Returns `undefined`
 * when the input does not start with Get-Content/gc, `null` when it is a
 * Get-Content pipeline that cannot be fully understood (bad path operand or a
 * non-Select pipeline stage — the whole script then fails the view check).
 */
function parsePsGetContentPipeline(
  input: string,
  variables: ReadonlyMap<string, string>,
): { paths: string[]; lines?: string } | null | undefined {
  const segments = splitPowerShellPipeline(input);
  const head = segments[0];
  if (!head || !PS_GET_CONTENT_COMMAND.test(head)) return undefined;

  const tokens = splitPsExprWords(head);
  let operand: string | undefined;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    const lower = token.toLowerCase();
    if (lower === "-path" || lower === "-literalpath") {
      operand = tokens[++i];
      break;
    }
    if (lower.startsWith("-literalpath:")) {
      operand = token.slice("-LiteralPath:".length);
      break;
    }
    if (lower.startsWith("-path:")) {
      operand = token.slice("-Path:".length);
      break;
    }
    if (token.startsWith("-")) {
      if (getContentOptionConsumesValue(lower)) i++;
      continue;
    }
    operand = token;
    break;
  }
  if (!operand) return null;

  const paths: string[] = [];
  for (const part of splitPsCommaList(operand)) {
    const resolved = resolvePsPathExpr(part, variables);
    if (resolved === undefined || !isResolvedPsViewPath(resolved)) return null;
    paths.push(resolved);
  }
  if (paths.length === 0) return null;

  let lines: string | undefined;
  for (let s = 1; s < segments.length; s++) {
    const segment = segments[s]!.trim();
    if (!PS_SELECT_COMMAND.test(segment)) return null;
    const window = parseSelectObjectLineWindow(splitPowerShellWords(segment));
    if (window && lines === undefined) lines = window;
  }
  return { paths, ...(lines ? { lines } : {}) };
}

/** Splits a path operand on top-level commas (`'a','b'` → two paths). */
function splitPsCommaList(input: string): string[] {
  return splitPsTopLevel(input, isPsCommaSeparator, { comments: true })
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Whether a resolved view path is displayable: no leftover `(` or `$` other
 * than literal `$env:NAME` references.
 */
function isResolvedPsViewPath(path: string): boolean {
  return !/[($]/.test(path.replace(/\$env:[A-Za-z_]\w*/gi, ""));
}

/**
 * Resolves a PowerShell path operand: quoted/bare literal, `$var` via earlier
 * assignments, `Join-Path A B [C…]` / `(Join-Path A B)` recursively,
 * `(Get-Location)`/`Get-Location`/`$PWD`/`.` → `.`, `$env:NAME` kept literally.
 */
function resolvePsPathExpr(
  rawExpr: string,
  variables: ReadonlyMap<string, string>,
): string | undefined {
  let expr = rawExpr.trim().replace(/;+$/, "").trim();
  while (isWrappedInParens(expr)) expr = expr.slice(1, -1).trim();
  if (!expr) return undefined;
  expr = expr.replace(/^\.([/\\])/, "");
  if (!expr) return undefined;

  const quoted = readPsQuotedLiteral(expr);
  if (quoted !== undefined) return quoted.replace(/^\.([/\\])/, "");

  if (/^Join-Path\b/i.test(expr)) {
    const argTokens = splitPsExprWords(expr.replace(/^Join-Path\b/i, ""));
    if (argTokens.length === 0) return undefined;
    const parts: string[] = [];
    for (const token of argTokens) {
      // Named parameters (`-Path`, `-ChildPath`, …) are not positional path
      // parts; treating them as literals would invent a bogus view path.
      if (token.startsWith("-")) return undefined;
      const resolved = resolvePsPathExpr(token, variables);
      if (resolved === undefined) return undefined;
      parts.push(resolved);
    }
    return parts.join("/").replace(/^\.([/\\])/, "");
  }

  if (/^\$env:/i.test(expr)) return expr;
  if (/^Get-Location$/i.test(expr) || /^\$pwd$/i.test(expr) || expr === ".") return ".";

  const variable = /^\$([A-Za-z_]\w*)$/.exec(expr);
  if (variable) return variables.get(variable[1]!.toLowerCase());

  if (expr.includes("(") || /\s/.test(expr)) return undefined;
  return expr;
}

/**
 * In assignment position (`$x = <rhs>`) a resolved bare Verb-Noun token is a
 * cmdlet invocation (`$x = Get-ChildItem`), not a path. Argument positions
 * (Get-Content operands, Join-Path parts) are always literal strings, so
 * hyphenated names like `my-file` still resolve there.
 */
function isBarePsCmdletPath(path: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)+$/.test(path) && !/[./\\]/.test(path);
}

function isWrappedInParens(expr: string): boolean {
  if (!expr.startsWith("(") || !expr.endsWith(")")) return false;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]!;
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (ch === "`") i++;
      else if (ch === '"') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") {
      depth--;
      if (depth === 0 && i < expr.length - 1) return false;
    }
  }
  return depth === 0;
}

/** Reads a whole-expression PowerShell string literal; undefined if malformed. */
function readPsQuotedLiteral(expr: string): string | undefined {
  const quote = expr[0];
  if (quote !== "'" && quote !== '"') return undefined;
  let out = "";
  let i = 1;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (quote === "'") {
      if (ch === "'") {
        if (expr[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        i++;
        break;
      }
      out += ch;
      i++;
      continue;
    }
    if (ch === "`") {
      if (i + 1 < expr.length) {
        out += expr[i + 1];
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (ch === '"') {
      i++;
      break;
    }
    out += ch;
    i++;
  }
  return expr.slice(i).trim().length === 0 ? out : undefined;
}

/**
 * Output expressions (foreach/for loops, `$var[…]` slices, `-join` pipelines)
 * are view-safe only when every command-position word is an allowlisted
 * cmdlet or language keyword.
 */
function isAllowedPsOutputExpr(statement: string): boolean {
  const unquoted = stripPsQuotedStrings(statement);
  const re = /(?:^|[|{(`]\s*|;\s*)([A-Za-z_][A-Za-z0-9_-]*)/g;
  for (const match of unquoted.matchAll(re)) {
    const word = match[1]!.toLowerCase();
    if (PS_VIEW_CMDLETS.has(word) || PS_VIEW_KEYWORDS.has(word)) continue;
    return false;
  }
  return true;
}

function stripPsQuotedStrings(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === "'") {
      i++;
      while (i < input.length) {
        if (input[i] === "'") {
          if (input[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < input.length) {
        if (input[i] === "`") {
          i += 2;
          continue;
        }
        if (input[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** `$var[start..end]` slices map to 1-based `start+1-end+1` line windows. */
function parsePowerShellSliceLines(
  command: string,
  contentVar: string | undefined,
): string | undefined {
  if (!contentVar) return undefined;
  const re = new RegExp(`\\$${contentVar}\\s*\\[\\s*(\\d+)\\s*\\.\\.\\s*(\\d+)\\s*\\]`, "i");
  const match = re.exec(command);
  if (!match) return undefined;
  const start = readNonNegativeInteger(match[1]);
  const end = readNonNegativeInteger(match[2]);
  if (start === undefined || end === undefined || end < start) return undefined;
  return `${start + 1}-${end + 1}`;
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
  if (
    !path ||
    !isResolvedPsViewPath(path) ||
    startIndex === undefined ||
    endIndex === undefined ||
    endIndex < startIndex
  )
    return null;

  return { path, lines: `${startIndex + 1}-${endIndex + 1}` };
}

function parsePowerShellForeachLineRanges(command: string): string | undefined {
  const match =
    /foreach\s*\(\s*\$\w+\s+in\s+@\(\s*((?:@\(\s*\d+\s*,\s*\d+\s*\)\s*,?\s*)+)\)\s*\)/i.exec(
      command,
    );
  if (!match?.[1]) return undefined;

  const ranges = [...match[1].matchAll(/@\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)].map((range) => {
    const start = Number(range[1]);
    const end = Number(range[2]);
    return end >= start ? (start === end ? `${start}` : `${start}-${end}`) : undefined;
  });
  return ranges.every((range): range is string => !!range) ? ranges.join(",") : undefined;
}

function extractPowerShellGetContentPath(
  words: string[],
  variables?: ReadonlyMap<string, string>,
): string | undefined {
  const executable = words[0]?.split(/[/\\]/).pop()?.toLowerCase();
  if (executable !== "get-content" && executable !== "gc") return undefined;

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const lower = word.toLowerCase();
    if (lower === "-path" || lower === "-literalpath")
      return resolvePowerShellPathOperand(words[i + 1], variables);
    if (lower.startsWith("-path:"))
      return resolvePowerShellPathOperand(word.slice("-Path:".length), variables);
    if (lower.startsWith("-literalpath:"))
      return resolvePowerShellPathOperand(word.slice("-LiteralPath:".length), variables);
    if (word.startsWith("-")) {
      if (getContentOptionConsumesValue(lower)) i++;
      continue;
    }
    return resolvePowerShellPathOperand(word, variables);
  }
  return undefined;
}

function resolvePowerShellPathOperand(
  value: string | undefined,
  variables?: ReadonlyMap<string, string>,
): string | undefined {
  if (!value) return undefined;
  return variables?.get(value.toLowerCase()) ?? value;
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

/**
 * `Select-Object -Skip N -First M` maps to the 1-based `skip+1 … skip+first`
 * line window; `-First` alone windows `1..first`.
 */
export function parseSelectObjectLineWindow(words: string[]): string | undefined {
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

function isPsStatementSeparator(ch: string): boolean {
  return ch === ";" || ch === "\n";
}

function isPsWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isPsCommaSeparator(ch: string): boolean {
  return ch === ",";
}

/**
 * Splits on whitespace outside quotes and ()/[]/{} nesting — the
 * `tokenizePsExprWords` behavior, kept as a named helper for readability at
 * the Join-Path/Get-Content call sites.
 */
function splitPsExprWords(input: string): string[] {
  return splitPsTopLevel(input, isPsWhitespace, { comments: true }).filter(
    (token) => token.length > 0,
  );
}

/**
 * One quote/nesting-aware scanner behind every PowerShell top-level split:
 * statement boundaries (`;`/newlines), expression words (whitespace), and
 * comma lists. `''` inside single quotes and `` ` `` escapes inside double
 * quotes are preserved verbatim; `#` comments (start-of-input or after
 * whitespace) are dropped when `comments` is set. Segments keep raw text —
 * callers trim and filter empties as their grammar requires.
 */
function splitPsTopLevel(
  input: string,
  isSeparator: (ch: string) => boolean,
  options?: { comments?: boolean },
): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let depth = 0;
  let i = 0;
  const comments = options?.comments === true;
  while (i < input.length) {
    const ch = input[i]!;
    if (quote === "'") {
      current += ch;
      if (ch === "'") {
        if (input[i + 1] === "'") {
          current += "'";
          i += 2;
          continue;
        }
        quote = null;
      }
      i++;
      continue;
    }
    if (quote === '"') {
      current += ch;
      if (ch === "`") {
        if (i + 1 < input.length) {
          current += input[i + 1];
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (ch === '"') quote = null;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      i++;
      continue;
    }
    if (ch === "`") {
      current += ch;
      if (i + 1 < input.length) {
        current += input[i + 1];
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (comments && ch === "#" && (i === 0 || /\s/.test(input[i - 1]!))) {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      current += ch;
      i++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
      current += ch;
      i++;
      continue;
    }
    if (depth === 0 && isSeparator(ch)) {
      parts.push(current);
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  parts.push(current);
  return parts;
}

/** Splits on `|` outside quotes and backtick escapes. */
export function splitPowerShellPipeline(command: string): string[] {
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

/** Splits on whitespace outside quotes; quote characters are stripped. */
export function splitPowerShellWords(input: string): string[] {
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

function readNonNegativeInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}
