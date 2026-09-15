import { afterEach, describe, expect, it, vi } from "vitest";
import { getMobileRuntimePlatform } from "./mobilePlatform";

describe("getMobileRuntimePlatform", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("identifies Windows browsers for platform-specific glass styling", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      platform: "Win32",
      maxTouchPoints: 0,
    });

    expect(getMobileRuntimePlatform()).toBe("windows");
  });

  it("identifies macOS browsers for platform-specific glass styling", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 0,
    });

    expect(getMobileRuntimePlatform()).toBe("macos");
  });

  it("keeps touch-capable MacIntel devices classified as iOS", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });

    expect(getMobileRuntimePlatform()).toBe("ios");
  });
});
