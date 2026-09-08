import { msg } from "@lingui/core/macro";
import {
  backgroundTaskUpdateBlockRe,
  extractBackgroundTaskCompletedBlock,
  findBackgroundTaskCompletedStart,
  looksLikeClassicTaskReport,
  parseBackgroundTaskUpdateBlock,
  parseTaskNotificationBody,
  type ParsedTaskNotificationBody,
} from "@/shared/taskNotificationText";
import { i18n } from "@/renderer/i18n/i18n";

/**
 * Antigravity ACP background tasks and historical transcript logs can embed
 * `<task_notification>`, `<SYSTEM_MESSAGE>`, `<received_message>` task reports,
 * markdown `# Background Task Update` / `<task_metadata>`, or
 * `**Background task completed:**` blocks into markdown text. Render these
 * cleanly as formatted task notification callouts with monospace output blocks
 * rather than raw XML tags or system prompt noise.
 * Matches inside fenced code blocks are left untouched — they are literal
 * code content, and rewriting them would corrupt the fence structure.
 *
 * Wired into chat markdown through the manifest's `formatTranscriptMarkdown`
 * capability, so only Antigravity threads pay for it and no shared chat code
 * carries this vendor format.
 */
export function formatTaskNotificationMarkdown(text: string): string {
  if (
    !text.includes("<task_notification>") &&
    !text.includes("<SYSTEM_MESSAGE>") &&
    !text.includes("<received_message>") &&
    !text.includes("<task_metadata>") &&
    !/Background Task Update/i.test(text) &&
    !/Background task (?:started|updated?|completed)/i.test(text)
  ) {
    return text;
  }
  const fenceLines = scanFenceLines(text);
  const withCompletedReports = replaceBackgroundTaskCompletedReports(text, fenceLines);
  const fenceLinesAfterCompleted =
    withCompletedReports === text ? fenceLines : scanFenceLines(withCompletedReports);
  const withBackgroundUpdates = withCompletedReports.replace(
    backgroundTaskUpdateBlockRe(),
    (match: string, offset: number) => {
      if (isInsideFence(fenceLinesAfterCompleted, offset)) return match;
      return formatParsedTaskNotification(parseBackgroundTaskUpdateBlock(match));
    },
  );
  const fenceLinesAfterBg =
    withBackgroundUpdates === withCompletedReports
      ? fenceLinesAfterCompleted
      : scanFenceLines(withBackgroundUpdates);
  return withBackgroundUpdates.replace(
    /(?:The following is a <SYSTEM_MESSAGE>[^\n]*\r?\n+)?<SYSTEM_MESSAGE>([\s\S]*?)<\/SYSTEM_MESSAGE>|<task_notification>([\s\S]*?)<\/task_notification>|<received_message>([\s\S]*?)<\/received_message>/gi,
    (
      match: string,
      sysBody: string | undefined,
      taskBody: string | undefined,
      receivedBody: string | undefined,
      offset: number,
    ) => {
      if (isInsideFence(fenceLinesAfterBg, offset)) return match;
      if (receivedBody !== undefined && !looksLikeClassicTaskReport(receivedBody)) return match;
      const body = sysBody ?? taskBody ?? receivedBody ?? "";
      return formatParsedTaskNotification(parseTaskNotificationBody(body));
    },
  );
}

function replaceBackgroundTaskCompletedReports(text: string, fenceLines: FenceLine[]): string {
  let out = "";
  let cursor = 0;
  while (cursor < text.length) {
    const start = findBackgroundTaskCompletedStart(text, cursor);
    if (start === -1) {
      out += text.slice(cursor);
      break;
    }
    if (isInsideFence(fenceLines, start)) {
      out += text.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }
    const extracted = extractBackgroundTaskCompletedBlock(text.slice(start));
    if (!extracted.complete || !extracted.parsed.taskId) {
      out += text.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }
    out += text.slice(cursor, start);
    out += formatParsedTaskNotification(extracted.parsed);
    cursor = start + extracted.end;
  }
  return out;
}

function formatParsedTaskNotification(parsed: ParsedTaskNotificationBody): string {
  const headerParts = [`**${i18n._(msg`Task Notification`)}**`];
  if (parsed.taskId) {
    headerParts.push(`— \`${parsed.taskId}\``);
  }
  if (parsed.exitCode !== undefined) {
    headerParts.push(`(${i18n._(msg`Exit code ${parsed.exitCode}`)})`);
  } else if (parsed.failed) {
    headerParts.push(`(${i18n._(msg`Failed`)})`);
  }
  const header = `> ${headerParts.join(" ")}`;
  if (!parsed.output) {
    return header;
  }
  const fence = "`".repeat(fenceLengthForOutput(parsed.output));
  return `${header}\n\n${fence}console\n${parsed.output}\n${fence}`;
}

/** One entry per line of `text`: fence state at the line start, and whether
 *  the line itself is a ``` fence delimiter. */
interface FenceLine {
  start: number;
  end: number;
  inside: boolean;
  isFenceDelimiter: boolean;
}

function scanFenceLines(text: string): FenceLine[] {
  const lines: FenceLine[] = [];
  let inFence = false;
  let offset = 0;
  for (const line of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []) {
    const isFenceDelimiter = /^ {0,3}```/.test(line);
    lines.push({ start: offset, end: offset + line.length, inside: inFence, isFenceDelimiter });
    if (isFenceDelimiter) inFence = !inFence;
    offset += line.length;
  }
  return lines;
}

function isInsideFence(lines: FenceLine[], offset: number): boolean {
  const line = lines.find((entry) => offset < entry.end);
  // A ``` delimiter line may carry content after the marker, so treat matches
  // starting on a delimiter line as fenced too.
  return line !== undefined && (line.inside || line.isFenceDelimiter);
}

/** CommonMark closes a fence only on a backtick run at least as long as the
 *  opening one, so wrap the output wide enough to contain it verbatim. */
function fenceLengthForOutput(output: string): number {
  let fenceLength = 3;
  for (const match of output.matchAll(/^ {0,3}(`{3,})/gm)) {
    fenceLength = Math.max(fenceLength, match[1]!.length + 1);
  }
  return fenceLength;
}
