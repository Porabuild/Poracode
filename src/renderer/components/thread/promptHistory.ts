import type { CanonicalContentBlock, MessageItemPayload } from "@/shared/contracts";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";

export interface PromptHistoryEntry {
  /** Transcript item id of the newest prompt the entry stands for. */
  itemId: string;
  content: readonly CanonicalContentBlock[];
}

/**
 * The prompts the user sent in one thread, newest first, read from the loaded
 * transcript. Sub-agent messages and turn-independent messages (live voice
 * transcripts) are not prompts. Consecutive identical prompts collapse into
 * one entry so "continue" sent five times takes one Up press to get past.
 */
export function threadPromptHistory(
  itemIds: readonly string[] | undefined,
  itemsById: Record<string, RuntimeChatItem> | undefined,
): PromptHistoryEntry[] {
  if (!itemIds || !itemsById) return [];
  const history: PromptHistoryEntry[] = [];
  let newerKey: string | undefined;
  for (let index = itemIds.length - 1; index >= 0; index--) {
    const item = itemsById[itemIds[index]!];
    if (!item || item.parentItemId) continue;
    const payload = getRuntimeItemPayload<MessageItemPayload>(item, "user_message");
    if (!payload || payload.turnIndependent || payload.content.length === 0) continue;
    const key = promptKey(payload.content);
    if (key === newerKey) continue;
    newerKey = key;
    history.push({ itemId: item.id, content: payload.content });
  }
  return history;
}

export type RecallMove = { kind: "show"; index: number } | { kind: "clear" } | { kind: "none" };

/**
 * Decide what an Up ("older") or Down ("newer") press does to the composer.
 * `browsingIndex` is the history entry the composer still shows unedited, or
 * null when the user is not browsing. Browsing starts only from an empty
 * composer so Up never replaces something the user typed. After that, the
 * caret must sit on the first line (Up) or last line (Down) so the arrows
 * still move through a multi-line prompt. "none" leaves the key to the editor.
 */
export function nextRecallMove(
  browsingIndex: number | null,
  input: {
    direction: "older" | "newer";
    historyLength: number;
    composerEmpty: boolean;
    caretAtEdge: boolean;
  },
): RecallMove {
  if (browsingIndex === null) {
    return input.direction === "older" && input.composerEmpty && input.historyLength > 0
      ? { kind: "show", index: 0 }
      : { kind: "none" };
  }
  if (!input.caretAtEdge) return { kind: "none" };
  if (input.direction === "newer") {
    return browsingIndex === 0 ? { kind: "clear" } : { kind: "show", index: browsingIndex - 1 };
  }
  return browsingIndex + 1 < input.historyLength
    ? { kind: "show", index: browsingIndex + 1 }
    : { kind: "none" };
}

// Image blocks carry their bytes as a data URL. The path identifies them.
function promptKey(content: readonly CanonicalContentBlock[]): string {
  return JSON.stringify(
    content.map((block) => (block.kind === "image" ? { ...block, dataUrl: "" } : block)),
  );
}
