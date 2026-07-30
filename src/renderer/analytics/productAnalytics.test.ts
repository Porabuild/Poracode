import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  appVersion: "0.1.7",
  arch: "arm64",
  channel: "stable" as const,
  chromeVersion: "125",
  electronVersion: "35",
  isDev: false,
  nodeVersion: "24",
  platform: "darwin" as const,
  posthogEnableDev: false,
  posthogEnabled: true,
  posthogHost: "https://posthog.test///",
  posthogKey: "phc_test",
  sentryEnabled: false,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

import {
  captureProductEvent,
  configureProductAnalytics,
  flushProductAnalytics,
} from "./productAnalytics";

describe("renderer product analytics adapter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads runtime config, normalizes the host, and adds app properties", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(configureProductAnalytics()).toBe(true);
    captureProductEvent("thread.started", { provider: "codex" });
    await flushProductAnalytics();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://posthog.test/batch/");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(request?.body)) as {
      api_key: string;
      batch: Array<{
        distinct_id: string;
        properties: Record<string, unknown>;
      }>;
    };
    expect(payload.api_key).toBe("phc_test");
    expect(payload.batch[0]).toMatchObject({
      distinct_id: expect.any(String),
      properties: {
        app_version: "0.1.7",
        channel: "stable",
        platform: "darwin",
        provider: "codex",
        $insert_id: expect.any(String),
        $session_id: expect.any(String),
      },
    });
  });
});
