import { randomUUID } from "node:crypto";
import type { CanonicalItemType } from "@/shared/contracts";

export interface CodexMapperState {
  threadId: string;
  /** Most recent turn id reported via `turn.started`. */
  currentTurnId?: string;
  /** Open assistant_message item id, if any (closed on `turn/completed`). */
  openAssistantItemId?: string;
  /** Map Codex `itemId` → our internal item id. */
  itemIdMap: Map<string, string>;
  /** Map Codex `itemId` → canonical type, for routing deltas + completions. */
  itemTypeMap: Map<string, CanonicalItemType>;
  /** Command items that already streamed outputDelta; used to avoid duplicate aggregated output. */
  commandOutputSeenSet: Set<string>;
  /** Accumulated file-change output, used when Codex reports the path there. */
  fileChangeOutputMap: Map<string, string>;
  /** Last path emitted for a file-change item, to avoid duplicate updates. */
  fileChangePathMap: Map<string, string>;
  /** Current chat item that mirrors the provider's active goal state. */
  goalItemId?: string;
  /** Provider-created timestamp for the current goal, when reported. */
  goalCreatedAt?: number;
  /** Objective for the current goal, used as a fallback identity. */
  goalObjective?: string;
  /** Current plan item sourced from `turn/plan/updated` notifications. */
  turnPlanItemId?: string;
}

export function createCodexMapperState(threadId: string): CodexMapperState {
  return {
    threadId,
    itemIdMap: new Map(),
    itemTypeMap: new Map(),
    commandOutputSeenSet: new Set(),
    fileChangeOutputMap: new Map(),
    fileChangePathMap: new Map(),
  };
}

export function newItemId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Normalize Codex's item-type label into our canonical enum: lowercase, split
 * camelCase, then keyword match.
 */
export function canonicalTypeFor(raw: string | undefined | null): CanonicalItemType {
  const type = normalizeItemType(raw);
  if (!type) return "tool_call";
  if (type.includes("user")) return "user_message";
  if (type.includes("agent message") || type.includes("assistant")) return "assistant_message";
  if (type.includes("reasoning") || type.includes("thought")) return "reasoning";
  if (type.includes("plan") || type.includes("todo")) return "plan";
  if (type.includes("goal")) return "goal";
  if (type.includes("command")) return "command_execution";
  if (type.includes("file change") || type.includes("patch") || type.includes("edit"))
    return "file_change";
  if (type.includes("web search")) return "web_search";
  if (type.includes("mcp")) return "mcp_tool_call";
  if (type.includes("image")) return "image_view";
  if (type.includes("dynamic")) return "dynamic_tool_call";
  if (type.includes("tool")) return "tool_call";
  if (type.includes("error")) return "error";
  return "tool_call";
}

function normalizeItemType(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function streamForType(
  type: CanonicalItemType,
): "assistant_text" | "reasoning_text" | undefined {
  if (type === "assistant_message") return "assistant_text";
  if (type === "reasoning") return "reasoning_text";
  return undefined;
}
