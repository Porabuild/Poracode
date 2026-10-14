import { setImmediate as nextTurn } from "node:timers/promises";
import { expect, it } from "vitest";
import { AsyncWorkTracker } from "./asyncWorkTracker";

it("registers work before a synchronous callback begins draining", async () => {
  const tracker = new AsyncWorkTracker();
  const release = Promise.withResolvers<void>();
  const order: string[] = [];
  let draining: Promise<void> | undefined;
  const operation = tracker.run(() => {
    draining = tracker.drain().then(() => {
      order.push("drained");
    });
    return release.promise.then(() => {
      order.push("completed");
    });
  });
  await nextTurn();
  expect(order).toEqual([]);
  release.resolve();
  await Promise.all([operation, draining]);
  expect(order).toEqual(["completed", "drained"]);
});

it("includes nested admitted continuations and settles rejected work", async () => {
  const tracker = new AsyncWorkTracker();
  const first = Promise.withResolvers<void>();
  const last = Promise.withResolvers<void>();
  const outer = tracker.run(async () => {
    await first.promise;
    void tracker.run(() => last.promise);
    throw new Error("synthetic admitted failure");
  });
  let drained = false;
  const draining = tracker.drain().then(() => {
    drained = true;
  });
  first.resolve();
  await expect(outer).rejects.toThrow("synthetic admitted failure");
  await nextTurn();
  expect(drained).toBe(false);
  last.resolve();
  await draining;
  expect(drained).toBe(true);
});
