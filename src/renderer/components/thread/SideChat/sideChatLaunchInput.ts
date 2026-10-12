import {
  TURN_CONVERSATION_SNAPSHOT_MAX_LENGTH,
  type PromptSegment,
  type TurnClientContext,
} from "@/shared/contracts";

/** Paint only the user's question; the runtime supplies context privately. */
export function sideChatLaunchInput(
  question: string,
  segments: PromptSegment[],
  transcript?: string,
): {
  prompt: string;
  segments: PromptSegment[];
  clientContext?: TurnClientContext;
} {
  const marker = "\n\n[intermediate conversation context omitted]\n\n";
  const available = TURN_CONVERSATION_SNAPSHOT_MAX_LENGTH - marker.length;
  const text =
    transcript && transcript.length > TURN_CONVERSATION_SNAPSHOT_MAX_LENGTH
      ? transcript.slice(0, Math.floor(available / 2)) +
        marker +
        transcript.slice(-Math.ceil(available / 2))
      : transcript;
  return {
    prompt: question,
    segments,
    ...(text ? { clientContext: { conversationSnapshot: { text } } } : {}),
  };
}
