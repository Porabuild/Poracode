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
