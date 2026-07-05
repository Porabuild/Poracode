/**
 * Codex tool/file-change/web-search item extractors.
 *
 * Pulls tool names, server ids, input/output payloads, file-change paths and
 * kinds, diff summaries, and web-search metadata out of loosely-typed Codex
 * item shapes.
 */

import type { CanonicalItemType } from "@/shared/contracts";
import { extractLeadingPath } from "@/shared/extractLeadingPath";
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

export function codexFinalStatus(raw: unknown): "success" | "error" {
  return typeof raw === "string" && (raw === "failed" || raw === "error") ? "error" : "success";
}

/**
 * Pick the tool's request payload from a codex item. Codex's per-tool item
 * shapes vary (`mcp`, `dynamic`, plus user-defined custom tools), so we accept
 * the common aliases — `args` / `input` — without inventing new ones.
 */
export function pickToolInput(source: CodexItemPayload): unknown {
  if (isCodexCollabAgentToolCall(source)) return pickCollabAgentInput(source);
  if (source.args !== undefined) return source.args;
  if (source.input !== undefined) return source.input;
  if (source.arguments !== undefined) return source.arguments;
  return undefined;
}

export function pickCodexWebSearchInput(source: CodexItemPayload): unknown {
  if (source.action !== undefined) return source.action;
  return pickToolInput(source);
}

export function pickToolOutput(source: CodexItemPayload): unknown {
  if (source.result !== undefined) return source.result;
  if (source.output !== undefined) return source.output;
  if (isCodexCollabAgentToolCall(source)) return pickCollabAgentResult(source);
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
  const server = toolServerId(source);
  const tool = readNonEmptyString(source.tool);
  return server && tool ? `mcp__${server}__${tool}` : undefined;
}

export function toolServerId(source: CodexItemPayload): string | undefined {
  if (canonicalTypeFor(source.type ?? source.kind) !== "mcp_tool_call") return undefined;
  return readNonEmptyString(source.server) ?? readNonEmptyString(source.serverId);
}

export function extractCodexWebSearchQuery(source: CodexItemPayload): string | undefined {
  const direct = readNonEmptyString(source.query) ?? readNonEmptyString(source.text);
  if (direct) return direct;

  const action = readRecord(source.action);
  if (!action) return undefined;
  const actionQuery = readNonEmptyString(action.query);
  if (actionQuery) return actionQuery;

  const url = readNonEmptyString(action.url);
  const pattern = readNonEmptyString(action.pattern);
  if (url && pattern) return `${pattern} in ${url}`;
  if (url) return url;
  if (pattern) return pattern;
  return undefined;
}

/**
 * Classify a codex `fileChange` item into create / edit / delete. Codex carries
 * the kind on `item.changeKind` (preferred) or implicitly through `item.kind`
 * / `item.type`; older shapes don't tell us, so default to `edit` to match
 * historical behavior.
 */
export function classifyCodexFileChangeKind(
  source: CodexItemPayload,
): "create" | "edit" | "delete" {
  const direct = String(source.changeKind ?? "").toLowerCase();
  if (direct === "create" || direct === "add") return "create";
  if (direct === "delete" || direct === "remove") return "delete";
  if (direct === "edit" || direct === "update" || direct === "modify") return "edit";

  const changesKind = classifyCodexChangesKind(source.changes);
  if (changesKind) return changesKind;

  const kind = String(source.kind ?? "").toLowerCase();
  if (/\b(create|add)\b/.test(kind)) return "create";
  if (/\b(delete|remove|rm)\b/.test(kind)) return "delete";

  const type = String(source.type ?? "").toLowerCase();
  if (/create|add/.test(type)) return "create";
  if (/delete|remove/.test(type)) return "delete";

  return "edit";
}

function classifyCodexChangesKind(changes: unknown): "create" | "edit" | "delete" | undefined {
  if (!Array.isArray(changes) || changes.length === 0) return undefined;
  const kinds = changes
    .map((change) => {
      if (!change || typeof change !== "object") return undefined;
      const kind = (change as Record<string, unknown>).kind;
      if (!kind || typeof kind !== "object") return undefined;
      const type = String((kind as Record<string, unknown>).type ?? "").toLowerCase();
      if (type === "add" || type === "create") return "create" as const;
      if (type === "delete" || type === "remove") return "delete" as const;
      if (type === "update" || type === "modify" || type === "move") return "edit" as const;
      return undefined;
    })
    .filter((kind): kind is "create" | "edit" | "delete" => kind !== undefined);
  if (kinds.length === 0) return undefined;
  return kinds.every((kind) => kind === kinds[0]) ? kinds[0] : "edit";
}

export function readCodexChangesDiffSummary(
  changes: unknown,
): { added: number; removed: number } | undefined {
  if (!Array.isArray(changes)) return undefined;
  let added = 0;
  let removed = 0;
  let sawDiff = false;
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const diff = (change as Record<string, unknown>).diff;
    if (typeof diff !== "string" || diff.length === 0) continue;
    sawDiff = true;
    for (const line of diff.split(/\r?\n/)) {
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+")) added++;
      else if (line.startsWith("-")) removed++;
    }
  }
  return sawDiff ? { added, removed } : undefined;
}

/** Count results when the web_search item carries a structured `results` array. */
export function countWebSearchResults(source: CodexItemPayload): number | undefined {
  if (Array.isArray(source.results)) return source.results.length;
  if (Array.isArray(source.content)) return source.content.length;
  return undefined;
}
