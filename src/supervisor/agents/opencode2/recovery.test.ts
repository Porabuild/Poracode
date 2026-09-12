import { describe, expect, it, vi } from "vitest";
import type { OpenCode2Client, SessionMessageInfo, V2Event } from "./clientTypes";
import {
  createOpenCode2MapperState,
  mapOpenCode2Event,
  setOpenCode2SessionId,
} from "./eventMapping";
import { openCode2SnapshotEvents, readOpenCode2Recovery } from "./recovery";

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

describe("OpenCode 2 snapshot recovery", () => {
  it("replaces a stream with a missing middle and ignores later replay of completed content", () => {
    const state = createOpenCode2MapperState("thread");
    setOpenCode2SessionId(state, "s");
    const initial = mapOpenCode2Event(delta("Hello world"), state);
    const item = initial.find((entry) => entry.type === "item.started")!;
    const recovered = openCode2SnapshotEvents("s", snapshot).flatMap((entry) =>
      mapOpenCode2Event(entry, state),
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
    expect(mapOpenCode2Event(delta(" world"), state)).toEqual([]);
    expect(
      openCode2SnapshotEvents("s", snapshot).flatMap((entry) => mapOpenCode2Event(entry, state)),
    ).toEqual([]);
  });

  it("recovers a whole missed message once without replaying resumed history", () => {
    const state = createOpenCode2MapperState("thread");
    setOpenCode2SessionId(state, "s");
    state.completedMessages.add("old");
    const events = openCode2SnapshotEvents("s", [
      { ...snapshot[0]!, id: "old" },
      ...snapshot,
    ]).flatMap((entry) => mapOpenCode2Event(entry, state));
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
      form: { list: vi.fn<() => Promise<unknown>>().mockResolvedValue([]) },
      session: {
        active,
        get: vi.fn<() => Promise<unknown>>().mockResolvedValue({ outcome: "completed" }),
      },
    } as unknown as OpenCode2Client;
    const recovered = await readOpenCode2Recovery(client, "s");
    expect(recovered.active).toBe(false);
    expect(list).toHaveBeenCalledTimes(2);
    const state = createOpenCode2MapperState("thread");
    setOpenCode2SessionId(state, "s");
    const events = openCode2SnapshotEvents("s", recovered.messages).flatMap((event) =>
      mapOpenCode2Event(event, state),
    );
    expect(events.filter((event) => event.type === "content.delta")).toEqual([
      expect.objectContaining({ delta: "Hello complete world" }),
    ]);
    expect(mapOpenCode2Event(delta(" complete world"), state)).toEqual([]);
  });
});
