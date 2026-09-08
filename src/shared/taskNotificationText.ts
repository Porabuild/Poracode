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
 *
 * 4. Bold/plain `Background task started|update|completed:` report:
 * ```
 * **Background task completed:** cargo test (task id: <id>).
 * Exit code: 0.
 * Duration: 13.91 seconds.
 *
 * Output:
 * ```
 * ...
 * ```
 * ```
 *
 * 5. `<received_message>` classic report (current Antigravity ACP finish dump):
 * ```
 * <received_message>
 * Task <id> finished with the following output:
 * The command exited with code 0.
 * Output:
 * ...
 * </received_message>
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
  /** Command line from a `Background task completed:` heading, when present. */
  command?: string;
  /** Duration from a `Duration: N seconds` line, rounded to milliseconds. */
  durationMs?: number;
  /** Lifecycle stage for `**Background task …:**` / metadata status. */
  phase?: TaskNotificationPhase;
}

export type TaskNotificationPhase = "start" | "progress" | "finish";

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

  const phase = phaseFromClassicHeader(headerLine);

  return {
    ...(taskId ? { taskId } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    failed,
    output,
    ...(phase ? { phase } : {}),
  };
}

export const OPEN_RECEIVED_MESSAGE_TAG = "<received_message>";
export const CLOSE_RECEIVED_MESSAGE_TAG = "</received_message>";

const CLASSIC_TASK_REPORT_HEADER_RE =
  /^Task\s+\S+\s+(?:started|updated|is running|finished|completed|failed|exited)\b/i;

/**
 * Header of a classic `Task <id> finished|started|…` report, including
 * Antigravity `<received_message>` bodies. Ordinary prose that mentions a
 * task id must not match.
 */
export function looksLikeClassicTaskReport(body: string): boolean {
  const header = (body.trimStart().split(/\r?\n/, 1)[0] ?? "").trim();
  return (
    CLASSIC_TASK_REPORT_HEADER_RE.test(header) || /finished with the following output/i.test(header)
  );
}

function phaseFromClassicHeader(headerLine: string): TaskNotificationPhase | undefined {
  if (/\b(?:finished|completed|failed|exited)\b/i.test(headerLine)) return "finish";
  if (/\b(?:updated|still running)\b/i.test(headerLine)) return "progress";
  if (/\b(?:started|is running)\b/i.test(headerLine)) return "start";
  return undefined;
}

export const OPEN_TASK_METADATA_TAG = "<task_metadata>";
export const CLOSE_TASK_METADATA_TAG = "</task_metadata>";
export const BACKGROUND_TASK_UPDATE_HEADING = "Background Task Update:";

const FAILED_TASK_STATUS_RE = /^(failed|error|cancelled|canceled|killed)$/i;
const SUCCESS_TASK_STATUS_RE = /^(exited|completed|success|ok|succeeded)$/i;
const RUNNING_TASK_STATUS_RE = /^(running|in_progress|started|pending|background)$/i;

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
  const phase: TaskNotificationPhase = /The task exited with the following message:/i.test(raw)
    ? "finish"
    : runningPhaseFromStatus(status, exitCode);

  return {
    ...(taskId ? { taskId } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    failed,
    output,
    phase,
  };
}

function runningPhaseFromStatus(
  status: string | undefined,
  exitCode: number | undefined,
): TaskNotificationPhase {
  if (status && RUNNING_TASK_STATUS_RE.test(status)) return "progress";
  if (status && (SUCCESS_TASK_STATUS_RE.test(status) || FAILED_TASK_STATUS_RE.test(status))) {
    return "finish";
  }
  return exitCode !== undefined ? "finish" : "progress";
}

export const BACKGROUND_TASK_COMPLETED_HEADING = "Background task completed:";
export const BACKGROUND_TASK_STARTED_HEADING = "Background task started:";
export const BACKGROUND_TASK_UPDATE_REPORT_HEADING = "Background task update:";

const REPORT_HEADING_RE = /^\*{0,2}Background task (started|updated|update|completed):\*{0,2}/i;
const COMPLETED_TASK_ID_RE = /\(\s*task id:\s*([^)]+?)\s*\)\.?/i;
const COMPLETED_EXIT_RE = /^Exit code:\s*(-?\d+)\.?$/i;
const COMPLETED_DURATION_RE = /^Duration:\s*([\d.]+)\s*seconds?\.?$/i;
const COMPLETED_OUTPUT_RE = /^Output:\s*(.*)$/i;

function phaseFromReportVerb(verb: string | undefined): TaskNotificationPhase {
  const normalized = verb?.toLowerCase() ?? "";
  if (normalized === "started") return "start";
  if (normalized === "update" || normalized === "updated") return "progress";
  return "finish";
}

export interface ExtractedBackgroundTaskCompletedBlock {
  parsed: ParsedTaskNotificationBody;
  /** Byte length of the report from the start of `text`. */
  end: number;
  /**
   * True when the report has a closed output fence, or metadata followed by
   * a new prose line. Heading+metadata at EOF stays incomplete so a streamed
   * `Output:` section is not cut off.
   */
  complete: boolean;
}

/** Line-start `**Background task completed:**` / plain heading, or -1. */
export function findBackgroundTaskCompletedStart(text: string, from: number): number {
  return findBackgroundTaskReportStart(text, from);
}

/** Line-start `**Background task started|update|completed:**`, or -1. */
export function findBackgroundTaskReportStart(text: string, from: number): number {
  const verbs = ["started:", "updated:", "update:", "completed:"];
  const lower = text.toLowerCase();
  let best = -1;
  for (const verb of verbs) {
    for (const prefix of ["**background task ", "background task "]) {
      const needle = `${prefix}${verb}`;
      let searchFrom = from;
      while (searchFrom < text.length) {
        const idx = lower.indexOf(needle, searchFrom);
        if (idx === -1) break;
        if (idx === 0 || text[idx - 1] === "\n") {
          if (best === -1 || idx < best) best = idx;
          break;
        }
        searchFrom = idx + 1;
      }
    }
  }
  return best;
}

function readLine(text: string, start: number): { line: string; next: number; eof: boolean } {
  if (start >= text.length) return { line: "", next: start, eof: true };
  const cr = text.indexOf("\r", start);
  const lf = text.indexOf("\n", start);
  if (lf === -1 && cr === -1) return { line: text.slice(start), next: text.length, eof: true };
  const eol = lf === -1 || (cr !== -1 && cr < lf) ? cr : lf;
  const br = text[eol] === "\r" && text[eol + 1] === "\n" ? 2 : 1;
  return { line: text.slice(start, eol), next: eol + br, eof: false };
}

function findLineStartFenceCloser(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const { line, next, eof } = readLine(text, i);
    if (/^```[ \t]*$/.test(line)) return i;
    if (eof) return -1;
    i = next;
  }
  return -1;
}

function commandFromCompletedHeading(headingLine: string): string | undefined {
  const command = headingLine
    .replace(REPORT_HEADING_RE, "")
    .replace(COMPLETED_TASK_ID_RE, "")
    .trim()
    .replace(/[.\s]+$/u, "");
  return command.length > 0 ? command : undefined;
}

function parsedCompletedBody(input: {
  taskId?: string;
  command?: string;
  exitCode?: number;
  durationMs?: number;
  output: string;
  phase: TaskNotificationPhase;
}): ParsedTaskNotificationBody {
  const failed = input.exitCode !== undefined ? input.exitCode !== 0 : false;
  return {
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.command ? { command: input.command } : {}),
    ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    failed,
    output: input.output,
    phase: input.phase,
  };
}

/**
 * Parse a `**Background task completed:**` / `Background task completed:`
 * report starting at the beginning of `text`. Used by the ACP extractor and
 * leftover transcript formatting.
 */
export function extractBackgroundTaskCompletedBlock(
  text: string,
): ExtractedBackgroundTaskCompletedBlock {
  return extractBackgroundTaskReportBlock(text);
}

/**
 * Parse a `**Background task started|update|completed:**` report starting at
 * the beginning of `text`. Start reports are complete after the heading;
 * update/finish reports still wait for a closed output fence so streamed
 * `Output:` is not cut off.
 */
export function extractBackgroundTaskReportBlock(
  text: string,
): ExtractedBackgroundTaskCompletedBlock {
  const first = readLine(text, 0);
  const headingMatch = first.line.trimStart().match(REPORT_HEADING_RE);
  if (!headingMatch) {
    return { parsed: { failed: false, output: "" }, end: 0, complete: false };
  }

  const phase = phaseFromReportVerb(headingMatch[1]);
  const taskId = first.line.match(COMPLETED_TASK_ID_RE)?.[1]?.trim();
  const command = commandFromCompletedHeading(first.line);
  let cursor = first.eof ? text.length : first.next;
  let exitCode: number | undefined;
  let durationMs: number | undefined;

  while (cursor < text.length) {
    const { line, next, eof } = readLine(text, cursor);
    if (/^\s*$/.test(line)) {
      cursor = next;
      if (eof) break;
      continue;
    }

    const exitMatch = line.match(COMPLETED_EXIT_RE);
    if (exitMatch) {
      exitCode = parseInt(exitMatch[1]!, 10);
      cursor = next;
      if (eof) break;
      continue;
    }

    const durationMatch = line.match(COMPLETED_DURATION_RE);
    if (durationMatch) {
      durationMs = Math.round(Number.parseFloat(durationMatch[1]!) * 1000);
      cursor = next;
      if (eof) break;
      continue;
    }

    const outputMatch = line.match(COMPLETED_OUTPUT_RE);
    if (outputMatch) {
      const inline = outputMatch[1] ?? "";
      const outputStart = inline.length > 0 ? cursor + (line.length - inline.length) : next;
      return extractCompletedOutput(text, outputStart, {
        ...(taskId ? { taskId } : {}),
        ...(command ? { command } : {}),
        ...(exitCode !== undefined ? { exitCode } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        phase,
      });
    }

    return {
      parsed: parsedCompletedBody({
        ...(taskId ? { taskId } : {}),
        ...(command ? { command } : {}),
        ...(exitCode !== undefined ? { exitCode } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        output: "",
        phase,
      }),
      end: cursor,
      complete: taskId !== undefined,
    };
  }

  return {
    parsed: parsedCompletedBody({
      ...(taskId ? { taskId } : {}),
      ...(command ? { command } : {}),
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      output: "",
      phase,
    }),
    end: cursor,
    complete: phase === "start" && taskId !== undefined,
  };
}

function extractCompletedOutput(
  text: string,
  start: number,
  meta: {
    taskId?: string;
    command?: string;
    exitCode?: number;
    durationMs?: number;
    phase: TaskNotificationPhase;
  },
): ExtractedBackgroundTaskCompletedBlock {
  const bodyStart = skipLeadingBlankLines(text, start);
  const opener = readLine(text, bodyStart);
  const fenceOpen = opener.line.match(/^```[^\n`]*$/);
  if (fenceOpen) {
    const afterOpen = opener.eof ? text.length : opener.next;
    const closer = findLineStartFenceCloser(text, afterOpen);
    if (closer === -1) {
      return {
        parsed: parsedCompletedBody({
          ...meta,
          output: text.slice(afterOpen),
        }),
        end: text.length,
        complete: false,
      };
    }
    const closerLine = readLine(text, closer);
    return {
      parsed: parsedCompletedBody({
        ...meta,
        output: text.slice(afterOpen, closer).replace(/\r?\n$/, ""),
      }),
      end: closerLine.eof ? text.length : closerLine.next,
      complete: true,
    };
  }

  return {
    parsed: parsedCompletedBody({
      ...meta,
      output: text.slice(bodyStart),
    }),
    end: text.length,
    complete: false,
  };
}

function skipLeadingBlankLines(text: string, start: number): number {
  let cursor = start;
  while (cursor < text.length) {
    const { line, next, eof } = readLine(text, cursor);
    if (!/^\s*$/.test(line)) return cursor;
    if (eof) return next;
    cursor = next;
  }
  return cursor;
}
