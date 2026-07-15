import { describe, expect, it } from "vitest";
import { shouldUseMockKeychain } from "./mockKeychain";

describe("shouldUseMockKeychain", () => {
  it("enables Chromium's mock keychain for opted-in macOS dev launches", () => {
    expect(shouldUseMockKeychain({ isDev: true, platform: "darwin", requested: "1" })).toBe(true);
  });

  it.each([
    { isDev: false, platform: "darwin", requested: "1" },
    { isDev: true, platform: "darwin", requested: "0" },
    { isDev: true, platform: "linux", requested: "1" },
    { isDev: true, platform: "win32", requested: "1" },
  ])("keeps the real platform storage for %o", (options) => {
    expect(shouldUseMockKeychain(options)).toBe(false);
  });
});
