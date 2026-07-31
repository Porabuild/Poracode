import { describe, expect, it } from "vitest";
import { shouldEnableSentryReporting } from "./sentryBuildConfig";

describe("shouldEnableSentryReporting", () => {
  it("disables reporting in local development even when a DSN is configured", () => {
    expect(shouldEnableSentryReporting("https://public@example.test/1", true)).toBe(false);
  });

  it("enables reporting for a non-development build with a DSN", () => {
    expect(shouldEnableSentryReporting("https://public@example.test/1", false)).toBe(true);
  });

  it("disables reporting when no DSN is configured", () => {
    expect(shouldEnableSentryReporting(null, false)).toBe(false);
  });
});
