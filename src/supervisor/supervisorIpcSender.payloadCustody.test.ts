import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { captureRuntimePayloadOrigin } from "@/shared/runtimePayloadOriginProtocol";
import { SupervisorIpcSender } from "./supervisorIpcSender";
import {
  custodyStarted,
  FORMAT_A,
} from "./runtime/threadSession/runtimePayloadCustody.testFixtures";

afterEach(() => vi.useRealTimers());
const envelope = (): SupervisorEvent => ({
  type: "thread-runtime-event",
  threadId: "a",
  event: captureRuntimePayloadOrigin(custodyStarted("a", "item"), FORMAT_A),
});

describe("sender private custody negotiation and accounting", () => {
  it("negotiates only exact generation1 BEFORE serialization, so queued old-receiver envelopes remain unknown", () => {
    const messages: unknown[] = [];
    let resume: ((error: Error | null) => void) | undefined;
    const sender = new SupervisorIpcSender({
      send: (message, callback) => {
        messages.push(JSON.parse(JSON.stringify(message)));
        if (!resume) {
          resume = callback;
          return false;
        }
        callback(null);
        return true;
      },
      onError: (error) => {
        throw error;
      },
      backpressureTimeoutMs: null,
    });
    sender.emit({
      type: "thread-state",
      threadId: "a",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });
    sender.emit(envelope()); // This is serialized for an old receiver before negotiation.
    sender.enableRuntimePayloadOrigins({
      control: "enable-runtime-payload-origins",
      version: 1,
      generation: "other",
    });
    sender.enableRuntimePayloadOrigins({
      control: "enable-runtime-payload-origins",
      version: 1,
      generation: sender.getCanonicalFlowGeneration(),
    });
    sender.emit(envelope());
    resume!(null);
    expect(messages[1]).not.toHaveProperty("runtimePayloadOrigins");
    expect(messages[2]).toHaveProperty("runtimePayloadOrigins.entries", [[0, 0, FORMAT_A]]);
    expect(sender.queueDepth).toEqual({ messages: 0, bytes: 0 });
  });
  it("charges private metadata even with a false event-only caller estimate, preserving control reserve on overflow", async () => {
    vi.useFakeTimers();
    let resume: ((error: Error | null) => void) | undefined;
    const dropped = vi.fn<(value: { bytes: number; type: string }) => void>();
    const stopped = vi.fn<(error: Error, message: SupervisorEvent) => void>();
    const sent: unknown[] = [];
    const sender = new SupervisorIpcSender({
      send: (message, callback) => {
        sent.push(message);
        if (!resume) {
          resume = callback;
          return false;
        }
        callback(null);
        return true;
      },
      onError: () => {},
      onFatalError: () => {
        throw new Error("Control reserve must survive.");
      },
      onCanonicalDropped: dropped,
      onCanonicalOverflow: stopped,
      maxQueuedBytes: 500,
      controlReserveBytes: 2000,
      backpressureTimeoutMs: null,
    });
    sender.enableRuntimePayloadOrigins({
      control: "enable-runtime-payload-origins",
      version: 1,
      generation: sender.getCanonicalFlowGeneration(),
    });
    sender.reply({ replyTo: "barrier", ok: true, data: null });
    sender.emit(envelope(), { estimatedBytes: 1 });
    expect(dropped).toHaveBeenCalledOnce();
    expect(dropped.mock.calls[0]![0].bytes).toBeGreaterThan(500);
    sender.reply({ replyTo: "control", ok: true, data: null });
    vi.advanceTimersByTime(0);
    expect(stopped).toHaveBeenCalledOnce();
    resume!(null);
    expect(sent).toHaveLength(2);
    expect(sender.queueDepth).toEqual({ messages: 0, bytes: 0 });
    expect(await sender.flushAndWait(1)).toBe(true);
  });
});
