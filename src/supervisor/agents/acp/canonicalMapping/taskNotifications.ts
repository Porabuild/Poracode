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
 * This module extracts and maps these notifications into canonical
 * `command_execution` events (either updating an already-tracked command
 * or emitting a standalone command accordion) and cleans up XML/system tags so they
 * do not leak into assistant message streams as unformatted text.
 */

import type { CanonicalItemType, RuntimeEvent } from "@/shared/contracts";
import { parseTaskNotificationBody } from "@/shared/taskNotificationText";
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

const TASK_NOTIFICATION_REGEX =
  /(?:The following is a <SYSTEM_MESSAGE>[^\n]*\r?\n+)?<SYSTEM_MESSAGE>([\s\S]*?)<\/SYSTEM_MESSAGE>|<task_notification>([\s\S]*?)<\/task_notification>/gi;

/** Command output that merely mentions a "task id" is not a background task;
 *  only register when the producer said the command runs as one. */
const BACKGROUND_SIGNAL_RE = /background\s+task/i;
/** Shape a truncated `<task_notification>` or `<SYSTEM_MESSAGE>` body must have to be completed
 *  leniently at a turn boundary instead of streaming as plain text. */
const TRUNCATED_BODY_SHAPE_RE =
  /completed with|failed with|Output:|exited with code|finished with result|content=Task id/i;

interface AcpToolCallSource {
  toolCallId: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  content?: unknown;
}

/**
 * Pull complete `<task_notification>...</task_notification>` or
 * `<SYSTEM_MESSAGE>...</SYSTEM_MESSAGE>` blocks out of streamed agent text,
 * mapping each to a parsed notification. `cleanText` is the input with the blocks
 * surgically removed — every other byte (including boundary whitespace) is preserved,
 * because callers concatenate the returned text into streaming assistant deltas.
 */
export function extractTaskNotifications(text: string): {
  notifications: ParsedTaskNotification[];
  cleanText: string;
} {
  const notifications: ParsedTaskNotification[] = [];
  if (!text.includes("<task_notification>") && !text.includes("<SYSTEM_MESSAGE>")) {
    return { notifications, cleanText: text };
  }
  let cleanText = "";
  let cursor = 0;
  for (const match of text.matchAll(TASK_NOTIFICATION_REGEX)) {
    cleanText += text.slice(cursor, match.index);
    const body = match[1] ?? match[2] ?? "";
    const parsed = parseTaskNotificationBody(body);
    if (parsed.taskId) {
      notifications.push(buildNotification(match[0], body));
    }
    cursor = match.index + match[0].length;
  }
  cleanText += text.slice(cursor);
  return { notifications, cleanText };
}

function buildNotification(raw: string, body: string): ParsedTaskNotification {
  const parsed = parseTaskNotificationBody(body);
  return {
    raw: raw.trim(),
    taskId: parsed.taskId ?? "unknown",
    exitCode: parsed.exitCode ?? (parsed.failed ? 1 : 0),
    output: parsed.output,
  };
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
  if (
    state.taskNotificationBuffer === undefined &&
    !text.includes("<task") &&
    !text.includes("<SYSTEM_MESSAGE") &&
    !text.includes("The following is a <SYSTEM_MESSAGE>")
  ) {
    return { notifications: [], text };
  }

  const buffered = state.taskNotificationBuffer;
  const combined = buffered ? buffered.text + text : text;
  const notifications: ParsedTaskNotification[] = [];
  let clean = "";
  let cursor = 0;

  while (cursor < combined.length) {
    const nextTaskIdx = combined.indexOf(OPEN_TASK_TAG, cursor);
    const nextSysIdx = combined.indexOf(OPEN_SYSTEM_TAG, cursor);
    let preambleStart = -1;

    if (nextSysIdx !== -1) {
      const textBeforeSys = combined.slice(cursor, nextSysIdx);
      const preambleMatch = textBeforeSys.match(
        /(?:The following is a <SYSTEM_MESSAGE>[^\n]*\r?\n+)\s*$/,
      );
      if (preambleMatch && preambleMatch.index !== undefined) {
        preambleStart = cursor + preambleMatch.index;
      }
    }

    const effectiveSysStart = preambleStart !== -1 ? preambleStart : nextSysIdx;

    let chosenType: "task" | "system" | undefined;
    let blockStart = -1;
    let openTagEnd = -1;
    let closeTag = "";

    if (nextTaskIdx !== -1 && (effectiveSysStart === -1 || nextTaskIdx < effectiveSysStart)) {
      chosenType = "task";
      blockStart = nextTaskIdx;
      openTagEnd = nextTaskIdx + OPEN_TASK_TAG.length;
      closeTag = CLOSE_TASK_TAG;
    } else if (effectiveSysStart !== -1) {
      chosenType = "system";
      blockStart = effectiveSysStart;
      openTagEnd = nextSysIdx + OPEN_SYSTEM_TAG.length;
      closeTag = CLOSE_SYSTEM_TAG;
    }

    if (!chosenType || blockStart === -1) {
      break;
    }

    const closeIdx = combined.indexOf(closeTag, openTagEnd);
    if (closeIdx === -1) {
      clean += combined.slice(cursor, blockStart);
      state.taskNotificationBuffer = { parentToolCallId, text: combined.slice(blockStart) };
      return { notifications, text: clean };
    }

    clean += combined.slice(cursor, blockStart);
    const raw = combined.slice(blockStart, closeIdx + closeTag.length);
    const body = combined.slice(openTagEnd, closeIdx);
    const parsed = parseTaskNotificationBody(body);
    if (parsed.taskId) {
      notifications.push(buildNotification(raw, body));
    }
    cursor = closeIdx + closeTag.length;
  }

  clean += combined.slice(cursor);
  state.taskNotificationBuffer = undefined;

  // A chunk that ends mid-open-tag must not leak the fragment:
  const candidatePrefixes = [OPEN_TASK_TAG, OPEN_SYSTEM_TAG, SYSTEM_MESSAGE_PREAMBLE_PREFIX];
  for (const prefix of candidatePrefixes) {
    const maxFragment = Math.min(clean.length, prefix.length - 1);
    for (let len = maxFragment; len >= 2; len--) {
      const fragment = clean.slice(clean.length - len);
      if (prefix.startsWith(fragment)) {
        state.taskNotificationBuffer = { parentToolCallId, text: fragment };
        return { notifications, text: clean.slice(0, clean.length - len) };
      }
    }
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

  if (isTaskOpen || isSysOpen) {
    const openTagLen = isTaskOpen ? OPEN_TASK_TAG.length : sysOpenIdx + OPEN_SYSTEM_TAG.length;
    const body = text.slice(openTagLen);
    if (TRUNCATED_BODY_SHAPE_RE.test(body)) {
      const parsed = parseTaskNotificationBody(body);
      if (parsed.taskId) {
        events.push(...emitTaskNotificationEvents(buildNotification(text, body), state));
        text = "";
      } else {
        text = "";
      }
    } else {
      text = isTaskOpen ? body : "";
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
