import { describe, expect, it } from "vitest";
import {
  appendRuntimeStreamHeadCounters,
  decodeRuntimeStreamKey,
  encodeRuntimeStreamKey,
  isRuntimeStreamHeadKeyEligible,
  isRuntimeStreamHeadSeed,
  runtimeStreamHeadCounters,
} from "./runtimeStreamHeadCodec";
import { HEAD_CHARS } from "./runtimeStreamCap";

function escapedOracle(text: string) {
  const wire = JSON.stringify(text);
  return {
    head_chars: text.length,
    head_wire_bytes: Buffer.byteLength(wire, "utf8") - 2,
    head_json_units: wire.length - 2,
    head_has_content: text.trim() ? 1 : 0,
    head_last_unit: text.length ? text.charCodeAt(text.length - 1) : -1,
  };
}

describe("runtime stream head codec", () => {
  it.each(["", "normal", 'quote"\\\n', "Ω😀", "\ud800", "\udc00", "\ud800�", "0", "__proto__"])(
    "round-trips exact UTF16 stream key %j",
    (key) => {
      expect(decodeRuntimeStreamKey(encodeRuntimeStreamKey(key))).toBe(key);
      expect(Buffer.from(encodeRuntimeStreamKey(key), "utf8").toString("utf8")).toBe(
        encodeRuntimeStreamKey(key),
      );
    },
  );

  it.each(["broken", "null", "0", "{}", "[]", '"\\u0061"'])(
    "refuses invalid/noncanonical key %j",
    (key) => {
      expect(() => decodeRuntimeStreamKey(key)).toThrow(/runtime stream head key|JSON/);
    },
  );

  it("keeps corrupt/prototype-sensitive seeds and keys on the legacy path", () => {
    for (const value of [
      undefined,
      null,
      [],
      3,
      "text",
      { text: 2 },
      { text: "x".repeat(HEAD_CHARS + 2) },
      JSON.parse('{"__proto__":"x"}'),
    ]) {
      expect(isRuntimeStreamHeadSeed(value)).toBe(false);
    }
    expect(
      isRuntimeStreamHeadSeed({ "\ud800": "\udc00", empty: "", exact: "x".repeat(HEAD_CHARS + 1) }),
    ).toBe(true);
    for (const key of ["constructor", "__proto__", "toString"])
      expect(isRuntimeStreamHeadKeyEligible(key)).toBe(false);
  });

  it.each([
    "",
    "ascii",
    '"\\\b\f\n\r\t\u0000\u0001',
    "Ω漢字😀",
    "\ud800",
    "\udc00",
    "\ud800\ud800\udc00\udc00",
    " \t\n\u00a0\u1680\u2000\u2028\u2029\u202f\u205f\u3000\ufeff ",
    "start\ud83d\ude00end\ud800\u0001",
  ])("matches escaped/content oracle at every delta boundary for %j", (text) => {
    expect(runtimeStreamHeadCounters(text)).toEqual(escapedOracle(text));
    for (let boundary = 0; boundary <= text.length; boundary++) {
      const prefix = runtimeStreamHeadCounters(text.slice(0, boundary));
      expect(appendRuntimeStreamHeadCounters(prefix, text.slice(boundary))).toEqual(
        escapedOracle(text),
      );
    }
    let incremental = runtimeStreamHeadCounters("");
    for (let unit = 0; unit < text.length; unit++) {
      incremental = appendRuntimeStreamHeadCounters(incremental, text.slice(unit, unit + 1));
      expect(incremental).toEqual(escapedOracle(text.slice(0, unit + 1)));
    }
  });
});
