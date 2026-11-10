import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFeatureContext } from "./useFeatureContext";

const getSchedules = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([{}, {}]));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => ({ getSchedules }),
  isRemoteSession: () => false,
}));

describe("useFeatureContext", () => {
  it("starts a remount from the settled schedule count", async () => {
    const first = renderHook(() => useFeatureContext(null));
    expect(first.result.current.schedules).toBeNull();
    await act(async () => {});
    expect(first.result.current.schedules).toBe(2);
    first.unmount();

    const second = renderHook(() => useFeatureContext(null));
    expect(second.result.current.schedules).toBe(2);
    expect(getSchedules).toHaveBeenCalledTimes(1);
  });
});
