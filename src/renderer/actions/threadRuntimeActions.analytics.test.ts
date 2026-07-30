import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  resolveThreadServerRequest: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
const analytics = vi.hoisted(() => ({
  captureProductEvent: vi.fn<() => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));
vi.mock("@/renderer/analytics/productAnalytics", () => ({
  captureProductEvent: analytics.captureProductEvent,
}));

import { resolveThreadServerRequest } from "./threadRuntimeActions";

describe("thread runtime request analytics", () => {
  beforeEach(() => {
    bridge.resolveThreadServerRequest.mockReset();
    bridge.resolveThreadServerRequest.mockResolvedValue(undefined);
    analytics.captureProductEvent.mockReset();
  });

  it("captures a successful request resolution from the canonical action", async () => {
    await resolveThreadServerRequest("missing-thread", {
      requestId: "request-1",
      method: "requestPermission",
      response: { optionId: "deny" },
      analytics: {
        outcome: "declined",
        requestType: "command_execution_approval",
      },
    });

    expect(analytics.captureProductEvent).toHaveBeenCalledWith("thread.request_resolved", {
      outcome: "declined",
      request_type: "command_execution_approval",
    });
  });

  it("does not capture a failed request resolution", async () => {
    bridge.resolveThreadServerRequest.mockRejectedValueOnce(new Error("failed"));

    await expect(
      resolveThreadServerRequest("missing-thread", {
        requestId: "request-1",
        method: "requestPermission",
        response: { optionId: "deny" },
        analytics: {
          outcome: "declined",
          requestType: "command_execution_approval",
        },
      }),
    ).rejects.toThrow("failed");

    expect(analytics.captureProductEvent).not.toHaveBeenCalled();
  });
});
