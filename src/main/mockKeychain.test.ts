import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldUseMockKeychain } from "./mockKeychain";

describe("shouldUseMockKeychain", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults macOS dev launches to the mock keychain (no blocking keychain dialog)", () => {
    vi.stubEnv("PORACODE_USE_REAL_KEYCHAIN", "");
    vi.stubEnv("PORACODE_USE_MOCK_KEYCHAIN", "");
    expect(shouldUseMockKeychain({ isDev: true, platform: "darwin" })).toBe(true);
  });

  it("keeps an explicit opt-out on the real platform storage", () => {
    expect(shouldUseMockKeychain({ isDev: true, platform: "darwin", requested: "1" })).toBe(false);
  });

  it("lets a production-mode macOS launch opt in via PORACODE_USE_MOCK_KEYCHAIN=1", () => {
    expect(shouldUseMockKeychain({ isDev: false, platform: "darwin", forced: "1" })).toBe(true);
  });

  it("real-keychain opt-out wins over a mock opt-in", () => {
    expect(
      shouldUseMockKeychain({ isDev: false, platform: "darwin", requested: "1", forced: "1" }),
    ).toBe(false);
  });

  it.each([
    { isDev: false, platform: "darwin", requested: "0", forced: "" },
    { isDev: false, platform: "darwin", requested: "0", forced: "0" },
    { isDev: true, platform: "linux", requested: "0", forced: "1" },
    { isDev: true, platform: "win32", requested: "0", forced: "1" },
  ])("never mocks for %o", (options) => {
    expect(shouldUseMockKeychain(options)).toBe(false);
  });
});
