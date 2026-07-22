import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PendingSteerState } from "@/shared/contracts";
import {
  PENDING_STEER_VISIBILITY_DELAY_MS,
  useDelayedPendingSteer,
} from "./useDelayedPendingSteer";

const pending: PendingSteerState = {
  id: "pending-delayed",
  prompt: "Wait until the current turn stops",
  stagedAt: new Date("2026-07-21T12:00:00Z").getTime(),
};

describe("useDelayedPendingSteer", () => {
  it("reveals a pending steer only after two seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(pending.stagedAt);
    const { result, unmount } = renderHook(() => useDelayedPendingSteer(pending));

    try {
      expect(result.current).toBeUndefined();

      act(() => {
        vi.advanceTimersByTime(PENDING_STEER_VISIBILITY_DELAY_MS - 1);
      });
      expect(result.current).toBeUndefined();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current).toBe(pending);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("cancels the reveal when the steer clears during the delay", () => {
    vi.useFakeTimers();
    vi.setSystemTime(pending.stagedAt);
    const { result, rerender, unmount } = renderHook(
      ({ value }: { value: PendingSteerState | undefined }) => useDelayedPendingSteer(value),
      { initialProps: { value: pending as PendingSteerState | undefined } },
    );

    try {
      rerender({ value: undefined });
      act(() => {
        vi.advanceTimersByTime(PENDING_STEER_VISIBILITY_DELAY_MS);
      });

      expect(result.current).toBeUndefined();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("shows a steer immediately when it has already waited two seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(pending.stagedAt + PENDING_STEER_VISIBILITY_DELAY_MS);
    const { result, unmount } = renderHook(() => useDelayedPendingSteer(pending));

    try {
      expect(result.current).toBe(pending);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });
});
