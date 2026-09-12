import { DEFAULT_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS } from "./SubagentRunManager";
import type { McpToolResult, SubagentWaitOptions, SubagentWaitResult } from "./types";

/** Shared `timeout_s` schema description for the blocking wait tools. */
export const TIMEOUT_S_DESCRIPTION =
  'Max seconds for this wait call (default and cap 240). A timeout leaves the subagent running; status "running" means call wait_for_agent again when its result is still required, not cancel it because time elapsed.';

export const WAIT_AGAIN_INSTRUCTION =
  "Call crossagents.wait_for_agent with only required running IDs. Do not end the turn expecting a completion notification.";

export function jsonResult(value: unknown, instruction?: string): McpToolResult {
  return {
    content: [
      { type: "text", text: JSON.stringify(value, null, 2) },
      ...(instruction ? [{ type: "text" as const, text: instruction }] : []),
    ],
  };
}

type RunToolValue = SubagentWaitResult & { run_id?: string };

/** One short continuation cue per response, regardless of the number of running children. */
export function runToolResult(
  value: RunToolValue | RunToolValue[] | { runs: RunToolValue[] },
): McpToolResult {
  const runs = Array.isArray(value) ? value : "runs" in value ? value.runs : [value];
  return jsonResult(
    value,
    runs.some((run) => run.status === "running") ? WAIT_AGAIN_INSTRUCTION : undefined,
  );
}

export function errorResult(message: string): McpToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Cap `text` at `maxChars`, appending an ellipsis marker when truncated. */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}… [truncated]`;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Caller-supplied wait timeout → ms, clamped to [0, {@link MAX_WAIT_TIMEOUT_MS}].
 * Reads `timeout_s` plus the aliases calling agents guess in practice
 * (`timeout_seconds`, `timeout_ms`) — a misnamed field used to fall back
 * silently to the default, so the caller waited a different duration than it
 * believed for the run's whole lifetime.
 */
export function parseWaitTimeoutMs(args: Record<string, unknown>): number {
  const seconds = finiteNumber(args.timeout_s) ?? finiteNumber(args.timeout_seconds);
  const ms = finiteNumber(args.timeout_ms);
  const requestedMs =
    seconds !== undefined
      ? Math.max(0, seconds * 1000)
      : ms !== undefined
        ? Math.max(0, ms)
        : DEFAULT_WAIT_TIMEOUT_MS;
  return Math.min(requestedMs, MAX_WAIT_TIMEOUT_MS);
}

export function parseWaitOptions(
  args: Record<string, unknown>,
  runId?: string,
): SubagentWaitOptions {
  const outputMode = parseOutputMode(args);
  if (args.full_output === true) return { fullOutput: true };
  const cursors = args.after_output_chars_by_run;
  const runCursor =
    runId && cursors && typeof cursors === "object" && !Array.isArray(cursors)
      ? finiteNumber((cursors as Record<string, unknown>)[runId])
      : undefined;
  const afterOutputChars = runCursor ?? finiteNumber(args.after_output_chars);
  return {
    outputMode,
    fullOutput: false,
    afterOutputChars:
      afterOutputChars !== undefined && Number.isInteger(afterOutputChars)
        ? Math.max(0, afterOutputChars)
        : 0,
  };
}

export function parseOutputMode(
  args: Record<string, unknown>,
): NonNullable<SubagentWaitOptions["outputMode"]> {
  const mode = args.output_mode;
  if (mode !== undefined && mode !== "quiet" && mode !== "progress") {
    throw new Error("output_mode must be quiet or progress");
  }
  return mode ?? "quiet";
}
