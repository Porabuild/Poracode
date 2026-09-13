import { describe, expect, it } from "vitest";
import { coalesceByKey, coalesceRuntimeEvents } from "./coalesce";

describe("coalesceByKey", () => {
  it("shares one in-flight promise per key and evicts it once settled", async () => {
    const inFlight = new Map<string, Promise<number>>();
    let calls = 0;
    let resolve!: (n: number) => void;
    const run = () => {
      calls++;
      return new Promise<number>((r) => {
        resolve = r;
      });
    };

    const a = coalesceByKey(inFlight, "k", run);
    const b = coalesceByKey(inFlight, "k", run);
    expect(a).toBe(b); // second caller shares the first's promise
    expect(calls).toBe(1);
    expect(inFlight.has("k")).toBe(true);

    resolve(7);
    expect(await a).toBe(7);
    expect(inFlight.has("k")).toBe(false); // evicted on settle

    // A later call for the same key runs fresh.
    const c = coalesceByKey(inFlight, "k", run);
    expect(calls).toBe(2);
    resolve(9);
    expect(await c).toBe(9);
  });

  it("keys work independently", async () => {
    const inFlight = new Map<string, Promise<string>>();
    const a = coalesceByKey(inFlight, "a", () => Promise.resolve("A"));
    const b = coalesceByKey(inFlight, "b", () => Promise.resolve("B"));
    expect(await a).toBe("A");
    expect(await b).toBe("B");
  });
});

describe("coalesceRuntimeEvents", () => {
  it("retains snapshot replacement semantics while coalescing subsequent deltas", () => {
    const base = {
      type: "content.delta" as const,
      threadId: "t",
      itemId: "i",
      stream: "assistant_text" as const,
    };
    expect(
      coalesceRuntimeEvents([
        { ...base, delta: "stale" },
        { ...base, delta: "correct", replace: true },
        { ...base, delta: " tail" },
      ]),
    ).toEqual([{ ...base, delta: "correct tail", replace: true }]);
  });
});
