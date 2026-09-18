import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import { describe, expect, it } from "vitest";
import {
  decodeBackendRendererFrame,
  decodeRemoteSocketFrame,
  isBackendRendererMessage,
  parseJsonValue,
  stringifyJsonValue,
} from "./decode";

describe("decodeBackendRendererFrame", () => {
  it("accepts valid backend frames", () => {
    const hello = {
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "hello",
      latestSeq: 4,
    };
    expect(decodeBackendRendererFrame(JSON.stringify(hello))).toEqual({
      ok: true,
      message: hello,
    });

    const reply = {
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply",
      id: "req-1",
      ok: true,
      data: { n: 1 },
    };
    expect(decodeBackendRendererFrame(JSON.stringify(reply))).toEqual({
      ok: true,
      message: reply,
    });

    const event = {
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "event",
      seq: 2,
      event: { type: "thread-reset", threadId: "t1" },
    };
    expect(decodeBackendRendererFrame(JSON.stringify(event))).toEqual({
      ok: true,
      message: event,
    });
    expect(isBackendRendererMessage(event)).toBe(true);
  });

  it("accepts large-reply top-level frames for later reassembly", () => {
    const start = {
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply-start",
      id: "req-1",
      totalBytes: 12,
    };
    expect(decodeBackendRendererFrame(JSON.stringify(start))).toEqual({
      ok: true,
      message: start,
    });
    expect(isBackendRendererMessage(start)).toBe(false);
  });

  it("rejects invalid backend frames", () => {
    expect(decodeBackendRendererFrame("{")).toEqual({ ok: false, error: "invalid" });
    expect(decodeBackendRendererFrame("null")).toEqual({ ok: false, error: "invalid" });
    expect(
      decodeBackendRendererFrame(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION - 1,
          type: "hello",
          latestSeq: 0,
        }),
      ),
    ).toEqual({ ok: false, error: "invalid" });
    expect(
      decodeBackendRendererFrame(
        JSON.stringify({ version: BACKEND_RENDERER_STREAM_VERSION, type: "event", seq: 1 }),
      ),
    ).toEqual({ ok: false, error: "invalid" });
  });
});

describe("decodeRemoteSocketFrame", () => {
  it("accepts valid remote frames", () => {
    const ready = { type: "ready", seq: 0 };
    expect(decodeRemoteSocketFrame(JSON.stringify(ready))).toEqual({
      ok: true,
      message: ready,
    });
    const event = { type: "event", seq: 1, event: { type: "noop" } };
    expect(decodeRemoteSocketFrame(JSON.stringify(event))).toEqual({
      ok: true,
      message: event,
    });
  });

  it("rejects invalid remote frames", () => {
    expect(decodeRemoteSocketFrame("{")).toEqual({ ok: false, error: "invalid" });
    expect(decodeRemoteSocketFrame(JSON.stringify({ type: "ready" }))).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(decodeRemoteSocketFrame(JSON.stringify({ type: "unknown", seq: 1 }))).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("json helpers", () => {
  it("parses and stringifies values", () => {
    expect(parseJsonValue('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonValue("{")).toEqual({ ok: false, error: "invalid" });
    expect(stringifyJsonValue({ a: 1 })).toEqual({ ok: true, json: '{"a":1}' });
    expect(stringifyJsonValue(undefined)).toEqual({ ok: false, error: "invalid" });
  });
});
