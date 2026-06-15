import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent, Thread, UsageEventInputPayload } from "@/shared/contracts";

const bridgeMock = vi.hoisted(() => ({
  appendUsageEvents: vi.fn<(payload: { events: UsageEventInputPayload[] }) => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

import { recordRuntimeUsage, recordThreadStarted } from "./usageRecorder";

function makeThread(id: string, agentKind: string): Thread {
  return {
    id,
    agentKind,
    config: { model: "test-model" },
    presentationMode: "gui",
  } as unknown as Thread;
}

function contextUpdated(threadId: string, usedTokens: number): RuntimeEvent {
  return { type: "context.updated", threadId, usage: { usedTokens } };
}

// The recorder flushes its buffer synchronously on `pagehide`; dispatch it to
// drain without waiting on the idle/timeout debounce.
function flushNow(): void {
  window.dispatchEvent(new Event("pagehide"));
}

function emittedTokenValues(provider: string): number[] {
  return bridgeMock.appendUsageEvents.mock.calls
    .flatMap((call) => call[0].events)
    .filter((event) => event.kind === "tokens" && event.provider === provider)
    .map((event) => event.value ?? 0);
}

describe("usageRecorder token baseline", () => {
  beforeEach(() => {
    flushNow(); // drain anything a prior test left buffered
    bridgeMock.appendUsageEvents.mockReset();
    bridgeMock.appendUsageEvents.mockResolvedValue(undefined);
  });
  afterEach(() => {
    flushNow();
  });

  it("does not re-count a resumed thread's restored context, but counts later growth", () => {
    const provider = "resumed-provider";
    const thread = makeThread("resumed-thread", provider);
    // Resumed thread: recordThreadStarted was NOT called this session, so there
    // is no seeded baseline. Its first context.updated reports the restored
    // context (already counted in a prior session) and must emit nothing.
    recordRuntimeUsage("resumed-thread", [contextUpdated("resumed-thread", 50_000)], [thread]);
    flushNow();
    expect(emittedTokenValues(provider)).toEqual([]);

    // A later context.updated reflects genuine growth and IS counted.
    recordRuntimeUsage("resumed-thread", [contextUpdated("resumed-thread", 50_500)], [thread]);
    flushNow();
    expect(emittedTokenValues(provider)).toEqual([500]);
  });

  it("counts the full initial context for a thread started this session", () => {
    const provider = "new-provider";
    const thread = makeThread("new-thread", provider);
    // recordThreadStarted seeds the baseline to 0, so the first context.updated
    // counts the whole new context as a delta from zero.
    recordThreadStarted(thread);
    recordRuntimeUsage("new-thread", [contextUpdated("new-thread", 1_200)], [thread]);
    flushNow();
    expect(emittedTokenValues(provider)).toEqual([1_200]);
  });
});
