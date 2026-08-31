/**
 * Parser for the body of an Antigravity `<task_notification>` block. The ACP
 * supervisor extracts these from streamed agent text into command-execution
 * events, and the renderer formats leftovers in historical transcript markdown;
 * both consume this single parser so the format is read in exactly one place.
 *
 * Expected shape:
 *
 * ```
 * Task <id> completed with exit code <code | 0>.
 * Output:
 * <output>
 * ```
 */

export interface ParsedTaskNotificationBody {
  /** `Task <id>` identifier from the header line; `undefined` when absent. */
  taskId?: string;
  /** Explicit `exit code N` / `code N` from the header line; `undefined` when absent. */
  exitCode?: number;
  /** Whether the header line mentions `fail`/`error`. */
  failed: boolean;
  /** Everything after the `Output:` marker (or after the header line), trimmed. */
  output: string;
}

/**
 * Parse the raw body between `<task_notification>` and `</task_notification>`.
 * The header line carries the identity and status; output text is never
 * interpreted as status even when it mentions codes or errors of its own.
 */
export function parseTaskNotificationBody(body: string): ParsedTaskNotificationBody {
  const trimmed = body.trim();
  const newlineIndex = trimmed.search(/\r?\n/);
  const headerLine = newlineIndex === -1 ? trimmed : trimmed.slice(0, newlineIndex);
  const taskMatch = headerLine.match(/Task\s+([^\s\r\n]+)/i);
  const codeMatch = headerLine.match(/(?:exit\s+code|code)\s+(\d+)/i);
  const outputIndex = trimmed.indexOf("Output:\n");
  let output: string;
  if (outputIndex !== -1) {
    output = trimmed.slice(outputIndex + "Output:\n".length);
  } else {
    const outputIndexAlt = trimmed.indexOf("Output:");
    if (outputIndexAlt !== -1) {
      output = trimmed.slice(outputIndexAlt + "Output:".length);
    } else if (taskMatch) {
      output = trimmed.split(/\r?\n/).slice(1).join("\n");
    } else {
      output = trimmed;
    }
  }
  return {
    ...(taskMatch ? { taskId: taskMatch[1] } : {}),
    ...(codeMatch ? { exitCode: parseInt(codeMatch[1]!, 10) } : {}),
    failed: /fail|error/i.test(headerLine),
    output: output.trim(),
  };
}
