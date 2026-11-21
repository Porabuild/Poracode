import { describe, expect, it, vi } from "vitest";
import type {
  OpenCodeClient,
  SessionMessageAssistant,
  SessionMessageInfo,
  SessionStepEnded,
  V2Event,
} from "./clientTypes";
import { createOpenCodeMapperState, mapOpenCodeEvent, setOpenCodeSessionId } from "./eventMapping";
import { openCodeSnapshotEvents, readOpenCodeRecovery } from "./recovery";

const snapshot = [
  {
    id: "m",
    type: "assistant",
    time: { created: 1, completed: 2 },
    content: [{ type: "text", text: "Hello complete world" }],
  },
] as SessionMessageInfo[];
function delta(text: string): V2Event {
  return {
    type: "session.text.delta",
    data: { sessionID: "s", assistantMessageID: "m", ordinal: 0, delta: text },
  } as V2Event;
}

describe("OpenCode snapshot recovery", () => {
  it.each([0, 1.25, undefined])(
    "preserves snapshot cost %s before exact-once message replay",
    (amount) => {
      const message: SessionMessageAssistant = {
        id: "cost-message",
        type: "assistant",
        agent: "build",
        model: { id: "unpriced-model", providerID: "fixture" },
        time: { created: 1, completed: 2 },
        content: [{ type: "text", text: "Recovered" }],
        tokens: { input: 100, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
        ...(amount !== undefined ? { cost: amount } : {}),
      };
      const state = createOpenCodeMapperState("thread");
      setOpenCodeSessionId(state, "s");
      const snapshotEvents = openCodeSnapshotEvents("s", [message]);
      const recovered = snapshotEvents.flatMap((event) => mapOpenCodeEvent(event, state));
      const spent = recovered.filter((event) => event.type === "usage.spent");
      expect(spent).toHaveLength(1);
      expect(spent[0]?.usage.counter).toBe(110);
      expect(spent[0]?.usage.cost).toEqual(
        amount === undefined ? undefined : { amount, currency: "USD" },
      );

      const live: SessionStepEnded = {
        id: "late-live",
        created: 3,
        type: "session.step.ended",
        durable: { aggregateID: "s", seq: 1, version: 1 },
        data: {
          sessionID: "s",
          assistantMessageID: message.id,
          finish: "stop",
          cost: 1.25,
          tokens: message.tokens!,
        },
      };
      const replayed = [...snapshotEvents, live].flatMap((event) => mapOpenCodeEvent(event, state));
      expect(replayed.some((event) => event.type === "usage.spent")).toBe(false);
    },
  );

  it("replaces a stream with a missing middle and ignores later replay of completed content", () => {
    const state = createOpenCodeMapperState("thread");
    setOpenCodeSessionId(state, "s");
    const initial = mapOpenCodeEvent(delta("Hello world"), state);
    const item = initial.find((entry) => entry.type === "item.started")!;
    const recovered = openCodeSnapshotEvents("s", snapshot).flatMap((entry) =>
      mapOpenCodeEvent(entry, state),
    );
    expect(recovered).toContainEqual({
      type: "content.delta",
      threadId: "thread",
      itemId: "itemId" in item ? item.itemId : "",
      stream: "assistant_text",
      delta: "Hello complete world",
      replace: true,
    });
    expect(recovered.filter((entry) => entry.type === "item.started")).toHaveLength(0);
    expect(mapOpenCodeEvent(delta(" world"), state)).toEqual([]);
    expect(
      openCodeSnapshotEvents("s", snapshot).flatMap((entry) => mapOpenCodeEvent(entry, state)),
    ).toEqual([]);
  });

  it("recovers a whole missed message once without replaying resumed history", () => {
    const state = createOpenCodeMapperState("thread");
    setOpenCodeSessionId(state, "s");
    state.completedMessages.add("old");
    const events = openCodeSnapshotEvents("s", [
      { ...snapshot[0]!, id: "old" },
      ...snapshot,
    ]).flatMap((entry) => mapOpenCodeEvent(entry, state));
    expect(events.filter((entry) => entry.type === "item.started")).toHaveLength(1);
    expect(events.filter((entry) => entry.type === "content.delta")).toEqual([
      expect.objectContaining({ delta: "Hello complete world" }),
    ]);
  });

  it("reads final content again when a turn finishes between history and active reads", async () => {
    const list = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({
        data: [
          { ...snapshot[0], time: { created: 1 }, content: [{ type: "text", text: "Hello" }] },
        ],
        cursor: {},
      })
      .mockResolvedValueOnce({ data: snapshot, cursor: {} });
    const active = vi.fn<() => Promise<object>>(async () => {
      expect(list).toHaveBeenCalledTimes(1);
      return {};
    });
    const client = {
      message: { list },
      permission: { list: vi.fn<() => Promise<unknown>>().mockResolvedValue([]) },
      session: {
        form: { list: vi.fn<() => Promise<unknown>>().mockResolvedValue([]) },
        active,
        get: vi.fn<() => Promise<unknown>>().mockResolvedValue({ outcome: "completed" }),
      },
    } as unknown as OpenCodeClient;
    const recovered = await readOpenCodeRecovery(client, "s");
    expect(recovered.active).toBe(false);
    expect(list).toHaveBeenCalledTimes(2);
    const state = createOpenCodeMapperState("thread");
    setOpenCodeSessionId(state, "s");
    const events = openCodeSnapshotEvents("s", recovered.messages).flatMap((event) =>
      mapOpenCodeEvent(event, state),
    );
    expect(events.filter((event) => event.type === "content.delta")).toEqual([
      expect.objectContaining({ delta: "Hello complete world" }),
    ]);
    expect(mapOpenCodeEvent(delta(" complete world"), state)).toEqual([]);
  });
});
