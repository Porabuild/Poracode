import { describe, expect, it } from "vitest";
import { FrameClassAccounting, classifyServerFrame } from "./frameClassification.ts";

/**
 * Frame classification unit tests.
 *
 * The qualification cells run a scoped terminal client (interested only in the
 * visible terminal) next to hidden structured-chat threads whose runtime
 * deltas must never be counted as interested bulk. These tests pin that
 * distinction, the withheld-payload (`summary`) path, and every attribution
 * bucket of the accounting (interested / offscreen / mixed / unattributed).
 */

const VISIBLE_TERMINAL = "v2q-term-01";
const HIDDEN_CHAT = "v2q-chat-hidden";

function runtimeEvent(threadId: string, type: string): Record<string, unknown> {
  return { type, threadId, itemId: `item-${threadId}`, delta: "x".repeat(64) };
}

describe("classifyServerFrame", () => {
  it("classes a content delta runtime event as bulk with its thread id", () => {
    const classified = classifyServerFrame({
      type: "event",
      seq: 7,
      event: {
        type: "thread-runtime-event",
        threadId: HIDDEN_CHAT,
        event: runtimeEvent(HIDDEN_CHAT, "content.delta"),
      },
    });
    expect(classified.frameClass).toBe("bulk");
    expect(classified.threadIds).toEqual([HIDDEN_CHAT]);
    expect(classified.bulkEventThreadIds).toEqual([HIDDEN_CHAT]);
  });

  it("classes a non-bulk runtime envelope as control while keeping its thread ids", () => {
    const classified = classifyServerFrame({
      type: "event",
      event: {
        type: "thread-runtime-events",
        threadId: HIDDEN_CHAT,
        events: [runtimeEvent(HIDDEN_CHAT, "turn.started")],
      },
    });
    expect(classified.frameClass).toBe("control");
    expect(classified.threadIds).toEqual([HIDDEN_CHAT]);
    expect(classified.bulkEventThreadIds).toEqual([]);
  });

  it("classes a withheld empty runtime envelope as summary, never bulk", () => {
    const classified = classifyServerFrame({
      type: "event",
      event: { type: "thread-runtime-events", threadId: HIDDEN_CHAT, events: [] },
    });
    expect(classified.frameClass).toBe("summary");
    expect(classified.threadIds).toEqual([HIDDEN_CHAT]);
    expect(classified.bulkEventThreadIds).toEqual([]);
  });

  it("reads every batch of a multi-thread envelope with its own fallback thread id", () => {
    const classified = classifyServerFrame({
      type: "event",
      event: {
        type: "thread-runtime-events-multi",
        batches: [
          { threadId: HIDDEN_CHAT, events: [runtimeEvent(HIDDEN_CHAT, "item.started")] },
          { threadId: "v2q-chat-02", events: [runtimeEvent("v2q-chat-02", "item.updated")] },
        ],
      },
    });
    expect(classified.frameClass).toBe("bulk");
    expect(classified.threadIds).toEqual([HIDDEN_CHAT, "v2q-chat-02"]);
    expect(classified.bulkEventThreadIds).toEqual([HIDDEN_CHAT, "v2q-chat-02"]);
  });

  it("falls back to the envelope thread id when a nested event carries none", () => {
    const classified = classifyServerFrame({
      type: "event",
      event: {
        type: "thread-runtime-events",
        threadId: HIDDEN_CHAT,
        events: [{ type: "item.completed", itemId: "i1" }],
      },
    });
    expect(classified.frameClass).toBe("bulk");
    expect(classified.threadIds).toEqual([HIDDEN_CHAT]);
  });

  it("classes terminal output and watch baselines as terminal frames scoped to their id", () => {
    for (const type of ["terminal-output", "terminal-watch-baseline-chunk"]) {
      const classified = classifyServerFrame({ type, id: VISIBLE_TERMINAL, data: "tick" });
      expect(classified.frameClass).toBe("terminal");
      expect(classified.threadIds).toEqual([VISIBLE_TERMINAL]);
    }
  });

  it("classes a terminal-watch-result as control and unknown frames as other", () => {
    expect(classifyServerFrame({ type: "terminal-watch-result", id: VISIBLE_TERMINAL })).toEqual({
      frameClass: "control",
      threadIds: [VISIBLE_TERMINAL],
      bulkEventThreadIds: [],
    });
    expect(classifyServerFrame({ type: "pong", id: "ping-1" })).toEqual({
      frameClass: "other",
      threadIds: [],
      bulkEventThreadIds: [],
    });
    expect(classifyServerFrame({ type: "event", event: null })).toEqual({
      frameClass: "control",
      threadIds: [],
      bulkEventThreadIds: [],
    });
  });
});

describe("FrameClassAccounting interest attribution", () => {
  it("separates hidden structured-chat bulk from scoped terminal traffic", () => {
    const accounting = new FrameClassAccounting();
    accounting.setInterests([VISIBLE_TERMINAL]);
    accounting.record(
      100,
      classifyServerFrame({ type: "terminal-output", id: VISIBLE_TERMINAL, data: "tick" }),
    );
    accounting.record(
      500,
      classifyServerFrame({
        type: "event",
        event: {
          type: "thread-runtime-event",
          threadId: HIDDEN_CHAT,
          event: runtimeEvent(HIDDEN_CHAT, "content.delta"),
        },
      }),
    );
    accounting.record(
      40,
      classifyServerFrame({
        type: "event",
        event: { type: "thread-runtime-events", threadId: HIDDEN_CHAT, events: [] },
      }),
    );

    const snapshot = accounting.snapshot();
    expect(snapshot.interestedBulkBytes).toBe(100);
    expect(snapshot.offscreenBulkBytes).toBe(500);
    expect(snapshot.offscreenBulkEvents).toBe(1);
    expect(snapshot.interestedBulkEvents).toBe(0);
    // The withheld frame is a summary: its bytes never join either bulk bucket.
    expect(snapshot.bytesByClass.summary).toBe(40);
    expect(snapshot.framesByClass.summary).toBe(1);
    expect(snapshot.mixedBulkFrames).toBe(0);
  });

  it("counts a frame carrying interested and offscreen threads as mixed, never as clean", () => {
    const accounting = new FrameClassAccounting();
    accounting.setInterests([VISIBLE_TERMINAL]);
    accounting.record(
      300,
      classifyServerFrame({
        type: "event",
        event: {
          type: "thread-runtime-events-multi",
          batches: [
            {
              threadId: VISIBLE_TERMINAL,
              events: [runtimeEvent(VISIBLE_TERMINAL, "item.started")],
            },
            { threadId: HIDDEN_CHAT, events: [runtimeEvent(HIDDEN_CHAT, "item.completed")] },
          ],
        },
      }),
    );

    const snapshot = accounting.snapshot();
    expect(snapshot.mixedBulkFrames).toBe(1);
    expect(snapshot.mixedBulkBytes).toBe(300);
    expect(snapshot.offscreenBulkBytes).toBe(0);
    expect(snapshot.interestedBulkBytes).toBe(0);
    expect(snapshot.interestedBulkEvents).toBe(1);
    expect(snapshot.offscreenBulkEvents).toBe(1);
  });

  it("tracks bulk events for every envelope shape and keeps unattributable frames separate", () => {
    const accounting = new FrameClassAccounting();
    accounting.setInterests(["thread-a"]);
    accounting.record(
      10,
      classifyServerFrame({
        type: "event",
        event: {
          type: "thread-runtime-events",
          events: [runtimeEvent("thread-a", "item.started")],
        },
      }),
    );
    accounting.record(
      20,
      classifyServerFrame({ type: "event", event: { type: "thread-runtime-events", events: [] } }),
    );
    accounting.record(30, classifyServerFrame({ type: "terminal-output", data: "no id" }));

    const snapshot = accounting.snapshot();
    expect(snapshot.bulkEvents).toBe(1);
    // The empty envelope contributes a summary frame, not a bulk event.
    expect(snapshot.framesByClass.summary).toBe(1);
    // A terminal frame without an id cannot be attributed to an interest.
    expect(snapshot.unattributedBulkBytes).toBe(30);
    expect(snapshot.offscreenBulkBytes).toBe(0);
    expect(snapshot.interests).toEqual(["thread-a"]);
  });

  it("replaces the interest set on setInterests instead of merging it", () => {
    const accounting = new FrameClassAccounting();
    accounting.setInterests(["thread-a"]);
    accounting.setInterests(["thread-b"]);
    accounting.record(
      5,
      classifyServerFrame({
        type: "event",
        event: {
          type: "thread-runtime-event",
          threadId: "thread-a",
          event: runtimeEvent("thread-a", "content.delta"),
        },
      }),
    );
    const snapshot = accounting.snapshot();
    expect(snapshot.interests).toEqual(["thread-b"]);
    expect(snapshot.offscreenBulkBytes).toBe(5);
  });

  it("returns a defensive copy of every counter", () => {
    const accounting = new FrameClassAccounting();
    accounting.setInterests(["thread-a"]);
    const first = accounting.snapshot();
    accounting.record(
      9,
      classifyServerFrame({ type: "terminal-output", id: "thread-a", data: "tick" }),
    );
    expect(first.bytesByClass.terminal).toBe(0);
    expect(first.interests).toEqual(["thread-a"]);
    expect(accounting.snapshot().bytesByClass.terminal).toBe(9);
  });
});
