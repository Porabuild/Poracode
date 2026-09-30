import { randomUUID } from "node:crypto";
import type { RuntimeEvent } from "@/shared/contracts";
import type { ImportedTranscript } from "@/shared/sessionImport/transcript";

/**
 * An imported transcript is replayed as the same canonical runtime events a
 * live session emits, so the existing persistence layer owns ordering,
 * positions, and stream storage. Assistant text rides the `assistant_text`
 * stream exactly as it would during streaming; user text is a content block on
 * the item payload.
 */

export const REPLAY_BATCH_SIZE = 200;

export function buildReplayEvents(
  threadId: string,
  transcript: ImportedTranscript,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const message of transcript.messages) {
    const itemId = `import-${randomUUID()}`;
    if (message.role === "user") {
      events.push({
        type: "item.started",
        threadId,
        itemId,
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: message.text }] },
      });
    } else {
      events.push({ type: "item.started", threadId, itemId, itemType: "assistant_message" });
      events.push({
        type: "content.delta",
        threadId,
        itemId,
        stream: "assistant_text",
        delta: message.text,
      });
    }
    events.push({ type: "item.completed", threadId, itemId });
  }
  return events;
}

export function replayTranscript(input: {
  threadId: string;
  transcript: ImportedTranscript;
  apply: (threadId: string, events: readonly RuntimeEvent[]) => void;
  flush: (threadId: string) => void;
}): number {
  const events = buildReplayEvents(input.threadId, input.transcript);
  if (events.length === 0) return 0;
  for (let index = 0; index < events.length; index += REPLAY_BATCH_SIZE) {
    input.apply(input.threadId, events.slice(index, index + REPLAY_BATCH_SIZE));
  }
  input.flush(input.threadId);
  return input.transcript.messages.length;
}
