import {
  buildDiffHeaderLines,
  formatHunkRange,
  normalizeDiffFilePath,
} from "@/shared/lineUnifiedDiff";
import type { FileChangeMetadata } from "../sdkCanonicalMappingState";

export { newItemId } from "../../contextUsage";

/** The API message id (`msg_…`) of a BetaMessage-ish payload, when present. */
export function readClaudeAssistantMessageId(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const value = (message as { id?: unknown }).id;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Collect inline images out of a Claude `tool_result` content (Anthropic image
 * blocks: `{ type: "image", source: { type: "base64", media_type, data } }`) as
 * renderable `data:` URLs, so MCP/tool-generated images survive onto the
 * payload instead of being dropped by the text-only `extractText`. Only inline
 * base64 sources are honored; remote `url` sources are intentionally skipped.
 */
export function extractToolResultImages(value: unknown): string[] {
  const images: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj.type === "image") {
      const source = obj.source;
      if (source && typeof source === "object") {
        const s = source as Record<string, unknown>;
        if (
          s.type === "base64" &&
          typeof s.data === "string" &&
          s.data.length > 0 &&
          typeof s.media_type === "string"
        ) {
          images.push(`data:${s.media_type};base64,${s.data}`);
        }
      }
      return;
    }
    if (obj.content !== undefined) walk(obj.content);
  };
  walk(value);
  return images;
}

interface StructuredPatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

function readStructuredPatchHunks(toolUseResult: unknown): StructuredPatchHunk[] | undefined {
  if (!toolUseResult || typeof toolUseResult !== "object") return undefined;
  const patch = (toolUseResult as Record<string, unknown>).structuredPatch;
  if (!Array.isArray(patch) || patch.length === 0) return undefined;
  const hunks: StructuredPatchHunk[] = [];
  for (const entry of patch) {
    if (!entry || typeof entry !== "object") continue;
    const { oldStart, oldLines, newStart, newLines, lines } = entry as Record<string, unknown>;
    if (
      typeof oldStart !== "number" ||
      typeof oldLines !== "number" ||
      typeof newStart !== "number" ||
      typeof newLines !== "number" ||
      !Array.isArray(lines)
    ) {
      continue;
    }
    hunks.push({
      oldStart,
      oldLines,
      newStart,
      newLines,
      lines: lines.filter((line): line is string => typeof line === "string"),
    });
  }
  return hunks.length > 0 ? hunks : undefined;
}

/**
 * Build a `metadata.changes[]` entry from the Claude SDK's
 * `tool_use_result.structuredPatch` (Edit / MultiEdit / Write output). The hunk
 * headers carry the real file line numbers (`oldStart` / `newStart`), so a full
 * unified diff assembled here flows through the renderer's existing structured-
 * changes passthrough (the same path Codex uses) and InlineDiffView renders true
 * line numbers instead of the synthetic `@@ -1 +1 @@` synthesized from
 * `old_string` / `new_string`.
 *
 * `expectedPath` guards against a `tool_use_result` that belongs to a different
 * tool_result block in the same user message (Claude emits one per message in
 * practice, but the SDK field is untyped and shared across the message).
 */
export function fileChangeMetadataFromToolResult(
  toolUseResult: unknown,
  expectedPath: string | undefined,
): FileChangeMetadata | undefined {
  const hunks = readStructuredPatchHunks(toolUseResult);
  if (!hunks) return undefined;
  const record = toolUseResult as Record<string, unknown>;
  const filePath = typeof record.filePath === "string" ? record.filePath : undefined;
  const resultPath = filePath && filePath.length > 0 ? filePath : expectedPath;
  if (!resultPath) return undefined;
  if (expectedPath && filePath !== undefined && filePath !== expectedPath) return undefined;
  const isCreate = record.originalFile === null || record.type === "create";
  const displayPath = normalizeDiffFilePath(resultPath);
  const body = hunks.flatMap((hunk) => [
    `@@ -${formatHunkRange(hunk.oldStart, hunk.oldLines)} +${formatHunkRange(hunk.newStart, hunk.newLines)} @@`,
    ...hunk.lines,
  ]);
  const diff = [...buildDiffHeaderLines(displayPath, isCreate, false), ...body].join("\n");
  return {
    changes: [
      { path: resultPath, kind: { type: isCreate ? "add" : "update", move_path: null }, diff },
    ],
  };
}

export function extractPlanSteps(
  input: Record<string, unknown>,
): Array<{ step: string; status: "pending" | "in_progress" | "completed" }> {
  const todos = input.todos;
  if (!Array.isArray(todos)) return [];
  return todos.flatMap((todo) => {
    if (!todo || typeof todo !== "object") return [];
    const obj = todo as Record<string, unknown>;
    const step =
      typeof obj.content === "string" && obj.content.trim() ? obj.content.trim() : "Task";
    const status =
      obj.status === "completed"
        ? "completed"
        : obj.status === "in_progress"
          ? "in_progress"
          : "pending";
    return [{ step, status }];
  });
}

export function summarizeToolRequest(toolName: string, input: Record<string, unknown>): string {
  const command = typeof input.command === "string" ? input.command : undefined;
  if (command) return `${toolName}: ${command}`;
  const path =
    typeof input.file_path === "string"
      ? input.file_path
      : typeof input.path === "string"
        ? input.path
        : undefined;
  if (path) return `${toolName}: ${path}`;
  try {
    const serialized = JSON.stringify(input);
    return serialized.length > 300
      ? `${toolName}: ${serialized.slice(0, 297)}...`
      : `${toolName}: ${serialized}`;
  } catch {
    return toolName;
  }
}

export function inputFingerprint(value: Record<string, unknown>): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export function tryParseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

// Matches a completed top-level `"key":"value"` string pair in a partial JSON
// buffer. Used to surface `file_path` / `path` / `command` to the UI before the
// full tool input has finished streaming. Skipped for plan/sub-agent tools
// whose inputs nest these keys inside arrays/objects.
const COMPLETED_STRING_FIELD_RE = /"((?:\\.|[^"\\])+)"\s*:\s*"((?:\\.|[^"\\])*)"/g;

export function extractCompletedStringFields(partial: string): Record<string, string> {
  const out: Record<string, string> = {};
  COMPLETED_STRING_FIELD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COMPLETED_STRING_FIELD_RE.exec(partial)) !== null) {
    try {
      const key = JSON.parse(`"${match[1]}"`);
      const value = JSON.parse(`"${match[2]}"`);
      if (typeof key === "string" && typeof value === "string") out[key] = value;
    } catch {
      // skip malformed escape sequences
    }
  }
  return out;
}

export function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).join("");
  if (!value || typeof value !== "object") return "";
  const obj = value as { text?: unknown; thinking?: unknown; content?: unknown };
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.thinking === "string") return obj.thinking;
  return extractText(obj.content);
}
