import { setImmediate as nextTurn } from "node:timers/promises";
import { expect, it } from "vitest";
import { NativeActionLifetime } from "./nativeActionLifetime";

it("starts native cancellation before joining the full admitted continuation", async () => {
  const owner = new NativeActionLifetime();
  const held = Promise.withResolvers<void>();
  const order: string[] = [];
  const action = owner
    .run(async (signal) => {
      await held.promise;
      try {
        signal.throwIfAborted();
      } finally {
        order.push("action-cleanup");
      }
    })
    .catch((error: unknown) => error);
  const closing = owner.close([
    () => {
      order.push("native-stop");
      held.resolve();
    },
  ]);
  expect(owner.close([])).toBe(closing);
  await closing;
  expect(await action).toBeInstanceOf(Error);
  expect(order).toEqual(["native-stop", "action-cleanup"]);
  await expect(owner.run(() => 1)).rejects.toThrow("closed");
});

it("permits a new interrupt generation while retaining the old work until close", async () => {
  const owner = new NativeActionLifetime();
  const held = Promise.withResolvers<void>();
  const old = owner
    .run(async (signal) => {
      await held.promise;
      signal.throwIfAborted();
    })
    .catch((error: unknown) => error);
  owner.interrupt();
  await expect(
    owner.run((signal) => {
      signal.throwIfAborted();
      return "new";
    }),
  ).resolves.toBe("new");
  let joined = false;
  const closing = owner.close([]).then(() => {
    joined = true;
  });
  await nextTurn();
  expect(joined).toBe(false);
  held.resolve();
  await closing;
  expect(await old).toBeInstanceOf(Error);
});

it("joins another stop and action after a sibling stop rejects", async () => {
  const owner = new NativeActionLifetime();
  const held = Promise.withResolvers<void>();
  const sibling = Promise.withResolvers<void>();
  const action = owner.run(() => held.promise);
  let settled = false;
  const closing = owner
    .close([
      () => {
        throw new Error("synthetic native close unconfirmed");
      },
      () => sibling.promise,
    ])
    .catch((error: unknown) => {
      settled = true;
      return error;
    });
  held.resolve();
  await action;
  await nextTurn();
  expect(settled).toBe(false);
  sibling.resolve();
  expect(await closing).toBeInstanceOf(AggregateError);
  await expect(owner.run(() => 1)).rejects.toThrow("closed");
  await owner.close([]);
});

it("registers work before a synchronous action initiates close", async () => {
  const owner = new NativeActionLifetime();
  const held = Promise.withResolvers<void>();
  let closing: Promise<void> | undefined;
  let joined = false;
  const action = owner.run(() => {
    closing = owner.close([]).then(() => {
      joined = true;
    });
    return held.promise;
  });
  await nextTurn();
  expect(joined).toBe(false);
  held.resolve();
  await Promise.all([action, closing]);
  expect(joined).toBe(true);
});
