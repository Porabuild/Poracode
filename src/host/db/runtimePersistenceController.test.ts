import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { RuntimePersistenceController, classifyStorageError } from "./runtimePersistenceController";
import {
  RuntimePersistenceDegradedError,
  RuntimePersistenceDrainIncompleteError,
} from "./runtimePersistenceTypes";

function delta(text: string, itemId = "a"): RuntimeEvent {
  return {
    type: "content.delta",
    threadId: "t1",
    itemId,
    stream: "command_output",
    delta: text,
  } as RuntimeEvent;
}

function sqliteError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("classifyStorageError", () => {
  it("maps SQLite failure codes to the retryable/storage/fatal classes", () => {
    expect(classifyStorageError(sqliteError("SQLITE_BUSY"))).toBe("retryable");
    expect(classifyStorageError(sqliteError("SQLITE_LOCKED"))).toBe("retryable");
    expect(classifyStorageError(sqliteError("SQLITE_FULL"))).toBe("storage");
    expect(classifyStorageError(sqliteError("SQLITE_IOERR_WRITE"))).toBe("storage");
    expect(classifyStorageError(sqliteError("SQLITE_READONLY"))).toBe("storage");
    expect(classifyStorageError(sqliteError("SQLITE_CANTOPEN"))).toBe("storage");
    expect(classifyStorageError(sqliteError("SQLITE_CORRUPT"))).toBe("fatal");
    expect(classifyStorageError(sqliteError("SQLITE_NOTADB"))).toBe("fatal");
    // Unknown non-SQLite errors degrade (visible, retried, survivable): a
    // classification mapping bug must never permanently wedge admission.
    expect(classifyStorageError(new Error("unknown"))).toBe("storage");
  });
});

describe("RuntimePersistenceController state machine", () => {
  it("enters degraded after the retryable failure threshold and emits pause", () => {
    let nowMs = 1_000;
    const signals: string[] = [];
    const controller = new RuntimePersistenceController({
      write: () => {
        throw sqliteError("SQLITE_BUSY");
      },
      now: () => nowMs,
      flushIntervalMs: 60_000,
      onSignal: (signal) =>
        signals.push(`${signal.kind}:${"reason" in signal ? signal.reason : ""}`),
    });

    controller.admit("t1", [delta("x")]);
    controller.barrier("t1");
    expect(controller.getState()).toBe("healthy");
    controller.barrier("t1");
    expect(controller.getState()).toBe("healthy");
    controller.barrier("t1");
    expect(controller.getState()).toBe("degraded");
    expect(signals.at(-1)).toBe("pause:storage");
  });

  it("enters degraded immediately on a storage-class error and recovers after the stable window", () => {
    let nowMs = 1_000;
    let fail = true;
    const signals: string[] = [];
    const controller = new RuntimePersistenceController({
      write: () => {
        if (fail) throw sqliteError("SQLITE_FULL");
      },
      now: () => nowMs,
      flushIntervalMs: 60_000,
      recoverAfterMs: 2_000,
      onSignal: (signal) => signals.push(signal.kind),
    });

    controller.admit("t1", [delta("x")]);
    const degraded = controller.barrier("t1");
    expect(degraded.kind).toBe("degraded");
    expect(controller.getState()).toBe("degraded");
    expect(signals).toContain("pause");

    fail = false;
    nowMs += 1_000;
    expect(controller.barrier("t1").kind).toBe("committed");
    expect(controller.getState()).toBe("degraded");
    nowMs += 2_000;
    expect(controller.barrier("t1").kind).toBe("committed");
    expect(controller.getState()).toBe("healthy");
    expect(signals.at(-1)).toBe("resume");
  });

  it("enters refusing on a fatal class and never auto-recovers", () => {
    const signals: string[] = [];
    const controller = new RuntimePersistenceController({
      write: () => {
        throw sqliteError("SQLITE_CORRUPT");
      },
      flushIntervalMs: 60_000,
      onSignal: (signal) => signals.push(signal.kind),
    });
    controller.admit("t1", [delta("x")]);
    expect(controller.barrier("t1").kind).toBe("degraded");
    expect(controller.getState()).toBe("refusing");
    expect(signals).toContain("stop");

    const refused = controller.admit("t2", [delta("y")]);
    expect(refused).toMatchObject({ kind: "refused", reason: "degraded" });
  });

  it("refuses admission at the hard cap and raises stop without dropping accepted events", () => {
    const signals: string[] = [];
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      bounds: {
        maxPendingEventsGlobal: 2,
        maxPendingBytesGlobal: 1_000_000,
        maxPendingEventsPerThread: 2,
        maxPendingBytesPerThread: 1_000_000,
      },
      flushIntervalMs: 60_000,
      onSignal: (signal) => signals.push(signal.kind),
    });

    expect(controller.admit("t1", [delta("1"), delta("2")]).kind).toBe("accepted");
    const refused = controller.admit("t2", [delta("3")]);
    expect(refused.kind).toBe("refused");
    expect(controller.getState()).toBe("refusing");
    expect(signals.at(-1)).toBe("stop");
    // Accepted events stay resident for the retry/drain path.
    expect(controller.pendingStats().events).toBe(2);
  });

  it("keeps control writes serviceable while canonical admission is refused", () => {
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      bounds: {
        maxPendingEventsGlobal: 1,
        maxPendingBytesGlobal: 1_000_000,
        maxPendingEventsPerThread: 1,
        maxPendingBytesPerThread: 1_000_000,
      },
      flushIntervalMs: 60_000,
    });
    controller.admit("t1", [delta("1")]);
    expect(controller.admit("t2", [delta("2")]).kind).toBe("refused");
    expect(controller.getState()).toBe("refusing");

    // Stop/interrupt-style control writes do not queue canonical events, so
    // they stay serviceable under a saturated or degraded persistence path.
    let controlRan = false;
    const result = controller.runControlWrite(() => {
      controlRan = true;
    });
    expect(result.ok).toBe(true);
    expect(controlRan).toBe(true);
  });

  it("raises pause at the soft watermark and resume once below the low watermark", () => {
    const signals: Array<{ kind: string; reason?: string }> = [];
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      bounds: {
        maxPendingEventsGlobal: 10,
        maxPendingBytesGlobal: 1_000_000,
        maxPendingEventsPerThread: 10,
        maxPendingBytesPerThread: 1_000_000,
      },
      flushIntervalMs: 60_000,
      onSignal: (signal) => signals.push(signal),
    });
    controller.admit("t1", [
      delta("1"),
      delta("2"),
      delta("3"),
      delta("4"),
      delta("5"),
      delta("6"),
    ]);
    expect(signals.at(-1)).toMatchObject({ kind: "pause", reason: "watermark" });
    expect(controller.barrier("t1").kind).toBe("committed");
    expect(signals.at(-1)).toMatchObject({ kind: "resume", reason: "watermark-cleared" });
  });

  it("escalates age past half the cap to pause and past the cap to stop", () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    const signals: Array<{ kind: string; reason?: string }> = [];
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      bounds: { maxPendingAgeMs: 1_000 },
      flushIntervalMs: 60_000,
      now: () => nowMs,
      onSignal: (signal) => signals.push(signal),
    });
    controller.admit("t1", [delta("x")]);
    nowMs += 600;
    // A no-op control write triggers the same classification path as a tick.
    controller.runControlWrite(() => undefined);
    expect(signals.at(-1)).toMatchObject({ kind: "pause", reason: "age" });

    nowMs += 1_000;
    const refused = controller.admit("t2", [delta("y")]);
    expect(refused.kind).toBe("refused");
    expect(controller.getState()).toBe("refusing");
    expect(signals.at(-1)).toMatchObject({ kind: "stop", reason: "age" });
  });
});

describe("RuntimePersistenceController mutation contract", () => {
  it("refuses an async mutation result instead of superseding admitted events", async () => {
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      bounds: { maxPendingEventsPerThread: 1 },
      flushIntervalMs: 60_000,
    });
    controller.admit("t1", [delta("kept")]);
    expect(controller.admit("t1", [delta("refused")])).toMatchObject({
      kind: "refused",
      scope: "thread",
    });
    expect(controller.getContamination("t1")).not.toBeNull();

    let callbackRan = false;
    await expect(
      controller.runThreadMutation("t1", "reset", () => {
        callbackRan = true;
        return Promise.resolve() as unknown as void;
      }),
    ).rejects.toThrow(/synchronous/);
    expect(callbackRan).toBe(true);
    // Refused before `supersedePendingPrefix`: the admitted prefix and the
    // contamination are untouched, and no accepted event was superseded.
    expect(controller.getContamination("t1")).not.toBeNull();
    expect(controller.hasPending("t1")).toBe(true);
    expect(controller.sample().supersededAcceptedEvents).toBe(0);

    // An `async` callback is refused before it runs at all. The cast bypasses
    // the compile-time `SynchronousMutationCallback` forbid on purpose: the
    // runtime check must hold for untyped/JavaScript callers too.
    let asyncCallbackRan = false;
    await expect(
      controller.runThreadMutation("t1", "reset", (async () => {
        asyncCallbackRan = true;
      }) as unknown as () => void),
    ).rejects.toThrow(/synchronous/);
    expect(asyncCallbackRan).toBe(false);
    expect(controller.getContamination("t1")).not.toBeNull();
    expect(controller.hasPending("t1")).toBe(true);
    expect(controller.sample().supersededAcceptedEvents).toBe(0);
  });

  it("rejects an async mutation callback at the type level", () => {
    const localController = new RuntimePersistenceController({
      write: () => undefined,
      flushIntervalMs: 60_000,
    });
    const asyncCallback = async () => undefined;
    // The callback parameter collapses a promise result to `never`, so an
    // async callback is a compile error (the `@ts-expect-error` is consumed).
    // @ts-expect-error -- async mutation callbacks are forbidden by the type
    const rejected: Parameters<typeof localController.runThreadMutation<Promise<void>>>[2] =
      asyncCallback;
    expect(rejected).toBe(asyncCallback);
  });
});

describe("RuntimePersistenceController control-op exhaustion", () => {
  it("communicates an exhausted control retry through health state and a loud diagnostic", async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const controller = new RuntimePersistenceController({
        write: () => undefined,
        flushIntervalMs: 10,
        recoverAfterMs: 60_000,
      });
      expect(
        controller.enqueueControlOperation({
          describe: "thread-state t1",
          run: () => {
            throw sqliteError("SQLITE_FULL");
          },
        }),
      ).toBe("accepted");
      await vi.advanceTimersByTimeAsync(2_000);
      // The bounded retry is exhausted: the operation is dropped, the visible
      // health state carries the storage failure, and the drop is logged.
      expect(controller.pendingControlOperations()).toBe(0);
      expect(controller.getState()).toBe("degraded");
      expect(controller.getLastErrorClass()).toBe("storage");
      expect(controller.sample().controlOperationsPending).toBe(0);
      expect(
        errorSpy.mock.calls.some(([message]) =>
          String(message).includes("runtime control write dropped"),
        ),
      ).toBe(true);
    } finally {
      errorSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("RuntimePersistenceController barriers and shutdown", () => {
  it("barrierOrThrow surfaces a typed degraded error with pending counts", () => {
    const controller = new RuntimePersistenceController({
      write: () => {
        throw sqliteError("SQLITE_READONLY");
      },
      flushIntervalMs: 60_000,
    });
    controller.admit("t1", [delta("x")]);
    let thrown: unknown;
    try {
      controller.barrierOrThrow("t1");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RuntimePersistenceDegradedError);
    const degraded = thrown as RuntimePersistenceDegradedError;
    expect(degraded.pendingEvents).toBe(1);
    expect(degraded.errorClass).toBe("storage");
  });

  it("drains within the deadline and reports incomplete with counts", () => {
    let fail = false;
    const controller = new RuntimePersistenceController({
      write: () => {
        if (fail) throw sqliteError("SQLITE_FULL");
      },
      flushIntervalMs: 60_000,
    });
    controller.admit("t1", [delta("x")]);
    expect(controller.shutdown(100)).toEqual({
      kind: "drained",
      committedThroughPersistSeq: expect.any(Number),
    });

    fail = true;
    controller.resetForNewConnection();
    controller.admit("t2", [delta("y")]);
    const report = controller.shutdown(100);
    expect(report).toMatchObject({ kind: "incomplete", pendingEvents: 1, errorClass: "storage" });
    expect(() => controller.drainBeforeClose(100)).toThrow(RuntimePersistenceDrainIncompleteError);
  });

  it("exposes a truthful sample with counters and pending state", () => {
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      flushIntervalMs: 60_000,
    });
    controller.admit("t1", [delta("x")]);
    controller.barrier("t1");
    controller.admit("t2", [delta("y")]);
    const sample = controller.sample();
    expect(sample.state).toBe("healthy");
    expect(sample.pendingThreads).toBe(1);
    expect(sample.pendingEvents).toBe(1);
    expect(sample.admittedEvents).toBe(2);
    expect(sample.flushSuccesses).toBe(1);
    expect(sample.producerSignal).toBe("none");
    expect(sample.shutdown).toBe("not-attempted");
    expect(sample.flushDurationMs.count).toBeGreaterThan(0);
  });
});

describe("RuntimePersistenceController delete ordering", () => {
  function contaminatedController(): RuntimePersistenceController {
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      bounds: { maxPendingEventsPerThread: 1 },
      flushIntervalMs: 60_000,
    });
    expect(controller.admit("t1", [delta("kept")]).kind).toBe("accepted");
    expect(controller.admit("t1", [delta("refused")]).kind).toBe("refused");
    expect(controller.getContamination("t1")?.reason).toBe("thread-events");
    expect(controller.hasPending("t1")).toBe(true);
    return controller;
  }

  it("retains accepted events and contamination when delete throws before applying", async () => {
    const controller = contaminatedController();
    const before = controller.sample().supersededAcceptedEvents;

    await expect(
      controller.runThreadMutation("t1", "delete", () => {
        throw sqliteError("SQLITE_READONLY");
      }),
    ).rejects.toThrow("SQLITE_READONLY");

    // The SQL delete never applied: the accepted prefix is still resident and
    // the contamination marker still refuses reads. Discarding before the
    // operation would have published a truncated history with no marker.
    expect(controller.hasPending("t1")).toBe(true);
    expect(controller.getContamination("t1")?.reason).toBe("thread-events");
    expect(controller.sample().supersededAcceptedEvents).toBe(before);
  });

  it("retains accepted events and contamination when delete returns a thenable", async () => {
    const controller = contaminatedController();
    const before = controller.sample().supersededAcceptedEvents;

    await expect(
      controller.runThreadMutation(
        "t1",
        "delete",
        () => Promise.resolve("late") as unknown as void,
      ),
    ).rejects.toThrow(/synchronous/);

    expect(controller.hasPending("t1")).toBe(true);
    expect(controller.getContamination("t1")?.reason).toBe("thread-events");
    expect(controller.sample().supersededAcceptedEvents).toBe(before);
  });

  it("discards the accepted prefix and clears contamination only after a successful delete", async () => {
    const controller = contaminatedController();
    const before = controller.sample().supersededAcceptedEvents;

    await expect(controller.runThreadMutation("t1", "delete", () => "deleted")).resolves.toBe(
      "deleted",
    );

    expect(controller.hasPending("t1")).toBe(false);
    expect(controller.getContamination("t1")).toBeNull();
    // The accepted-but-uncommitted prefix is explicitly accounted for.
    expect(controller.sample().supersededAcceptedEvents).toBe(before + 1);
    expect(controller.barrier("t1").kind).toBe("committed");
  });
});

describe("RuntimePersistenceController synchronous mutation fast path", () => {
  it("refuses an async callback before it runs and preserves prefix + contamination", () => {
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      bounds: { maxPendingEventsPerThread: 1 },
      flushIntervalMs: 60_000,
    });
    expect(controller.admit("t1", [delta("kept")]).kind).toBe("accepted");
    expect(controller.admit("t1", [delta("refused")]).kind).toBe("refused");
    const before = controller.sample().supersededAcceptedEvents;

    let ran = false;
    const asyncCallback = (async () => {
      ran = true;
      return "late-rebase";
    }) as unknown as () => string;

    // A cast simulates an untyped/JavaScript caller: the runtime check must
    // hold at the synchronous boundary too.
    expect(() => controller.tryRunThreadMutation("t1", "replace", asyncCallback)).toThrow(
      /synchronous/,
    );
    expect(ran).toBe(false);
    expect(controller.hasPending("t1")).toBe(true);
    expect(controller.getContamination("t1")?.reason).toBe("thread-events");
    expect(controller.sample().supersededAcceptedEvents).toBe(before);
  });

  it("refuses a thenable result before the supersede and preserves admitted events", () => {
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      bounds: { maxPendingEventsPerThread: 1 },
      flushIntervalMs: 60_000,
    });
    expect(controller.admit("t1", [delta("kept")]).kind).toBe("accepted");
    expect(controller.admit("t1", [delta("refused")]).kind).toBe("refused");
    const before = controller.sample().supersededAcceptedEvents;

    let ran = false;
    const thenable = () => {
      ran = true;
      return Promise.resolve("late") as unknown as void;
    };

    expect(() => controller.tryRunThreadMutation("t1", "reset", thenable)).toThrow(/synchronous/);
    expect(ran).toBe(true);
    expect(controller.hasPending("t1")).toBe(true);
    expect(controller.getContamination("t1")?.reason).toBe("thread-events");
    expect(controller.sample().supersededAcceptedEvents).toBe(before);
  });

  it("refuses a thenable truncate result after committing the accepted prefix", () => {
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      flushIntervalMs: 60_000,
    });
    expect(controller.admit("t1", [delta("kept")]).kind).toBe("accepted");

    const thenable = () => Promise.resolve("late") as unknown as void;
    expect(() => controller.tryRunThreadMutation("t1", "truncate", thenable)).toThrow(
      /synchronous/,
    );
    // Truncate commits the accepted prefix instead of discarding it, so the
    // refusal never loses an accepted event.
    expect(controller.hasPending("t1")).toBe(false);
    expect(controller.getContamination("t1")).toBeNull();
    expect(controller.barrier("t1").kind).toBe("committed");
  });
});
