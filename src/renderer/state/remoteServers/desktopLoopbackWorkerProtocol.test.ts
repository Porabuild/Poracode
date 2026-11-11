import { describe, expect, it } from "vitest";
import { decodeAndCoalesceRawLoopbackBatch } from "./desktopLoopbackWorkerProtocol";

describe("desktopLoopbackWorkerProtocol coalescer", () => {
  it("drops invalid and empty no-op runtime envelopes while preserving omittedRuntimeThreadIds", () => {
    const frames = decodeAndCoalesceRawLoopbackBatch([
      "{malformed",
      JSON.stringify({
        type: "event",
        seq: 1,
        space: "loopback",
        event: { type: "thread-runtime-events", threadId: "t1", events: [] },
      }),
      JSON.stringify({
        type: "event",
        seq: 2,
        space: "loopback",
        event: {
          type: "thread-runtime-events-multi",
          batches: [
            { threadId: "t1", events: [] },
            { threadId: "t2", events: [] },
          ],
        },
      }),
      JSON.stringify({
        type: "event",
        seq: 3,
        space: "loopback",
        omittedRuntimeThreadIds: ["t1"],
        event: { type: "thread-runtime-events", threadId: "t1", events: [] },
      }),
    ]);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      kind: "event",
      seq: 3,
      omittedRuntimeThreadIds: ["t1"],
    });
  });

  it("coalesces redundant provider-usage and agent-status snapshots in place while keeping order", () => {
    const frames = decodeAndCoalesceRawLoopbackBatch([
      JSON.stringify({
        type: "desktop-event",
        seq: 1,
        event: {
          type: "provider-usage",
          snapshot: { providerId: "claude", status: "ok", updatedAt: "2026-11-11T10:00:00Z" },
        },
      }),
      JSON.stringify({
        type: "event",
        seq: 10,
        event: {
          type: "thread-runtime-events",
          threadId: "t1",
          events: [
            {
              type: "content.delta",
              threadId: "t1",
              itemId: "i1",
              stream: "assistant_text",
              delta: "hello",
            },
          ],
        },
      }),
      JSON.stringify({
        type: "desktop-event",
        seq: 2,
        event: {
          type: "provider-usage",
          snapshot: { providerId: "claude", status: "ok", updatedAt: "2026-11-11T10:00:01Z" },
        },
      }),
    ]);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      kind: "event",
      seq: 2,
      event: {
        type: "provider-usage",
        snapshot: { providerId: "claude", status: "ok", updatedAt: "2026-11-11T10:00:01Z" },
      },
    });
    expect(frames[1]).toMatchObject({
      kind: "event",
      seq: 10,
    });
  });

  it("coalesces adjacent identical-status thread-state updates but preserves real status transitions", () => {
    const frames = decodeAndCoalesceRawLoopbackBatch([
      JSON.stringify({
        type: "event",
        seq: 1,
        event: {
          type: "thread-state",
          threadId: "t1",
          status: "working",
          attention: "working",
          canResumeWithConfig: true,
          slashCommands: [{ id: "a", label: "a", description: "a" }],
        },
      }),
      JSON.stringify({
        type: "event",
        seq: 2,
        event: {
          type: "thread-state",
          threadId: "t1",
          status: "working",
          attention: "working",
          canResumeWithConfig: true,
          slashCommands: [{ id: "b", label: "b", description: "b" }],
        },
      }),
      JSON.stringify({
        type: "event",
        seq: 3,
        event: {
          type: "thread-state",
          threadId: "t1",
          status: "idle",
          attention: "none",
          canResumeWithConfig: true,
        },
      }),
    ]);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      kind: "event",
      seq: 2,
      event: {
        type: "thread-state",
        threadId: "t1",
        status: "working",
        slashCommands: [{ id: "b", label: "b", description: "b" }],
      },
    });
    expect(frames[1]).toMatchObject({
      kind: "event",
      seq: 3,
      event: {
        type: "thread-state",
        threadId: "t1",
        status: "idle",
      },
    });
  });
});
