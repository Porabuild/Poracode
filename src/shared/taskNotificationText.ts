/**
 * Parser for the body of an Antigravity `<task_notification>` or
 * `<SYSTEM_MESSAGE>` block. The ACP supervisor extracts these from streamed
 * agent text into command-execution events, and the renderer formats leftovers
 * in historical transcript markdown; both consume this single parser so the
 * format is read in exactly one place.
 *
 * Expected shapes:
 *
 * 1. Classic `<task_notification>`:
 * ```
 * Task <id> completed with exit code <code | 0>.
 * Output:
 * <output>
 * ```
 *
 * 2. Antigravity `<SYSTEM_MESSAGE>`:
 * ```
 * [Message] ... content=Task id "<id>" finished with result:
 * The command exited with code 0.
 * Stdout:
 * ...
 * Stderr:
 * ...
 * Log: file:///...
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

function extractSection(text: string, label: string, endLabels: string[]): string {
  const idx = text.search(new RegExp(`^${label}\\s*`, "m"));
  if (idx === -1) return "";
  const afterLabel = text.slice(idx);
  const lineEnd = afterLabel.indexOf("\n");
  const contentStart = lineEnd === -1 ? afterLabel.length : lineEnd + 1;
  const rest = afterLabel.slice(contentStart);
  let minEnd = rest.length;
  for (const endLabel of endLabels) {
    const endIdx = rest.search(new RegExp(`^${endLabel}`, "m"));
    if (endIdx !== -1 && endIdx < minEnd) {
      minEnd = endIdx;
    }
  }
  return rest.slice(0, minEnd).trim();
}

/**
 * Parse the raw body of a task notification (between `<task_notification>` tags
 * or `<SYSTEM_MESSAGE>` tags).
 */
export function parseTaskNotificationBody(body: string): ParsedTaskNotificationBody {
  const trimmed = body.trim();
  const newlineIndex = trimmed.search(/\r?\n/);
  const headerLine = newlineIndex === -1 ? trimmed : trimmed.slice(0, newlineIndex);

  const antTaskIdMatch = trimmed.match(/Task\s+id\s*["']?([^"'\s\r\n]+)["']?/i);
  const antSenderMatch = trimmed.match(/sender=([^\s\r\n]+)/i);
  const classicTaskMatch = headerLine.match(/Task\s+([^\s\r\n]+)/i);
  const taskId = antTaskIdMatch
    ? antTaskIdMatch[1]
    : classicTaskMatch && classicTaskMatch[1]?.toLowerCase() !== "id"
      ? classicTaskMatch[1]
      : antSenderMatch?.[1];

  const codeMatch = trimmed.match(/(?:exited\s+with\s+code|exit\s+code|code)\s+(\d+)/i);
  const exitCode = codeMatch ? parseInt(codeMatch[1]!, 10) : undefined;

  const isAntMessage = !!(antTaskIdMatch || antSenderMatch || trimmed.includes("[Message]"));

  let output = "";
  if (trimmed.includes("Stdout:") || trimmed.includes("Stderr:")) {
    const stdout = extractSection(trimmed, "Stdout:", ["Stderr:", "Log:"]);
    const stderr = extractSection(trimmed, "Stderr:", ["Log:"]);
    if (stdout && stderr) output = `${stdout}\n${stderr}`;
    else output = stdout || stderr || "";
  } else {
    const outputIndex = trimmed.indexOf("Output:\n");
    if (outputIndex !== -1) {
      const rest = trimmed.slice(outputIndex + "Output:\n".length);
      const logIdx = rest.search(/^Log:\s*file:\/\//m);
      output = logIdx !== -1 ? rest.slice(0, logIdx).trim() : rest;
    } else {
      const outputIndexAlt = trimmed.indexOf("Output:");
      if (outputIndexAlt !== -1) {
        const rest = trimmed.slice(outputIndexAlt + "Output:".length);
        const logIdx = rest.search(/^Log:\s*file:\/\//m);
        output = logIdx !== -1 ? rest.slice(0, logIdx).trim() : rest;
      } else if (isAntMessage) {
        output = "";
      } else if (classicTaskMatch) {
        output = trimmed.split(/\r?\n/).slice(1).join("\n");
      } else {
        output = trimmed;
      }
    }
  }

  output = output.replace(/^Log:\s*file:\/\/[^\r\n]*$/gm, "").trim();

  const failed =
    exitCode !== undefined
      ? exitCode !== 0
      : /fail|error/i.test(isAntMessage ? trimmed : headerLine);

  return {
    ...(taskId ? { taskId } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    failed,
    output,
  };
}
