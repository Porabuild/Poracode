import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { buildReplayEvents, REPLAY_BATCH_SIZE, replayTranscript } from "./replay";

describe("buildReplayEvents", () => {
  it("emits a started/completed pair per user message with text content", () => {
    const events = buildReplayEvents("t1", {
      messages: [{ role: "user", text: "hello" }],
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "item.started",
      threadId: "t1",
      itemType: "user_message",
      payload: { content: [{ kind: "text", text: "hello" }] },
    });
    expect(events[1]).toMatchObject({ type: "item.completed", threadId: "t1" });
    expect((events[0] as { itemId: string }).itemId).toBe((events[1] as { itemId: string }).itemId);
  });

  it("streams assistant text through the assistant_text stream", () => {
    const events = buildReplayEvents("t1", {
      messages: [{ role: "assistant", text: "done" }],
    });
    expect(events.map((event) => event.type)).toEqual([
      "item.started",
      "content.delta",
      "item.completed",
    ]);
    expect(events[1]).toMatchObject({ stream: "assistant_text", delta: "done" });
  });

  it("gives every item a distinct id and preserves order", () => {
    const events = buildReplayEvents("t1", {
      messages: [
        { role: "user", text: "one" },
        { role: "assistant", text: "two" },
        { role: "user", text: "three" },
      ],
    });
    const startedIds = events
      .filter(
        (event): event is Extract<RuntimeEvent, { type: "item.started" }> =>
          event.type === "item.started",
      )
      .map((event) => event.itemId);
    expect(new Set(startedIds).size).toBe(3);
  });

  it("returns nothing for an empty transcript", () => {
    expect(buildReplayEvents("t1", { messages: [] })).toEqual([]);
  });
});

describe("replayTranscript", () => {
  it("applies events in batches and flushes once", () => {
    const apply = vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>();
    const flush = vi.fn<(threadId: string) => void>();
    const messages = Array.from({ length: 150 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `m${index}`,
    }));

    const count = replayTranscript({ threadId: "t1", transcript: { messages }, apply, flush });

    expect(count).toBe(150);
    // 75 user messages × 2 events + 75 assistant × 3 = 375 events → 2 batches.
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0]?.[1].length).toBe(REPLAY_BATCH_SIZE);
    expect(flush).toHaveBeenCalledExactlyOnceWith("t1");
  });

  it("does not touch the database for an empty transcript", () => {
    const apply = vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>();
    const flush = vi.fn<(threadId: string) => void>();
    expect(replayTranscript({ threadId: "t1", transcript: { messages: [] }, apply, flush })).toBe(
      0,
    );
    expect(apply).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });
});
