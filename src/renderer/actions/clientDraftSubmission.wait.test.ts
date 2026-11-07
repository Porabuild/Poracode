import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientDraftSubmission } from "@/renderer/state/composerDrafts/clientDraftDatabase";
const mocks = vi.hoisted(() => ({
  read: vi.fn<(id: string) => Promise<ClientDraftSubmission | undefined>>(),
  subscribe: vi.fn<(listener: () => void) => () => void>(),
  unsubscribe: vi.fn<() => void>(),
  listener: undefined as undefined | (() => void),
}));
vi.mock("@/renderer/state/composerDrafts/clientDraftDatabase", async (original) => ({
  ...(await original<typeof import("@/renderer/state/composerDrafts/clientDraftDatabase")>()),
  readClientSubmission: mocks.read,
  subscribeClientDraftSubmissions: mocks.subscribe,
}));
import { waitForClientSubmission } from "./clientDraftSubmission";
const record = (state: ClientDraftSubmission["state"]): ClientDraftSubmission => ({
  formatVersion: 1,
  id: "receipt",
  draftId: "draft",
  scope: "project",
  revision: 1,
  target: "host",
  fingerprint: "draft",
  state,
  content: {},
  assets: [],
});
beforeEach(() => {
  vi.useFakeTimers();
  mocks.read.mockReset().mockResolvedValue(record("prepared"));
  mocks.unsubscribe.mockClear();
  mocks.subscribe.mockReset().mockImplementation((listener) => {
    mocks.listener = listener;
    return mocks.unsubscribe;
  });
});
afterEach(() => vi.useRealTimers());

describe("handoff receipt subscriptions", () => {
  it("reads on receipt changes instead of polling every 100ms", async () => {
    const pending = waitForClientSubmission("receipt");
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.read).toHaveBeenCalledOnce();
    mocks.read.mockResolvedValue(record("accepted"));
    mocks.listener!();
    await pending;
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rechecks a notification racing with the initial read", async () => {
    let finish!: (value: ClientDraftSubmission) => void;
    mocks.read
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(record("accepted"));
    const pending = waitForClientSubmission("receipt");
    mocks.listener!();
    finish(record("prepared"));
    await pending;
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it.each(["failed", "uncertain"] as const)(
    "settles a %s receipt and releases the subscription",
    async (state) => {
      mocks.read.mockResolvedValue(record(state));
      await expect(waitForClientSubmission("receipt")).rejects.toThrow(
        state === "failed" ? "could not be started" : "Couldn't confirm",
      );
      expect(mocks.unsubscribe).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("treats a missing receipt or read failure as unknown delivery", async () => {
    mocks.read
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(waitForClientSubmission("receipt")).rejects.toMatchObject({
      code: "command_outcome_uncertain",
    });
    await expect(waitForClientSubmission("receipt")).rejects.toMatchObject({
      code: "command_outcome_uncertain",
    });
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
  });
  it("retains conservative polling when no notification arrives", async () => {
    const pending = waitForClientSubmission("receipt");
    await vi.advanceTimersByTimeAsync(10);
    mocks.read.mockResolvedValue(record("accepted"));
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the ten-minute unknown-outcome deadline and clears every timer", async () => {
    const pending = waitForClientSubmission("receipt").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await expect(pending).resolves.toMatchObject({ code: "command_outcome_uncertain" });
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
