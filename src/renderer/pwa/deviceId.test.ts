// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateBrowserDeviceId, resetBrowserDeviceIdForTest } from "./deviceId";

describe("browser push device id", () => {
  beforeEach(() => {
    localStorage.clear();
    resetBrowserDeviceIdForTest();
  });

  it("persists one stable identity for concurrent callers", async () => {
    const randomUUID = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000001");
    const [first, second] = await Promise.all([
      getOrCreateBrowserDeviceId(),
      getOrCreateBrowserDeviceId(),
    ]);

    expect(first).toBe("00000000-0000-4000-8000-000000000001");
    expect(second).toBe("00000000-0000-4000-8000-000000000001");
    expect(randomUUID).toHaveBeenCalledOnce();
  });
});
