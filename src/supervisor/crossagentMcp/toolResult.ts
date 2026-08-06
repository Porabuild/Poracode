import { DEFAULT_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS } from "./SubagentRunManager";
import type { McpToolResult } from "./types";

/** Shared `timeout_s` schema description for the blocking wait tools. */
export const TIMEOUT_S_DESCRIPTION =
  'Max seconds to wait (capped at 240). On timeout, status is "running" — call wait_for_agent again to keep waiting.';

export function jsonResult(value: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message: string): McpToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Cap `text` at `maxChars`, appending an ellipsis marker when truncated. */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}… [truncated]`;
}

/** Caller-supplied `timeout_s` → ms, clamped to [0, {@link MAX_WAIT_TIMEOUT_MS}]. */
export function parseWaitTimeoutMs(value: unknown): number {
  const requestedMs =
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, value * 1000)
      : DEFAULT_WAIT_TIMEOUT_MS;
  return Math.min(requestedMs, MAX_WAIT_TIMEOUT_MS);
}
