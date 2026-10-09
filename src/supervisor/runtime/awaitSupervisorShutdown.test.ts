import { afterEach, expect, it, vi } from "vitest";
import { awaitSupervisorShutdown } from "./awaitSupervisorShutdown";
afterEach(() => vi.useRealTimers());

it("clears its deadline after confirmed disposal", async () => {
  vi.useFakeTimers();
  await awaitSupervisorShutdown(Promise.resolve(), 5000);
  expect(vi.getTimerCount()).toBe(0);
});

it("retains disposal failure and clears the deadline", async () => {
  vi.useFakeTimers();
  const failure = new Error("child exit unconfirmed");
  await expect(awaitSupervisorShutdown(Promise.reject(failure), 5000)).rejects.toBe(failure);
  expect(vi.getTimerCount()).toBe(0);
});

it("fails at the unchanged deadline while disposal remains pending", async () => {
  vi.useFakeTimers();
  const held = Promise.withResolvers<void>();
  const outcome = awaitSupervisorShutdown(held.promise, 5000).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(4999);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await outcome).toMatchObject({
    message: "Supervisor shutdown was not confirmed within 5000ms.",
  });
  expect(vi.getTimerCount()).toBe(0);
  held.resolve();
});

it("observes a late disposal rejection after expiry", async () => {
  vi.useFakeTimers();
  const held = Promise.withResolvers<void>();
  const outcome = awaitSupervisorShutdown(held.promise, 5000).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(5000);
  expect(await outcome).toBeInstanceOf(Error);
  held.reject(new Error("late cleanup failure"));
  await Promise.resolve();
});
