import { describe, expect, it } from "vitest";
import { decodeRelayBinaryFrame, encodeRelayBinaryFrame } from "./relayBinaryFrame";

describe("relay binary envelope", () => {
  it("preserves every byte value and message boundaries without base64 expansion", () => {
    const data = Uint8Array.from({ length: 64 * 1024 }, (_, i) => i & 0xff);
    const id = "channel-a";
    const encoded = encodeRelayBinaryFrame(id, data);
    expect(encoded.byteLength).toBe(data.byteLength + id.length + 3);
    const decoded = decodeRelayBinaryFrame(encoded);
    expect(decoded?.id).toBe(id);
    expect(decoded?.data).toEqual(data);
  });

  it("preserves empty messages and Unicode channel ids", () => {
    const encoded = encodeRelayBinaryFrame("频道-😀", new Uint8Array());
    expect(decodeRelayBinaryFrame(encoded)).toEqual({ id: "频道-😀", data: new Uint8Array() });
  });

  it("handles input views with offsets and owns the encoded copy", () => {
    const source = new Uint8Array([8, 255, 192, 0, 9]);
    const encoded = encodeRelayBinaryFrame("id", source.subarray(1, 4));
    source.fill(0);
    const carrier = new Uint8Array(encoded.byteLength + 6);
    carrier.set(encoded, 3);
    expect(decodeRelayBinaryFrame(carrier.subarray(3, 3 + encoded.byteLength))?.data).toEqual(
      new Uint8Array([255, 192, 0]),
    );
  });

  it.each([
    [],
    [1, 0],
    [2, 0, 1, 65],
    [1, 0, 0],
    [1, 0, 2, 65],
    [1, 0, 1, 255],
    [1, 0, 129, ...new Array<number>(129).fill(65)],
  ])("rejects malformed or unsupported envelope %#", (...bytes: number[]) => {
    expect(decodeRelayBinaryFrame(new Uint8Array(bytes))).toBeNull();
  });

  it.each(["", "a".repeat(129), "\ud800"])("rejects invalid channel id %#", (id) => {
    expect(() => encodeRelayBinaryFrame(id, new Uint8Array())).toThrow(
      "Invalid relay binary channel id",
    );
  });
});
