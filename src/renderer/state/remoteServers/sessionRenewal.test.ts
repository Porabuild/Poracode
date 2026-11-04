import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionRenewal } from "./sessionRenewal";

const NOW = new Date("2026-01-01T00:00:00.000Z").getTime();
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("renews five minutes before a long-lived bearer's deadline", async () => {
  const renew = vi.fn<() => Promise<boolean>>(async () => true);
  const renewal = new SessionRenewal(renew, "test");
  renewal.schedule(at(60 * 60_000));
  await vi.advanceTimersByTimeAsync(55 * 60_000 - 1);
  expect(renew).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(renew).toHaveBeenCalledOnce();
  renewal.dispose();
});

it("renews at half of a short remaining window", async () => {
  const renew = vi.fn<() => Promise<boolean>>(async () => true);
  const renewal = new SessionRenewal(renew, "test");
  renewal.schedule(at(4 * 60_000));
  await vi.advanceTimersByTimeAsync(2 * 60_000);
  expect(renew).toHaveBeenCalledOnce();
  renewal.dispose();
});

it("retries a transport failure once a minute later, but never a refusal", async () => {
  const renew = vi
    .fn<() => Promise<boolean>>()
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(false);
  const renewal = new SessionRenewal(renew, "test");
  renewal.schedule(at(60 * 60_000));
  await vi.advanceTimersByTimeAsync(55 * 60_000);
  expect(renew).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(renew).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(renew).toHaveBeenCalledTimes(2);
  renewal.dispose();
});

it("arms nothing for an expired bearer or after dispose", async () => {
  const renew = vi.fn<() => Promise<boolean>>(async () => true);
  const renewal = new SessionRenewal(renew, "test");
  renewal.schedule(at(-1));
  expect(renewal.renewalDueAtMs).toBeNull();
  renewal.schedule(at(60 * 60_000));
  renewal.dispose();
  await vi.advanceTimersByTimeAsync(60 * 60_000);
  expect(renew).not.toHaveBeenCalled();
});
