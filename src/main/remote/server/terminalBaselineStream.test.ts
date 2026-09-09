import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import {
  remoteWebSocketServerMessageSchema,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
  type RemoteTerminalWatchBaselineChunk,
} from "@/shared/remote";
import {
  clampTerminalBaselineChunkBytes,
  clampTerminalBaselineWindowBytes,
  composeTerminalBaselineStream,
  resolveTerminalBaselineResume,
  sliceTerminalBaselineChunks,
  terminalBaselineChunkEnvelopeOverheadBytes,
} from "./terminalCursorSync";
import { TerminalBaselineStreamScheduler } from "./terminalBaselineStream";

vi.mock("../../db", () => ({
  dbGetThread: vi.fn<() => null>(() => null),
  dbGetThreadTerminalScrollbackRecord: vi.fn<() => null>(() => null),
}));

const OVERHEAD = 256;

function fakeSocket(): WebSocket {
  return { readyState: 1, bufferedAmount: 0, OPEN: 1 } as unknown as WebSocket;
}

describe("terminal baseline bounds", () => {
  it("clamps chunk and window requests into the accepted ranges", () => {
    expect(clampTerminalBaselineChunkBytes(undefined)).toBe(8192);
    expect(clampTerminalBaselineChunkBytes(1)).toBe(1024);
    expect(clampTerminalBaselineChunkBytes(1_000_000)).toBe(65_536);
    expect(clampTerminalBaselineChunkBytes(4096)).toBe(4096);
    // Window never drops below the effective chunk budget.
    expect(clampTerminalBaselineWindowBytes(undefined, 8192)).toBe(8192);
    expect(clampTerminalBaselineWindowBytes(1024, 8192)).toBe(8192);
    expect(clampTerminalBaselineWindowBytes(1_000_000, 8192)).toBe(262_144);
  });
});

describe("terminal baseline resume decision", () => {
  const decision = resolveTerminalBaselineResume;

  it("serves the suffix for a matching generation inside the window", () => {
    expect(
      decision({
        resume: { generation: "g", cursor: 40 },
        generation: "g",
        fromCursor: 10,
        toCursor: 100,
      }),
    ).toEqual({
      resumeServed: true,
      sliceFromCursor: 40,
    });
  });

  it("rejects null generations, generation mismatches, and out-of-window positions", () => {
    expect(
      decision({
        resume: { generation: "g", cursor: 40 },
        generation: null,
        fromCursor: 10,
        toCursor: 100,
      }).resumeServed,
    ).toBe(false);
    expect(
      decision({
        resume: { generation: "other", cursor: 40 },
        generation: "g",
        fromCursor: 10,
        toCursor: 100,
      }).resumeServed,
    ).toBe(false);
    // Retention cutoff: position scrolled out of the retained tail.
    expect(
      decision({
        resume: { generation: "g", cursor: 5 },
        generation: "g",
        fromCursor: 10,
        toCursor: 100,
      }),
    ).toEqual({
      resumeServed: false,
      sliceFromCursor: 10,
    });
    // Position past the window end is stale nonsense — full replacement.
    expect(
      decision({
        resume: { generation: "g", cursor: 200 },
        generation: "g",
        fromCursor: 10,
        toCursor: 100,
      }).resumeServed,
    ).toBe(false);
    expect(
      decision({ resume: undefined, generation: "g", fromCursor: 10, toCursor: 100 }).resumeServed,
    ).toBe(false);
  });
});

describe("terminal baseline slicing", () => {
  it("keeps every encoded envelope under the budget and concatenates losslessly", () => {
    // Worst case for escaping: control characters cost 6 bytes per unit.
    const data = JSON.stringify("\u0001".repeat(50_000)).slice(1, -1);
    const pieces = sliceTerminalBaselineChunks({
      data,
      fromCursor: 100,
      budgetBytes: 4096,
      envelopeOverheadBytes: OVERHEAD,
    });
    expect(pieces.length).toBeGreaterThan(10);
    expect(pieces[0]!.fromCursor).toBe(100);
    let cursor = 100;
    let joined = "";
    for (const piece of pieces) {
      expect(piece.fromCursor).toBe(cursor);
      expect(piece.toCursor - piece.fromCursor).toBe(piece.data.length);
      // Encoded cost of the slice (escapes included) must fit the data budget.
      expect(Buffer.byteLength(JSON.stringify(piece.data), "utf8")).toBeLessThanOrEqual(
        4096 - OVERHEAD,
      );
      cursor = piece.toCursor;
      joined += piece.data;
    }
    expect(joined).toBe(data);
    expect(cursor).toBe(100 + data.length);
  });

  it("never splits surrogate pairs at chunk boundaries", () => {
    const data = "a😀b😀c";
    const pieces = sliceTerminalBaselineChunks({
      data,
      fromCursor: 0,
      budgetBytes: 4096,
      envelopeOverheadBytes: OVERHEAD,
    });
    const joined = pieces.map((p) => p.data).join("");
    expect(joined).toBe(data);
    for (const piece of pieces) {
      const last = piece.data.charCodeAt(piece.data.length - 1);
      const first = piece.data.charCodeAt(0);
      const singleUnitLoneSurrogate = piece.data.length === 1 && first >= 0xd800 && first <= 0xdfff;
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
      expect(singleUnitLoneSurrogate).toBe(false);
    }
  });

  it("is deterministic and emits one empty completion chunk for an empty window", () => {
    const a = sliceTerminalBaselineChunks({
      data: "xyz",
      fromCursor: 5,
      budgetBytes: 4096,
      envelopeOverheadBytes: OVERHEAD,
    });
    const b = sliceTerminalBaselineChunks({
      data: "xyz",
      fromCursor: 5,
      budgetBytes: 4096,
      envelopeOverheadBytes: OVERHEAD,
    });
    expect(a).toEqual(b);
    expect(
      sliceTerminalBaselineChunks({
        data: "",
        fromCursor: 42,
        budgetBytes: 4096,
        envelopeOverheadBytes: OVERHEAD,
      }),
    ).toEqual([{ fromCursor: 42, toCursor: 42, data: "" }]);
  });
});

describe("composeTerminalBaselineStream", () => {
  const result = {
    status: "ready" as const,
    generation: "g1",
    fromCursor: 0,
    toCursor: 5000,
    data: "x".repeat(5000),
    processState: "running" as const,
    terminalSize: null,
  };

  it("produces schema-valid chunk messages whose sizes match and cursors are contiguous", () => {
    const stream = composeTerminalBaselineStream({
      terminalId: "t1",
      watchId: "w1",
      result,
      resume: undefined,
      maxChunkBytes: 2048,
      maxWindowBytes: 4096,
    });
    expect(stream.chunks.length).toBeGreaterThan(1);
    expect(stream.resumeServed).toBe(false);
    expect(stream.finalCursor).toBe(5000);
    let previousTo: number | null = null;
    stream.chunks.forEach((c, index) => {
      const message = remoteWebSocketServerMessageSchema.parse(JSON.parse(stream.messages[index]!));
      expect(message.type).toBe("terminal-watch-baseline-chunk");
      expect(Buffer.byteLength(stream.messages[index]!, "utf8")).toBe(stream.messageBytes[index]);
      expect(c.chunkIndex).toBe(index);
      expect(c.chunkCount).toBe(stream.chunks.length);
      expect(c.fromCursor).toBe(previousTo ?? 0);
      previousTo = c.toCursor;
    });
    expect(stream.throughCursors[stream.throughCursors.length - 1]).toBe(5000);
    // Each message envelope respects the requested budget.
    for (const bytes of stream.messageBytes) {
      expect(bytes).toBeLessThanOrEqual(2048);
    }
    expect(stream.windowBytes).toBe(4096);
  });

  it("serves the resume suffix with resumeServed=true", () => {
    const stream = composeTerminalBaselineStream({
      terminalId: "t1",
      watchId: "w1",
      result,
      resume: { generation: "g1", cursor: 4900 },
      maxChunkBytes: undefined,
      maxWindowBytes: undefined,
    });
    expect(stream.resumeServed).toBe(true);
    expect(stream.chunks[0]!.fromCursor).toBe(4900);
    expect(stream.chunks[0]!.toCursor).toBe(5000);
    expect(stream.chunks.map((c) => c.data).join("")).toBe("x".repeat(100));
  });

  it("emits an empty up-to-date completion chunk for a fully current resume", () => {
    const stream = composeTerminalBaselineStream({
      terminalId: "t1",
      watchId: "w1",
      result: { ...result, data: "", toCursor: 0 },
      resume: undefined,
      maxChunkBytes: undefined,
      maxWindowBytes: undefined,
    });
    expect(stream.chunks).toHaveLength(1);
    expect(stream.chunks[0]).toMatchObject({
      fromCursor: 0,
      toCursor: 0,
      data: "",
      version: TERMINAL_CURSOR_SYNC_V2_VERSION,
    });
  });

  it("overhead template is an overestimate so real envelopes stay under budget", () => {
    const template: Omit<RemoteTerminalWatchBaselineChunk, "data"> = {
      version: TERMINAL_CURSOR_SYNC_V2_VERSION,
      watchId: "w",
      generation: "g",
      chunkIndex: 0,
      chunkCount: 1,
      fromCursor: 0,
      toCursor: 0,
      processState: "running",
      terminalSize: null,
      resumeServed: false,
    };
    const overhead = terminalBaselineChunkEnvelopeOverheadBytes("t1", template);
    const real = Buffer.byteLength(
      JSON.stringify({
        type: "terminal-watch-baseline-chunk",
        id: "t1",
        cursorSync: { ...template, data: "" },
      }),
      "utf8",
    );
    expect(overhead).toBe(real);
  });
});

describe("TerminalBaselineStreamScheduler", () => {
  interface Harness {
    scheduler: TerminalBaselineStreamScheduler;
    sent: string[];
    flush: () => Promise<void>;
    setCurrent: (current: boolean) => void;
  }

  function harness(): Harness {
    const sent: string[] = [];
    let current = true;
    const scheduler = new TerminalBaselineStreamScheduler({
      isCurrent: () => current,
      sendRaw: (_ws, data) => {
        sent.push(data);
        return true;
      },
    });
    const pending: Array<() => void> = [];
    vi.stubGlobal("setImmediate", (fn: () => void) => {
      pending.push(fn);
      return undefined as unknown as NodeJS.Immediate;
    });
    const flush = async () => {
      while (pending.length > 0) {
        const fn = pending.shift()!;
        fn();
        await Promise.resolve();
      }
    };
    return {
      scheduler,
      sent,
      flush,
      setCurrent: (value: boolean) => {
        current = value;
      },
    };
  }

  function spec(
    overrides: Partial<Parameters<TerminalBaselineStreamScheduler["enqueue"]>[1]> = {},
  ) {
    return {
      terminalId: "t1",
      watchId: "w1",
      epoch: 1,
      messages: ["m0", "m1", "m2"],
      messageBytes: [100, 100, 100],
      throughCursors: [1, 2, 3],
      finalCursor: 3,
      windowBytes: 250,
      ...overrides,
    };
  }

  it("streams chunks in order under the credit window and completes on the final ack", async () => {
    const h = harness();
    const socket = fakeSocket();
    h.scheduler.enqueue(socket, spec());
    await h.flush();
    // Window 250 bytes: m0 + m1 fit (200 unacked); m2 would reach 300 > 250 → held.
    expect(h.sent).toEqual(["m0", "m1"]);
    h.scheduler.acknowledge(socket, "t1", "w1", 1);
    await h.flush();
    // After acking m0 (100 bytes released), m2 fits (100 + 100 = 200 ≤ 250).
    expect(h.sent).toEqual(["m0", "m1", "m2"]);
    h.scheduler.acknowledge(socket, "t1", "w1", 3);
    const counts = h.scheduler.counts(socket);
    expect(counts).toEqual({ active: 0, queued: 0 });
    vi.unstubAllGlobals();
  });

  it("abandons the stream when the watch is replaced mid-flight", async () => {
    const h = harness();
    const socket = fakeSocket();
    h.scheduler.enqueue(socket, spec());
    await h.flush();
    expect(h.sent).toEqual(["m0", "m1"]);
    h.setCurrent(false); // rewatch/unwatch invalidated the registration
    h.scheduler.acknowledge(socket, "t1", "w1", 1);
    await h.flush();
    expect(h.sent).toEqual(["m0", "m1"]);
    expect(h.scheduler.counts(socket).active).toBe(0);
    vi.unstubAllGlobals();
  });

  it("queues beyond the per-connection stream cap and promotes when a slot frees", async () => {
    const h = harness();
    const socket = fakeSocket();
    h.scheduler.enqueue(
      socket,
      spec({
        watchId: "a",
        messages: ["a0"],
        messageBytes: [1],
        throughCursors: [9],
        finalCursor: 9,
      }),
    );
    h.scheduler.enqueue(
      socket,
      spec({
        watchId: "b",
        messages: ["b0"],
        messageBytes: [1],
        throughCursors: [9],
        finalCursor: 9,
      }),
    );
    h.scheduler.enqueue(
      socket,
      spec({
        watchId: "c",
        messages: ["c0"],
        messageBytes: [1],
        throughCursors: [9],
        finalCursor: 9,
      }),
    );
    await h.flush();
    expect(h.sent.sort()).toEqual(["a0", "b0"]);
    expect(h.scheduler.counts(socket)).toEqual({ active: 2, queued: 1 });
    // Completing "a" promotes "c".
    h.scheduler.acknowledge(socket, "t1", "a", 9);
    await h.flush();
    expect(h.sent.sort()).toEqual(["a0", "b0", "c0"]);
    expect(h.scheduler.counts(socket)).toEqual({ active: 2, queued: 0 });
    vi.unstubAllGlobals();
  });

  it("drops everything on connection teardown", async () => {
    const h = harness();
    const socket = fakeSocket();
    h.scheduler.enqueue(socket, spec());
    h.scheduler.enqueue(socket, spec({ watchId: "b" }));
    h.scheduler.clearConnection(socket);
    await h.flush();
    expect(h.sent).toEqual([]);
    expect(h.scheduler.counts(socket)).toEqual({ active: 0, queued: 0 });
    vi.unstubAllGlobals();
  });
});
