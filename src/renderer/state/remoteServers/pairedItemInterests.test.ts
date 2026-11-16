import { afterEach, expect, it, onTestFinished, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recover: vi.fn<(threadId: string) => void>() }));
vi.mock("@/renderer/state/remote/sync", () => ({ recoverRuntimeHistory: mocks.recover }));

import {
  __resetRendererEventInterestsForTest,
  retainRendererEventInterest,
} from "@/renderer/state/rendererEventInterests";
import {
  resetLiveStreamCapacityStore,
  useLiveStreamCapacityStore,
} from "@/renderer/state/liveStreamCapacityStore";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { MANAGED_ITEM_INTERESTS_MAX } from "./desktopLoopbackInterests";
import { notePairedItemInterestCoverage } from "./pairedItemInterests";

afterEach(() => {
  notePairedItemInterestCoverage("pc", false);
  __resetRendererEventInterestsForTest();
  resetLiveStreamCapacityStore();
  mocks.recover.mockReset();
});

/**
 * A paired connection's bounded interest wire behaves like the desktop host's:
 * the overflow is reported, and a thread the bound re-admits re-baselines.
 */
it("reports the overflow and re-baselines a thread the bound re-admits", () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const leases = Array.from({ length: MANAGED_ITEM_INTERESTS_MAX + 1 }, (_, index) =>
    retainRendererEventInterest("runtime", remoteThreadId("pc", `thread-${index}`)),
  );
  notePairedItemInterestCoverage("pc", true);
  expect(useLiveStreamCapacityStore.getState().droppedRuntimeThreadCount).toBe(1);
  expect(mocks.recover).not.toHaveBeenCalled();

  // The most recently retained win: thread-0 was excluded; freeing a slot re-admits it.
  leases.at(-1)!.release();
  vi.runAllTimers();
  notePairedItemInterestCoverage("pc", true);
  expect(useLiveStreamCapacityStore.getState().droppedRuntimeThreadCount).toBe(0);
  expect(mocks.recover).toHaveBeenCalledExactlyOnceWith(remoteThreadId("pc", "thread-0"));
  for (const lease of leases) lease.release();
});

it("clears its overflow once the connection goes down", () => {
  for (let index = 0; index <= MANAGED_ITEM_INTERESTS_MAX; index += 1)
    retainRendererEventInterest("runtime", remoteThreadId("pc", `thread-${index}`));
  notePairedItemInterestCoverage("pc", true);
  notePairedItemInterestCoverage("pc", false);
  expect(useLiveStreamCapacityStore.getState().droppedRuntimeThreadCount).toBe(0);
});
