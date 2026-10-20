import { describe, expect, it } from "vitest";
import {
  DEVICE_PREVIEW_MAX_BUFFER_BYTES,
  DEVICE_PREVIEW_MAX_PACKET_BYTES,
  DEVICE_PREVIEW_MAX_QUEUED_PACKETS,
} from "@/shared/devicePreview";
import { DevicePreviewCredits } from "./DevicePreviewCredits";

const credit = (bytes: number, packets: number) => ({
  type: "device-preview-credit",
  version: 1,
  bytes,
  packets,
});

describe("generation-owned device preview credit windows", () => {
  it("requires both byte and packet credit and never prefetches a stalled reader", async () => {
    const controller = new AbortController();
    const window = new DevicePreviewCredits(controller.signal);
    window.grant(credit(8, 1));
    await window.take(4);
    let admitted = false;
    const pending = window.take(4).then(() => {
      admitted = true;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);
    window.grant(credit(1, 1));
    await pending;
    const held = window.take(2);
    const rejected = held.catch((error: unknown) => error);
    controller.abort();
    expect(await rejected).toMatchObject({ name: "AbortError" });
  });

  it("requires sufficient bytes even when the packet window has room", async () => {
    const window = new DevicePreviewCredits(new AbortController().signal);
    window.grant(credit(1, 2));
    let admitted = false;
    const pending = window.take(2).then(() => {
      admitted = true;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);
    window.grant(credit(1, 1));
    await pending;
  });

  it("caps each and accumulated credit window in bytes and packets", () => {
    for (const bad of [
      credit(DEVICE_PREVIEW_MAX_BUFFER_BYTES + 1, 1),
      credit(1, DEVICE_PREVIEW_MAX_QUEUED_PACKETS + 1),
      credit(0, 1),
      credit(1, 0),
      { ...credit(1, 1), version: 2 },
      { ...credit(1, 1), input: "key" },
    ])
      expect(() => new DevicePreviewCredits(new AbortController().signal).grant(bad)).toThrow(
        /Device-preview credit|Too big|Too small|Invalid input|Unrecognized key/u,
      );
    const bytes = new DevicePreviewCredits(new AbortController().signal);
    bytes.grant(credit(DEVICE_PREVIEW_MAX_BUFFER_BYTES, 1));
    expect(() => bytes.grant(credit(1, 1))).toThrow(
      "Device-preview credit exceeds its reader budget.",
    );
    const packets = new DevicePreviewCredits(new AbortController().signal);
    packets.grant(credit(1, DEVICE_PREVIEW_MAX_QUEUED_PACKETS));
    expect(() => packets.grant(credit(1, 1))).toThrow(
      "Device-preview credit exceeds its reader budget.",
    );
  });

  it("rejects invalid media packets and never carries credit into a replacement generation", async () => {
    const old = new AbortController();
    const first = new DevicePreviewCredits(old.signal);
    first.grant(credit(DEVICE_PREVIEW_MAX_BUFFER_BYTES, DEVICE_PREVIEW_MAX_QUEUED_PACKETS));
    old.abort();
    await expect(first.take(1)).rejects.toMatchObject({ name: "AbortError" });
    expect(() => first.grant(credit(1, 1))).toThrow("This operation was aborted");
    const replacement = new AbortController();
    const next = new DevicePreviewCredits(replacement.signal);
    const held = next.take(1);
    const rejected = held.catch((error: unknown) => error);
    replacement.abort();
    expect(await rejected).toMatchObject({ name: "AbortError" });
    for (const bytes of [0, -1, 1.5, DEVICE_PREVIEW_MAX_PACKET_BYTES + 1])
      await expect(
        new DevicePreviewCredits(new AbortController().signal).take(bytes),
      ).rejects.toThrow("Device-preview packet exceeds its budget.");
  });
});
