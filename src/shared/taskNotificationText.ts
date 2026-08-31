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
 *
 * 3. Markdown `# Background Task Update` with `<task_metadata>`:
 * a heading `# Background Task Update: <id>`, optional fenced command output
 * after "The task exited with the following message:", then a
 * `<task_metadata>` block carrying `task_id`, `status`, and `exit_code`.
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

export const OPEN_TASK_METADATA_TAG = "<task_metadata>";
export const CLOSE_TASK_METADATA_TAG = "</task_metadata>";
export const BACKGROUND_TASK_UPDATE_HEADING = "Background Task Update:";

const FAILED_TASK_STATUS_RE = /^(failed|error|cancelled|canceled|killed)$/i;
const SUCCESS_TASK_STATUS_RE = /^(exited|completed|success|ok|succeeded)$/i;

/** Fresh regex: `/g` lastIndex must not leak across callers. */
export function backgroundTaskUpdateBlockRe(): RegExp {
  return /^#{1,6}\s*Background Task Update:[\s\S]*?<task_metadata>[\s\S]*?<\/task_metadata>/gim;
}

function extractTaskMetadataBody(raw: string): string {
  const openIdx = raw.search(/<task_metadata>/i);
  if (openIdx === -1) return "";
  const afterOpen = raw.slice(openIdx + OPEN_TASK_METADATA_TAG.length);
  const closeIdx = afterOpen.search(/<\/task_metadata>/i);
  return closeIdx === -1 ? afterOpen : afterOpen.slice(0, closeIdx);
}

/**
 * Command output sits between the "following message" label and `<task_metadata>`.
 * Strip one wrapping fence if present, but keep inner fences as payload — the
 * first-closer regex would truncate `cat` of markdown at ```md.
 */
function extractBackgroundUpdateOutput(raw: string): string {
  const messageIdx = raw.search(/The task exited with the following message:/i);
  if (messageIdx === -1) return "";
  let rest = raw.slice(messageIdx).replace(/The task exited with the following message:\s*/i, "");
  const metaIdx = rest.search(/<task_metadata>/i);
  const hadMeta = metaIdx !== -1;
  if (hadMeta) rest = rest.slice(0, metaIdx);
  const opener = rest.match(/^\s*```[^\n`]*\r?\n/);
  if (opener) {
    rest = rest.slice(opener[0].length);
    // Only strip a wrapping closer when the metadata footer is present, so a
    // truncated body that ends on an inner fence is not mistaken for the wrap.
    if (hadMeta) {
      rest = rest.replace(/(?:\r?\n)?```[ \t]*(?:\r?\n)*$/, "");
    }
  }
  return rest.replace(/\r?\n$/, "");
}

/**
 * Parse a markdown `# Background Task Update` block (heading, optional fenced
 * output, and `<task_metadata>`). Missing pieces are tolerated so a truncated
 * stream can still yield a task id at a turn boundary.
 */
export function parseBackgroundTaskUpdateBlock(raw: string): ParsedTaskNotificationBody {
  const metaBody = extractTaskMetadataBody(raw);
  const metaTaskId = metaBody.match(/^\s*task_id:\s*(\S+)/im)?.[1];
  const headingTaskId =
    raw.match(/Background Task Update:\s*`([^`]+)`/i)?.[1] ??
    raw.match(/Background Task Update:\s*(\S+)/i)?.[1];
  const taskId = metaTaskId ?? headingTaskId;

  const status = metaBody.match(/^\s*status:\s*(\S+)/im)?.[1];
  const exitMatch = metaBody.match(/^\s*exit_code:\s*(-?\d+)/im);
  let exitCode = exitMatch ? parseInt(exitMatch[1]!, 10) : undefined;
  // Success statuses without an explicit code mean exit 0. Failed/cancelled
  // without `exit_code` stay code-less so leftover callouts can show Failed
  // instead of a synthesized "Exit code 1".
  if (exitCode === undefined && status && SUCCESS_TASK_STATUS_RE.test(status)) {
    exitCode = 0;
  }

  const output = extractBackgroundUpdateOutput(raw);
  const failed = exitCode !== undefined ? exitCode !== 0 : FAILED_TASK_STATUS_RE.test(status ?? "");

  return {
    ...(taskId ? { taskId } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    failed,
    output,
  };
}
