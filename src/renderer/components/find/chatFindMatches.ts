import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { ChatTimelineEntry } from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import { countOccurrences } from "./findText";

/** One match within the chat transcript: which timeline row, and which
 * occurrence inside that row's text (so the active-match highlight can target
 * the Nth hit within the rendered row). */
export interface ChatFindMatch {
  itemId: string;
  /** Index of the entry in the timeline (for `virtualizer.scrollToIndex`). */
  itemIndex: number;
  /** Zero-based occurrence within the item's searchable text. */
  occurrence: number;
}

function blocksToText(payload: unknown): string {
  const blocks = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { content?: unknown }).content)
      ? (payload as { content: unknown[] }).content
      : null;
  if (!blocks) return "";
  let out = "";
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const record = block as {
      kind?: unknown;
      text?: unknown;
      path?: unknown;
      source?: unknown;
      name?: unknown;
      title?: unknown;
      threadId?: unknown;
    };
    if (record.kind === "text" && typeof record.text === "string") {
      out += record.text;
    } else if (
      record.kind === "file" &&
      typeof record.path === "string" &&
      record.source !== "attachment"
    ) {
      out += record.path;
    } else if (record.kind === "mcp" && typeof record.name === "string") {
      // Keep the badge's `@Name` directive findable in the transcript.
      out += `@${record.name}`;
    } else if (
      record.kind === "thread" &&
      typeof record.title === "string" &&
      typeof record.threadId === "string"
    ) {
      out += `@${record.title || record.threadId}`;
    }
  }
  return out;
}

/**
 * Searchable text for a chat item. Mirrors what the conversation surfaces show:
 * user prompts, assistant replies, and reasoning. Tool output / diffs are not
 * searched here (they live in collapsed groups and have their own surfaces).
 */
export function getChatItemSearchText(item: RuntimeChatItem): string {
  switch (item.type) {
    case "assistant_message":
      // Shared display-truth helper: find must hit exactly the text on screen,
      // not a stream a display hook replaced or suppressed.
      return assistantDisplayText(item);
    case "reasoning":
      return item.streams.reasoning_text ?? "";
    case "user_message":
      return blocksToText(item.payload);
    default:
      return "";
  }
}

/**
 * Flatten the thread's timeline into an ordered match list. Tool-call groups are
 * skipped (the v1 scope is the readable conversation). Each occurrence becomes
 * one entry so prev/next steps through every hit.
 */
export function collectChatMatches(
  itemsById: Record<string, RuntimeChatItem> | undefined,
  entries: readonly ChatTimelineEntry[],
  query: string,
  caseSensitive: boolean,
): ChatFindMatch[] {
  if (!query || !itemsById) return [];
  const matches: ChatFindMatch[] = [];
  entries.forEach((entry, itemIndex) => {
    if (entry.kind !== "item") return;
    const item = itemsById[entry.id];
    if (!item) return;
    const text = getChatItemSearchText(item);
    if (!text) return;
    const count = countOccurrences(text, query, caseSensitive);
    for (let occurrence = 0; occurrence < count; occurrence += 1) {
      matches.push({ itemId: entry.id, itemIndex, occurrence });
    }
  });
  return matches;
}
