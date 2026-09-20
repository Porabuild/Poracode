import { describe, expect, it } from "vitest";
import { remoteTerminalWatchResultReadySchema } from "./protocol";
import {
  createTerminalFeed,
  type TerminalFeed,
  type TerminalFeedListener,
  type TerminalFeedOptions,
  type TerminalSocketSender,
} from "./terminalFeed";
import type {
  RemoteTerminalWatchResult,
  RemoteTerminalWatchResultError,
  RemoteTerminalWatchResultReady,
  RemoteWebSocketClientMessage,
  RemoteWebSocketServerMessage,
} from "./protocol";

type ReadyOverrides = Partial<Omit<RemoteTerminalWatchResultReady, "status">>;

function createScheduler() {
  const timers = new Map<object, () => void>();
  const schedule: TerminalFeedOptions["schedule"] = (_delayMs, fn) => {
    const key = {};
    timers.set(key, fn);
    return () => {
      timers.delete(key);
    };
  };
  /** Run up to `count` due timers in schedule order. */
  const flush = (count: number) => {
    for (let i = 0; i < count && timers.size > 0; i += 1) {
      const [key, fn] = [...timers.entries()][0]!;
      timers.delete(key);
      fn();
    }
  };
  return { schedule, flush, size: () => timers.size };
}

interface ListenerRecording {
  output: string[];
  resets: number;
  exited: (number | null)[];
  snapshots: RemoteTerminalWatchResultReady[];
  errors: RemoteTerminalWatchResultError[];
}

function recordingListener(opts: { snapshot?: boolean; error?: boolean } = {}): {
  listener: TerminalFeedListener;
  rec: ListenerRecording;
} {
  const rec: ListenerRecording = { output: [], resets: 0, exited: [], snapshots: [], errors: [] };
  const listener: TerminalFeedListener = {
    onOutput: (data) => rec.output.push(data),
    onReset: () => {
      rec.resets += 1;
    },
    onExited: (exitCode) => rec.exited.push(exitCode),
    ...(opts.snapshot
      ? {
          onSnapshot: (snapshot: RemoteTerminalWatchResultReady) => {
            rec.snapshots.push(snapshot);
          },
        }
      : {}),
    ...(opts.error
      ? {
          onWatchError: (error: RemoteTerminalWatchResultError) => {
            rec.errors.push(error);
          },
        }
      : {}),
  };
  return { listener, rec };
}

function createHarness(options: TerminalFeedOptions = {}) {
  const sent: RemoteWebSocketClientMessage[] = [];
  const senders: TerminalSocketSender[] = [];
  const nextSender = (): TerminalSocketSender => {
    const sender: TerminalSocketSender = (message) => {
      sent.push(message);
      return true;
    };
    senders.push(sender);
    return sender;
  };
  const scheduler = createScheduler();
  let watchIdCounter = 0;
  const feed = createTerminalFeed({
    ...options,
    generateWatchId: options.generateWatchId ?? (() => `w${(watchIdCounter += 1)}`),
    schedule: options.schedule ?? scheduler.schedule,
  });
  const watchIds = () =>
    sent
      .filter((m) => m.type === "terminal-watch")
      .map((m) => (m.type === "terminal-watch" ? m.cursorSync?.watchId : undefined));
  return { feed, sent, nextSender, scheduler, watchIds };
}

function tag(
  id: string,
  watchId: string,
  generation: string,
  fromCursor: number,
  data: string,
): RemoteWebSocketServerMessage {
  return {
    type: "terminal-output",
    id,
    data,
    cursorSync: {
      version: 1,
      watchId,
      generation,
      fromCursor,
      toCursor: fromCursor + data.length,
    },
  };
}

const plainOutput = (id: string, data: string): RemoteWebSocketServerMessage => ({
  type: "terminal-output",
  id,
  data,
});

const ready = (overrides: ReadyOverrides = {}): RemoteTerminalWatchResultReady =>
  remoteTerminalWatchResultReadySchema.parse({
    status: "ready",
    generation: "g1",
    fromCursor: 0,
    toCursor: 0,
    data: "",
    processState: "running",
    terminalSize: null,
    ...overrides,
  });

const watchError = (
  code: "forbidden" | "not-found" | "unavailable",
  retryable: boolean,
): RemoteTerminalWatchResult => ({
  status: "error",
  code,
  retryable,
});

function sendResult(
  feed: TerminalFeed,
  id: string,
  watchId: string,
  result: RemoteTerminalWatchResult,
): void {
  feed.handleServerMessage({
    type: "terminal-watch-result",
    id,
    cursorSync: { version: 1, watchId, result },
  });
}

const syncSender = (h: ReturnType<typeof createHarness>) => h.nextSender();
const connect = (h: ReturnType<typeof createHarness>) =>
  h.feed.setSender(syncSender(h), { cursorSyncVersion: 1 });

describe("terminalFeed — legacy mode parity", () => {
  it("keeps the old live-only contract: plain watch, passthrough output, unwatch on last detach", () => {
    const h = createHarness();
    const sender = syncSender(h);
    h.feed.setSender(sender);
    const { listener, rec } = recordingListener({ error: true });

    const unsub = h.feed.watch("t1", listener);
    expect(h.sent).toEqual([{ type: "terminal-watch", id: "t1" }]);

    expect(h.feed.handleServerMessage(plainOutput("t1", "hi"))).toBe(true);
    expect(rec.output).toEqual(["hi"]);
    expect(h.feed.handleServerMessage(tag("t1", "w1", "g1", 0, "tagged"))).toBe(true);
    expect(rec.output).toEqual(["hi", "tagged"]);

    expect(h.feed.handleServerMessage(plainOutput("other", "x"))).toBe(true);
    h.feed.emitExited("t1", 3);
    expect(rec.exited).toEqual([3]);
    h.feed.emitReset("t1");
    expect(rec.resets).toBe(1);

    expect(h.feed.handleServerMessage({ type: "ready", seq: 0 })).toBe(false);
    expect(rec.output).toEqual(["hi", "tagged"]);

    unsub();
    expect(h.sent).toEqual([
      { type: "terminal-watch", id: "t1" },
      { type: "terminal-unwatch", id: "t1" },
    ]);
    // Legacy hosts get no watch errors: retry machinery never engages.
    expect(rec.errors).toEqual([]);
  });
});

describe("terminalFeed — cursor-sync baseline", () => {
  it("buffers live frames before the baseline, installs the snapshot, then delivers only uncovered live", () => {
    const h = createHarness();
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", listener);

    expect(h.sent[0]).toMatchObject({
      type: "terminal-watch",
      id: "t1",
      cursorSync: { version: 1, watchId: "w1" },
    });

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 0, "hello"));
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 5, "orld")); // overlaps baseline tail
    expect(rec.output).toEqual([]);
    expect(rec.snapshots).toEqual([]);

    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 8, data: "hello wo" }),
    );

    // Snapshot install first; the covered prefix of the second frame is
    // trimmed by cursor math — only "d" (unit 8..9) is live.
    expect(rec.snapshots).toEqual([
      ready({ generation: "g1", fromCursor: 0, toCursor: 8, data: "hello wo" }),
    ]);
    expect(rec.output).toEqual(["d"]);

    // Fully-covered and partial-overlap duplicates are skipped, new bytes flow.
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 0, "hello wo"));
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 4, "lo wo"));
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 9, "ok")); // cursor is 9 after the overlap trim
    expect(rec.output).toEqual(["d", "ok"]);
    expect(rec.errors).toEqual([]);
    expect(h.sent).toHaveLength(1);
  });

  it("reconciles by UTF-16 units, not code points", () => {
    const h = createHarness();
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true });
    h.feed.watch("t1", listener);

    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 6, data: "a👍b c" }),
    );
    expect(rec.output).toEqual([]);

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 6, "d👍")); // 3 units
    expect(rec.output).toEqual(["d👍"]);
    expect(rec.snapshots[0]?.data).toBe("a👍b c");

    const { listener: late, rec: lateRec } = recordingListener({ snapshot: true });
    h.feed.watch("t1", late);
    expect(lateRec.snapshots[0]).toMatchObject({ fromCursor: 0, toCursor: 9, data: "a👍b cd👍" });
  });
});

describe("terminalFeed — generation changes and resync budgets", () => {
  it("resnapshots on a generation change without guessing the missing bytes", () => {
    const h = createHarness();
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", listener);

    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 10, data: "0123456789" }),
    );
    expect(rec.snapshots).toHaveLength(1);

    // A frame from a new generation beyond our cursor: resync, fresh watchId.
    h.feed.handleServerMessage(tag("t1", "w1", "g2", 12, "abc"));
    expect(h.watchIds()).toEqual(["w1", "w2"]);
    expect(rec.output).toEqual([]); // no invented bytes for 10..12
    expect(rec.errors).toEqual([]);

    // Frames/results from the replaced attempt are stale now.
    h.feed.handleServerMessage(tag("t1", "w1", "g2", 15, "xyz"));
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g2", fromCursor: 0, toCursor: 20, data: "stale".repeat(4) }),
    );

    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g2", fromCursor: 0, toCursor: 15, data: "0123456789XYabc" }),
    );
    expect(rec.snapshots).toHaveLength(2);
    expect(rec.snapshots[1]).toMatchObject({ generation: "g2", toCursor: 15 });
    expect(rec.output).toEqual([]);

    h.feed.handleServerMessage(tag("t1", "w2", "g2", 15, "de"));
    expect(rec.output).toEqual(["de"]);
  });

  it("stops with a single honest error after the resync budget is exhausted without progress", () => {
    const h = createHarness({ retry: { maxResyncs: 1 } });
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", listener);

    // Null generation is replace-only and never progress: any live frame
    // against it forces a resnapshot, and the loop must terminate.
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: null, processState: "exited", fromCursor: 0, toCursor: 3, data: "old" }),
    );
    expect(rec.snapshots).toHaveLength(1);

    h.feed.handleServerMessage(tag("t1", "w1", "g9", 3, "x"));
    expect(h.watchIds()).toEqual(["w1", "w2"]);

    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: null, processState: "exited", fromCursor: 0, toCursor: 3, data: "old" }),
    );
    h.feed.handleServerMessage(tag("t1", "w2", "g9", 3, "x"));

    expect(rec.errors).toEqual([{ status: "error", code: "unavailable", retryable: false }]);
    expect(h.watchIds()).toEqual(["w1", "w2"]); // no further watches after stop
    expect(h.sent.some((m) => m.type === "terminal-unwatch")).toBe(true);

    const watches = h.sent.length;
    h.feed.handleServerMessage(tag("t1", "w2", "g9", 99, "late"));
    h.scheduler.flush(20);
    expect(h.sent).toHaveLength(watches);
    expect(rec.errors).toHaveLength(1);
  });

  it("does not refill the resync budget when a resnapshot returns an unchanged baseline", () => {
    const h = createHarness({ retry: { maxResyncs: 2, baselineTimeoutMs: 60_000 } });
    connect(h);
    recordingListener({ snapshot: true });
    h.feed.watch("t1", recordingListener({ snapshot: true }).listener);

    const baseline = ready({ generation: "g1", fromCursor: 0, toCursor: 5, data: "abcde" });
    sendResult(h.feed, "t1", "w1", baseline);
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 9, "z")); // gap → resync 1

    // Same generation, same cursor: not forward progress, budget not refilled.
    sendResult(h.feed, "t1", "w2", baseline);
    h.feed.handleServerMessage(tag("t1", "w2", "g1", 9, "z")); // resync 2
    sendResult(h.feed, "t1", "w3", baseline);
    h.feed.handleServerMessage(tag("t1", "w3", "g1", 9, "z")); // exhausted

    expect(h.watchIds()).toEqual(["w1", "w2", "w3"]);
    expect(h.sent.at(-1)).toEqual({ type: "terminal-unwatch", id: "t1" });
  });

  it("treats a cursor-advanced re-baseline as progress and keeps recovering", () => {
    const h = createHarness({ retry: { maxResyncs: 1, baselineTimeoutMs: 60_000 } });
    connect(h);
    h.feed.watch("t1", recordingListener({ snapshot: true, error: true }).listener);

    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 5, data: "abcde" }),
    );
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 9, "z")); // resync 1
    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g1", fromCursor: 0, toCursor: 10, data: "abcdefghiz" }),
    );
    h.feed.handleServerMessage(tag("t1", "w2", "g1", 10, "more"));
    expect(h.watchIds()).toEqual(["w1", "w2"]); // budget was refilled by progress, no stop
  });
});

describe("terminalFeed — reconnect, reset, and stale identities", () => {
  it("ignores stale ids after a reconnect and rewatch with a fresh id", () => {
    const h = createHarness();
    const first = syncSender(h);
    h.feed.setSender(first, { cursorSyncVersion: 1 });
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", listener);

    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 5, data: "hello" }),
    );
    expect(rec.snapshots).toHaveLength(1);

    const sentBefore = h.sent.length;
    h.feed.setSender(first, { cursorSyncVersion: 1 }); // idempotent: same sender + mode
    expect(h.sent).toHaveLength(sentBefore);

    h.feed.setSender(syncSender(h), { cursorSyncVersion: 1 });
    expect(h.watchIds()).toEqual(["w1", "w2"]);

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 5, "X")); // stale frame
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "stale", fromCursor: 0, toCursor: 1, data: "!" }),
    ); // stale result
    expect(rec.snapshots).toHaveLength(1);
    expect(rec.output).toEqual([]);
    expect(rec.errors).toEqual([]);

    // Late joiner mid-reconnect sees the retained real cache, not an empty view.
    const { listener: late, rec: lateRec } = recordingListener({ snapshot: true });
    h.feed.watch("t1", late);
    expect(lateRec.snapshots[0]).toMatchObject({ generation: "g1", data: "hello" });

    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g1", fromCursor: 0, toCursor: 8, data: "hello wo" }),
    );
    h.feed.handleServerMessage(tag("t1", "w2", "g1", 8, "rld"));
    expect(rec.output).toEqual(["rld"]);
    expect(lateRec.output).toEqual(["rld"]);
  });

  it("starts a fresh attempt on reset and ignores the previous attempt's frames and results", () => {
    const h = createHarness();
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true });
    h.feed.watch("t1", listener);

    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 4, data: "data" }),
    );
    h.feed.emitReset("t1");
    expect(rec.resets).toBe(1);
    expect(h.watchIds()).toEqual(["w1", "w2"]);

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 4, "X"));
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "gX", fromCursor: 0, toCursor: 1, data: "!" }),
    );
    expect(rec.snapshots).toHaveLength(1);
    expect(rec.output).toEqual([]);

    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g2", fromCursor: 0, toCursor: 2, data: "n>" }),
    );
    expect(rec.snapshots).toHaveLength(2);
    expect(rec.snapshots[1]).toMatchObject({ generation: "g2", data: "n>" });
  });
});

describe("terminalFeed — watch errors", () => {
  it("stops a forbidden watch without retrying and re-arms only on reset or explicit re-watch", () => {
    const h = createHarness();
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    const unsub = h.feed.watch("t1", listener);

    sendResult(h.feed, "t1", "w1", watchError("forbidden", false));
    expect(rec.errors).toEqual([{ status: "error", code: "forbidden", retryable: false }]);
    h.scheduler.flush(50);
    expect(h.watchIds()).toEqual(["w1"]); // no retry
    expect(h.sent.some((m) => m.type === "terminal-unwatch")).toBe(true);

    // Late joiner learns why there is no history; no snapshot is invented.
    const { listener: late, rec: lateRec } = recordingListener({ snapshot: true, error: true });
    const unsubLate = h.feed.watch("t1", late);
    expect(lateRec.errors).toEqual([{ status: "error", code: "forbidden", retryable: false }]);
    expect(lateRec.snapshots).toEqual([]);

    // Only the final detach stops the watch; the explicit re-watch re-arms.
    unsub();
    unsubLate();
    h.feed.watch("t1", recordingListener({ snapshot: true }).listener);
    expect(h.watchIds()).toEqual(["w1", "w2"]);
  });

  it("recovers a not-found watch on thread reset (deferred spawn)", () => {
    const h = createHarness();
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", listener);

    sendResult(h.feed, "t1", "w1", watchError("not-found", false));
    expect(rec.errors).toHaveLength(1);
    h.scheduler.flush(20);
    expect(h.watchIds()).toEqual(["w1"]);

    h.feed.emitReset("t1");
    expect(rec.resets).toBe(1);
    expect(h.watchIds()).toEqual(["w1", "w2"]);
    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "hi" }),
    );
    expect(rec.snapshots).toHaveLength(1);
  });

  it("times out a missing baseline, retries with fresh ids, and cancels on unsubscribe", () => {
    const h = createHarness({
      retry: { baseMs: 10, maxMs: 20, maxAttempts: 4, baselineTimeoutMs: 5 },
    });
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    const unsub = h.feed.watch("t1", listener);

    h.scheduler.flush(1); // baseline timeout fires → retryable error + retry scheduled
    expect(rec.errors[0]).toEqual({ status: "error", code: "unavailable", retryable: true });
    h.scheduler.flush(1); // backoff retry fires → fresh watchId
    expect(h.watchIds()).toEqual(["w1", "w2"]);

    unsub();
    const sentAfterUnsub = h.sent.length;
    h.scheduler.flush(50);
    expect(h.sent).toHaveLength(sentAfterUnsub);
    expect(rec.errors).toHaveLength(1);
    expect(rec.snapshots).toEqual([]);
  });

  it("stops after the final baseline attempt and reports a non-retryable exhaustion", () => {
    const h = createHarness({
      retry: { baseMs: 1, maxMs: 2, maxAttempts: 1, baselineTimeoutMs: 5 },
    });
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", listener);

    h.scheduler.flush(10);
    expect(rec.errors.at(-1)).toEqual({ status: "error", code: "unavailable", retryable: false });
    expect(h.watchIds()).toEqual(["w1", "w2"]);
    expect(h.sent.at(-1)).toEqual({ type: "terminal-unwatch", id: "t1" });
    h.scheduler.flush(20);
    expect(h.watchIds()).toEqual(["w1", "w2"]);

    // A new connection resets the budget and re-arms.
    h.feed.setSender(syncSender(h), { cursorSyncVersion: 1 });
    expect(h.watchIds()).toEqual(["w1", "w2", "w3"]);
  });
});

describe("terminalFeed — multi-listener replay rules", () => {
  it("delivers the baseline only through onSnapshot; script listeners never receive replay", () => {
    const h = createHarness();
    connect(h);
    const script = recordingListener(); // no onSnapshot/onWatchError
    const visual = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", script.listener);
    h.feed.watch("t1", visual.listener);

    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 4, data: "hist" }),
    );
    expect(visual.rec.snapshots).toHaveLength(1);
    expect(script.rec.output).toEqual([]); // history never reaches onOutput
    expect(visual.rec.output).toEqual([]);

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 4, "ve"));
    expect(script.rec.output).toEqual(["ve"]);
    expect(visual.rec.output).toEqual(["ve"]);
  });

  it("serves the bounded active cache to a late visual listener; a late script listener gets nothing", () => {
    const h = createHarness();
    connect(h);
    const first = recordingListener({ snapshot: true });
    const unsub = h.feed.watch("t1", first.listener);
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 4, data: "hist" }),
    );
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 4, "ve"));

    const lateScript = recordingListener();
    const unsubScript = h.feed.watch("t1", lateScript.listener);
    expect(lateScript.rec.output).toEqual([]);

    const lateVisual = recordingListener({ snapshot: true });
    const unsubVisual = h.feed.watch("t1", lateVisual.listener);
    expect(lateVisual.rec.snapshots[0]).toMatchObject({
      status: "ready",
      generation: "g1",
      fromCursor: 0,
      toCursor: 6,
      data: "histve",
      processState: "running",
    });

    // Only uncovered bytes flow to everyone after the join (frame spans
    // 5..7, cursor is 6 → shared uncovered suffix "!").
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 5, "e!"));
    expect(lateVisual.rec.output).toEqual(["!"]);
    expect(lateScript.rec.output).toEqual(["!"]);

    // The desktop stream stops only after the last listener detaches.
    unsubScript();
    unsubVisual();
    unsub();
    expect(h.sent.some((m) => m.type === "terminal-unwatch" && m.id === "t1")).toBe(true);
  });

  it("exposes exit status in the retained cache for late joins", () => {
    const h = createHarness();
    connect(h);
    h.feed.watch("t1", recordingListener({ snapshot: true }).listener);
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "ok" }),
    );
    h.feed.emitExited("t1", 0);

    const late = recordingListener({ snapshot: true });
    h.feed.watch("t1", late.listener);
    expect(late.rec.snapshots[0]).toMatchObject({ processState: "exited" });
  });
});

describe("terminalFeed — bounded memory", () => {
  it("drops the pending buffer and resnapshots once when live outruns the baseline window", () => {
    const h = createHarness({ limits: { pendingUnits: 10 } });
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", listener);

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 0, "12345678")); // 8 units buffered
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 8, "0123456789")); // overflows the 10-unit cap
    expect(h.watchIds()).toEqual(["w1", "w2"]); // single bounded resnapshot

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 18, "stale"));
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 1, data: "x" }),
    ); // stale result

    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g1", fromCursor: 0, toCursor: 20, data: "1".repeat(20) }),
    );
    expect(rec.snapshots).toHaveLength(1);
    expect(rec.output).toEqual([]);
    h.feed.handleServerMessage(tag("t1", "w2", "g1", 20, "A"));
    expect(rec.output).toEqual(["A"]);
    expect(rec.errors).toEqual([]);
    expect(h.watchIds()).toEqual(["w1", "w2"]);
  });

  it("bounds the pending buffer against empty-frame floods without resync churn", () => {
    const h = createHarness({ limits: { pendingUnits: 10 } });
    connect(h);
    h.feed.watch("t1", recordingListener({ snapshot: true }).listener);
    for (let i = 0; i < 500; i += 1) {
      h.feed.handleServerMessage(tag("t1", "w1", "g1", 5, "")); // zero-unit frames are dropped
    }
    expect(h.watchIds()).toEqual(["w1"]);
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 0, "ab"));
    expect(h.watchIds()).toEqual(["w1"]);
  });

  it("front-trims the active cache on append and preserves absolute cursors for late joins", () => {
    const h = createHarness({ limits: { cacheUnits: 6 } });
    connect(h);
    h.feed.watch("t1", recordingListener({ snapshot: true }).listener);
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 4, data: "abcd" }),
    );
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 4, "efghi"));

    const late = recordingListener({ snapshot: true });
    h.feed.watch("t1", late.listener);
    expect(late.rec.snapshots[0]).toMatchObject({ fromCursor: 3, toCursor: 9, data: "defghi" });

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 9, "j"));
    expect(late.rec.output).toEqual(["j"]);
  });

  it("front-trims an oversized snapshot on installation", () => {
    const h = createHarness({ limits: { cacheUnits: 4 } });
    connect(h);
    h.feed.watch("t1", recordingListener({ snapshot: true }).listener);
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 10, data: "0123456789" }),
    );

    const late = recordingListener({ snapshot: true });
    h.feed.watch("t1", late.listener);
    expect(late.rec.snapshots[0]).toMatchObject({ fromCursor: 6, toCursor: 10, data: "6789" });
  });
});

describe("terminalFeed — sender lifecycle", () => {
  it("suspends writes and retries while disconnected and keeps the connection-local mode fresh", () => {
    const h = createHarness({ retry: { baseMs: 1, maxMs: 2, baselineTimeoutMs: 5 } });
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", listener);
    expect(h.watchIds()).toEqual(["w1"]);

    h.feed.setSender(null);
    const sentAtDisconnect = h.sent.length;
    h.scheduler.flush(30); // no timers survive the disconnect
    expect(h.sent).toHaveLength(sentAtDisconnect);
    expect(h.scheduler.size()).toBe(0);
    expect(rec.errors).toEqual([]);

    h.feed.setSender(syncSender(h), { cursorSyncVersion: 1 });
    expect(h.watchIds()).toEqual(["w1", "w2"]); // reconnect: new id baseline
  });

  it("invalidates cached generation on reset even while disconnected, without sending", () => {
    const h = createHarness();
    connect(h);
    const { listener, rec } = recordingListener({ snapshot: true, error: true });
    h.feed.watch("t1", listener);
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 3, data: "old" }),
    );
    expect(rec.snapshots).toHaveLength(1);

    h.feed.setSender(null);
    const sentAtDisconnect = h.sent.length;
    h.feed.emitReset("t1");
    expect(rec.resets).toBe(1);
    expect(h.sent).toHaveLength(sentAtDisconnect);

    // The stale pre-reset cache is gone: a late joiner must not see generation g1.
    const late = recordingListener({ snapshot: true });
    h.feed.watch("t1", late.listener);
    expect(late.rec.snapshots).toEqual([]);

    h.feed.setSender(syncSender(h), { cursorSyncVersion: 1 });
    expect(h.watchIds()).toEqual(["w1", "w2"]);
    const afterReconnect = recordingListener({ snapshot: true });
    h.feed.watch("t1", afterReconnect.listener);
    expect(afterReconnect.rec.snapshots).toEqual([]);
    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g2", fromCursor: 0, toCursor: 3, data: "new" }),
    );
    expect(rec.snapshots).toHaveLength(2);
    expect(late.rec.snapshots).toHaveLength(1);
  });

  it("does not resend watches when re-activating the same socket with the same mode", () => {
    const h = createHarness();
    const sender = syncSender(h);
    h.feed.setSender(sender, { cursorSyncVersion: 1 });
    h.feed.watch("t1", recordingListener({ snapshot: true }).listener);
    h.feed.watch("t2", recordingListener().listener);
    expect(h.watchIds()).toEqual(["w1", "w2"]);

    h.feed.setSender(sender, { cursorSyncVersion: 1 });
    expect(h.watchIds()).toEqual(["w1", "w2"]);

    // A different sender is a new connection: everything rewatches.
    h.feed.setSender(syncSender(h), { cursorSyncVersion: 1 });
    expect(h.watchIds()).toEqual(["w1", "w2", "w3", "w4"]);

    // A mode change on the same connection rewatches in the other mode.
    const sender3 = syncSender(h);
    h.feed.setSender(sender3);
    const legacyWatches = h.sent.filter(
      (m): m is Extract<RemoteWebSocketClientMessage, { type: "terminal-watch" }> =>
        m.type === "terminal-watch" && m.cursorSync === undefined,
    );
    expect(legacyWatches.map((m) => m.id)).toEqual(["t1", "t2"]);
    expect(h.sent.filter((m) => m.type === "terminal-unwatch")).toHaveLength(0);
  });
});

describe("terminalFeed — unsubscribe and reentrancy", () => {
  it("does not recreate a watch when a reset callback clears the feed", () => {
    const h = createHarness();
    connect(h);
    h.feed.watch("t1", {
      onOutput: () => undefined,
      onReset: () => h.feed.reset(),
      onExited: () => undefined,
    });
    h.feed.emitReset("t1");
    expect(h.watchIds()).toEqual(["w1"]);
    expect(h.scheduler.size()).toBe(0);
  });

  it("stops delivering to an orphaned listener set when a callback clears the feed", () => {
    const h = createHarness();
    h.feed.setSender(h.nextSender());
    h.feed.watch("t1", {
      onOutput: () => h.feed.reset(),
      onReset: () => undefined,
      onExited: () => undefined,
    });
    const other = recordingListener();
    h.feed.watch("t1", other.listener);
    h.feed.handleServerMessage(plainOutput("t1", "old bytes"));
    expect(other.rec.output).toEqual([]);
  });

  it("updates cached exit state before notifying listeners that may attach a new view", () => {
    const h = createHarness();
    connect(h);
    const late = recordingListener({ snapshot: true });
    h.feed.watch("t1", {
      onOutput: () => undefined,
      onReset: () => undefined,
      onExited: () => {
        h.feed.watch("t1", late.listener);
      },
    });
    sendResult(h.feed, "t1", "w1", ready());
    h.feed.emitExited("t1", 0);
    expect(late.rec.snapshots).toEqual([ready({ processState: "exited" })]);
  });

  it("lets an onWatchError callback unsubscribe and re-watch the same id without the stop clobbering the new watch", () => {
    const h = createHarness({
      retry: { baseMs: 1, maxMs: 2, maxAttempts: 1, baselineTimeoutMs: 5 },
    });
    connect(h);
    const replacement = recordingListener({ snapshot: true });
    let unsub: (() => void) | null = null;
    let rewatched = false;
    const rewatcher: TerminalFeedListener = {
      onOutput: () => {},
      onReset: () => {},
      onExited: () => {},
      onWatchError: (error) => {
        // Re-watch only on the terminal stop, so the retryable timeout error
        // gets one legitimate retry first.
        if (rewatched || error.retryable) return;
        rewatched = true;
        unsub?.();
        h.feed.watch("t1", replacement.listener);
      },
    };
    unsub = h.feed.watch("t1", rewatcher);

    h.scheduler.flush(1); // w1 baseline timeout → retryable error → retry w2
    h.scheduler.flush(1); // backoff fires → fresh attempt w2
    h.scheduler.flush(1); // w2 baseline timeout → attempts exhausted → stop → callback re-watches
    // stop() completed its transition (unwatch sent) before the callback ran,
    // so the replacement watch lands after both unwatchs and survives.
    const unwatchIndices = h.sent.flatMap((m, i) => (m.type === "terminal-unwatch" ? [i] : []));
    expect(unwatchIndices.length).toBe(2); // stop's unwatch + final-detach unwatch
    expect(h.watchIds()).toEqual(["w1", "w2", "w3"]);

    // Accept the replacement baseline immediately, then prove no orphan
    // retries/unwatches appear afterwards.
    sendResult(
      h.feed,
      "t1",
      "w3",
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "ok" }),
    );
    h.scheduler.flush(20);
    expect(replacement.rec.snapshots).toEqual([
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "ok" }),
    ]);
    expect(h.watchIds()).toEqual(["w1", "w2", "w3"]);
    expect(h.sent.filter((m) => m.type === "terminal-unwatch")).toHaveLength(2);
  });

  it("does not let a retired attempt schedule retries after its callback already re-watched the id", () => {
    const h = createHarness({
      retry: { baseMs: 1, maxMs: 2, maxAttempts: 5, baselineTimeoutMs: 5 },
    });
    connect(h);
    const replacement = recordingListener({ snapshot: true });
    let unsub: (() => void) | null = null;
    let rewatched = false;
    const rewatcher: TerminalFeedListener = {
      onOutput: () => {},
      onReset: () => {},
      onExited: () => {},
      onWatchError: () => {
        // Retryable timeout error: unsubscribe (disposes this session) and
        // re-watch — the retired attempt must not add a duplicate retry.
        if (rewatched) return;
        rewatched = true;
        unsub?.();
        h.feed.watch("t1", replacement.listener);
      },
    };
    unsub = h.feed.watch("t1", rewatcher);

    h.scheduler.flush(1); // first baseline timeout → callback re-watches (new session w2)
    expect(h.watchIds()).toEqual(["w1", "w2"]);

    // Accept the replacement baseline before draining any timers.
    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g1", fromCursor: 0, toCursor: 1, data: "z" }),
    );
    expect(replacement.rec.snapshots).toHaveLength(1);
    h.scheduler.flush(20); // drain: no orphan retries may appear
    expect(h.watchIds()).toEqual(["w1", "w2"]);
    expect(h.sent.filter((m) => m.type === "terminal-unwatch")).toHaveLength(1);
    expect(replacement.rec.snapshots).toHaveLength(1);
  });

  it("does not schedule a retry when the error callback resets the terminal on the same session", () => {
    const h = createHarness({
      retry: { baseMs: 1, maxMs: 2, maxAttempts: 5, baselineTimeoutMs: 5 },
    });
    connect(h);
    const rec: ListenerRecording = { output: [], resets: 0, exited: [], snapshots: [], errors: [] };
    const resetting: TerminalFeedListener = {
      onOutput: () => {},
      onReset: () => {
        rec.resets += 1;
      },
      onExited: () => {},
      onWatchError: () => {
        h.feed.emitReset("t1"); // same session restarts from inside the callback
      },
      onSnapshot: (snapshot) => rec.snapshots.push(snapshot),
    };
    h.feed.watch("t1", resetting);

    h.scheduler.flush(1); // baseline timeout → callback resets → session restarts (w2)
    expect(h.watchIds()).toEqual(["w1", "w2"]);
    expect(rec.resets).toBe(1);

    // Accept the restarted watch's baseline, then drain and prove the retired
    // attempt scheduled nothing behind the callback.
    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "ok" }),
    );
    expect(rec.snapshots).toHaveLength(1);
    h.scheduler.flush(20);
    expect(h.watchIds()).toEqual(["w1", "w2"]);
    expect(rec.resets).toBe(1);
    expect(rec.snapshots).toHaveLength(1);
  });

  it("does not double-deliver an append to a listener that joins inside another listener's onOutput", () => {
    const h = createHarness();
    connect(h);
    const base = recordingListener({ snapshot: true });
    h.feed.watch("t1", base.listener);
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "ok" }),
    );

    const late = recordingListener({ snapshot: true });
    let joined = false;
    const joiner: TerminalFeedListener = {
      onOutput: () => {
        if (joined) return;
        joined = true;
        h.feed.watch("t1", late.listener);
      },
      onReset: () => {},
      onExited: () => {},
    };
    h.feed.watch("t1", joiner);

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 2, "!!"));
    // The mid-fanout joiner is served by its own watch() path: the active
    // cache snapshot already contains this append, so the fanout must not
    // visit it again.
    expect(base.rec.output).toEqual(["!!"]);
    expect(late.rec.snapshots).toEqual([
      ready({ generation: "g1", fromCursor: 0, toCursor: 4, data: "ok!!" }),
    ]);
    expect(late.rec.output).toEqual([]);

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 4, "#"));
    expect(base.rec.output).toEqual(["!!", "#"]);
    expect(late.rec.output).toEqual(["#"]);
  });

  it("does not duplicate the snapshot for a listener that joins inside another listener's onSnapshot", () => {
    const h = createHarness();
    connect(h);
    const late = recordingListener({ snapshot: true });
    let joined = false;
    const joiner: TerminalFeedListener = {
      onOutput: () => {},
      onReset: () => {},
      onExited: () => {},
      onSnapshot: () => {
        if (joined) return;
        joined = true;
        h.feed.watch("t1", late.listener);
      },
    };
    h.feed.watch("t1", joiner);

    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "ok" }),
    );
    // The baseline fanout snapshot was taken before the join; the late
    // listener got exactly one snapshot via its own watch() path.
    expect(late.rec.snapshots).toHaveLength(1);
  });

  it("stops delivering in-flight output to remaining listeners once a reset happens mid-fanout", () => {
    const h = createHarness();
    connect(h);
    const other = recordingListener({ snapshot: true });
    const resetter: TerminalFeedListener = {
      onOutput: () => {
        h.feed.emitReset("t1");
      },
      onReset: () => {},
      onExited: () => {},
    };
    h.feed.watch("t1", resetter); // first in the fanout order
    h.feed.watch("t1", other.listener);
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "ok" }),
    );

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 2, "!!"));
    // resetter (first in the fanout) received the frame and reset mid-fanout;
    // "other" must not receive pre-reset bytes after its onReset.
    expect(other.rec.output).toEqual([]);
    expect(other.rec.resets).toBe(1);
    expect(h.watchIds()).toEqual(["w1", "w2"]); // session re-armed with a fresh id

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 4, "old")); // stale after restart
    expect(other.rec.output).toEqual([]);
    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g2", fromCursor: 0, toCursor: 4, data: "ok!!" }),
    );
    expect(other.rec.snapshots).toHaveLength(2);
  });

  it("drops pre-resnapshot buffered frames when a snapshot callback triggers a resync", () => {
    const h = createHarness();
    connect(h);
    const rec: ListenerRecording = { output: [], resets: 0, exited: [], snapshots: [], errors: [] };
    const visual: TerminalFeedListener = {
      onOutput: (data) => rec.output.push(data),
      onReset: () => {
        rec.resets += 1;
      },
      onExited: () => {},
      onSnapshot: () => {
        // Mid-delivery the world moves: a generation break forces a resync
        // while this baseline's buffered frames are still queued.
        h.feed.handleServerMessage(tag("t1", "w1", "g2", 50, "z"));
      },
    };
    h.feed.watch("t1", visual);

    h.feed.handleServerMessage(tag("t1", "w1", "g1", 5, "XY")); // buffered pre-baseline
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 5, data: "abcde" }),
    );
    // The queued old-attempt frame must not cross into the new watch attempt.
    expect(rec.output).toEqual([]);
    expect(h.watchIds()).toEqual(["w1", "w2"]);

    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g2", fromCursor: 0, toCursor: 51, data: "a".repeat(51) }),
    );
    h.feed.handleServerMessage(tag("t1", "w2", "g2", 51, "live"));
    expect(rec.output).toEqual(["live"]);
    expect(rec.errors).toEqual([]);
  });

  it("drops the cache on final unsubscribe; a re-watch starts clean", () => {
    const h = createHarness();
    connect(h);
    const first = recordingListener({ snapshot: true });
    const unsub = h.feed.watch("t1", first.listener);
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 4, data: "hist" }),
    );
    unsub();
    expect(h.sent.some((m) => m.type === "terminal-unwatch" && m.id === "t1")).toBe(true);

    h.feed.watch("t1", recordingListener({ snapshot: true }).listener);
    const { listener: rejoined, rec: reRec } = recordingListener({ snapshot: true });
    h.feed.watch("t1", rejoined);
    expect(h.watchIds()).toEqual(["w1", "w2"]);
    expect(reRec.snapshots).toEqual([]); // old cache must not leak into the new watch
    sendResult(
      h.feed,
      "t1",
      "w2",
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "nw" }),
    );
    expect(reRec.snapshots).toHaveLength(1);
  });

  it("survives a listener unsubscribing the last seat during output delivery", () => {
    const h = createHarness();
    connect(h);
    const sentUnwatch = () => h.sent.filter((m) => m.type === "terminal-unwatch").length;
    let unsub: (() => void) | null = null;
    const leaver: TerminalFeedListener = {
      onOutput: () => {
        unsub?.();
      },
      onReset: () => {},
      onExited: () => {},
      onSnapshot: () => {},
    };
    unsub = h.feed.watch("t1", leaver);
    sendResult(
      h.feed,
      "t1",
      "w1",
      ready({ generation: "g1", fromCursor: 0, toCursor: 2, data: "ok" }),
    );
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 2, "!"));

    expect(sentUnwatch()).toBe(1);
    h.scheduler.flush(20);
    expect(h.scheduler.size()).toBe(0); // no timers resurrected
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 3, "?")); // session gone: no crash, no output path
    expect(sentUnwatch()).toBe(1);
    expect(h.watchIds()).toEqual(["w1"]);
  });

  it("survives a listener unsubscribing during snapshot delivery before the pending flush", () => {
    const h = createHarness();
    connect(h);
    let unsub: (() => void) | null = null;
    const leaver: TerminalFeedListener = {
      onOutput: () => {},
      onReset: () => {},
      onExited: () => {},
      onSnapshot: () => {
        unsub?.();
      },
    };
    unsub = h.feed.watch("t1", leaver);
    h.feed.handleServerMessage(tag("t1", "w1", "g1", 0, "hello"));
    expect(() =>
      sendResult(
        h.feed,
        "t1",
        "w1",
        ready({ generation: "g1", fromCursor: 0, toCursor: 5, data: "hello" }),
      ),
    ).not.toThrow();
    expect(h.sent.filter((m) => m.type === "terminal-unwatch")).toHaveLength(1);
    h.scheduler.flush(10);
    expect(h.scheduler.size()).toBe(0);
  });
});
