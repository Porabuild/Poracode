import { describe, expect, it } from "vitest";
import {
  REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
  REMOTE_HTTP_BRIDGE_VERSION,
  REMOTE_HTTP_MAX_HEADER_COUNT,
  REMOTE_HTTP_MAX_HEADER_TOTAL_BYTES,
  REMOTE_HTTP_MAX_RESPONSE_HEADER_COUNT,
  REMOTE_HTTP_MAX_RESPONSE_HEADER_TOTAL_BYTES,
  REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
  REMOTE_HTTP_UPLOAD_CREDIT_BYTES,
  isHeaderBudgetWithinBounds,
  isRemoteHttpBridgeOpenDescriptor,
  isRemoteHttpBridgeParentMessage,
  isRemoteHttpBridgePortDownstreamMessage,
  isRemoteHttpBridgePortEnvelope,
  isRemoteHttpBridgePortUpstreamMessage,
  isRemoteHttpBridgeWorkerMessage,
  isResponseHeaderPairsWithinBounds,
} from "./httpBridgeProtocol";

const REQUEST_ID = "f7cf6f5a-bc12-4e3a-8d91-c0a602c350f0";

describe("remote HTTP bridge protocol", () => {
  it("pins the frame-set version and accepts a well-formed open descriptor", () => {
    expect(REMOTE_HTTP_BRIDGE_VERSION).toBe(2);
    const descriptor = {
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "open",
      generation: 1,
      senderId: 2,
      requestId: REQUEST_ID,
      url: "https://remote.example.test/api",
      method: "POST",
      headers: { authorization: "Bearer token" },
      hasBody: true,
      bodyBytes: 128,
    };
    expect(isRemoteHttpBridgeOpenDescriptor(descriptor)).toBe(true);
    expect(isRemoteHttpBridgeParentMessage(descriptor)).toBe(true);
    expect(isRemoteHttpBridgeOpenDescriptor({ ...descriptor, requestId: "not-a-uuid" })).toBe(
      false,
    );
    expect(
      isRemoteHttpBridgeOpenDescriptor({ ...descriptor, url: `https://x/${"a".repeat(5000)}` }),
    ).toBe(false);
    expect(isRemoteHttpBridgeOpenDescriptor({ ...descriptor, generation: 0 })).toBe(false);
    expect(isRemoteHttpBridgeOpenDescriptor({ ...descriptor, senderId: -1 })).toBe(false);
    expect(
      isRemoteHttpBridgeOpenDescriptor({
        ...descriptor,
        bodyBytes: 64 * 1024 * 1024 + 1,
      }),
    ).toBe(false);
    expect(isRemoteHttpBridgeOpenDescriptor({ ...descriptor, method: "PUT" })).toBe(false);
    expect(isRemoteHttpBridgeOpenDescriptor({ ...descriptor, body: "leak" })).toBe(false);
  });

  it("enforces the header metadata budget", () => {
    expect(isHeaderBudgetWithinBounds({ a: "b" })).toBe(true);
    const tooMany = Object.fromEntries(
      Array.from({ length: REMOTE_HTTP_MAX_HEADER_COUNT + 1 }, (_, index) => [`h${index}`, "v"]),
    );
    expect(isHeaderBudgetWithinBounds(tooMany)).toBe(false);
    expect(
      isHeaderBudgetWithinBounds({ big: "a".repeat(REMOTE_HTTP_MAX_HEADER_TOTAL_BYTES + 1) }),
    ).toBe(false);
  });

  it("gives responses their own, looser metadata budget that admits real server shapes", () => {
    const manyHeaders = Array.from(
      { length: 65 },
      (_, index) => [`x-extra-${index}`, "v"] as const,
    );
    // Real legal responses the request budget used to reject.
    expect(isResponseHeaderPairsWithinBounds(manyHeaders)).toBe(true);
    expect(isResponseHeaderPairsWithinBounds([["x-long", "a".repeat(9000)]])).toBe(true);
    expect(
      isRemoteHttpBridgePortDownstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "head",
        requestId: REQUEST_ID,
        generation: 4,
        status: 200,
        statusText: "OK",
        headers: manyHeaders,
      }),
    ).toBe(true);

    const tooMany = Array.from(
      { length: REMOTE_HTTP_MAX_RESPONSE_HEADER_COUNT + 1 },
      (_, index) => [`h${index}`, "v"] as const,
    );
    expect(isResponseHeaderPairsWithinBounds(tooMany)).toBe(false);
    expect(isResponseHeaderPairsWithinBounds([["x", "a".repeat(17 * 1024)]])).toBe(false);
    expect(
      isResponseHeaderPairsWithinBounds([
        ["x", "a".repeat(REMOTE_HTTP_MAX_RESPONSE_HEADER_TOTAL_BYTES)],
      ]),
    ).toBe(false);
    expect(
      isRemoteHttpBridgePortDownstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "head",
        requestId: REQUEST_ID,
        generation: 4,
        status: 200,
        statusText: "OK",
        headers: manyHeaders,
      }),
    ).toBe(true);
  });

  it("validates parent control messages and ignores unknown kinds", () => {
    expect(
      isRemoteHttpBridgeParentMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "abort-window",
        generation: 3,
        senderId: 9,
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgeParentMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "abort-all",
        generation: 3,
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgeParentMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "cancel",
        generation: 3,
        requestId: REQUEST_ID,
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgeParentMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "stats-query",
        generation: 3,
        queryId: 1,
      }),
    ).toBe(true);
    expect(isRemoteHttpBridgeParentMessage({ v: REMOTE_HTTP_BRIDGE_VERSION, kind: "nope" })).toBe(
      false,
    );
    expect(isRemoteHttpBridgeParentMessage({ v: 1, kind: "abort-all", generation: 3 })).toBe(false);
  });

  it("validates upstream frames and bounds upload chunk sizes", () => {
    expect(
      isRemoteHttpBridgePortUpstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "upload-chunk",
        requestId: REQUEST_ID,
        data: new Uint8Array(4),
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgePortUpstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "upload-chunk",
        requestId: REQUEST_ID,
        data: new Uint8Array(2 * 1024 * 1024),
      }),
    ).toBe(false);
    expect(
      isRemoteHttpBridgePortUpstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "credit",
        requestId: REQUEST_ID,
        bytes: 0,
      }),
    ).toBe(false);
    expect(
      isRemoteHttpBridgePortUpstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "credit",
        requestId: REQUEST_ID,
        bytes: 1024,
      }),
    ).toBe(true);
    // The documented 1 MiB per-request credit ceiling is the frame bound too:
    // a larger single grant is a non-conforming peer, never extra credit.
    expect(
      isRemoteHttpBridgePortUpstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "credit",
        requestId: REQUEST_ID,
        bytes: REMOTE_HTTP_RESPONSE_CREDIT_BYTES,
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgePortUpstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "credit",
        requestId: REQUEST_ID,
        bytes: REMOTE_HTTP_RESPONSE_CREDIT_BYTES + 1,
      }),
    ).toBe(false);
  });

  it("validates downstream frames, terminal codes, and the port envelope", () => {
    expect(
      isRemoteHttpBridgePortDownstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "head",
        requestId: REQUEST_ID,
        generation: 4,
        status: 200,
        statusText: "OK",
        headers: [["content-type", "application/octet-stream"]],
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgePortDownstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "upload-grant",
        requestId: REQUEST_ID,
        generation: 4,
        bytes: REMOTE_HTTP_UPLOAD_CREDIT_BYTES,
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgePortDownstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "upload-grant",
        requestId: REQUEST_ID,
        generation: 4,
        bytes: 0,
      }),
    ).toBe(false);
    expect(
      isRemoteHttpBridgePortDownstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "upload-grant",
        requestId: REQUEST_ID,
        generation: 4,
        bytes: REMOTE_HTTP_UPLOAD_CREDIT_BYTES + 1,
      }),
    ).toBe(false);
    expect(
      isRemoteHttpBridgePortDownstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "error",
        requestId: REQUEST_ID,
        generation: 4,
        code: "timeout",
        message: "Remote request timed out after 60000ms.",
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgePortDownstreamMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "error",
        requestId: REQUEST_ID,
        generation: 4,
        code: "mystery",
        message: "x",
      }),
    ).toBe(false);
    expect(
      isRemoteHttpBridgePortEnvelope({
        channel: REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
        v: REMOTE_HTTP_BRIDGE_VERSION,
        requestId: REQUEST_ID,
        generation: 4,
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgePortEnvelope({
        channel: REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
        v: REMOTE_HTTP_BRIDGE_VERSION,
        requestId: REQUEST_ID,
        generation: 0,
      }),
    ).toBe(false);
  });

  it("validates worker settle/stats messages", () => {
    expect(
      isRemoteHttpBridgeWorkerMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "settled",
        generation: 1,
        requestId: REQUEST_ID,
        outcome: "completed",
        receivedBytes: 10,
        sentBytes: 10,
      }),
    ).toBe(true);
    expect(
      isRemoteHttpBridgeWorkerMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "settled",
        generation: 1,
        requestId: REQUEST_ID,
        outcome: "half-done",
      }),
    ).toBe(false);
    expect(
      isRemoteHttpBridgeWorkerMessage({
        v: REMOTE_HTTP_BRIDGE_VERSION,
        kind: "stats-reply",
        generation: 1,
        queryId: 2,
        stats: { activeRequests: 0 },
      }),
    ).toBe(true);
  });
});
