import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import type { AgentSlashCommand, PromptSegment } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import type { Attachment } from "../composer/useAttachments";
import type { MentionInputHandle } from "../composer/MentionInput";
import { nextRecallMove, threadPromptHistory } from "./promptHistory";
import { revertedPromptToDraft } from "./revertedPrompt";

interface Browsing {
  threadId: string;
  /** The shown history entry, by item id so prompts landing meanwhile don't shift it. */
  itemId: string;
  /** The composer contents right after the recall. Any difference is an edit. */
  shownKey: string;
}

/**
 * Up/Down recall of the thread's earlier prompts in the composer. Returns a
 * key handler that reports whether it consumed the key.
 */
export function usePromptRecall(options: {
  threadId: string;
  mentionRef: RefObject<MentionInputHandle | null>;
  attachments: {
    getAttachments(): readonly Attachment[];
    restore(saved: Attachment[]): void;
  };
  availableCommands: readonly AgentSlashCommand[];
  /** Skill chips can only be rebuilt once the skill catalog has loaded. */
  skillCommandsResolved: boolean;
}) {
  const { threadId, mentionRef, attachments, availableCommands, skillCommandsResolved } = options;
  const browsingRef = useRef<Browsing | null>(null);
  // Leaving the thread ends browsing. The composer keeps what it shows.
  useLayoutEffect(() => {
    if (browsingRef.current?.threadId !== threadId) browsingRef.current = null;
  }, [threadId]);

  return function handlePromptRecallKey(e: KeyboardEvent): boolean {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return false;
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false;
    const composer = mentionRef.current;
    if (!composer) return false;

    const segments = composer.serializeSegments();
    const currentAttachments = attachments.getAttachments();
    const state = useAppStore.getState();
    const history = threadPromptHistory(
      state.runtimeItemIdsByThread[threadId],
      state.runtimeItemsByIdByThread[threadId],
    );
    const browsing = browsingRef.current;
    const shownIndex =
      browsing && browsing.shownKey === composerKey(segments, currentAttachments)
        ? history.findIndex((entry) => entry.itemId === browsing.itemId)
        : -1;
    const browsingIndex = shownIndex === -1 ? null : shownIndex;
    if (browsingIndex === null) browsingRef.current = null;
    const direction = e.key === "ArrowUp" ? "older" : "newer";
    // Measuring touches the live selection, so only do it while browsing.
    const edges = browsingIndex === null ? null : composer.caretLineEdges();
    const move = nextRecallMove(browsingIndex, {
      direction,
      historyLength: history.length,
      composerEmpty: segments.length === 0 && currentAttachments.length === 0,
      caretAtEdge: direction === "older" ? edges?.first === true : edges?.last === true,
    });
    if (move.kind === "none") return false;
    const entry = move.kind === "show" ? history[move.index]! : null;
    if (!skillCommandsResolved && entry?.content.some((block) => block.kind === "skill")) {
      return false;
    }

    e.preventDefault();
    const draft = entry
      ? revertedPromptToDraft(entry.content, availableCommands)
      : { segments: [], attachments: [] };
    composer.restoreFromSegments(draft.segments);
    attachments.restore(draft.attachments);
    composer.placeCaret(direction === "older" ? "start" : "end");
    browsingRef.current = entry
      ? {
          threadId,
          itemId: entry.itemId,
          shownKey: composerKey(composer.serializeSegments(), draft.attachments),
        }
      : null;
    return true;
  };
}

function composerKey(segments: PromptSegment[], attachments: readonly Attachment[]): string {
  return JSON.stringify([segments, attachments.map((attachment) => attachment.path)]);
}
