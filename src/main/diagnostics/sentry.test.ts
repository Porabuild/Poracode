import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { isPackaged: false },
}));

import { initializeMainSentry, isSentryConfigured } from "./sentry";

const originalDsn = process.env.SENTRY_DSN;
const originalDevOverride = process.env.SENTRY_ENABLE_DEV;

afterEach(() => {
  if (originalDsn === undefined) {
    delete process.env.SENTRY_DSN;
  } else {
    process.env.SENTRY_DSN = originalDsn;
  }
  if (originalDevOverride === undefined) {
    delete process.env.SENTRY_ENABLE_DEV;
  } else {
    process.env.SENTRY_ENABLE_DEV = originalDevOverride;
  }
});

describe("main Sentry configuration", () => {
  it("cannot be enabled by a local development override", () => {
    process.env.SENTRY_DSN = "https://public@example.test/1";
    process.env.SENTRY_ENABLE_DEV = "1";

    const options = {
      appVersion: "test",
      isDev: true,
      channel: "stable" as const,
    };
    expect(isSentryConfigured(options)).toBe(false);
    expect(initializeMainSentry(options)).toBe(false);
  });
});
