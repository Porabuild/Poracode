/**
 * Leaf param/item extractors for the Codex canonical mapper.
 *
 * These helpers read loosely-typed Codex app-server notification params and
 * item payloads into narrow shapes the domain modules consume. They have no
 * dependencies on the rest of the mapper.
 */

import { readStringField } from "../../fileChangeSummary";
import type { TurnPlanStepStatus } from "../protocol";

const CODEX_PLAN_STATUS_MAP = {
  pending: "pending",
  inProgress: "in_progress",
  completed: "completed",
} as const satisfies Record<TurnPlanStepStatus, "pending" | "in_progress" | "completed">;

export interface CodexItemPayload {
  id?: string;
  type?: string;
  kind?: string;
  text?: string;
  review?: string;
  title?: string;
  name?: string;
  command?: string;
  aggregatedOutput?: string | null;
  formattedOutput?: string | null;
  cwd?: string;
  path?: string;
  file_path?: string;
  filePath?: string;
  relative_path?: string;
  relativePath?: string;
  notebook_path?: string;
  query?: string;
  exitCode?: number;
  durationMs?: number;
  status?: string;
  changeKind?: string;
  changes?: unknown;
  content?: unknown;
  server?: string;
  serverId?: string;
  tool?: string;
  arguments?: unknown;
  error?: unknown;
  senderThreadId?: string;
  sender_thread_id?: string;
  receiverThreadIds?: unknown;
  receiver_thread_ids?: unknown;
  agentsStates?: unknown;
  agents_states?: unknown;
  prompt?: string;
  model?: unknown;
  reasoningEffort?: unknown;
  reasoning_effort?: unknown;
  toolKind?: unknown;
  tool_kind?: unknown;
  agentThreadId?: unknown;
  agentPath?: unknown;
  /** Generic tool input (codex `mcp` / `dynamic` tool items). */
  input?: unknown;
  args?: unknown;
  /** Generic tool output. */
  output?: unknown;
  result?: unknown;
  /** Web search may carry a results array. */
  results?: unknown;
  /** Responses-style web search action (`search`, `open_page`, `find_in_page`). */
  action?: unknown;
}

export function readItem(
  params: Record<string, unknown> | undefined,
): CodexItemPayload | undefined {
  if (!params) return undefined;
  if (params.item && typeof params.item === "object") {
    return params.item as CodexItemPayload;
  }
  return params as CodexItemPayload;
}

export function readTurnId(params: Record<string, unknown> | undefined): string | undefined {
  if (params && typeof params.turnId === "string") return params.turnId;
  const turn = params?.turn;
  if (turn && typeof turn === "object") {
    const value = (turn as Record<string, unknown>).id;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function readItemId(
  params: Record<string, unknown> | undefined,
  fallback?: CodexItemPayload,
): string | undefined {
  if (params && typeof params.itemId === "string") return params.itemId;
  if (fallback && typeof fallback.id === "string") return fallback.id;
  return undefined;
}

export function readTurnState(
  method: string,
  params: Record<string, unknown> | undefined,
): "completed" | "failed" | "interrupted" | "cancelled" {
  // Legacy-only; current app-server sends `turn/completed` with an interrupted status.
  if (method === "turn/aborted") return "interrupted";
  const turn = params?.turn;
  const status = turn && typeof turn === "object" ? (turn as Record<string, unknown>).status : null;
  switch (status) {
    case "failed":
      return "failed";
    case "interrupted":
      return "interrupted";
    case "cancelled":
      return "cancelled";
    default:
      return "completed";
  }
}

export function readCodexErrorMessage(
  params: Record<string, unknown> | undefined,
): string | undefined {
  const direct = readStringField(params, "message", "errorMessage");
  if (direct) return direct;
  const message = readTurnErrorMessage(params?.error);
  if (message) return message;
  const turn = params?.turn;
  if (turn && typeof turn === "object") {
    const turnMessage = readTurnErrorMessage((turn as Record<string, unknown>).error);
    if (turnMessage) return turnMessage;
  }
  return undefined;
}

function readTurnErrorMessage(value: unknown): string | undefined {
  return readStringField(value, "message");
}

export function readCodexPlanSteps(
  params: Record<string, unknown> | undefined,
): Array<{ step: string; status: "pending" | "in_progress" | "completed" }> {
  const rawPlan = params?.plan;
  if (!Array.isArray(rawPlan)) return [];
  return rawPlan.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const step = readStringField(record, "step");
    if (!step) return [];
    return [
      {
        step,
        status: codexPlanStepStatus(record.status),
      },
    ];
  });
}

function codexPlanStepStatus(raw: unknown): "pending" | "in_progress" | "completed" {
  if (raw === "in_progress") return "in_progress";
  return typeof raw === "string" && raw in CODEX_PLAN_STATUS_MAP
    ? CODEX_PLAN_STATUS_MAP[raw as TurnPlanStepStatus]
    : "pending";
}

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

export function readChangesPayload(source: CodexItemPayload): unknown {
  return source.changes !== undefined ? { changes: source.changes } : undefined;
}

export function readPathField(record: Record<string, unknown>): string | undefined {
  const keys = [
    "path",
    "file_path",
    "filePath",
    "filepath",
    "relative_path",
    "relativePath",
    "notebook_path",
    "notebookPath",
  ];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

/**
 * Pull plain text out of a Codex message item. Codex 0.122+ packs text into
 * `content` as an array of `{ type: "text", text }` blocks; older shapes set
 * `item.text` directly.
 */
export function extractMessageText(item: CodexItemPayload): string {
  if (typeof item.text === "string" && item.text.length > 0) return item.text;
  if (typeof item.review === "string" && item.review.length > 0) return item.review;
  if (Array.isArray(item.content)) {
    const parts: string[] = [];
    for (const block of item.content) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: unknown; text?: unknown };
      if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
    }
    if (parts.length > 0) return parts.join("");
  }
  return "";
}
