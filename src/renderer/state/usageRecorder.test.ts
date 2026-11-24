import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageEventInputPayload } from "@/shared/contracts";

const bridgeMock = vi.hoisted(() => ({
  appendUsageEvents: vi.fn<(payload: { events: UsageEventInputPayload[] }) => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

import { recordAiAction } from "./usageRecorder";

function flushNow(): void {
  window.dispatchEvent(new Event("pagehide"));
}

describe("usageRecorder", () => {
  beforeEach(() => {
    flushNow();
    bridgeMock.appendUsageEvents.mockReset();
    bridgeMock.appendUsageEvents.mockResolvedValue(undefined);
  });

  afterEach(() => {
    flushNow();
  });

  it("buffers and flushes AI git action usage events on pagehide", () => {
    recordAiAction("commit", "provider-a", "model-x");
    recordAiAction("pr", "provider-b", "model-y");

    flushNow();
    const events = bridgeMock.appendUsageEvents.mock.calls.flatMap((call) => call[0].events);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "ai_commit",
        provider: "provider-a",
        model: "model-x",
        value: 1,
      }),
      expect.objectContaining({
        kind: "ai_pr",
        provider: "provider-b",
        model: "model-y",
        value: 1,
      }),
    ]);
  });
});
