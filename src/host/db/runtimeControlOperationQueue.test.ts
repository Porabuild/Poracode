import { describe, expect, it } from "vitest";
import {
  RuntimeControlOperationQueue,
  type RuntimeControlOperation,
} from "./runtimeControlOperationQueue";
import type { RuntimeControlWriteResult } from "./runtimePersistenceController";

function failing(errorClass: "retryable" | "storage" | "fatal"): RuntimeControlWriteResult {
  return { ok: false, errorClass, error: new Error(errorClass) };
}

async function processDue(queue: RuntimeControlOperationQueue, maxPerCycle = 8): Promise<void> {
  queue.processDue(maxPerCycle);
  // The queue's driver is async; a macrotask flushes every awaited attempt.
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("RuntimeControlOperationQueue bounded retry semantics", () => {
  it("runs a successful operation once and reports the completed result", async () => {
    const completed: RuntimeControlWriteResult[] = [];
    let runs = 0;
    const queue = new RuntimeControlOperationQueue({
      execute: () => {
        runs += 1;
        return { ok: true };
      },
    });
    expect(
      queue.enqueue({
        describe: "ok",
        run: () => undefined,
        onCompleted: (result) => completed.push(result),
      }),
    ).toBe("accepted");

    await processDue(queue);
    expect(runs).toBe(1);
    expect(completed).toEqual([{ ok: true }]);
    expect(queue.hasPending()).toBe(false);
  });

  it("retries a failed operation with bounded backoff, then reports the final failure once", async () => {
    let nowMs = 1_000;
    const completed: RuntimeControlWriteResult[] = [];
    const dropped: RuntimeControlWriteResult[] = [];
    let runs = 0;
    const queue = new RuntimeControlOperationQueue({
      now: () => nowMs,
      maxAttempts: 3,
      backoffMs: [10, 20],
      execute: () => {
        runs += 1;
        return failing("storage");
      },
      onDropped: (_operation, result) => dropped.push(result),
    });
    queue.enqueue({
      describe: "failing",
      run: () => undefined,
      onCompleted: (result) => completed.push(result),
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      await processDue(queue);
      nowMs += 100;
    }
    expect(runs).toBe(3);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ ok: false, errorClass: "storage" });
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ ok: false, errorClass: "storage" });
    expect(queue.hasPending()).toBe(false);
  });

  it("drops a fatal-class failure on the first attempt without retrying", async () => {
    const completed: RuntimeControlWriteResult[] = [];
    let runs = 0;
    const queue = new RuntimeControlOperationQueue({
      maxAttempts: 5,
      execute: () => {
        runs += 1;
        return failing("fatal");
      },
    });
    queue.enqueue({
      describe: "fatal",
      run: () => undefined,
      onCompleted: (result) => completed.push(result),
    });

    await processDue(queue);
    expect(runs).toBe(1);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ ok: false, errorClass: "fatal" });
    expect(queue.hasPending()).toBe(false);
  });

  it("coalesces by key without letting a later operation overtake an earlier due one", async () => {
    const order: string[] = [];
    let nowMs = 1_000;
    let replacedFails = true;
    const queue = new RuntimeControlOperationQueue({
      now: () => nowMs,
      maxAttempts: 2,
      backoffMs: [50],
      execute: (operation): RuntimeControlWriteResult => {
        order.push(operation.describe);
        return operation.key === "k1" && replacedFails ? failing("storage") : { ok: true };
      },
    });
    const operation = (key: string, label: string): RuntimeControlOperation => ({
      key,
      describe: label,
      run: () => undefined,
    });
    queue.enqueue(operation("k1", "first"));
    queue.enqueue(operation("k2", "second"));
    // Same key replaces in place: "replaced" takes the first slot, "first"
    // never runs, and FIFO still keeps "second" behind it.
    queue.enqueue(operation("k1", "replaced"));
    expect(queue.pendingCount()).toBe(2);

    await processDue(queue);
    // The failing head holds the FIFO: "second" is due but must not overtake.
    expect(order).toEqual(["replaced"]);
    replacedFails = false;
    nowMs += 50;
    await processDue(queue);
    expect(order).toEqual(["replaced", "replaced", "second"]);
    expect(queue.hasPending()).toBe(false);
  });

  it("refuses a new key at capacity but still accepts a coalescing replacement", () => {
    const queue = new RuntimeControlOperationQueue({
      maxOperations: 1,
      execute: () => ({ ok: true }),
    });
    expect(queue.enqueue({ key: "k1", describe: "one", run: () => undefined })).toBe("accepted");
    expect(queue.enqueue({ key: "k2", describe: "two", run: () => undefined })).toBe("refused");
    expect(queue.enqueue({ key: "k1", describe: "one-replaced", run: () => undefined })).toBe(
      "accepted",
    );
    // Keyless operations always consume a slot.
    expect(queue.enqueue({ describe: "no-key", run: () => undefined })).toBe("refused");
    expect(queue.pendingCount()).toBe(1);
  });

  it("clear cancels pending operations without invoking completion or drop callbacks", async () => {
    const completed: RuntimeControlWriteResult[] = [];
    const dropped: RuntimeControlWriteResult[] = [];
    let runs = 0;
    const queue = new RuntimeControlOperationQueue({
      execute: () => {
        runs += 1;
        return { ok: true };
      },
      onDropped: () => dropped.push({ ok: false }),
    });
    queue.enqueue({
      describe: "cancelled-by-clear",
      run: () => undefined,
      onCompleted: (result) => completed.push(result),
    });

    queue.clear();
    await processDue(queue);
    expect(runs).toBe(0);
    expect(completed).toEqual([]);
    expect(dropped).toEqual([]);
    expect(queue.hasPending()).toBe(false);
  });
});
