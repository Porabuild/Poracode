import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { filterEventForItemInterests } from "./itemInterestFilter";
import type { RemoteBroadcastEvent } from "./context";

const itemEvent: RuntimeEvent = {
  type: "item.completed",
  threadId: "watched",
  itemId: "i1",
  payload: { name: "bash", result: "big" },
};
const delta: RuntimeEvent = {
  type: "content.delta",
  threadId: "watched",
  itemId: "i1",
  stream: "assistant_text",
  delta: "hello",
};
const request: RuntimeEvent = {
  type: "request.opened",
  threadId: "watched",
  requestId: "r1",
  requestType: "tool_call_approval",
  payload: { summary: "Allow rm -rf?" },
};
const turn: RuntimeEvent = {
  type: "turn.completed",
  threadId: "watched",
  turnId: "t1",
  state: "completed",
};

describe("filterEventForItemInterests", () => {
  it("passes everything through when the client never declared interests", () => {
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-event",
      threadId: "other",
      event: itemEvent,
    };
    expect(filterEventForItemInterests(event, null)).toBe(event);
  });

  it("keeps content for a watched thread", () => {
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-event",
      threadId: "watched",
      event: itemEvent,
    };
    expect(filterEventForItemInterests(event, new Set(["watched"]))).toBe(event);
  });

  it("empties content for an unwatched thread instead of dropping the event", () => {
    // Dropping it would break the replay contiguity check and force a resync.
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-event",
      threadId: "other",
      event: itemEvent,
    };
    const filtered = filterEventForItemInterests(event, new Set(["watched"]));
    expect(filtered).toEqual({ type: "thread-runtime-events", threadId: "other", events: [] });
    expect(JSON.stringify(filtered).length).toBeLessThan(80);
  });

  it("still delivers a permission request for an unwatched thread", () => {
    // The critical invariant: a background thread blocking on approval must
    // surface, and a thread snapshot cannot recover an open request later.
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-event",
      threadId: "other",
      event: request,
    };
    expect(filterEventForItemInterests(event, new Set(["watched"]))).toBe(event);
  });

  it("keeps lifecycle events but strips content from a mixed batch", () => {
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-events",
      threadId: "other",
      events: [itemEvent, request, delta, turn],
    };
    const filtered = filterEventForItemInterests(event, new Set(["watched"]));
    expect(filtered.type).toBe("thread-runtime-events");
    const events = (filtered as unknown as { events: RuntimeEvent[] }).events;
    expect(events.map((e) => e.type)).toEqual(["request.opened", "turn.completed"]);
  });

  it("scopes each batch of a multi-thread event independently", () => {
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-events-multi",
      batches: [
        { threadId: "watched", events: [itemEvent] },
        { threadId: "other", events: [itemEvent, request] },
      ],
    };
    const filtered = filterEventForItemInterests(event, new Set(["watched"]));
    const batches = (
      filtered as unknown as {
        batches: Array<{ threadId: string; events: RuntimeEvent[] }>;
      }
    ).batches;
    expect(batches[0]!.events.map((e) => e.type)).toEqual(["item.completed"]);
    expect(batches[1]!.events.map((e) => e.type)).toEqual(["request.opened"]);
  });

  it("leaves non-runtime events alone", () => {
    const event: RemoteBroadcastEvent = {
      type: "thread-state",
      threadId: "other",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    };
    expect(filterEventForItemInterests(event, new Set(["watched"]))).toBe(event);
  });

  it("does not copy a batch that needed no filtering", () => {
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-events",
      threadId: "watched",
      events: [itemEvent],
    };
    expect(filterEventForItemInterests(event, new Set(["watched"]))).toBe(event);
  });
});
