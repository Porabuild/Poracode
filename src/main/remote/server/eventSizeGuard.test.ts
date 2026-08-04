import { describe, expect, it } from "vitest";
import { isRemoteOmittedField, payloadHasOmittedField, readRemoteImageRef } from "@/shared/remote";
import type { RuntimeEvent } from "@/shared/contracts";
import { capBroadcastEvent, maxBroadcastEventBytes, trimEventBuffer } from "./eventSizeGuard";
import type { BufferedSupervisorEvent, RemoteBroadcastEvent } from "./context";

/**
 * A bulk-text payload. Cap tests use text rather than an image because inline
 * images now take the lossless reference path before the cap is consulted.
 */
function textItemEvent(bytes: number, itemId = "tool_call-1"): RuntimeEvent {
  return {
    type: "item.completed",
    threadId: "thread-1",
    itemId,
    payload: {
      name: "bash",
      args: { command: "cat huge.log" },
      status: "success",
      result: "R".repeat(bytes),
    },
  };
}

function imageItemEvent(bytes: number, itemId = "image_view-1"): RuntimeEvent {
  return {
    type: "item.completed",
    threadId: "thread-1",
    itemId,
    payload: {
      name: "imageView",
      args: { path: "/tmp/shot.png" },
      status: "success",
      images: [`data:image/png;base64,${"A".repeat(bytes)}`],
    },
  };
}

function runtimeEvent(event: RuntimeEvent): RemoteBroadcastEvent {
  return { type: "thread-runtime-event", threadId: "thread-1", event };
}

describe("maxBroadcastEventBytes", () => {
  it("never exceeds the socket budget, so a sendable verdict is truly sendable", () => {
    for (const budget of [64, 1024, 256 * 1024, 4 * 1024 * 1024]) {
      expect(maxBroadcastEventBytes(budget)).toBeLessThanOrEqual(budget);
    }
  });

  it("caps events at half the 4MB default budget", () => {
    expect(maxBroadcastEventBytes(4 * 1024 * 1024)).toBe(2 * 1024 * 1024);
  });
});

describe("capBroadcastEvent", () => {
  it("passes a deliverable event through untouched", () => {
    const event = runtimeEvent(textItemEvent(100));
    const result = capBroadcastEvent(event, 1024 * 1024);
    expect(result.kind).toBe("sendable");
    if (result.kind !== "sendable") return;
    expect(result.event).toBe(event);
    expect(result.omittedBytes).toBe(0);
    expect(JSON.parse(result.json)).toEqual(event);
  });

  it("withholds the oversized field so the event fits the budget", () => {
    const event = runtimeEvent(textItemEvent(200_000));
    const result = capBroadcastEvent(event, 50_000);
    expect(result.kind).toBe("sendable");
    if (result.kind !== "sendable") return;
    expect(result.bytes).toBeLessThanOrEqual(50_000);
    expect(result.omittedBytes).toBeGreaterThan(150_000);
    const payload = (result.event as { event: { payload: Record<string, unknown> } }).event.payload;
    // The heavy field is replaced by a marker; the cheap descriptive fields that
    // drive the collapsed row survive.
    expect(isRemoteOmittedField(payload.result)).toBe(true);
    expect(payload.name).toBe("bash");
    expect(payload.args).toEqual({ command: "cat huge.log" });
    expect(payload.status).toBe("success");
    expect(payloadHasOmittedField(payload)).toBe(true);
  });

  it("keeps the smaller fields when withholding only the largest is enough", () => {
    const event = runtimeEvent({
      type: "item.completed",
      threadId: "thread-1",
      itemId: "tool-1",
      payload: {
        name: "bash",
        result: "R".repeat(300_000),
        stderr: "E".repeat(1_000),
      },
    });
    const result = capBroadcastEvent(event, 20_000);
    expect(result.kind).toBe("sendable");
    if (result.kind !== "sendable") return;
    const payload = (result.event as { event: { payload: Record<string, unknown> } }).event.payload;
    expect(isRemoteOmittedField(payload.result)).toBe(true);
    expect(payload.stderr).toBe("E".repeat(1_000));
  });

  it("does not mutate the original event", () => {
    const event = runtimeEvent(textItemEvent(200_000));
    const before = JSON.stringify(event);
    capBroadcastEvent(event, 50_000);
    expect(JSON.stringify(event)).toBe(before);
  });

  it("replaces inline images with references before consulting the budget", () => {
    // Lossless: the client fetches each image on demand, so nothing is withheld
    // and the frame drops far under budget without the cap acting at all.
    const event = runtimeEvent(imageItemEvent(200_000));
    const result = capBroadcastEvent(event, 50_000);
    expect(result.kind).toBe("sendable");
    if (result.kind !== "sendable") return;
    expect(result.omittedBytes).toBe(0);
    expect(result.bytes).toBeLessThan(1_000);
    const payload = (result.event as { event: { payload: Record<string, unknown> } }).event.payload;
    const ref = readRemoteImageRef((payload.images as unknown[])[0]);
    expect(ref).toMatchObject({ threadId: "thread-1", itemId: "image_view-1", mime: "image/png" });
    expect(payload.name).toBe("imageView");
  });

  it("caps every payload in a batched multi-thread event", () => {
    const event: RemoteBroadcastEvent = {
      type: "thread-runtime-events-multi",
      batches: [
        { threadId: "thread-1", events: [textItemEvent(200_000, "a")] },
        { threadId: "thread-2", events: [textItemEvent(200_000, "b")] },
      ],
    };
    const result = capBroadcastEvent(event, 60_000);
    expect(result.kind).toBe("sendable");
    if (result.kind !== "sendable") return;
    expect(result.bytes).toBeLessThanOrEqual(60_000);
    const batches = (
      result.event as {
        batches: ReadonlyArray<{ events: ReadonlyArray<{ payload: Record<string, unknown> }> }>;
      }
    ).batches;
    expect(isRemoteOmittedField(batches[0]!.events[0]!.payload.result)).toBe(true);
    expect(isRemoteOmittedField(batches[1]!.events[0]!.payload.result)).toBe(true);
  });

  it("reports undeliverable when the event carries no shrinkable payload", () => {
    const event: RemoteBroadcastEvent = {
      type: "thread-state",
      threadId: "t".repeat(5_000),
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    };
    const result = capBroadcastEvent(event, 500);
    expect(result.kind).toBe("undeliverable");
  });

  it("reports undeliverable when even a fully stripped payload cannot fit", () => {
    const event = runtimeEvent(textItemEvent(200_000));
    const result = capBroadcastEvent(event, 10);
    expect(result.kind).toBe("undeliverable");
  });
});

describe("trimEventBuffer", () => {
  const entry = (seq: number, bytes: number): BufferedSupervisorEvent => ({
    seq,
    bytes,
    event: { type: "thread-reset", threadId: `thread-${seq}` },
  });

  it("drops the oldest entries past the count limit", () => {
    const buffer = [entry(1, 10), entry(2, 10), entry(3, 10)];
    trimEventBuffer(buffer, 2, 1_000);
    expect(buffer.map((e) => e.seq)).toEqual([2, 3]);
  });

  it("drops the oldest entries past the byte budget", () => {
    const buffer = [entry(1, 800), entry(2, 500), entry(3, 500)];
    trimEventBuffer(buffer, 500, 1_000);
    expect(buffer.map((e) => e.seq)).toEqual([2, 3]);
  });

  it("keeps the newest entry even when it alone exceeds the byte budget", () => {
    const buffer = [entry(1, 100), entry(2, 5_000)];
    trimEventBuffer(buffer, 500, 1_000);
    expect(buffer.map((e) => e.seq)).toEqual([2]);
  });

  it("leaves a buffer within both limits untouched", () => {
    const buffer = [entry(1, 10), entry(2, 10)];
    trimEventBuffer(buffer, 500, 1_000);
    expect(buffer.map((e) => e.seq)).toEqual([1, 2]);
  });
});
