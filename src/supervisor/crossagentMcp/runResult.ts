import type { parseCompactResult } from "./compactResult";
import { compactRunResult } from "./compactRunResult";
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

export function readRunResult(
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
  const displayOutput = [
    ...record.attemptResults
      .filter((attempt) => attempt.attempt !== record.attemptIndex + 1)
      .map((attempt) => attempt.output),
    record.output,
  ].join("");
  // Non-zero cursors index the append-only live stream a caller has already
  // observed. Reads from the beginning and full reads use the final display
  // projection so replaced or suppressed text is not exposed again.
  const useCursorOutput = incremental && cursorOffset !== 0;
  const source = fullOutput
    ? options?.currentAttemptOnly === true
      ? record.output
      : displayOutput
    : useCursorOutput
      ? cursorOutputAfter(record, cursorOffset)
      : incremental
        ? displayOutput
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
    ...(quiet && record.pendingRequestIds.size > 0
      ? { pending_requests: record.pendingRequestIds.size }
      : {}),
    ...(record.error ? { error: record.error } : {}),
    ...(record.plan.attempts.length > 1
      ? {
          attempts: record.attemptResults.map((attempt) => ({
            ...attempt,
            output: fullOutput
              ? attempt.output
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
