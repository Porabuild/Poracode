import { describe, expect, it } from "vitest";
import { decodeRemoteSocketFrame, parseJsonValue, stringifyJsonValue } from "./decode";

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
