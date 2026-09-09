import { parseCompactResult, MAX_COMPACT_RESULT_CHARS } from "./compactResult";
import type { SubagentAttemptResult, SubagentWaitOptions, SubagentWaitResult } from "./types";

/** Keep evidence unread while returning only the worker's validated report and control state. */
export function compactRunResult(
  record: {
    status: SubagentWaitResult["status"];
    report: ReturnType<typeof parseCompactResult> | undefined;
    error: SubagentWaitResult["error"];
    total: number;
    pendingRequests: number;
    attempts: SubagentAttemptResult[];
  },
  options?: SubagentWaitOptions,
): SubagentWaitResult {
  return {
    status: record.status,
    output: "",
    total_output_chars: Math.min(Math.max(0, options?.afterOutputChars ?? 0), record.total),
    ...(record.report && "result" in record.report ? { result: record.report.result } : {}),
    ...(record.report && "error" in record.report ? { result_error: record.report.error } : {}),
    ...(record.error ? { error: record.error } : {}),
    ...(record.pendingRequests > 0 ? { pending_requests: record.pendingRequests } : {}),
    ...(record.attempts.length > 0
      ? { attempts: record.attempts.map((attempt) => ({ ...attempt, output: "" })) }
      : {}),
  };
}

/** Preserve message starts for report parsing without changing legacy transcript/cursor joins. */
export function parseCompactRunReport(
  messages: readonly string[],
): ReturnType<typeof parseCompactResult> {
  const text = messages.join("");
  const starts = new Set<number>();
  let offset = 0;
  for (const message of messages) {
    starts.add(offset);
    offset += message.length;
  }
  const tailStart = Math.max(0, text.length - MAX_COMPACT_RESULT_CHARS - 1);
  let reportStart = -1;
  for (const marker of text.slice(tailStart).matchAll(/```crossagents-result[ \t]*\r?\n/g)) {
    const position = tailStart + marker.index;
    if (starts.has(position) || text[position - 1] === "\n") reportStart = position;
  }
  return parseCompactResult(reportStart >= 0 ? text.slice(reportStart) : text);
}
