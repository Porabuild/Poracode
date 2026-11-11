/**
 * Codex tool/file-change/web-search item extractors.
 *
 * Pulls tool names, server ids, input/output payloads, file-change paths and
 * kinds, diff summaries, and web-search metadata out of loosely-typed Codex
 * item shapes.
 */

import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import type { CanonicalItemType, CommandAction } from "@/shared/contracts";
import { extractLeadingPath } from "@/shared/extractLeadingPath";
import { toWslUncPath } from "@/shared/wsl";
import { inferFileChangeKindFromSource } from "../../fileChangeKind";
import { canonicalTypeFor } from "../canonicalMappingState";
import {
  isCodexCollabAgentToolCall,
  pickCollabAgentInput,
  pickCollabAgentResult,
} from "./collabAgent";
import { type CodexItemPayload, readNonEmptyString, readPathField, readRecord } from "./readers";

export function isToolLikeItemType(itemType: CanonicalItemType): boolean {
  return (
    itemType === "tool_call" ||
    itemType === "mcp_tool_call" ||
    itemType === "image_view" ||
    itemType === "dynamic_tool_call"
  );
}

export function readCommandAggregatedOutput(
  itemType: CanonicalItemType,
  source: CodexItemPayload,
): string | undefined {
  if (itemType !== "command_execution") return undefined;
  if (typeof source.aggregatedOutput === "string" && source.aggregatedOutput.length > 0) {
    return source.aggregatedOutput;
  }
  if (typeof source.formattedOutput === "string" && source.formattedOutput.length > 0) {
    return source.formattedOutput;
  }
  return undefined;
}

export function codexFinalStatus(raw: unknown, failure?: unknown): "success" | "error" {
  if (failure !== undefined && failure !== null) return "error";
  return raw === "failed" ||
    raw === "declined" ||
    raw === "error" ||
    raw === "interrupted" ||
    raw === "incomplete"
    ? "error"
    : "success";
}

/**
 * Pick the tool's request payload from a codex item. Codex's per-tool item
 * shapes vary (`mcp`, `dynamic`, plus user-defined custom tools), so we accept
 * the common aliases — `args` / `input` — without inventing new ones.
 */
export function pickToolInput(source: CodexItemPayload): unknown {
  if (isCodexCollabAgentToolCall(source)) return pickCollabAgentInput(source);
  const imagePath = source.type === "imageView" ? readNonEmptyString(source.path) : undefined;
  if (imagePath) return { path: imagePath };
  if (source.type === "imageGeneration") {
    const imageGenInput = pickImageGenerationInput(source);
    if (imageGenInput) return imageGenInput;
  }
  if (source.args !== undefined) return source.args;
  if (source.input !== undefined) return source.input;
  if (source.arguments !== undefined) return source.arguments;
  return undefined;
}

function pickImageGenerationInput(source: CodexItemPayload): Record<string, unknown> | undefined {
  const prompt = readNonEmptyString(source.revisedPrompt);
  const savedPath = readNonEmptyString(source.savedPath);
  const fileId = readNonEmptyString(source.fileId);
  const generationId = readNonEmptyString(source.generationId);
  if (!prompt && !savedPath && !fileId && !generationId) return undefined;
  return {
    ...(prompt ? { prompt } : {}),
    ...(savedPath ? { path: savedPath, savedPath } : {}),
    ...(fileId ? { fileId } : {}),
    ...(generationId ? { generationId } : {}),
  };
}

export function pickCodexWebSearchInput(source: CodexItemPayload): unknown {
  // `action` is null on the started item; only a real action object is input.
  if (readRecord(source.action)) return source.action;
  return pickToolInput(source);
}

/**
 * Normalize Codex `commandActions` into shared `CommandAction` entries. Codex
 * classifies a command as exploration only when every part is known, so any
 * `unknown` or malformed entry drops the whole array (mirrors the provider).
 */
export function readCodexCommandActions(source: CodexItemPayload): CommandAction[] | undefined {
  if (!Array.isArray(source.commandActions) || source.commandActions.length === 0) {
    return undefined;
  }
  const actions: CommandAction[] = [];
  for (const entry of source.commandActions) {
    const record = readRecord(entry);
    const type = readNonEmptyString(record?.type);
    if (!record || !type) return undefined;
    const path = readNonEmptyString(record.path);
    const name = readNonEmptyString(record.name);
    const query = readNonEmptyString(record.query);
    if (type === "read") {
      if (!path) return undefined;
      actions.push({ kind: "read", path, ...(name ? { name } : {}), ...(query ? { query } : {}) });
    } else if (type === "listFiles") {
      actions.push({ kind: "list", ...(path ? { path } : {}), ...(name ? { name } : {}) });
    } else if (type === "search") {
      actions.push({
        kind: "search",
        ...(path ? { path } : {}),
        ...(name ? { name } : {}),
        ...(query ? { query } : {}),
      });
    } else {
      return undefined;
    }
  }
  return actions;
}

export interface CodexWebSearchAction {
  action: string;
  queries?: string[];
  url?: string;
  pattern?: string;
}

/**
 * Read the Responses-style web-search `action` object. `openPage`/`findInPage`
 * arrive camelCased on the wire; the shared payload stores snake_case kinds.
 */
export function readCodexWebSearchAction(
  source: CodexItemPayload,
): CodexWebSearchAction | undefined {
  const action = readRecord(source.action);
  if (!action) return undefined;
  const type = readNonEmptyString(action.type);
  let kind: string | undefined;
  if (type === "search") kind = "search";
  else if (type === "openPage" || type === "open_page") kind = "open_page";
  else if (type === "findInPage" || type === "find_in_page") kind = "find_in_page";
  if (!kind) return undefined;

  const url = readNonEmptyString(action.url);
  const pattern = readNonEmptyString(action.pattern);
  const queries = readStringList(action.queries);
  if (queries.length === 0) {
    const query = readNonEmptyString(action.query);
    if (query) queries.push(query);
  }
  return {
    action: kind,
    ...(queries.length > 0 ? { queries } : {}),
    ...(url ? { url } : {}),
    ...(pattern ? { pattern } : {}),
  };
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = readNonEmptyString(item);
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

export function pickToolOutput(source: CodexItemPayload): unknown {
  if (source.result !== undefined) return source.result;
  if (source.output !== undefined) return source.output;
  if (source.type === "imageGeneration") {
    const imageGenResult = pickImageGenerationOutput(source);
    if (imageGenResult) return imageGenResult;
  }
  if (isCodexCollabAgentToolCall(source)) return pickCollabAgentResult(source);
  return undefined;
}

/**
 * Codex 0.167+ can return `imageGeneration` items with `{ fileId }` (and optional
 * `savedPath`, `revisedPrompt`, `generationId`, `failure`) instead of inline base64
 * `result`. Preserve the structured metadata on `result` when `source.result` is absent.
 */
function pickImageGenerationOutput(source: CodexItemPayload): Record<string, unknown> | undefined {
  const fileId = readNonEmptyString(source.fileId);
  const savedPath = readNonEmptyString(source.savedPath);
  const revisedPrompt = readNonEmptyString(source.revisedPrompt);
  const generationId = readNonEmptyString(source.generationId);
  const failure = readRecord(source.failure);
  if (!fileId && !savedPath && !revisedPrompt && !generationId && !failure) return undefined;
  return {
    ...(fileId ? { fileId } : {}),
    ...(savedPath ? { savedPath } : {}),
    ...(revisedPrompt ? { revisedPrompt } : {}),
    ...(generationId ? { generationId } : {}),
    ...(failure ? { failure } : {}),
  };
}

const IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

// Keep base64 previews below the ordinary canonical envelope budget. Large
// source images are decoded asynchronously before their tool row completes.
const MAX_INLINE_IMAGE_BYTES = 512 * 1024;
const MAX_PREVIEW_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_CONCURRENT_IMAGE_PREVIEWS = 2;
let activeImagePreviews = 0;

/**
 * Convert Codex's native `imageView.path` or `imageGeneration.savedPath` (when no
 * inline base64 `result` is present) into the shared inline-image channel.
 */
export function readCodexImageViewDataUrl(
  source: CodexItemPayload,
  wslDistro?: string,
): string | undefined {
  let imagePath: string | undefined;
  if (source.type === "imageView") {
    imagePath = readNonEmptyString(source.path);
  } else if (
    source.type === "imageGeneration" &&
    (typeof source.result !== "string" || source.result.length === 0)
  ) {
    imagePath = readNonEmptyString(source.savedPath);
  }
  if (!imagePath) return undefined;
  const mimeType = IMAGE_MIME_BY_EXTENSION[extname(imagePath).toLowerCase()];
  if (!mimeType) return undefined;
  const hostPath =
    wslDistro && imagePath.startsWith("/") ? toWslUncPath(wslDistro, imagePath) : imagePath;
  try {
    if (statSync(hostPath).size > MAX_INLINE_IMAGE_BYTES) return undefined;
    const bytes = readFileSync(hostPath);
    return bytes.length > 0 && bytes.length <= MAX_INLINE_IMAGE_BYTES
      ? `data:${mimeType};base64,${bytes.toString("base64")}`
      : undefined;
  } catch {
    return undefined;
  }
}

export async function readCodexImageViewPreview(
  imagePath: string,
  wslDistro?: string,
): Promise<string | undefined> {
  if (!IMAGE_MIME_BY_EXTENSION[extname(imagePath).toLowerCase()]) return undefined;
  // Previews are optional; a burst must neither retain unbounded source buffers
  // nor delay successful tool completions behind an image-processing queue.
  if (activeImagePreviews >= MAX_CONCURRENT_IMAGE_PREVIEWS) return undefined;
  activeImagePreviews += 1;
  const hostPath =
    wslDistro && imagePath.startsWith("/") ? toWslUncPath(wslDistro, imagePath) : imagePath;
  try {
    // Snapshot at tool completion: agents often overwrite the same screenshot
    // path while an earlier preview is still being encoded.
    const info = statSync(hostPath);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_PREVIEW_SOURCE_BYTES) return undefined;
    const bytes = readFileSync(hostPath);
    if (bytes.length > MAX_PREVIEW_SOURCE_BYTES) return undefined;
    const { default: sharp } = await import("sharp");
    for (const width of [1600, 800]) {
      const preview = await sharp(bytes, { limitInputPixels: 64 * 1024 * 1024 })
        .rotate()
        .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      if (preview.length <= MAX_INLINE_IMAGE_BYTES) {
        return `data:image/webp;base64,${preview.toString("base64")}`;
      }
    }
  } catch {
    // An unavailable preview must not fail an otherwise successful tool call.
  } finally {
    activeImagePreviews -= 1;
  }
  return undefined;
}

export function extractCodexFileChangePath(source: CodexItemPayload | unknown): string | undefined {
  if (source && typeof source === "object") {
    const record = source as Record<string, unknown>;
    const direct = readPathField(record);
    if (direct) return direct;
    const changesPath = readFirstCodexChangePath(record.changes);
    if (changesPath) return changesPath;
    return (
      extractCodexFileChangePath(record.args) ??
      extractCodexFileChangePath(record.input) ??
      extractCodexFileChangePath(record.output) ??
      extractCodexFileChangePath(record.result) ??
      extractTitlePath(record.title) ??
      extractTitlePath(record.name)
    );
  }
  if (typeof source !== "string") return undefined;

  const patchPath = /^\*\*\*\s+(?:Add|Update|Delete)\s+File:\s+(.+?)\s*$/m.exec(source);
  if (patchPath?.[1]) return patchPath[1].trim();

  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fileListStart = lines.findIndex((line) => /following files:/i.test(line));
  if (fileListStart === -1) return undefined;
  for (const line of lines.slice(fileListStart + 1)) {
    const path = /^[A-Z?]\s+(.+)$/.exec(line)?.[1] ?? (/^[A-Z?]$/.test(line) ? undefined : line);
    if (path) return path.trim();
  }
  return undefined;
}

function readFirstCodexChangePath(changes: unknown): string | undefined {
  if (!Array.isArray(changes)) return undefined;
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const record = change as Record<string, unknown>;
    const movePath = readCodexChangeMovePath(record.kind);
    if (movePath) return movePath;
    const path = readPathField(record);
    if (path) return path;
  }
  return undefined;
}

function readCodexChangeMovePath(kind: unknown): string | undefined {
  if (!kind || typeof kind !== "object") return undefined;
  const value = (kind as Record<string, unknown>).move_path;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function extractTitlePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const leading = extractLeadingPath(value);
  if (leading) return leading;
  const writingTarget = /\b(?:to|file)\s+([^\s]+\.[^\s:]+)(?::|\s|$)/i.exec(value);
  return writingTarget?.[1]?.trim();
}

export function toolName(source: CodexItemPayload): string | undefined {
  const mcpName = mcpToolName(source);
  if (mcpName) return mcpName;
  if (isCodexCollabAgentToolCall(source) && readNonEmptyString(source.tool)) return source.tool;
  if (typeof source.title === "string" && source.title.length > 0) return source.title;
  if (typeof source.name === "string" && source.name.length > 0) return source.name;
  if (readNonEmptyString(source.tool)) return source.tool;
  if (typeof source.type === "string" && source.type.length > 0) return source.type;
  return undefined;
}

function mcpToolName(source: CodexItemPayload): string | undefined {
  const identity = mcpToolIdentity(source);
  return identity ? `mcp__${identity.server}__${identity.tool}` : undefined;
}

export function toolServerId(source: CodexItemPayload): string | undefined {
  return mcpToolIdentity(source)?.server ?? rawMcpServerId(source);
}

function mcpToolIdentity(source: CodexItemPayload): { server: string; tool: string } | undefined {
  const server = rawMcpServerId(source);
  const tool = readNonEmptyString(source.tool);
  if (!server || !tool) return undefined;

  if (server === "codex_apps") {
    const separator = tool.indexOf(".");
    if (separator > 0 && separator < tool.length - 1) {
      return { server: tool.slice(0, separator), tool: tool.slice(separator + 1) };
    }
  }

  return { server, tool };
}

function rawMcpServerId(source: CodexItemPayload): string | undefined {
  if (canonicalTypeFor(source.type ?? source.kind) !== "mcp_tool_call") return undefined;
  return readNonEmptyString(source.server) ?? readNonEmptyString(source.serverId);
}

export function extractCodexWebSearchQuery(source: CodexItemPayload): string | undefined {
  // The structured action carries the real queries; `source.query` can be a
  // display string (multi-query searches arrive truncated with " ...").
  const action = readCodexWebSearchAction(source);
  if (action) {
    if (action.action === "search" && action.queries && action.queries.length > 0) {
      return action.queries.join(" · ");
    }
    if (action.action === "open_page" && action.url) return action.url;
    if (action.action === "find_in_page") {
      if (action.pattern && action.url) return `${action.pattern} in ${action.url}`;
      if (action.pattern) return action.pattern;
      if (action.url) return action.url;
    }
  }

  const direct = readNonEmptyString(source.query) ?? readNonEmptyString(source.text);
  if (direct) return direct;

  const record = readRecord(source.action);
  if (!record) return undefined;
  const actionQuery = readNonEmptyString(record.query);
  if (actionQuery) return actionQuery;

  const url = readNonEmptyString(record.url);
  const pattern = readNonEmptyString(record.pattern);
  if (url && pattern) return `${pattern} in ${url}`;
  if (url) return url;
  if (pattern) return pattern;
  return undefined;
}

/**
 * Shape Codex `webSearch.results` (`text_result` entries with title/url) into
 * canonical `result.contents` text blocks so expanded rows have a body.
 * `resultCount` stays the full results length; contents are capped at 50.
 */
export function readCodexWebSearchResultContents(
  source: CodexItemPayload,
): { contents: Array<{ type: "text"; text: string }> } | undefined {
  if (!Array.isArray(source.results)) return undefined;
  const contents = source.results.flatMap((entry) => {
    const record = readRecord(entry);
    if (!record) return [];
    const title = readNonEmptyString(record.title);
    const url = readNonEmptyString(record.url);
    if (!title && !url) return [];
    return [{ type: "text" as const, text: [title, url].filter(Boolean).join("\n") }];
  });
  return contents.length > 0 ? { contents: contents.slice(0, 50) } : undefined;
}

/**
 * Classify a codex `fileChange` item into create / edit / delete. Codex carries
 * the kind on `item.changeKind` (preferred), the structured `changes` array, or
 * implicitly through `item.kind` / `item.type`; older shapes don't tell us, so
 * default to `edit` to match historical behavior. Structured evidence goes
 * through the shared cross-provider inference.
 */
export function classifyCodexFileChangeKind(
  source: CodexItemPayload,
): "create" | "edit" | "delete" {
  const inferred = inferFileChangeKindFromSource(source);
  if (inferred) return inferred;

  const kind = String(source.kind ?? "").toLowerCase();
  if (/\b(create|add)\b/.test(kind)) return "create";
  if (/\b(delete|remove|rm)\b/.test(kind)) return "delete";

  const type = String(source.type ?? "").toLowerCase();
  if (/create|add/.test(type)) return "create";
  if (/delete|remove/.test(type)) return "delete";

  return "edit";
}

export { readCodexChangesDiffSummary } from "../fileChangeDiffSummary";

/** Count results when the web_search item carries a structured `results` array. */
export function countWebSearchResults(source: CodexItemPayload): number | undefined {
  if (Array.isArray(source.results)) return source.results.length;
  if (Array.isArray(source.content)) return source.content.length;
  return undefined;
}
