import { describe, expect, it } from "vitest";
import {
  decodeDesktopFrame,
  decodeRemoteSocketFrame,
  measuredRawBytes,
  parseJsonValue,
  stringifyJsonValue,
} from "./decode";

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

describe("decodeDesktopFrame (private managed loopback vocabulary)", () => {
  it("validates the private desktop-event envelope off the public wire schema", () => {
    const raw = JSON.stringify({
      type: "desktop-event",
      seq: 4,
      space: "ipc",
      event: { type: "provider-usage", snapshot: { providerId: "p" } },
    });
    expect(decodeDesktopFrame(raw)).toEqual({
      ok: true,
      frame: {
        kind: "event",
        seq: 4,
        space: "ipc",
        event: { type: "provider-usage", snapshot: { providerId: "p" } },
      },
    });
    // The public schema deliberately carries `event: unknown`; the private
    // validator is the one that rejects a payload with no event type at all.
    expect(
      decodeDesktopFrame(JSON.stringify({ type: "desktop-event", seq: 1, event: {} })),
    ).toEqual({ ok: false, error: "invalid" });
  });

  it("routes terminal and control frames without exposing them to the paired path", () => {
    expect(
      decodeDesktopFrame(JSON.stringify({ type: "terminal-output", id: "t", data: "x" })),
    ).toEqual({
      ok: true,
      frame: { kind: "terminal", frame: { type: "terminal-output", id: "t", data: "x" } },
    });
    expect(decodeDesktopFrame(JSON.stringify({ type: "pong", id: "7" }))).toEqual({
      ok: true,
      frame: { kind: "pong", id: "7" },
    });
    expect(decodeDesktopFrame(JSON.stringify({ type: "ready" }))).toEqual({
      ok: true,
      frame: { kind: "ready" },
    });
    expect(decodeDesktopFrame(JSON.stringify({ type: "resync-required" }))).toEqual({
      ok: true,
      frame: { kind: "resync-required" },
    });
  });

  it("rejects malformed cursors and unknown spaces", () => {
    expect(
      decodeDesktopFrame(JSON.stringify({ type: "event", seq: -1, event: { type: "noop" } })),
    ).toEqual({ ok: false, error: "invalid" });
    expect(
      decodeDesktopFrame(JSON.stringify({ type: "event", seq: 1.5, event: { type: "noop" } })),
    ).toEqual({ ok: false, error: "invalid" });
    expect(
      decodeDesktopFrame(
        JSON.stringify({ type: "event", seq: 1, space: "elsewhere", event: { type: "noop" } }),
      ),
    ).toEqual({ ok: false, error: "invalid" });
    expect(decodeDesktopFrame("{")).toEqual({ ok: false, error: "invalid" });
    expect(decodeDesktopFrame(JSON.stringify({ type: "not-in-the-protocol" }))).toEqual({
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

  it("measures a conservative UTF-16 upper bound", () => {
    expect(measuredRawBytes(0)).toBe(0);
    expect(measuredRawBytes(3)).toBe(6);
  });
});
