import { describe, expect, it } from "vitest";
import { DEVICE_PREVIEW_MAX_PACKET_BYTES } from "./devicePreview";
import { DevicePreviewAvccGuard } from "./devicePreviewAvcc";

function envelope(tag: number, payload: number[]): Uint8Array {
  const bytes = new Uint8Array(5 + payload.length);
  new DataView(bytes.buffer).setUint32(0, payload.length + 1);
  bytes[4] = tag;
  bytes.set(payload, 5);
  return bytes;
}

describe("unchanged upstream AVCC envelope admission", () => {
  it("accepts arbitrary HTTP/WS chunk boundaries without decoding or altering bytes", () => {
    const bytes = new Uint8Array([
      ...envelope(1, [0, 2, 255, 3]),
      ...envelope(2, []),
      ...envelope(3, [2, 3]),
      ...envelope(4, [4]),
    ]);
    const saved = bytes.slice();
    for (let boundary = 0; boundary <= bytes.length; boundary++) {
      const guard = new DevicePreviewAvccGuard();
      guard.push(bytes.subarray(0, boundary));
      guard.push(bytes.subarray(boundary));
      expect(() => guard.finish()).not.toThrow();
    }
    const singleBytes = new DevicePreviewAvccGuard();
    for (const byte of bytes) singleBytes.push(Uint8Array.of(byte));
    expect(() => singleBytes.finish()).not.toThrow();
    expect(bytes).toEqual(saved);
  });

  it("refuses a declared oversized payload before any payload can be retained", () => {
    for (const length of [0, DEVICE_PREVIEW_MAX_PACKET_BYTES + 1, 0xffff_ffff]) {
      const header = new Uint8Array(4);
      new DataView(header.buffer).setUint32(0, length);
      const guard = new DevicePreviewAvccGuard();
      guard.push(header.subarray(0, 3));
      expect(() => guard.push(header.subarray(3))).toThrow(
        "Device-preview envelope exceeds its budget.",
      );
    }
  });

  it("rejects unsupported tags and truncated headers/payloads", () => {
    for (const tag of [0, 5, 255])
      expect(() => new DevicePreviewAvccGuard().push(envelope(tag, []))).toThrow(
        "Unsupported device-preview envelope.",
      );
    const bytes = envelope(1, [1, 2, 3]);
    for (let length = 1; length < bytes.length; length++) {
      const guard = new DevicePreviewAvccGuard();
      guard.push(bytes.subarray(0, length));
      expect(() => guard.finish()).toThrow("Incomplete device-preview envelope.");
    }
  });
});
