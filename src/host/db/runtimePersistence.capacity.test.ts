import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { RuntimeQueueCapacityChange } from "./runtimeQueueCapacity";
import { RuntimePersistenceController } from "./runtimePersistenceController";

const controllers: RuntimePersistenceController[] = [];
const event: RuntimeEvent = {
  type: "content.delta",
  threadId: "a",
  itemId: "item",
  stream: "assistant_text",
  delta: "queued",
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.resetForNewConnection();
  vi.useRealTimers();
});

describe("controller capacity publication", () => {
  it("scheduled outer commit publishes capacity after storage has resolved", () => {
    const changes: RuntimeQueueCapacityChange[] = [];
    const controller = new RuntimePersistenceController({
      write: () => {
        throw new Error("unexpected single-thread write");
      },
      atomicBatchWriter: () => {
        expect(controller.capacitySnapshot(["a", "b"]).global.pendingEvents).toBe(2);
        expect(changes.map((change) => change.kind)).toEqual(["admitted", "admitted"]);
        return { kind: "committed" };
      },
      onCapacityChange: (change) => changes.push(change),
    });
    controllers.push(controller);
    controller.admit("a", [event]);
    controller.admit("b", [{ ...event, threadId: "b" }]);
    expect(controller.capacitySnapshot(["a"]).global.pendingEvents).toBe(2);
    vi.advanceTimersByTime(250);
    expect(controller.capacitySnapshot(["a"]).global.pendingEvents).toBe(0);
    expect(changes.map((change) => change.kind)).toEqual([
      "admitted",
      "admitted",
      "committed",
      "committed",
    ]);
    expect(
      changes.every(
        (change) => !Object.hasOwn(change, "events") && !Object.hasOwn(change, "payload"),
      ),
    ).toBe(true);
  });

  it("failed storage does not free capacity and later recovery frees it once", () => {
    let failed = true;
    const changes: RuntimeQueueCapacityChange[] = [];
    const controller = new RuntimePersistenceController({
      write: () => {
        if (failed) throw Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
      },
      onCapacityChange: (change) => changes.push(change),
    });
    controllers.push(controller);
    controller.admit("a", [event]);
    const before = controller.capacitySnapshot(["a"]);
    vi.advanceTimersByTime(250);
    expect(controller.capacitySnapshot(["a"])).toEqual(before);
    expect(changes.map((change) => change.kind)).toEqual(["admitted"]);
    failed = false;
    vi.advanceTimersByTime(1000);
    expect(controller.capacitySnapshot(["a"]).global.pendingEvents).toBe(0);
    expect(changes.filter((change) => change.kind === "committed")).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(changes.filter((change) => change.kind === "committed")).toHaveLength(1);
  });

  it("a new connection invalidates the old capacity generation", () => {
    const changes: RuntimeQueueCapacityChange[] = [];
    const controller = new RuntimePersistenceController({
      write: () => undefined,
      onCapacityChange: (change) => changes.push(change),
    });
    controllers.push(controller);
    controller.admit("a", [event]);
    const before = controller.capacitySnapshot(["a"]);
    controller.resetForNewConnection();
    const after = controller.capacitySnapshot(["a"]);
    expect(after.generation).toBeGreaterThan(before.generation);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.global.pendingEvents).toBe(0);
    expect(changes.at(-1)?.kind).toBe("reset");
    expect(vi.getTimerCount()).toBe(0);
  });
});
