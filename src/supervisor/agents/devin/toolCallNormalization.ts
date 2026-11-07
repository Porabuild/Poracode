import type { SessionNotification } from "@agentclientprotocol/sdk";
import { record } from "./acpRecord";

const INFERENCE_TOOL_NAME_META_KEY = "cognition.ai/inferenceToolName";
const RESULT_URLS_META_KEY = "cognition.ai/resultUrls";
const ASK_USER_QUESTION_TOOL_NAME = "ask_user_question";
const READ_LINE_COUNT_SUMMARY = /^\d+ lines?(?: \(truncated\))?$/;

/**
 * Normalize live-captured read summaries and paths, question tool names, and
 * web-search URLs; all other tool payloads remain provider-owned output.
 */
export function normalizeDevinToolCall(notification: SessionNotification): SessionNotification {
  const update = notification.update as Record<string, unknown>;
  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update")
    return notification;
  const toolName = record(update._meta)[INFERENCE_TOOL_NAME_META_KEY];
  let normalized = update;
  let changed = false;

  if (toolName === "read" && update.status === "completed") {
    const summary = singleTextBlock(update.content)?.trim();
    if (summary && READ_LINE_COUNT_SUMMARY.test(summary)) {
      normalized = { ...normalized };
      delete normalized.content;
      changed = true;
    }
  }

  if (update.sessionUpdate === "tool_call" && update.kind === "read") {
    const locations = Array.isArray(normalized.locations) ? normalized.locations : [];
    const hasNonEmptyLocation = locations.some((location) => nonEmptyString(record(location).path));
    const rawInput = record(normalized.rawInput);
    const path = nonEmptyString(rawInput.path) ?? nonEmptyString(rawInput.file_path);
    if (!hasNonEmptyLocation && path) {
      normalized = { ...normalized, locations: [{ path }] };
      changed = true;
    }
  }

  if (toolName === ASK_USER_QUESTION_TOOL_NAME) {
    const meta = record(normalized._meta);
    if (meta.toolName !== ASK_USER_QUESTION_TOOL_NAME) {
      normalized = {
        ...normalized,
        _meta: { ...meta, toolName: ASK_USER_QUESTION_TOOL_NAME },
      };
      changed = true;
    }
  }

  if (toolName === "web_search" && update.status === "completed") {
    const urls = readHttpUrls(record(update._meta)[RESULT_URLS_META_KEY]);
    if (urls.length > 0) {
      const content = Array.isArray(normalized.content) ? normalized.content : [];
      normalized = {
        ...normalized,
        content: [
          ...content,
          { type: "content", content: { type: "text", text: urls.join("\n") } },
        ],
      };
      changed = true;
    }
  }

  return changed
    ? {
        ...notification,
        update: normalized as unknown as SessionNotification["update"],
      }
    : notification;
}

function singleTextBlock(content: unknown): string | undefined {
  if (!Array.isArray(content) || content.length !== 1) return undefined;
  const entry = record(content[0]);
  if (entry.type !== "content") return undefined;
  const block = record(entry.content);
  return block.type === "text" && typeof block.text === "string" ? block.text : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readHttpUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = value.flatMap((entry): string[] => {
    if (typeof entry !== "string" || entry.trim().length === 0) return [];
    const candidate = entry.trim();
    try {
      const protocol = new URL(candidate).protocol;
      return protocol === "http:" || protocol === "https:" ? [candidate] : [];
    } catch {
      return [];
    }
  });
  return urls.slice(0, 20);
}
