/**
 * Antigravity ACP task notification handler.
 *
 * Antigravity (and Google's localharness) executes commands asynchronously
 * when they run in the background. When completed, the harness emits:
 *
 * Classic XML:
 * ```xml
 * <task_notification>
 * Task <id> completed with exit code <code | 0>.
 * Output:
 * <output>
 * </task_notification>
 * ```
 *
 * Or Antigravity system message:
 * ```
 * The following is a <SYSTEM_MESSAGE> not actually sent by the user...
 * <SYSTEM_MESSAGE>
 * [Message] ... content=Task id "<id>" finished with result:
 * The command exited with code 0.
 * Output:
 * ...
 * </SYSTEM_MESSAGE>
 * ```
 *
 * Or markdown `# Background Task Update` with `<task_metadata>`: a heading
 * carrying the task id, optional fenced command output, then a metadata block
 * with `task_id`, `status`, and `exit_code`.
 *
 * This module extracts and maps these notifications into canonical
 * `command_execution` events (either updating an already-tracked command
 * or emitting a standalone command accordion) and cleans up XML/system tags so they
 * do not leak into assistant message streams as unformatted text.
 */

import type { CanonicalItemType, RuntimeEvent } from "@/shared/contracts";
import {
  BACKGROUND_TASK_UPDATE_HEADING,
  CLOSE_TASK_METADATA_TAG,
  OPEN_TASK_METADATA_TAG,
  parseBackgroundTaskUpdateBlock,
  parseTaskNotificationBody,
  type ParsedTaskNotificationBody,
} from "@/shared/taskNotificationText";
import { msg } from "@/shared/messages";
import type { AcpMapperState } from "./state";
import { newItemId, closeAllOpenContentItems, getContentItemState } from "./state";

export interface ParsedTaskNotification {
  raw: string;
  taskId: string;
  exitCode: number;
  output: string;
}

const OPEN_TASK_TAG = "<task_notification>";
const CLOSE_TASK_TAG = "</task_notification>";
const OPEN_SYSTEM_TAG = "<SYSTEM_MESSAGE>";
const CLOSE_SYSTEM_TAG = "</SYSTEM_MESSAGE>";

const SYSTEM_MESSAGE_PREAMBLE_PREFIX =
  "The following is a <SYSTEM_MESSAGE> not actually sent by the user. It is provided by the system as important information to pay attention to.";

const BACKGROUND_TASK_UPDATE_PREFIX = `# ${BACKGROUND_TASK_UPDATE_HEADING}`;
/** Hold a trailing heading fragment only once it is unique (`# Bac…`).
 *  `# ` / `# B` are ordinary markdown and must still stream. */
const BACKGROUND_TASK_UPDATE_PREFIX_MIN = 5;

/** Command output that merely mentions a "task id" is not a background task;
 *  only register when the producer said the command runs as one. */
const BACKGROUND_SIGNAL_RE = /background\s+task/i;
/** Shape a truncated `<task_notification>` or `<SYSTEM_MESSAGE>` body must have to be completed
 *  leniently at a turn boundary instead of streaming as plain text. */
const TRUNCATED_BODY_SHAPE_RE =
  /completed with|failed with|Output:|exited with code|finished with result|content=Task id/i;
const TRUNCATED_BACKGROUND_UPDATE_SHAPE_RE = /The task exited|task_id:|exit_code:|<task_metadata>/i;

interface AcpToolCallSource {
  toolCallId: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  content?: unknown;
}

/**
 * Pull complete `<task_notification>`, `<SYSTEM_MESSAGE>`, or markdown
 * `# Background Task Update` + `<task_metadata>` blocks out of streamed agent
 * text, mapping each to a parsed notification. `cleanText` is the input with
 * the blocks surgically removed — every other byte (including boundary
 * whitespace) is preserved, because callers concatenate the returned text into
 * streaming assistant deltas. An unterminated tail stays in `cleanText`.
 */
export function extractTaskNotifications(text: string): {
  notifications: ParsedTaskNotification[];
  cleanText: string;
} {
  const scanned = scanTaskNotificationBlocks(text);
  return {
    notifications: scanned.notifications,
    cleanText: scanned.cleanText + (scanned.unclosed ?? ""),
  };
}

function toParsedTaskNotification(
  raw: string,
  parsed: ParsedTaskNotificationBody,
): ParsedTaskNotification {
  return {
    raw: raw.trim(),
    taskId: parsed.taskId ?? "unknown",
    exitCode: parsed.exitCode ?? (parsed.failed ? 1 : 0),
    output: parsed.output,
  };
}

type NotificationBlockKind = "task" | "system" | "backgroundUpdate";

function indexOfIgnoreCase(haystack: string, needle: string, from: number): number {
  return haystack.toLowerCase().indexOf(needle.toLowerCase(), from);
}

/** Line-start `# Background Task Update:` heading, or -1. */
function findBackgroundTaskUpdateHeading(text: string, from: number): number {
  const needle = BACKGROUND_TASK_UPDATE_HEADING.toLowerCase();
  const lower = text.toLowerCase();
  let searchFrom = from;
  while (searchFrom < text.length) {
    const idx = lower.indexOf(needle, searchFrom);
    if (idx === -1) return -1;
    let lineStart = idx;
    while (lineStart > from && text[lineStart - 1] !== "\n") {
      lineStart--;
    }
    const prefix = text.slice(lineStart, idx);
    if (/^#{1,6}\s*$/.test(prefix)) return lineStart;
    searchFrom = idx + needle.length;
  }
  return -1;
}

function findBackgroundTaskUpdateStart(text: string, from: number): number {
  const heading = findBackgroundTaskUpdateHeading(text, from);
  if (heading !== -1) return heading;
  const meta = indexOfIgnoreCase(text, OPEN_TASK_METADATA_TAG, from);
  if (meta === -1) return -1;
  // A lone `<task_metadata>` example in assistant prose is not a notification.
  // If the heading was lost, recover from the "The task exited…" line that
  // still sits before metadata in this chunk (the command output is between).
  const before = text.slice(from, meta);
  const exitedMatch = before.match(/(?:^|\n)(The task exited with the following message:)/i);
  if (exitedMatch && exitedMatch.index !== undefined) {
    const exitedStart =
      before[exitedMatch.index] === "\n" ? exitedMatch.index + 1 : exitedMatch.index;
    return from + exitedStart;
  }
  return -1;
}

function isPartialBackgroundTaskUpdateHeading(lastLine: string): boolean {
  const match = lastLine.match(/^(#{1,6})\s+(.*)$/);
  if (!match) return false;
  const rest = match[2] ?? "";
  if (rest.length < BACKGROUND_TASK_UPDATE_PREFIX_MIN - 2) return false;
  return BACKGROUND_TASK_UPDATE_HEADING.toLowerCase().startsWith(rest.toLowerCase());
}

const NOTIFICATION_PREFIXES: Array<{ value: string; min: number; ignoreCase: boolean }> = [
  { value: OPEN_TASK_TAG, min: 2, ignoreCase: false },
  { value: OPEN_SYSTEM_TAG, min: 2, ignoreCase: false },
  { value: SYSTEM_MESSAGE_PREAMBLE_PREFIX, min: 2, ignoreCase: false },
  { value: OPEN_TASK_METADATA_TAG, min: 2, ignoreCase: true },
  {
    value: BACKGROUND_TASK_UPDATE_PREFIX,
    min: BACKGROUND_TASK_UPDATE_PREFIX_MIN,
    ignoreCase: true,
  },
];

function matchTrailingNotificationPrefix(
  text: string,
): { start: number; fragment: string } | undefined {
  let best: { start: number; fragment: string } | undefined;
  for (const prefix of NOTIFICATION_PREFIXES) {
    const maxFragment = Math.min(text.length, prefix.value.length - 1);
    for (let len = maxFragment; len >= prefix.min; len--) {
      const fragment = text.slice(text.length - len);
      const matches = prefix.ignoreCase
        ? prefix.value.toLowerCase().startsWith(fragment.toLowerCase())
        : prefix.value.startsWith(fragment);
      if (matches) {
        const start = text.length - len;
        if (!best || start < best.start) best = { start, fragment };
        break;
      }
    }
  }
  const lastNl = text.lastIndexOf("\n");
  const lastLine = lastNl === -1 ? text : text.slice(lastNl + 1);
  if (isPartialBackgroundTaskUpdateHeading(lastLine)) {
    const start = lastNl === -1 ? 0 : lastNl + 1;
    if (!best || start < best.start) best = { start, fragment: lastLine };
  }
  return best;
}

function containsTaskNotificationMarker(text: string): boolean {
  return (
    text.includes("<task") ||
    text.includes("<SYSTEM_MESSAGE") ||
    text.includes("The following is a <SYSTEM_MESSAGE>") ||
    /Background Task Update/i.test(text) ||
    text.includes("<task_metadata") ||
    matchTrailingNotificationPrefix(text) !== undefined
  );
}

function scanTaskNotificationBlocks(text: string): {
  notifications: ParsedTaskNotification[];
  cleanText: string;
  unclosed: string | undefined;
} {
  const notifications: ParsedTaskNotification[] = [];
  if (!containsTaskNotificationMarker(text)) {
    return { notifications, cleanText: text, unclosed: undefined };
  }

  let cleanText = "";
  let cursor = 0;

  while (cursor < text.length) {
    const nextTaskIdx = text.indexOf(OPEN_TASK_TAG, cursor);
    const nextSysIdx = text.indexOf(OPEN_SYSTEM_TAG, cursor);
    let preambleStart = -1;

    if (nextSysIdx !== -1) {
      const textBeforeSys = text.slice(cursor, nextSysIdx);
      const preambleMatch = textBeforeSys.match(
        /(?:The following is a <SYSTEM_MESSAGE>[^\n]*\r?\n+)\s*$/,
      );
      if (preambleMatch && preambleMatch.index !== undefined) {
        preambleStart = cursor + preambleMatch.index;
      }
    }

    const effectiveSysStart = preambleStart !== -1 ? preambleStart : nextSysIdx;
    const nextBgIdx = findBackgroundTaskUpdateStart(text, cursor);

    let chosenType: NotificationBlockKind | undefined;
    let blockStart = -1;
    let openTagEnd = -1;
    let closeTag = "";

    const candidates: Array<{
      kind: NotificationBlockKind;
      start: number;
      openTagEnd: number;
      closeTag: string;
    }> = [];
    if (nextTaskIdx !== -1) {
      candidates.push({
        kind: "task",
        start: nextTaskIdx,
        openTagEnd: nextTaskIdx + OPEN_TASK_TAG.length,
        closeTag: CLOSE_TASK_TAG,
      });
    }
    if (effectiveSysStart !== -1) {
      candidates.push({
        kind: "system",
        start: effectiveSysStart,
        openTagEnd: nextSysIdx + OPEN_SYSTEM_TAG.length,
        closeTag: CLOSE_SYSTEM_TAG,
      });
    }
    if (nextBgIdx !== -1) {
      candidates.push({
        kind: "backgroundUpdate",
        start: nextBgIdx,
        openTagEnd: nextBgIdx,
        closeTag: CLOSE_TASK_METADATA_TAG,
      });
    }
    candidates.sort((a, b) => a.start - b.start);
    const chosen = candidates[0];
    if (chosen) {
      chosenType = chosen.kind;
      blockStart = chosen.start;
      openTagEnd = chosen.openTagEnd;
      closeTag = chosen.closeTag;
    }

    if (!chosenType || blockStart === -1) {
      break;
    }

    const closeIdx =
      chosenType === "backgroundUpdate"
        ? indexOfIgnoreCase(text, closeTag, Math.max(openTagEnd, blockStart))
        : text.indexOf(closeTag, openTagEnd);
    if (closeIdx === -1) {
      cleanText += text.slice(cursor, blockStart);
      return { notifications, cleanText, unclosed: text.slice(blockStart) };
    }

    cleanText += text.slice(cursor, blockStart);
    const raw = text.slice(blockStart, closeIdx + closeTag.length);
    if (chosenType === "backgroundUpdate") {
      const parsed = parseBackgroundTaskUpdateBlock(raw);
      if (parsed.taskId) {
        notifications.push(toParsedTaskNotification(raw, parsed));
      } else {
        cleanText += raw;
      }
    } else {
      const body = text.slice(openTagEnd, closeIdx);
      const parsed = parseTaskNotificationBody(body);
      if (parsed.taskId) {
        notifications.push(toParsedTaskNotification(raw, parsed));
      }
    }
    cursor = closeIdx + closeTag.length;
  }

  cleanText += text.slice(cursor);
  return { notifications, cleanText, unclosed: undefined };
}

/**
 * Split a streamed agent-text chunk into assistant text plus completed task
 * notifications. Text from an unterminated notification (or a trailing partial
 * opening tag split across chunks) is buffered on `state` under `parentToolCallId`
 * so the next chunk resumes seamlessly; the buffer is left untouched when the
 * chunk is unrelated. Emits nothing on its own — the caller maps returned
 * notifications to runtime events.
 */
export function handleTaskNotificationText(
  text: string,
  state: AcpMapperState,
  parentToolCallId: string | undefined,
): { notifications: ParsedTaskNotification[]; text: string } {
  if (state.taskNotificationBuffer === undefined && !containsTaskNotificationMarker(text)) {
    return { notifications: [], text };
  }

  const buffered = state.taskNotificationBuffer;
  const combined = buffered ? buffered.text + text : text;
  const scanned = scanTaskNotificationBlocks(combined);
  const notifications = scanned.notifications;

  if (scanned.unclosed) {
    state.taskNotificationBuffer = { parentToolCallId, text: scanned.unclosed };
    return { notifications, text: scanned.cleanText };
  }

  const clean = scanned.cleanText;
  state.taskNotificationBuffer = undefined;

  const trailing = matchTrailingNotificationPrefix(clean);
  if (trailing) {
    state.taskNotificationBuffer = { parentToolCallId, text: trailing.fragment };
    return { notifications, text: clean.slice(0, trailing.start) };
  }

  return { notifications, text: clean };
}

/**
 * Try extracting an Antigravity background task id from tool output / result.
 * e.g. "Tool is running as a background task with task id: 1bc6d974.../task-304"
 */
export function extractBackgroundTaskId(output: unknown): string | undefined {
  if (typeof output === "string") {
    const match = output.match(/task id(?:\s*:\s*|\s+is\s+|\s+)["']?([^"'\s\r\n]+)["']?/i);
    if (match) return match[1];
  } else if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.taskId === "string") return obj.taskId;
    if (typeof obj.task_id === "string") return obj.task_id;
    const str = JSON.stringify(output);
    const match = str.match(/task id[:"\s]+([a-zA-Z0-9_.-]+)/i);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Register a command-execution item for later `<task_notification>`
 * correlation when its output announces a background task id. The id is only
 * taken from text that explicitly signals a background task (arbitrary output
 * mentioning "task id" must not steal the correlation), and the first
 * registration for an id wins — a later foreground command re-mentioning the
 * same id cannot take the row over.
 */
export function trackBackgroundCommandFromToolCall(
  state: AcpMapperState,
  itemType: CanonicalItemType,
  itemId: string,
  payload: Record<string, unknown>,
  toolCall: AcpToolCallSource,
): void {
  if (itemType !== "command_execution") return;
  for (const source of [payload.result, toolCall.rawOutput, toolCall.content] as const) {
    if (typeof source === "string" && !BACKGROUND_SIGNAL_RE.test(source)) continue;
    const taskId = extractBackgroundTaskId(source);
    if (!taskId) continue;
    const existing = state.backgroundTasks.get(taskId);
    if (existing && existing.toolCallId !== toolCall.toolCallId) return;
    state.backgroundTasks.set(taskId, {
      toolCallId: toolCall.toolCallId,
      itemId,
      command: resolveCommand(payload, toolCall),
      payload,
    });
    return;
  }
}

function resolveCommand(payload: Record<string, unknown>, toolCall: AcpToolCallSource): string {
  if (typeof payload.command === "string") return payload.command;
  return toolCall.rawInput &&
    typeof toolCall.rawInput === "object" &&
    typeof (toolCall.rawInput as Record<string, unknown>).CommandLine === "string"
    ? ((toolCall.rawInput as Record<string, unknown>).CommandLine as string)
    : "";
}

/**
 * Emit canonical runtime events for a completed task notification.
 * If the task was tracked from an earlier command execution, update that item.
 * Otherwise, emit a standalone `command_execution` item so the output renders
 * cleanly in an accordion.
 */
export function emitTaskNotificationEvents(
  notification: ParsedTaskNotification,
  state: AcpMapperState,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const threadId = state.threadId;
  const status = notification.exitCode === 0 ? "success" : "error";

  const tracked = state.backgroundTasks.get(notification.taskId);
  if (tracked) {
    state.backgroundTasks.delete(notification.taskId);
    // Seal the live tool-call entry so no later turn-boundary close can
    // re-complete the row with the stale pre-notification payload.
    const live = state.toolCallItems.get(tracked.toolCallId);
    if (live) {
      live.payload = {
        ...live.payload,
        command: tracked.command,
        result: notification.output,
        exitCode: notification.exitCode,
        status,
      };
      state.toolCallItems.delete(tracked.toolCallId);
    }
    const updatedPayload: Record<string, unknown> = {
      ...(live ? live.payload : tracked.payload),
      command: tracked.command,
      result: notification.output,
      exitCode: notification.exitCode,
      status,
    };
    if (notification.output) {
      events.push({
        type: "content.delta",
        threadId,
        itemId: tracked.itemId,
        stream: "command_output",
        delta: notification.output,
      });
    }
    events.push({
      type: "item.updated",
      threadId,
      itemId: tracked.itemId,
      payload: updatedPayload,
    });
    events.push({
      type: "item.completed",
      threadId,
      itemId: tracked.itemId,
      payload: updatedPayload,
    });
    return events;
  }

  // Fallback: emit a standalone command_execution item
  events.push(...closeAllOpenContentItems(state));
  const itemId = newItemId("tool");
  const payload: Record<string, unknown> = {
    name: msg("acp.taskNotification.task", { id: notification.taskId }),
    command: msg("acp.taskNotification.task", { id: notification.taskId }),
    result: notification.output,
    exitCode: notification.exitCode,
    status,
  };
  events.push({
    type: "item.started",
    threadId,
    itemId,
    itemType: "command_execution",
    payload,
  });
  if (notification.output) {
    events.push({
      type: "content.delta",
      threadId,
      itemId,
      stream: "command_output",
      delta: notification.output,
    });
  }
  events.push({
    type: "item.completed",
    threadId,
    itemId,
    payload,
  });
  return events;
}

/**
 * Flush any buffered partial task notification at a turn boundary. A buffer
 * that still holds an unterminated notification is completed leniently when
 * its body has the notification shape; anything else (including fragments of
 * a split open tag) streams as plain text under the buffer's original parent.
 */
export function flushTaskNotificationBuffer(state: AcpMapperState): RuntimeEvent[] {
  const buffer = state.taskNotificationBuffer;
  if (!buffer) return [];
  state.taskNotificationBuffer = undefined;

  const events: RuntimeEvent[] = [];
  let text = buffer.text;
  const isTaskOpen = text.startsWith(OPEN_TASK_TAG);
  const sysOpenIdx = text.indexOf(OPEN_SYSTEM_TAG);
  const isSysOpen =
    sysOpenIdx !== -1 &&
    (text.startsWith(OPEN_SYSTEM_TAG) || text.startsWith("The following is a <SYSTEM_MESSAGE>"));
  const bgHeading = findBackgroundTaskUpdateHeading(text, 0);
  const isBgOpen =
    bgHeading === 0 ||
    indexOfIgnoreCase(text.trimStart(), OPEN_TASK_METADATA_TAG, 0) === 0 ||
    /^The task exited with the following message:/i.test(text.trimStart());

  if (isTaskOpen || isSysOpen) {
    const openTagLen = isTaskOpen ? OPEN_TASK_TAG.length : sysOpenIdx + OPEN_SYSTEM_TAG.length;
    const body = text.slice(openTagLen);
    if (TRUNCATED_BODY_SHAPE_RE.test(body)) {
      const parsed = parseTaskNotificationBody(body);
      if (parsed.taskId) {
        events.push(...emitTaskNotificationEvents(toParsedTaskNotification(text, parsed), state));
        text = "";
      } else {
        text = "";
      }
    } else {
      text = isTaskOpen ? body : "";
    }
  } else if (isBgOpen) {
    const parsed = parseBackgroundTaskUpdateBlock(text);
    if (
      parsed.taskId &&
      (indexOfIgnoreCase(text, CLOSE_TASK_METADATA_TAG, 0) !== -1 ||
        TRUNCATED_BACKGROUND_UPDATE_SHAPE_RE.test(text))
    ) {
      events.push(...emitTaskNotificationEvents(toParsedTaskNotification(text, parsed), state));
      text = "";
    }
  } else {
    const extracted = extractTaskNotifications(text);
    for (const notif of extracted.notifications) {
      events.push(...emitTaskNotificationEvents(notif, state));
    }
    text = extracted.cleanText;
  }

  if (text.trim().length === 0) return events;
  const parentToolCallId = buffer.parentToolCallId;
  const contentState = getContentItemState(state, parentToolCallId);
  if (!contentState.openAssistantItemId) {
    contentState.openAssistantItemId = newItemId("asst");
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId: contentState.openAssistantItemId,
      itemType: "assistant_message",
    });
  }
  events.push({
    type: "content.delta",
    threadId: state.threadId,
    itemId: contentState.openAssistantItemId,
    stream: "assistant_text",
    delta: text,
  });
  return events;
}
