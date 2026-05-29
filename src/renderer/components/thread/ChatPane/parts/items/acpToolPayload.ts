/**
 * ACP-shaped tool-call payload helpers.
 *
 * ACP-speaking adapters (Copilot, generic ACP) carry the tool's request and
 * response on the chat item payload as `{ name, args, status, result }`. After
 * `canonicalMapping` extracts the canonical type-specific fields (`command`,
 * `path`, `query`), the rest of the request/response stays around so the
 * accordion body can show what was actually sent and what came back.
 *
 * These helpers read those auxiliary fields tolerantly — rows without those
 * fields lack extra body details and that's fine.
 */

import { buildLineUnifiedDiff, countLineChangeStats } from "@/shared/lineUnifiedDiff";
import { detectLanguageFromPath, type ViewportLanguage } from "./languageDetect";

export interface AcpToolResult {
  /** Markdown/plain text result used by ACP servers such as Factory Droid. */
  text?: unknown;
  /** Short preview text. */
  content?: unknown;
  /** Full output (may be larger than `content`). */
  detailedContent?: unknown;
  /** Typed content blocks (mostly used by web_search). */
  contents?: Array<{ type?: string; text?: unknown } | undefined>;
}

/** A rendered tool-call section. `language` selects how the viewport highlights the body. */
export interface ExtractedPart {
  text: string;
  language: ViewportLanguage;
}

export interface DiffSummary {
  added: number;
  removed: number;
}

/** Pull a string from `args[key]` when args is an object (not a string blob). */
export function readAcpStringField(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const args = (payload as Record<string, unknown>).args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const v = (args as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Serialize the tool's `result` field for accordion bodies, returning the
 * formatted text and whether it parses as JSON (so the renderer can apply
 * syntax highlighting). Prefers `detailedContent` over `content` (full vs.
 * preview); falls back to JSON for objects without those keys.
 */
export function extractAcpResultPart(payload: unknown): ExtractedPart {
  if (!payload || typeof payload !== "object") return emptyPart();
  const result = (payload as Record<string, unknown>).result;
  if (result === undefined || result === null) return emptyPart();
  if (typeof result === "string") return asPart(prettyIfJson(result));
  if (typeof result !== "object") return { text: String(result), language: "plain" };

  const r = result as AcpToolResult;
  if (typeof r.detailedContent === "string" && r.detailedContent.length > 0)
    return asPart(prettyIfJson(r.detailedContent));
  if (typeof r.text === "string" && r.text.length > 0) return asPart(prettyIfJson(r.text));
  if (typeof r.content === "string" && r.content.length > 0) return asPart(prettyIfJson(r.content));
  if (Array.isArray(r.contents)) {
    const parts = r.contents
      .map((c) => (c && typeof c.text === "string" ? prettyIfJson(c.text) : ""))
      .filter((t) => t.length > 0);
    if (parts.length > 0) {
      const joined = parts.join("\n\n");
      return { text: joined, language: parts.every(isJsonText) ? "json" : "plain" };
    }
  }
  return { text: safeJson(result), language: "json" };
}

/**
 * Read-tool result serializer. Unwraps OpenCode's
 * `<path>…</path><type>file</type><content>…</content>` wrapper and strips
 * the per-line `\d+: ` prefix that read tools emit for LLM consumption, then
 * picks a syntax-highlight language from the file path (args or wrapper).
 * Falls back to {@link extractAcpResultPart} for shapes we don't recognise.
 */
export function extractReadFileResultPart(payload: unknown): ExtractedPart {
  const structured = extractStructuredReadResult(payload);
  const base = structured ? asPart(structured.text) : extractAcpResultPart(payload);
  if (base.text.length === 0) return base;
  const pathFromPayload =
    structured?.path ??
    readPayloadString(payload, "path") ??
    readAcpStringField(payload, "filePath") ??
    readAcpStringField(payload, "file_path") ??
    readAcpStringField(payload, "path") ??
    readAcpStringField(payload, "notebook_path") ??
    readAcpStringField(payload, "notebookPath");
  const unwrapped = unwrapReadFileWrapper(base.text);
  const text = unwrapped ? unwrapped.content : base.text;
  const path = unwrapped?.path ?? pathFromPayload;
  const stripped = stripLineNumberPrefix(text);
  const language = detectLanguageFromPath(path);
  return { text: stripped, language };
}

function extractStructuredReadResult(
  payload: unknown,
): { path: string | undefined; text: string } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const result = (payload as Record<string, unknown>).result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const record = result as Record<string, unknown>;
  const nested =
    readNestedReadText(record.file) ??
    readNestedReadText(record.output) ??
    readNestedReadText(record.FileContent) ??
    readNestedReadText(record.fileContent);
  const text =
    nested?.text ??
    readString(record.content) ??
    readString(record.text) ??
    readString(record.tool_output_for_prompt);
  if (text === undefined) return undefined;
  const path =
    nested?.path ??
    readString(record.path) ??
    readString(record.file_path) ??
    readString(record.filePath) ??
    readString(record.absolute_path) ??
    readString(record.absolutePath);
  return { path, text };
}

function readNestedReadText(
  value: unknown,
): { path: string | undefined; text: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const text =
    readString(record.raw_output) ?? readString(record.content) ?? readString(record.text);
  if (text === undefined) return undefined;
  const path =
    readString(record.path) ??
    readString(record.file_path) ??
    readString(record.filePath) ??
    readString(record.absolute_path) ??
    readString(record.absolutePath);
  return { path, text };
}

function unwrapReadFileWrapper(
  text: string,
): { path: string | undefined; content: string } | undefined {
  const contentMatch = /<content>\r?\n?([\s\S]*?)\r?\n?<\/content>\s*$/.exec(text);
  if (!contentMatch) return undefined;
  const pathMatch = /<path>([\s\S]*?)<\/path>/.exec(text);
  const path = pathMatch?.[1]?.trim();
  return { path: path && path.length > 0 ? path : undefined, content: contentMatch[1] ?? "" };
}

/**
 * Strip `\d+:\s?` line-number prefixes that read tools prepend to every line.
 * Requires at least half the non-empty lines to match before stripping, so
 * regular code that happens to contain `\d+:` lines isn't mangled.
 */
function stripLineNumberPrefix(text: string): string {
  if (text.length === 0) return text;
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let prefixed = 0;
  let nonEmpty = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) nonEmpty += 1;
    const match = /^\s*\d+(?::|>|→)\s?(.*)$/.exec(line);
    if (match) {
      prefixed += 1;
      out.push(match[1] ?? "");
    } else {
      out.push(line);
    }
  }
  if (nonEmpty === 0 || prefixed * 2 <= nonEmpty) return text;
  return out.join("\n");
}

/** Serialize `args` for accordion bodies. String args (apply_patch) pass through; objects become pretty-printed JSON. */
export function extractAcpArgsPart(payload: unknown): ExtractedPart {
  if (!payload || typeof payload !== "object") return emptyPart();
  const args = (payload as Record<string, unknown>).args;
  if (args === undefined || args === null) return emptyPart();
  if (typeof args === "string") return asPart(prettyIfJson(args));
  return { text: safeJson(args), language: "json" };
}

/** Cursor ACP content-diff blocks stored on the payload by the supervisor mapper. */
export function readAcpContentEditTexts(
  payload: unknown,
): { path: string; oldText: string; newText: string } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const path = readPayloadString(payload, "path");
  const newText = readString(record.editNewText);
  if (!path || newText === undefined) return undefined;
  const oldText = readString(record.editOldText) ?? "";
  return { path, oldText, newText };
}

/** Return only ACP result bodies that are unified diffs, or synthesize one from edit args. */
export function extractAcpDiffResultPart(payload: unknown): ExtractedPart {
  const contentEdit = readAcpContentEditTexts(payload);
  if (contentEdit) {
    return {
      text: buildLineUnifiedDiff(contentEdit.path, contentEdit.oldText, contentEdit.newText),
      language: "diff",
    };
  }
  const resultPart = extractAcpResultPart(payload);
  if (resultPart.language === "diff") return resultPart;
  const synthesized = synthesizeEditDiff(payload);
  return synthesized ? { text: synthesized, language: "diff" } : emptyPart();
}

/** Reconstruct the added file body from an apply_patch add-file section. */
export function extractAcpAddedFileText(payload: unknown, filePath: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const args = (payload as Record<string, unknown>).args;
  if (typeof args === "string") {
    const lines = args.split("\n");
    const header = `*** Add File: ${filePath}`;
    const start = lines.findIndex((line) => line === header);
    if (start >= 0) {
      const content: string[] = [];
      for (const line of lines.slice(start + 1)) {
        if (line.startsWith("*** ")) break;
        if (line.startsWith("+")) content.push(line.slice(1));
      }
      return content.length > 0 ? `${content.join("\n")}\n` : "";
    }
  }

  return extractStructuredAddedFileText(payload, filePath);
}

export function extractAcpPatchTargetPath(payload: unknown): string | undefined {
  const patchText = readApplyPatchText(payload);
  if (!patchText) return undefined;
  const paths = parseApplyPatchSections(patchText).map((section) => section.path);
  const uniquePaths = new Set(paths);
  return uniquePaths.size === 1 ? paths[0] : undefined;
}

export function extractAcpDiffSummary(payload: unknown): DiffSummary | undefined {
  const contentEdit = readAcpContentEditTexts(payload);
  if (contentEdit) {
    const stats = countLineChangeStats(contentEdit.oldText, contentEdit.newText);
    return stats.added === 0 && stats.removed === 0 ? undefined : stats;
  }
  const changesSummary = summarizeStructuredFileChanges(payload);
  if (changesSummary) return changesSummary;
  const diffPart = extractAcpDiffResultPart(payload);
  return diffPart.text ? summarizeDiffText(diffPart.text) : undefined;
}

/** Back-compat: text-only accessors for callers that don't need the language. */
export function extractAcpResultText(payload: unknown): string {
  return extractAcpResultPart(payload).text;
}

export function extractAcpArgsText(payload: unknown): string {
  return extractAcpArgsPart(payload).text;
}

function emptyPart(): ExtractedPart {
  return { text: "", language: "plain" };
}

function asPart(text: string): ExtractedPart {
  if (isUnifiedDiff(text)) return { text, language: "diff" };
  return { text, language: isJsonText(text) ? "json" : "plain" };
}

function synthesizeEditDiff(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;
  const changesDiff = synthesizeStructuredFileChangesDiff(payload);
  if (changesDiff) return changesDiff;
  const applyPatchDiff = synthesizeApplyPatchDiff(payload);
  if (applyPatchDiff) return applyPatchDiff;
  const createDiff = synthesizeCreateContentDiff(payload);
  if (createDiff) return createDiff;

  const args = p.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const a = args as Record<string, unknown>;
  const oldText = readString(a.oldString) ?? readString(a.old_string);
  const newText = readString(a.newString) ?? readString(a.new_string);
  if (oldText === undefined || newText === undefined) return undefined;
  const path = readString(a.filePath) ?? readString(a.file_path) ?? readString(p.path);
  if (!path) return undefined;

  const oldLines = splitPatchLines(oldText);
  const newLines = splitPatchLines(newText);
  const oldRange = formatRange(oldLines.length, oldLines.length === 0 ? 0 : 1);
  const newRange = formatRange(newLines.length, newLines.length === 0 ? 0 : 1);
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldRange} +${newRange} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

function synthesizeCreateContentDiff(payload: unknown): string | undefined {
  const content = readCreateContent(payload);
  if (content === undefined) return undefined;
  const path =
    readAcpStringField(payload, "filePath") ??
    readAcpStringField(payload, "file_path") ??
    readAcpStringField(payload, "path") ??
    readPayloadString(payload, "path");
  if (!path) return undefined;
  return buildLineUnifiedDiff(path, "", content);
}

interface StructuredFileChange {
  path: string | undefined;
  kindType: string;
  diff: string;
}

function readStructuredFileChanges(payload: unknown): StructuredFileChange[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  // Providers report precise per-edit diffs at `metadata.changes[].diff` on
  // completion; preferring them over args/synthesis keeps true hunk ranges and
  // context lines intact for InlineDiffView.
  const containers = [p, p.args, p.result, p.metadata];
  for (const container of containers) {
    if (!container || typeof container !== "object" || Array.isArray(container)) continue;
    const changes = (container as Record<string, unknown>).changes;
    if (!Array.isArray(changes)) continue;
    return changes
      .map((change) => readStructuredFileChange(change))
      .filter((change): change is StructuredFileChange => change !== null);
  }
  return [];
}

function readStructuredFileChange(change: unknown): StructuredFileChange | null {
  if (!change || typeof change !== "object") return null;
  const record = change as Record<string, unknown>;
  const diff = record.diff;
  if (typeof diff !== "string" || diff.length === 0) return null;
  const kind = record.kind;
  const kindType =
    kind && typeof kind === "object"
      ? String((kind as Record<string, unknown>).type ?? "").toLowerCase()
      : "";
  return {
    path: readStructuredFileChangePath(record),
    kindType,
    diff,
  };
}

function readStructuredFileChangePath(record: Record<string, unknown>): string | undefined {
  const kind = record.kind;
  if (kind && typeof kind === "object") {
    const movePath = (kind as Record<string, unknown>).move_path;
    if (typeof movePath === "string" && movePath.trim().length > 0) return movePath.trim();
  }
  for (const key of ["path", "file_path", "filePath", "relative_path", "relativePath"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function selectStructuredFileChanges(
  payload: unknown,
  filePath: string | undefined,
): StructuredFileChange[] {
  const changes = readStructuredFileChanges(payload);
  if (!filePath) return changes;
  const matching = changes.filter((change) => change.path === filePath);
  return matching.length > 0 ? matching : changes;
}

function synthesizeStructuredFileChangesDiff(payload: unknown): string | undefined {
  const filePath = readPayloadString(payload, "path");
  const changes = selectStructuredFileChanges(payload, filePath);
  if (changes.length === 0) return undefined;

  const parts: string[] = [];
  for (const change of changes) {
    const path = change.path ?? filePath;
    if (!path) continue;
    if (isUnifiedDiff(change.diff)) {
      parts.push(change.diff.trimEnd());
      continue;
    }
    const body = extractUnifiedDiffBody(change.diff);
    const isCreate = change.kindType === "add" || change.kindType === "create";
    const isDelete = change.kindType === "delete" || change.kindType === "remove";
    parts.push(
      [
        `diff --git a/${path} b/${path}`,
        isCreate ? "--- /dev/null" : `--- a/${path}`,
        isDelete ? "+++ /dev/null" : `+++ b/${path}`,
        body.trimEnd(),
      ].join("\n"),
    );
  }
  return parts.length > 0 ? `${parts.join("\n")}\n` : undefined;
}

function extractUnifiedDiffBody(diff: string): string {
  const lines = diff.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("@@"));
  return start >= 0 ? lines.slice(start).join("\n") : diff;
}

interface ApplyPatchSection {
  operation: "Add" | "Update" | "Delete";
  path: string;
  lines: string[];
}

function synthesizeApplyPatchDiff(payload: unknown): string | undefined {
  const patchText = readApplyPatchText(payload);
  if (!patchText) return undefined;
  const sections = parseApplyPatchSections(patchText);
  const parts = sections.flatMap((section) => sectionToUnifiedDiff(section));
  return parts.length > 0 ? `${parts.join("\n")}\n` : undefined;
}

function readApplyPatchText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const args = (payload as Record<string, unknown>).args;
  if (typeof args === "string") return args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const record = args as Record<string, unknown>;
  const value = record.patchText ?? record.patch_text ?? record.patch;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseApplyPatchSections(patchText: string): ApplyPatchSection[] {
  const lines = patchText.split(/\r?\n/);
  const sections: ApplyPatchSection[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(lines[i] ?? "");
    if (!match) continue;
    const operation = match[1] as ApplyPatchSection["operation"];
    const path = match[2]?.trim();
    if (!path) continue;
    const sectionLines: string[] = [];
    for (i += 1; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (/^\*\*\* (?:Add|Update|Delete) File: /.test(line) || line === "*** End Patch") {
        i -= 1;
        break;
      }
      if (!line.startsWith("*** ")) sectionLines.push(line);
    }
    sections.push({ operation, path, lines: sectionLines });
  }
  return sections;
}

function sectionToUnifiedDiff(section: ApplyPatchSection): string[] {
  const hunks = splitApplyPatchHunks(section.lines).flatMap((hunk) =>
    normalizeApplyPatchHunk(hunk),
  );
  if (hunks.length === 0) return [];
  return [
    `diff --git a/${section.path} b/${section.path}`,
    section.operation === "Add" ? "--- /dev/null" : `--- a/${section.path}`,
    section.operation === "Delete" ? "+++ /dev/null" : `+++ b/${section.path}`,
    ...hunks,
  ];
}

function splitApplyPatchHunks(lines: string[]): string[][] {
  const hunks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (current.length > 0) hunks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) hunks.push(current);
  return hunks;
}

function normalizeApplyPatchHunk(hunk: string[]): string[] {
  const header = hunk[0]?.startsWith("@@") ? hunk[0] : undefined;
  const body = (header ? hunk.slice(1) : hunk).filter(isPatchBodyLine);
  if (body.length === 0) return [];
  const normalizedHeader =
    header && /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(header)
      ? header
      : synthesizeHunkHeader(body);
  return [normalizedHeader, ...body];
}

function isPatchBodyLine(line: string): boolean {
  return (
    line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line.startsWith("\\")
  );
}

function synthesizeHunkHeader(lines: readonly string[]): string {
  let oldCount = 0;
  let newCount = 0;
  for (const line of lines) {
    if (line.startsWith("\\")) continue;
    if (line.startsWith("-") || line.startsWith(" ")) oldCount += 1;
    if (line.startsWith("+") || line.startsWith(" ")) newCount += 1;
  }
  return `@@ -${formatRange(oldCount, oldCount === 0 ? 0 : 1)} +${formatRange(
    newCount,
    newCount === 0 ? 0 : 1,
  )} @@`;
}

function extractStructuredAddedFileText(payload: unknown, filePath: string): string | undefined {
  const changes = selectStructuredFileChanges(payload, filePath).filter(
    (change) => change.kindType === "add" || change.kindType === "create",
  );
  if (changes.length === 0) return undefined;

  const content: string[] = [];
  for (const change of changes) {
    for (const line of change.diff.split(/\r?\n/)) {
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+")) content.push(line.slice(1));
    }
  }
  return content.length > 0 ? `${content.join("\n")}\n` : "";
}

function summarizeStructuredFileChanges(payload: unknown): DiffSummary | undefined {
  const changes = selectStructuredFileChanges(payload, readPayloadString(payload, "path"));
  if (changes.length === 0) return undefined;
  let sawDiff = false;
  let added = 0;
  let removed = 0;
  for (const change of changes) {
    const summary = summarizeDiffText(change.diff);
    if (!summary) continue;
    sawDiff = true;
    added += summary.added;
    removed += summary.removed;
  }
  return sawDiff ? { added, removed } : undefined;
}

function summarizeDiffText(diff: string): DiffSummary | undefined {
  let sawLine = false;
  let added = 0;
  let removed = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      sawLine = true;
      added++;
    } else if (line.startsWith("-")) {
      sawLine = true;
      removed++;
    }
  }
  return sawLine ? { added, removed } : undefined;
}

function readCreateContent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const changeKind = (readString(record.changeKind) ?? "").toLowerCase();
  const toolName = (readString(record.name) ?? "").toLowerCase();
  const args = record.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const content = readString((args as Record<string, unknown>).content);
  if (content === undefined) return undefined;
  return changeKind === "create" || toolName === "write" ? content : undefined;
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function splitPatchLines(text: string): string[] {
  if (text.length === 0) return [];
  const withoutTrailingFinalNewline = text.endsWith("\n") ? text.slice(0, -1) : text;
  return withoutTrailingFinalNewline.split("\n");
}

function formatRange(count: number, start: number): string {
  return count === 1 ? String(start) : `${start},${count}`;
}

function isUnifiedDiff(text: string): boolean {
  return /^diff --git [^\n]+$/m.test(text) && /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(text);
}

function isJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  const head = trimmed[0];
  const tail = trimmed[trimmed.length - 1];
  if (!((head === "{" && tail === "}") || (head === "[" && tail === "]"))) return false;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * If `text` parses as a JSON object/array, return a 2-space indented version;
 * otherwise return the input unchanged. Bare strings/numbers/booleans are not
 * worth re-formatting (the parsed value loses surrounding context), so we only
 * reformat when the trimmed text looks like a structured JSON literal.
 */
function prettyIfJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 2) return text;
  const head = trimmed[0];
  const tail = trimmed[trimmed.length - 1];
  if (!((head === "{" && tail === "}") || (head === "[" && tail === "]"))) return text;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") return JSON.stringify(parsed, null, 2);
  } catch {
    // not JSON — fall through
  }
  return text;
}
