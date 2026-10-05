/**
 * Frozen R15 reader oracle. Preserve its full join/clip implementation.
 * runResult.ts SHA-256: a709b84c33f1263269bb4201dd1e71b24bcaf082e47318cb78963cce2d67cabf
 * compactRunResult.ts SHA-256: 46a6ba9fe3cbc971d0d1fad27e269389bfa5d3b00159e65bada2c25604c6ac4a
 */
import type { parseCompactResult } from "./compactResult";
import type { PreparedSubagentRun } from "./spawnPlan";
import type { SubagentAttemptResult, SubagentWaitOptions, SubagentWaitResult } from "./types";

interface RunResultRecord {
  status: SubagentWaitResult["status"];
  output: string;
  cursorOutput: string;
  cursorOutputEdits: Array<{ start: number; end: number; key: string; replacement: string }>;
  attemptResults: SubagentAttemptResult[];
  attemptIndex: number;
  pendingRequestIds: Set<string>;
  report: ReturnType<typeof parseCompactResult> | undefined;
  error: SubagentWaitResult["error"];
  plan: PreparedSubagentRun;
}

/**
 * Tail cap on the incremental output a wait/status call returns while a run is
 * still in progress. Mid-run text is process narration the parent rarely needs
 * verbatim; a long-polling parent otherwise re-ingests the child's entire
 * growing transcript on every check (observed at 100k+ tokens per poll).
 */
export const MAX_RUNNING_OUTPUT_TAIL_CHARS = 1_000;
/** Tail cap on the incremental output returned once a run has settled. */
const MAX_SETTLED_OUTPUT_TAIL_CHARS = 16_000;
/** Tail cap on the per-attempt outputs echoed inside `attempts`. */
const MAX_ATTEMPT_OUTPUT_TAIL_CHARS = 2_000;

/** Keep the newest `maxChars` of `text`, prefixing a marker for the omitted prefix. */
function clipOutputTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `[…${omitted} earlier chars omitted — pass full_output=true for the complete output]\n${text.slice(-maxChars)}`;
}

export function readReleasedRunResult(
  record: RunResultRecord,
  options?: SubagentWaitOptions,
): SubagentWaitResult {
  const fullOutput = options?.fullOutput === true;
  if (record.plan.resultMode === "compact" && !fullOutput && options?.outputMode !== "progress") {
    return compactRunResult(
      {
        status: record.status,
        report: record.report,
        error: record.error,
        total: record.cursorOutput.length,
        pendingRequests: record.pendingRequestIds.size,
        attempts: record.plan.attempts.length > 1 ? record.attemptResults : [],
      },
      options,
    );
  }
  const quiet = !fullOutput && options?.outputMode === "quiet" && record.status === "running";
  const incremental = !fullOutput && options?.afterOutputChars !== undefined;
  const cursorOffset = options?.afterOutputChars ?? 0;
  // Assemble fallback history only for reads that actually display it. Status,
  // current-attempt and nonzero-cursor reads retain their original projections
  // without copying an unrelated potentially large combined transcript.
  const displayOutput = () =>
    [
      ...record.attemptResults
        .filter((attempt) => attempt.attempt !== record.attemptIndex + 1)
        .map((attempt) => attempt.output),
      record.output,
    ].join("");
  // Non-zero cursors index the append-only live stream a caller has already
  // observed. Reads from the beginning and full reads use the final display
  // projection so replaced or suppressed text is not exposed again.
  const useCursorOutput = incremental && cursorOffset !== 0;
  const source = quiet
    ? ""
    : fullOutput
      ? options?.currentAttemptOnly === true
        ? record.output
        : displayOutput()
      : useCursorOutput
        ? cursorOutputAfter(record, cursorOffset)
        : incremental
          ? displayOutput()
          : record.output;
  const total = record.cursorOutput.length;
  const delta = source;
  const tailCap =
    record.status === "running" ? MAX_RUNNING_OUTPUT_TAIL_CHARS : MAX_SETTLED_OUTPUT_TAIL_CHARS;
  const output = quiet ? "" : fullOutput ? delta : clipOutputTail(delta, tailCap);
  const isCompleteTranscript = fullOutput || (!useCursorOutput && delta.length <= tailCap);
  return {
    status: record.status,
    output,
    ...(quiet
      ? { total_output_chars: Math.min(Math.max(0, cursorOffset), total) }
      : incremental || !isCompleteTranscript
        ? { total_output_chars: total }
        : {}),
    ...(record.pendingRequestIds.size > 0
      ? { pending_requests: record.pendingRequestIds.size }
      : {}),
    ...(record.error ? { error: record.error } : {}),
    ...(record.plan.attempts.length > 1
      ? {
          attempts: record.attemptResults.map((attempt) => ({
            ...attempt,
            output: fullOutput
              ? attempt.output
              : quiet
                ? ""
                : clipOutputTail(attempt.output, MAX_ATTEMPT_OUTPUT_TAIL_CHARS),
          })),
        }
      : {}),
  };
}

function cursorOutputAfter(record: RunResultRecord, requestedOffset: number): string {
  const offset = Math.min(Math.max(0, requestedOffset), record.cursorOutput.length);
  const parts: string[] = [];
  const emitted = new Set<string>();
  let position = offset;
  for (const edit of [...record.cursorOutputEdits].sort(
    (left, right) => left.start - right.start,
  )) {
    if (edit.end <= position) continue;
    if (edit.start > position) parts.push(record.cursorOutput.slice(position, edit.start));
    if (!emitted.has(edit.key)) {
      parts.push(edit.replacement);
      emitted.add(edit.key);
    }
    position = Math.max(position, edit.end);
  }
  parts.push(record.cursorOutput.slice(position));
  return parts.join("");
}

/** Keep evidence unread while returning only the worker's validated report and control state. */
function compactRunResult(
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
