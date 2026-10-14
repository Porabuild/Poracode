import Module from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { isPackaged: false },
}));

import { captureMainException, initializeMainSentry, isSentryConfigured } from "./sentry";

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

describe("captureMainException", () => {
  it("does not load the Sentry SDK when main Sentry was never initialized", () => {
    // Loading @sentry/electron/main is ~100ms of synchronous main-thread work;
    // a disabled reporter must not pay it on the first captured error.
    const moduleLoader = Module as unknown as {
      _load: (request: string, ...rest: unknown[]) => unknown;
    };
    const loadSpy = vi.spyOn(moduleLoader, "_load");
    try {
      process.env.SENTRY_DSN = " ";
      expect(initializeMainSentry({ appVersion: "test", isDev: false, channel: "nightly" })).toBe(
        false,
      );

      captureMainException(new Error("updater failed"), { "poracode.feature_area": "update" });

      const requests = loadSpy.mock.calls.map(([request]) => request);
      expect(requests.some((request) => request.startsWith("@sentry/"))).toBe(false);
    } finally {
      loadSpy.mockRestore();
    }
  });
});
