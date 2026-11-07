import { describe, expect, it } from "vitest";
import { ThreadHistoryReplay } from "./threadHistoryReplay";
import type { RuntimeEvent } from "@/shared/contracts";

const delta = (threadId: string, text = "x"): RuntimeEvent => ({
  type: "content.delta",
  threadId,
  itemId: "reply",
  stream: "assistant_text",
  delta: text,
});
const publish = (replay: ThreadHistoryReplay, threadId: string, seq: number, bytes?: number) =>
  replay.observe(
    { type: "thread-runtime-event", threadId, event: delta(threadId) },
    seq,
    true,
    bytes,
  );

describe("thread-owned history replay", () => {
  it("retains hr1 recovery for multi-thread frames within the existing subset byte limits", () => {
    const replay = new ThreadHistoryReplay();
    const ids = Array.from({ length: 8 }, (_, i) => `thread-${i}`);
    const cursors = ids.map((id) => replay.cursor(id, 0));
    for (let seq = 1; seq <= 64; seq++) {
      const event = {
        type: "thread-runtime-events-multi" as const,
        batches: ids.map((threadId) => ({
          threadId,
          events: [delta(threadId, "é😀".repeat(500))],
        })),
      };
      replay.observe(event, seq, true, Buffer.byteLength(JSON.stringify(event)));
    }
    for (let i = 0; i < ids.length; i++) {
      const batches = replay.read(ids[i]!, cursors[i]!, 64)?.batches;
      expect(batches).toHaveLength(64);
      expect(batches?.map((batch) => batch.seq)).toEqual(
        Array.from({ length: 64 }, (_, index) => index + 1),
      );
      expect(batches?.every((batch) => batch.events.every((e) => e.threadId === ids[i]))).toBe(
        true,
      );
    }
  });

  it("still invalidates a genuinely oversized retained multi-thread subset", () => {
    const replay = new ThreadHistoryReplay();
    const small = replay.cursor("small", 0);
    const large = replay.cursor("large", 0);
    replay.observe(
      {
        type: "thread-runtime-events-multi",
        batches: [
          { threadId: "small", events: [delta("small")] },
          { threadId: "large", events: [delta("large", "x".repeat(1024 * 1024))] },
        ],
      },
      1,
      true,
      2 * 1024 * 1024,
    );
    expect(replay.read("small", small, 1)?.batches).toHaveLength(1);
    expect(replay.read("large", large, 1)).toBeNull();
  });

  it("evicts multi-thread subsets when their actual total exceeds the unchanged quota", () => {
    const ids = ["a", "b", "c", "d"];
    const bytes = Buffer.byteLength(JSON.stringify([delta("a")]));
    const replay = new ThreadHistoryReplay({
      threads: 4,
      batches: 4,
      threadBytes: 1000,
      totalBytes: 2 * bytes,
    });
    const cursors = ids.map((id) => replay.cursor(id, 0));
    const event = {
      type: "thread-runtime-events-multi" as const,
      batches: ids.map((threadId) => ({ threadId, events: [delta(threadId)] })),
    };
    replay.observe(event, 1, true, Buffer.byteLength(JSON.stringify(event)));
    expect(replay.read("a", cursors[0]!, 1)).toBeNull();
    expect(replay.read("b", cursors[1]!, 1)).toBeNull();
    expect(replay.read("c", cursors[2]!, 1)?.batches).toHaveLength(1);
    expect(replay.read("d", cursors[3]!, 1)?.batches).toHaveLength(1);
  });

  it("retains a quiet thread independently of another thread's sequence and trims only its own floor", () => {
    const replay = new ThreadHistoryReplay({
      threads: 4,
      batches: 2,
      threadBytes: 1000,
      totalBytes: 4000,
    });
    const quiet = replay.cursor("quiet", 1);
    const busy = replay.cursor("busy", 1);
    publish(replay, "busy", 2);
    publish(replay, "busy", 3);
    publish(replay, "busy", 4);
    expect(replay.read("quiet", quiet, 4)?.batches).toEqual([]);
    expect(replay.read("busy", busy, 4)).toBeNull();
    const fresh = replay.cursor("busy", 3);
    expect(replay.read("busy", fresh, 4)?.batches.map((batch) => batch.seq)).toEqual([4]);
  });

  it("rejects foreign thread, process, revision, future and malformed cursors", () => {
    const replay = new ThreadHistoryReplay();
    const cursor = replay.cursor("a", 10, 2);
    replay.cursor("b", 10, 2);
    expect(replay.read("a", cursor, 10, 0, 2)?.batches).toEqual([]);
    expect(replay.read("b", cursor, 10, 0, 2)).toBeNull();
    expect(new ThreadHistoryReplay().read("a", cursor, 10, 0, 2)).toBeNull();
    expect(replay.read("a", cursor, 10, 0, 3)).toBeNull();
    expect(replay.read("a", cursor, 9, 0, 2)).toBeNull();
    expect(replay.read("a", "hr1.invalid", 10)).toBeNull();
  });

  it("replays ordered multi-thread subsets above the actual applied sequence", () => {
    const replay = new ThreadHistoryReplay();
    const a = replay.cursor("a", 1),
      b = replay.cursor("b", 1);
    replay.observe(
      {
        type: "thread-runtime-events-multi",
        batches: [
          { threadId: "a", events: [delta("a", "a")] },
          { threadId: "b", events: [delta("b", "b")] },
        ],
      },
      2,
    );
    publish(replay, "a", 3);
    expect(replay.read("a", a, 3, 2)?.batches.map((batch) => batch.seq)).toEqual([3]);
    expect(replay.read("b", b, 3)?.batches[0]?.events).toEqual([delta("b", "b")]);
  });

  it.each(["runtime.truncated", "request.opened", "request.resolved"] as const)(
    "invalidates transcript-only resume on %s",
    (type) => {
      const replay = new ThreadHistoryReplay();
      const cursor = replay.cursor("a", 0);
      replay.observe(
        {
          type: "thread-runtime-event",
          threadId: "a",
          event: { type, threadId: "a" } as RuntimeEvent,
        },
        1,
      );
      expect(replay.read("a", cursor, 1)).toBeNull();
    },
  );

  it("invalidates reset, incomplete publication and oversized frames", () => {
    const replay = new ThreadHistoryReplay({
      threads: 4,
      batches: 4,
      threadBytes: 20,
      totalBytes: 80,
    });
    for (const cause of ["reset", "incomplete", "oversized"]) {
      const cursor = replay.cursor(cause, 0);
      if (cause === "reset") replay.observe({ type: "thread-reset", threadId: cause }, 1);
      else
        replay.observe(
          { type: "thread-runtime-event", threadId: cause, event: delta(cause) },
          1,
          cause !== "incomplete",
          21,
        );
      expect(replay.read(cause, cursor, 1)).toBeNull();
    }
  });

  it("bounds total bytes and thread count and rejects evicted incarnations", () => {
    const replay = new ThreadHistoryReplay({
      threads: 2,
      batches: 4,
      threadBytes: 100,
      totalBytes: 100,
    });
    const a = replay.cursor("a", 0);
    publish(replay, "a", 1, 60);
    const b = replay.cursor("b", 1);
    publish(replay, "b", 2, 60);
    expect(replay.read("a", a, 2)).toBeNull();
    expect(replay.read("b", b, 2)?.batches).toHaveLength(1);
    replay.cursor("c", 2);
    replay.cursor("d", 2);
    expect(replay.read("b", b, 2)).toBeNull();
    replay.clear();
    expect(replay.read("d", replay.cursor("d", 3), 3)?.batches).toEqual([]);
  });
});
