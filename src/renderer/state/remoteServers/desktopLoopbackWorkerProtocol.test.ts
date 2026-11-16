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

  it("coalesces redundant snapshots to the LATER slot so same-space seqs remain strictly monotonic", () => {
    // Regression test: if `agent-status` at seq=10 and seq=12 coalesce into slot 0,
    // `thread-runtime-events` at seq=11 in the same `loopback` space would arrive
    // AFTER seq=12 and be dropped by `PreloadIpcTransport` (`11 <= 12`).
    const frames = decodeAndCoalesceRawLoopbackBatch([
      JSON.stringify({
        type: "event",
        seq: 10,
        space: "loopback",
        event: {
          type: "agent-status-updated",
          status: { kind: "claude", available: false },
        },
      }),
      JSON.stringify({
        type: "event",
        seq: 11,
        space: "loopback",
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
        type: "event",
        seq: 12,
        space: "loopback",
        event: {
          type: "agent-status-updated",
          status: { kind: "claude", available: true },
        },
      }),
    ]);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      kind: "event",
      seq: 11,
      event: { type: "thread-runtime-events" },
    });
    expect(frames[1]).toMatchObject({
      kind: "event",
      seq: 12,
      event: {
        type: "agent-status-updated",
        status: { kind: "claude", available: true },
      },
    });
  });

  it("coalesces adjacent identical-status thread-state updates unless one-shot fields are present", () => {
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
      // One-shot `interruptedTurn` / `errorMessage` must NEVER be overwritten by a following frame!
      JSON.stringify({
        type: "event",
        seq: 3,
        event: {
          type: "thread-state",
          threadId: "t1",
          status: "idle",
          attention: "none",
          canResumeWithConfig: true,
          interruptedTurn: "stopped",
          errorMessage: "Stopped by user",
        },
      }),
      JSON.stringify({
        type: "event",
        seq: 4,
        event: {
          type: "thread-state",
          threadId: "t1",
          status: "idle",
          attention: "none",
          canResumeWithConfig: true,
        },
      }),
    ]);

    expect(frames).toHaveLength(3);
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
        interruptedTurn: "stopped",
        errorMessage: "Stopped by user",
      },
    });
    expect(frames[2]).toMatchObject({
      kind: "event",
      seq: 4,
      event: {
        type: "thread-state",
        threadId: "t1",
        status: "idle",
      },
    });
  });
});
