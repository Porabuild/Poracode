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

  it("parses a base64 grpc-web-text body, whatever the content-type claims", () => {
    // What the real client sees: the text stream arrives as ASCII base64 in both
    // `body` and `bodyBytes`, while the edge still labels it `grpc-web+proto`.
    const text = Buffer.from(frame(creditsPayload(16, 1_800_000_000))).toString("base64");

    expect(
      parseGrokGrpcBillingResponse({
        headers: { "content-type": "application/grpc-web+proto" },
        body: text,
        bodyBytes: new Uint8Array(Buffer.from(text, "utf8")),
        nowMs: NOW_MS,
      }),
    ).toEqual({ kind: "ok", billing: { usedPercent: 16, resetsAt: 1_800_000_000_000 } });
  });

  it("decodes per-frame base64 segments with interior padding", () => {
    // Envoy-style grpc-web-text: each frame base64'd separately, so the payload
    // carries interior `=` padding. Decoding the string in one shot truncates at
    // the first pad and loses the data frame.
    const data = Buffer.from(frame(creditsPayload(16, 1_800_000_000))).toString("base64");
    const trailer = Buffer.from(frame(Buffer.from("grpc-status: 0\r\n"), 0x80)).toString("base64");
    expect(data.includes("=")).toBe(true);
    const text = `${data}${trailer}`;

    expect(
      parseGrokGrpcBillingResponse({
        headers: { "content-type": "application/grpc-web-text" },
        body: text,
        bodyBytes: new Uint8Array(Buffer.from(text, "utf8")),
        nowMs: NOW_MS,
      }),
    ).toEqual({ kind: "ok", billing: { usedPercent: 16, resetsAt: 1_800_000_000_000 } });
  });

  it("reads a freshly reset weekly period as 0% (captured live response)", () => {
    // Verbatim bytes from a real grok.com response, the day the credits cycle
    // reset: a data frame plus a `grpc-status:0` trailer, carrying period start
    // (field 4) and end (field 5) exactly 7 days apart and NO percent field —
    // proto3 omits the zero. Previously reported as "unparseable frames".
    const bodyBytes = new Uint8Array(
      Buffer.from(
        "00000000440a4212001a00220b08e3ce89d30610f8fde3202a0b08e3c3aed30610f8fde320421c0802120b08e3ce89d30610f8fde3201a0b08e3c3aed30610f8fde320580162006801800000000f677270632d7374617475733a300d0a",
        "hex",
      ),
    );

    const result = parseGrokGrpcBillingResponse({
      headers: { "content-type": "application/grpc-web+proto" },
      bodyBytes,
      // Mid-cycle: after the period start, before the reset.
      nowMs: 1_784_900_000_000,
    });

    expect(result).toEqual({
      kind: "ok",
      billing: {
        usedPercent: 0,
        periodStartsAt: 1_784_833_891_000,
        resetsAt: 1_785_438_691_000,
      },
    });
    // Exactly one week apart, so the collector can label the cycle weekly.
    expect(1_785_438_691_000 - 1_784_833_891_000).toBe(7 * 864e5);
  });

  it("still refuses a message with neither a percent field nor a period", () => {
    const bodyBytes = frame(Uint8Array.from([0x58, 0x01, 0x68, 0x01]));
    expect(parseGrokGrpcBillingResponse({ headers: {}, bodyBytes, nowMs: NOW_MS }).kind).toBe(
      "invalid",
    );
  });

  it("reads a percent field declared as a double, not just a float", () => {
    const value = Buffer.alloc(8);
    value.writeDoubleLE(16, 0);
    const payload = Uint8Array.from([0x09, ...value, 0x10, ...varint(1_800_000_000)]);

    expect(
      parseGrokGrpcBillingResponse({ headers: {}, bodyBytes: frame(payload), nowMs: NOW_MS }),
    ).toEqual({ kind: "ok", billing: { usedPercent: 16, resetsAt: 1_800_000_000_000 } });
  });

  it("keeps the card summary short and puts the wire dump in `debug`", () => {
    // Without the bytes, a server-side proto change is undiagnosable — but they
    // belong in the host log, not in a user-facing error string.
    const bodyBytes = frame(Uint8Array.from([0x52, 0x02, 0x08, 0x01]));

    const result = parseGrokGrpcBillingResponse({
      headers: { "content-type": "application/grpc-web+proto" },
      bodyBytes,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({
      kind: "invalid",
      detail: `unparseable frames (${bodyBytes.length}B, application/grpc-web+proto)`,
      debug: {
        bytes: bodyBytes.length,
        contentType: "application/grpc-web+proto",
        hex: Buffer.from(bodyBytes).toString("hex"),
      },
    });
  });

  it("describes an unparseable body instead of failing silently", () => {
    const html = "<!DOCTYPE html><html>challenge</html>";

    expect(
      parseGrokGrpcBillingResponse({
        headers: { "content-type": "text/html" },
        body: html,
        bodyBytes: new Uint8Array(Buffer.from(html, "utf8")),
        nowMs: NOW_MS,
      }),
    ).toEqual({
      kind: "invalid",
      detail: `html body (bot challenge?) (${html.length}B, text/html)`,
    });

    expect(
      parseGrokGrpcBillingResponse({ headers: {}, bodyBytes: new Uint8Array(), nowMs: NOW_MS }),
    ).toEqual({ kind: "invalid", detail: "empty body" });
  });

  it("reads unauthenticated trailers out of a base64 text body", () => {
    const text = Buffer.from(
      frame(Buffer.from("grpc-status: 16\r\ngrpc-message: bad%20credentials\r\n"), 0x80),
    ).toString("base64");

    expect(
      parseGrokGrpcBillingResponse({
        headers: { "content-type": "application/grpc-web-text" },
        body: text,
        bodyBytes: new Uint8Array(Buffer.from(text, "utf8")),
        nowMs: NOW_MS,
      }),
    ).toEqual({ kind: "unauthenticated" });
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
