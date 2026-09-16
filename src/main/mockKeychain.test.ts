import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldUseMockKeychain } from "./mockKeychain";

describe("shouldUseMockKeychain", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults macOS dev launches to the mock keychain (no blocking keychain dialog)", () => {
    vi.stubEnv("PORACODE_USE_REAL_KEYCHAIN", "");
    expect(shouldUseMockKeychain({ isDev: true, platform: "darwin" })).toBe(true);
  });

  it("keeps an explicit opt-out on the real platform storage", () => {
    expect(shouldUseMockKeychain({ isDev: true, platform: "darwin", requested: "1" })).toBe(false);
  });

  it.each([
    { isDev: false, platform: "darwin", requested: "0" },
    { isDev: true, platform: "linux", requested: "0" },
    { isDev: true, platform: "win32", requested: "0" },
  ])("never mocks for %o", (options) => {
    expect(shouldUseMockKeychain(options)).toBe(false);
  });
});
