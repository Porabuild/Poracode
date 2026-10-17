import { describe, expect, it, vi } from "vitest";
import { messageItemPayloadSchema } from "@/shared/contracts";
import { StructuredTurnQueue, type StructuredTurnQueueContext } from "./structuredTurnQueue";

describe("StructuredTurnQueue answer metadata", () => {
  it("keeps answers on the durable user message while preserving ordinary prompt content and identity", () => {
    const emit = vi.fn<StructuredTurnQueueContext["emit"]>();
    const queue = new StructuredTurnQueue({
      emit,
      emitTurnContinuation: vi.fn<StructuredTurnQueueContext["emitTurnContinuation"]>(),
      sessions: new Map(),
      outputPipeline: {
        updateState: vi.fn<StructuredTurnQueueContext["outputPipeline"]["updateState"]>(),
      },
      beginFailureEpisode: vi.fn<StructuredTurnQueueContext["beginFailureEpisode"]>(),
      failStructuredSession: vi.fn<StructuredTurnQueueContext["failStructuredSession"]>(),
    });
    const questionAnswer = {
      questions: [{ header: "", question: "Which scope?", selected: [{ label: "Focused" }] }],
    };
    const id = queue.emitOptimisticUserMessage(
      "thread",
      "Which scope?\nFocused",
      undefined,
      "answer",
      { questionAnswer },
    );
    expect(id).toBe("answer");
    const event = emit.mock.calls
      .map(([entry]) => entry)
      .find(
        (entry) => entry.type === "thread-runtime-event" && entry.event.type === "item.started",
      );
    expect(event).toEqual({
      type: "thread-runtime-event",
      threadId: "thread",
      event: {
        type: "item.started",
        threadId: "thread",
        itemId: "answer",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "Which scope?\nFocused" }], questionAnswer },
      },
    });
    if (event?.type !== "thread-runtime-event" || event.event.type !== "item.started")
      throw new Error("Missing user message");
    expect(messageItemPayloadSchema.parse(JSON.parse(JSON.stringify(event.event.payload)))).toEqual(
      event.event.payload,
    );
  });
});
