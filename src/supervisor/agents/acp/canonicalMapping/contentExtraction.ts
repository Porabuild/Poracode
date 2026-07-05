/**
 * Leaf extractors for the ACP → canonical mapper.
 *
 * Pure, provider-agnostic helpers that pull typed fields out of ACP's loosely
 * typed `rawInput`/`rawOutput`/`content` shapes and classify tool kinds. No
 * mapper state is touched here.
 */

import type { CanonicalItemType } from "@/shared/contracts";
import { readFileChangePath } from "../../fileChangeSummary";

export function normalizeToolText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readStringField(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const v = (input as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function readStringAllowEmpty(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

export function firstNonEmptyLine(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

export function extractToolLocations(
  locations: Array<{ path?: string | null; line?: number | null }> | null | undefined,
): Array<{ path: string; line?: number }> {
  if (!Array.isArray(locations)) return [];
  return locations.flatMap((location) => {
    const path = normalizeToolText(location?.path);
    if (!path) return [];
    const line = typeof location?.line === "number" ? location.line : undefined;
    return [{ path, ...(line != null ? { line } : {}) }];
  });
}

export function extractFileChangePath(
  input: unknown,
  title: string | undefined,
  kind: string | undefined,
  locations: readonly { path: string }[],
): string | undefined {
  return (
    readFileChangePath(input) ?? readToolLocationPath(kind, locations) ?? readFileChangePath(title)
  );
}

function readToolLocationPath(
  kind: string | undefined,
  locations: readonly { path: string }[],
): string | undefined {
  if (locations.length === 0) return undefined;
  const lowerKind = (kind ?? "").toLowerCase();
  return lowerKind === "move" ? locations[locations.length - 1]?.path : locations[0]?.path;
}

export function classifyFileChangeKind(
  kind: string | undefined,
  title: string | undefined,
  ...sources: unknown[]
): "create" | "edit" | "delete" {
  const k = (kind ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  for (const source of sources) {
    const inferred = inferFileChangeKindFromSource(source);
    if (inferred) return inferred;
  }
  if (k === "delete" || /\bdelete\b/.test(t)) return "delete";
  if (k === "create" || /\b(create|add)\b/.test(t)) return "create";
  if ((k === "write" || /\bwrite\b/.test(t)) && sources.some(sourceHasFileContent)) return "create";
  return "edit";
}

export function normalizeDiffSummaryForKind(
  changeKind: "create" | "edit" | "delete",
  summary: { added: number; removed: number },
): { added: number; removed: number } {
  if (changeKind === "create") return { added: summary.added, removed: 0 };
  if (changeKind === "delete") return { added: 0, removed: summary.removed };
  return summary;
}

function inferFileChangeKindFromSource(source: unknown): "create" | "edit" | "delete" | undefined {
  if (typeof source === "string") {
    if (/^\*\*\*\s+Add File:/m.test(source)) return "create";
    if (/^\*\*\*\s+Delete File:/m.test(source)) return "delete";
    if (/^\*\*\*\s+Update File:/m.test(source)) return "edit";
    if (/^(?:new file mode|--- \/dev\/null\b)/m.test(source)) return "create";
    if (/^(?:deleted file mode|\+\+\+ \/dev\/null\b)/m.test(source)) return "delete";
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(source)) return "edit";
    return undefined;
  }
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  const changesKind = inferStructuredChangesKind(record.changes);
  if (changesKind) return changesKind;
  const diffKind = inferFileChangeKindFromSource(record.diff);
  if (diffKind) return diffKind;
  const patchKind =
    inferFileChangeKindFromSource(record.patchText) ??
    inferFileChangeKindFromSource(record.patch_text) ??
    inferFileChangeKindFromSource(record.patch);
  if (patchKind) return patchKind;
  const directKind =
    readStringField(record, "changeKind") ?? readStringField(record, "change_kind");
  const normalizedKind = directKind?.toLowerCase();
  if (normalizedKind === "create" || normalizedKind === "add") return "create";
  if (normalizedKind === "delete" || normalizedKind === "remove") return "delete";
  if (normalizedKind === "edit" || normalizedKind === "update") return "edit";
  const oldText =
    readStringAllowEmpty(record, "oldText") ?? readStringAllowEmpty(record, "old_text");
  const newText =
    readStringAllowEmpty(record, "newText") ?? readStringAllowEmpty(record, "new_text");
  if (oldText !== undefined && oldText.trim().length === 0 && newText && newText.length > 0) {
    return "create";
  }
  if (newText !== undefined && newText.trim().length === 0 && oldText && oldText.length > 0) {
    return "delete";
  }
  return undefined;
}

function inferStructuredChangesKind(changes: unknown): "create" | "edit" | "delete" | undefined {
  if (!Array.isArray(changes) || changes.length === 0) return undefined;
  const kinds = changes.flatMap((change) => {
    if (!change || typeof change !== "object") return [];
    const record = change as Record<string, unknown>;
    const kind = record.kind && typeof record.kind === "object" ? record.kind : record;
    const type =
      readStringField(kind, "type") ??
      readStringField(kind, "changeKind") ??
      readStringField(kind, "change_kind");
    if (!type) return [];
    const normalized = type.toLowerCase();
    if (normalized === "add" || normalized === "create") return ["create" as const];
    if (normalized === "delete" || normalized === "remove") return ["delete" as const];
    if (normalized === "edit" || normalized === "update") return ["edit" as const];
    return [];
  });
  if (kinds.length === 0) return undefined;
  const uniqueKinds = new Set(kinds);
  return uniqueKinds.size === 1 ? kinds[0] : undefined;
}

function sourceHasFileContent(source: unknown): boolean {
  if (!source || typeof source !== "object") return false;
  const record = source as Record<string, unknown>;
  if (typeof record.content === "string" && readFileChangePath(record)) return true;
  return sourceHasFileContent(record.args) || sourceHasFileContent(record.input);
}

/** Recognise Droid/Codex `ApplyPatch`, `apply_patch`, `apply-patch` tool names. */
export function isApplyPatchToolName(name: string): boolean {
  return /^(apply[_-]?patch)$/i.test(name.trim());
}

/**
 * Classify ACP tool kind/title into a canonical item type for richer rendering.
 * - command-style tool calls → command_execution
 * - file-edit / write tool calls → file_change
 * - web search tool calls → web_search
 * - everything else → tool_call
 */
export function classifyToolCallItemType(
  kind: string | null | undefined,
  title: string | null | undefined,
  locations?: Array<{ path?: string | null; line?: number | null }> | null,
): CanonicalItemType {
  const k = (kind ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (k === "execute" || k === "shell" || /^(run|exec|shell)\b/.test(t)) return "command_execution";
  if (
    k === "edit" ||
    k === "delete" ||
    k === "move" ||
    isApplyPatchToolName(k) ||
    /\b(edit|write|create|delete|patch|move|rename)\b/.test(t) ||
    isApplyPatchToolName(t)
  ) {
    return "file_change";
  }
  if (k === "search") {
    return extractToolLocations(locations).length > 0 || !isWebSearchTitle(t)
      ? "tool_call"
      : "web_search";
  }
  if (isWebSearchTitle(t)) return "web_search";
  return "tool_call";
}

function isWebSearchTitle(title: string): boolean {
  return /\b(web[_ ]search|search(?:ing)? the web|internet search|search online)\b/.test(title);
}

/**
 * Pull text from an ACP `ToolCallContent[]` collection. ACP carries tool
 * output as one of:
 *   - `{ type: "content", content: { type: "text", text } }` — inline text
 *   - `{ type: "terminal", terminalId }` — reference to a client-hosted PTY,
 *     used by Gemini's run_shell_command tool. The session passes a resolver
 *     so we can inline that PTY's current captured stdout/stderr.
 * Diff blocks are left to richer renderers and skipped at this layer.
 *
 * Pass `terminalIdHint` when the caller knows the PTY id from earlier updates
 * but the current notification omits the `content` array — Gemini sends the
 * terminal reference on the initial `tool_call` and may not repeat it on
 * status-only `tool_call_update`s.
 */
export function extractToolCallContentText(
  content: unknown,
  resolveTerminalOutput?: (terminalId: string) => string | undefined,
  terminalIdHint?: string,
): string | undefined {
  const parts: string[] = [];
  const seenTerminals = new Set<string>();
  if (Array.isArray(content)) {
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (e.type === "terminal") {
        const terminalId = typeof e.terminalId === "string" ? e.terminalId : undefined;
        if (!terminalId || !resolveTerminalOutput) continue;
        seenTerminals.add(terminalId);
        const out = resolveTerminalOutput(terminalId);
        if (out && out.length > 0) parts.push(out);
        continue;
      }
      if (e.type !== "content") continue;
      const inner = e.content;
      if (!inner || typeof inner !== "object") continue;
      const block = inner as Record<string, unknown>;
      if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
        parts.push(block.text);
      }
    }
  }
  if (terminalIdHint && resolveTerminalOutput && !seenTerminals.has(terminalIdHint)) {
    const out = resolveTerminalOutput(terminalIdHint);
    if (out && out.length > 0) parts.push(out);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Collect inline images from an ACP tool result's `ToolCallContent[]` as
 * renderable `data:` URLs. ACP carries images as
 * `{ type: "content", content: { type: "image", data: "<base64>", mimeType } }`
 * — `extractToolCallContentText` keeps only text, so this preserves the picture
 * for the renderer's inline image card. Only inline base64 `data` is honored;
 * `uri`-only references are left to fall through to the accordion.
 */
export function extractToolCallContentImages(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const images: string[] = [];
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.type !== "content") continue;
    const inner = e.content;
    if (!inner || typeof inner !== "object") continue;
    const block = inner as Record<string, unknown>;
    if (block.type !== "image") continue;
    if (typeof block.data !== "string" || block.data.length === 0) continue;
    const mime = typeof block.mimeType === "string" ? block.mimeType : "image/png";
    images.push(`data:${mime};base64,${block.data}`);
  }
  return images;
}
