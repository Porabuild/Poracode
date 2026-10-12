import { afterEach, describe, expect, it, vi } from "vitest";
import { isUsageCollectionEnabled } from "./usageCollectionPolicy";

afterEach(() => vi.unstubAllEnvs());

describe("isolated usage collection policy", () => {
  it.each([
    [undefined, false, true],
    [undefined, true, true],
    ["1", true, false],
    ["1", false, true],
    ["0", true, true],
    ["other", true, true],
  ])("request %s in dev=%s permits collection=%s", (request, dev, enabled) => {
    vi.stubEnv("PORACODE_DISABLE_USAGE_COLLECTION", "");
    expect(isUsageCollectionEnabled(request, dev)).toBe(enabled);
  });

  it.each(["PORACODE_IS_DEV", "VITE_DEV_SERVER_URL"])(
    "recognizes the supervisor's %s development signal",
    (signal) => {
      vi.stubEnv("PORACODE_DISABLE_USAGE_COLLECTION", "1");
      vi.stubEnv("PORACODE_IS_DEV", "");
      vi.stubEnv("VITE_DEV_SERVER_URL", "");
      expect(isUsageCollectionEnabled()).toBe(true);
      vi.stubEnv(signal, signal === "PORACODE_IS_DEV" ? "1" : "http://127.0.0.1:1");
      expect(isUsageCollectionEnabled()).toBe(false);
    },
  );
});
