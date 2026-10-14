import { msg } from "@lingui/core/macro";
import type { Thread, TurnClientContext } from "@/shared/contracts";
import { TURN_CONVERSATION_SNAPSHOT_MAX_LENGTH } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { i18n } from "@/renderer/i18n/i18n";
import { handoffTranscriptBudget } from "@/renderer/actions/handoffTranscript";
import { readSideChatContext } from "./sideChatContext";

/** A new bounded parent snapshot belongs to each submitted side question. */
export async function captureSideChatTurnContext(
  source: Thread,
): Promise<TurnClientContext | undefined> {
  const parent = useAppStore.getState().threads.find((thread) => thread.id === source.id) ?? source;
  try {
    const context = await readSideChatContext(
      parent,
      Math.min(
        handoffTranscriptBudget(parent.config.contextSize),
        TURN_CONVERSATION_SNAPSHOT_MAX_LENGTH,
      ),
    );
    return context?.summary ? { conversationSnapshot: { text: context.summary } } : undefined;
  } catch (cause) {
    throw new Error(i18n._(msg`Could not read the thread context for side chat. Try again.`), {
      cause,
    });
  }
}
