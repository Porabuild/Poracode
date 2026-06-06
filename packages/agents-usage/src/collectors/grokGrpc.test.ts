import { describe, expect, it } from "vitest";
import { parseGrokGrpcBillingResponse } from "./grokGrpc";

const NOW_MS = 1_768_000_000_000;

function varint(value: number): number[] {
  const out: number[] = [];
  let next = value >>> 0;
  while (next >= 0x80) {
    out.push((next & 0x7f) | 0x80);
    next >>>= 7;
  }
  out.push(next);
  return out;
}

function frame(message: Uint8Array, flags = 0): Uint8Array {
  const header = Buffer.alloc(5);
  header[0] = flags;
  header.writeUInt32BE(message.length, 1);
  return Uint8Array.from(Buffer.concat([header, message]));
}

function creditsPayload(usedPercent: number, resetEpoch: number): Uint8Array {
  const percent = Buffer.alloc(4);
  percent.writeFloatLE(usedPercent, 0);
  return Uint8Array.from([0x0d, ...percent, 0x10, ...varint(resetEpoch)]);
}

describe("grok gRPC-web parsing", () => {
  it("extracts usage percent and reset from the credits response", () => {
    expect(
      parseGrokGrpcBillingResponse({
        headers: {},
        bodyBytes: frame(creditsPayload(42.5, 1_800_000_000)),
        nowMs: NOW_MS,
      }),
    ).toEqual({
      kind: "ok",
      billing: { usedPercent: 42.5, resetsAt: 1_800_000_000_000 },
    });
  });

  it("parses no-usage-yet responses as zero percent", () => {
    const bodyBytes = Uint8Array.from([
      0x00, 0x00, 0x00, 0x00, 0x37, 0x0a, 0x35, 0x12, 0x00, 0x1a, 0x00, 0x22, 0x06, 0x08, 0x80,
      0xda, 0xcf, 0xcf, 0x06, 0x2a, 0x06, 0x08, 0x80, 0x97, 0xf3, 0xd0, 0x06, 0x32, 0x09, 0x0a,
      0x05, 0x08, 0xea, 0x0f, 0x10, 0x04, 0x12, 0x00, 0x32, 0x09, 0x0a, 0x05, 0x08, 0xea, 0x0f,
      0x10, 0x03, 0x12, 0x00, 0x32, 0x09, 0x0a, 0x05, 0x08, 0xea, 0x0f, 0x10, 0x02, 0x12, 0x00,
    ]);

    expect(parseGrokGrpcBillingResponse({ headers: {}, bodyBytes, nowMs: NOW_MS })).toEqual({
      kind: "ok",
      billing: { usedPercent: 0, resetsAt: 1_780_272_000_000 },
    });
  });

  it("turns grpc unauthenticated trailers into auth-missing", () => {
    const result = parseGrokGrpcBillingResponse({
      headers: {},
      bodyBytes: frame(Buffer.from("grpc-status: 16\r\ngrpc-message: token%20expired\r\n"), 0x80),
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ kind: "unauthenticated" });
  });
});
