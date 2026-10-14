import { describe, expect, it } from "vitest";
import {
  remoteTerminalWatchResultReadySchema,
  remoteWebSocketClientMessageSchema,
  remoteWebSocketServerMessageSchema,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
  type RemoteTerminalWatchBaselineChunk,
  type RemoteTerminalWatchResultError,
  type RemoteTerminalWatchResultReady,
  type RemoteWebSocketClientMessage,
  type RemoteWebSocketServerMessage,
} from "./protocol";
import {
  createTerminalFeed,
  type TerminalFeed,
  type TerminalFeedListener,
  type TerminalFeedOptions,
  type TerminalSocketSender,
} from "./terminalFeed";
import { TERMINAL_FEED_V2_CHUNK_BYTES } from "./terminalFeedWatchV2";

/**
 * Cursor-sync v2 feed tests: chunked baselines assemble into exactly one
 * authoritative snapshot, resume requests are derived from the retained
 * cache, per-chunk ACKs and idle-deadline resets ride the v1 lifecycle, and
 * an explicit `unsupported-version` verdict downgrades the watch to v1.
 */

function createScheduler() {
  const timers = new Map<object, () => void>();
  const schedule: TerminalFeedOptions["schedule"] = (_delayMs, fn) => {
    const key = {};
    timers.set(key, fn);
    return () => {
      timers.delete(key);
    };
  };
  const flush = (count: number) => {
    for (let i = 0; i < count && timers.size > 0; i += 1) {
      const [key, fn] = [...timers.entries()][0]!;
      timers.delete(key);
      fn();
    }
  };
  return { schedule, flush, size: () => timers.size };
}

interface Recording {
  output: string[];
  snapshots: RemoteTerminalWatchResultReady[];
  errors: RemoteTerminalWatchResultError[];
}

function recordingListener(): { listener: TerminalFeedListener; rec: Recording } {
  const rec: Recording = { output: [], snapshots: [], errors: [] };
  const listener: TerminalFeedListener = {
    onOutput: (data) => rec.output.push(data),
    onReset: () => {},
    onExited: () => {},
    onSnapshot: (snapshot) => rec.snapshots.push(snapshot),
    onWatchError: (error) => rec.errors.push(error),
  };
  return { listener, rec };
}

function createV2Harness() {
  const sent: RemoteWebSocketClientMessage[] = [];
  const sender: TerminalSocketSender = (message) => {
    sent.push(message);
    return true;
  };
  const scheduler = createScheduler();
  let watchIdCounter = 0;
  const feed: TerminalFeed = createTerminalFeed({
    generateWatchId: () => `w${(watchIdCounter += 1)}`,
    schedule: scheduler.schedule,
  });
  feed.setSender(sender, { cursorSyncVersion: TERMINAL_CURSOR_SYNC_V2_VERSION });
  return { feed, sent, scheduler };
}

function chunk(overrides: Partial<RemoteTerminalWatchBaselineChunk>): RemoteWebSocketServerMessage {
  return remoteWebSocketServerMessageSchema.parse({
    type: "terminal-watch-baseline-chunk",
    id: "t1",
    cursorSync: {
      version: TERMINAL_CURSOR_SYNC_V2_VERSION,
      watchId: "w1",
      generation: "g1",
      chunkIndex: 0,
      chunkCount: 1,
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "running",
      terminalSize: null,
      resumeServed: false,
      ...overrides,
    },
  });
}

describe("terminalFeed — cursor-sync v2", () => {
  it("requests v2 with bounds and resume from the retained cache position", () => {
    const { feed, sent } = createV2Harness();
    const { listener } = recordingListener();
    feed.watch("t1", listener)();

    const watch = sent.find((m) => m.type === "terminal-watch");
    expect(watch).toMatchObject({
      type: "terminal-watch",
      id: "t1",
      cursorSync: {
        version: TERMINAL_CURSOR_SYNC_V2_VERSION,
        maxChunkBytes: TERMINAL_FEED_V2_CHUNK_BYTES,
        maxWindowBytes: 8192,
      },
    });
    // Cold start: no cache to resume from.
    expect(watch?.type === "terminal-watch" && watch.cursorSync?.resume).toBeUndefined();
  });

  it("assembles a chunked baseline into exactly one snapshot and acks per chunk", () => {
    const { feed, sent } = createV2Harness();
    const { listener, rec } = recordingListener();
    feed.watch("t1", listener);

    feed.handleServerMessage(
      chunk({ chunkIndex: 0, chunkCount: 2, fromCursor: 0, toCursor: 4, data: "abcd" }),
    );
    feed.handleServerMessage(
      chunk({ chunkIndex: 1, chunkCount: 2, fromCursor: 4, toCursor: 7, data: "efg" }),
    );

    expect(rec.snapshots).toEqual([
      {
        status: "ready",
        generation: "g1",
        fromCursor: 0,
        toCursor: 7,
        data: "abcdefg",
        processState: "running",
        terminalSize: null,
      },
    ]);
    const acks = sent.filter((m) => m.type === "terminal-watch-baseline-ack");
    expect(
      acks.map((m) =>
        m.type === "terminal-watch-baseline-ack" ? m.cursorSync.throughCursor : null,
      ),
    ).toEqual([4, 7]);
  });

  it("presents the retained cache cursor as resume and serves the up-to-date marker", () => {
    const { feed, sent, scheduler } = createV2Harness();
    const { listener } = recordingListener();
    feed.watch("t1", listener);
    // Install a full baseline first (single chunk covering 0..10).
    feed.handleServerMessage(
      chunk({ fromCursor: 0, toCursor: 10, data: "0123456789", chunkCount: 1 }),
    );
    // Reconnect: the same connection sender re-arms with a fresh watch.
    feed.setSender(
      (message) => {
        sent.push(message);
        return true;
      },
      { cursorSyncVersion: TERMINAL_CURSOR_SYNC_V2_VERSION },
    );
    const watch = sent[sent.length - 1];
    expect(watch?.type).toBe("terminal-watch");
    const cursorSync = watch?.type === "terminal-watch" ? watch.cursorSync : undefined;
    expect(cursorSync).toMatchObject({
      version: TERMINAL_CURSOR_SYNC_V2_VERSION,
      resume: { generation: "g1", cursor: 10 },
    });

    // Server answers "you are current": one empty completion chunk.
    const watchId = cursorSync?.watchId ?? "";
    feed.handleServerMessage(
      chunk({
        watchId,
        fromCursor: 10,
        toCursor: 10,
        data: "",
        resumeServed: true,
      }),
    );
    scheduler.flush(10);
  });

  it("ignores duplicate chunks and resyncs on gaps without installing partial data", () => {
    const { feed } = createV2Harness();
    const { listener, rec } = recordingListener();
    feed.watch("t1", listener);

    feed.handleServerMessage(
      chunk({ chunkIndex: 0, chunkCount: 3, fromCursor: 0, toCursor: 2, data: "ab" }),
    );
    // Duplicate index: ignored.
    feed.handleServerMessage(
      chunk({ chunkIndex: 0, chunkCount: 3, fromCursor: 0, toCursor: 2, data: "ab" }),
    );
    // Gap: discards the assembly and resyncs (bounded); no snapshot installed.
    feed.handleServerMessage(
      chunk({ chunkIndex: 2, chunkCount: 3, fromCursor: 4, toCursor: 6, data: "ef" }),
    );
    expect(rec.snapshots).toEqual([]);
  });

  it("resets the baseline deadline on every chunk so progress is never retired", () => {
    const { feed, scheduler } = createV2Harness();
    const { listener, rec } = recordingListener();
    feed.watch("t1", listener);
    expect(scheduler.size()).toBe(1);

    // Each chunk cancels the armed deadline and re-arms it: exactly one live
    // timer at all times while the stream progresses (a v1 session would keep
    // the original deadline and retire the attempt mid-transfer).
    for (let i = 0; i < 5; i += 1) {
      feed.handleServerMessage(
        chunk({
          chunkIndex: i,
          chunkCount: 6,
          fromCursor: i * 2,
          toCursor: i * 2 + 2,
          data: `${i}${i}`,
        }),
      );
      expect(scheduler.size()).toBe(1);
    }
    // The final chunk completes the baseline and cancels the deadline.
    feed.handleServerMessage(
      chunk({ chunkIndex: 5, chunkCount: 6, fromCursor: 10, toCursor: 12, data: "55" }),
    );
    expect(scheduler.size()).toBe(0);
    scheduler.flush(5);
    expect(rec.errors).toEqual([]);
    expect(rec.snapshots).toEqual([
      expect.objectContaining({ data: "001122334455", toCursor: 12 }),
    ]);

    // Control: a stalled stream (no chunks) fires the deadline and retries
    // with a fresh watchId, exactly like v1's baseline timeout.
    const { feed: feed2, scheduler: scheduler2 } = createV2Harness();
    const l2 = recordingListener();
    feed2.watch("t1", l2.listener);
    scheduler2.flush(1);
    expect(l2.rec.errors).toEqual([{ status: "error", code: "unavailable", retryable: true }]);
  });

  it("downgrades to a v1 watch on an explicit unsupported-version verdict", () => {
    const { feed, sent } = createV2Harness();
    const { listener } = recordingListener();
    feed.watch("t1", listener);
    expect(sent.filter((m) => m.type === "terminal-watch")).toHaveLength(1);

    feed.handleServerMessage({
      type: "terminal-watch-result",
      id: "t1",
      cursorSync: {
        version: 1,
        watchId: "w1",
        result: {
          status: "error",
          code: "unavailable",
          reason: "unsupported-version",
          retryable: false,
        },
      },
    });

    // The same connection now carries a v1 watch (no resume/bounds fields).
    const v1Watch = sent.filter(
      (m) =>
        m.type === "terminal-watch" &&
        m.cursorSync?.version === 1 &&
        m.cursorSync.maxChunkBytes === undefined,
    );
    expect(v1Watch).toHaveLength(1);
    // And the v1 baseline installs normally.
    feed.handleServerMessage({
      type: "terminal-watch-result",
      id: "t1",
      cursorSync: {
        version: 1,
        watchId: "w2",
        result: remoteTerminalWatchResultReadySchema.parse({
          status: "ready",
          generation: "g1",
          fromCursor: 0,
          toCursor: 3,
          data: "abc",
          processState: "running",
          terminalSize: null,
        }),
      },
    });
  });

  it("round-trips v2 watch and ack messages through the wire schemas", () => {
    const watch: RemoteWebSocketClientMessage = remoteWebSocketClientMessageSchema.parse({
      type: "terminal-watch",
      id: "t1",
      cursorSync: {
        version: 2,
        watchId: "w1",
        maxChunkBytes: 4096,
        maxWindowBytes: 8192,
        resume: { generation: "g1", cursor: 42 },
      },
    });
    expect(watch.type === "terminal-watch" && watch.cursorSync?.resume).toEqual({
      generation: "g1",
      cursor: 42,
    });
  });
});
