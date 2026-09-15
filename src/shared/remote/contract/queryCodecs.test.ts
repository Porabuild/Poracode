import { describe, expect, it } from "vitest";
import {
  decodeQueryValue,
  encodeQueryValue,
  LOSSY_QUERY_METADATA_KINDS,
  QueryCodecError,
  ROUTE_QUERY_CODECS,
  WEBSOCKET_QUERY_CODECS,
} from "./queryCodecs";

describe("explicit query wire codecs", () => {
  it("round-trips each documented kind without z.coerce", () => {
    expect(encodeQueryValue("string", "abc")).toBe("abc");
    expect(decodeQueryValue("string", "abc")).toBe("abc");

    expect(encodeQueryValue("int", 12)).toBe("12");
    expect(decodeQueryValue("int", "12")).toBe(12);
    expect(() => decodeQueryValue("int", "12.5")).toThrow(QueryCodecError);
    expect(() => decodeQueryValue("int", "1e2")).toThrow(QueryCodecError);

    expect(encodeQueryValue("decimal", 1.25)).toBe("1.25");
    expect(decodeQueryValue("decimal", "1.25")).toBe(1.25);
    expect(() => decodeQueryValue("decimal", "1e2")).toThrow(QueryCodecError);
    expect(() => encodeQueryValue("decimal", 1e21)).toThrow(QueryCodecError);
    expect(() => encodeQueryValue("decimal", -0)).toThrow(QueryCodecError);

    expect(encodeQueryValue("0-or-1", true)).toBe("1");
    expect(encodeQueryValue("0-or-1", false)).toBe("0");
    expect(decodeQueryValue("0-or-1", "1")).toBe(true);
    expect(() => decodeQueryValue("0-or-1", "true")).toThrow(QueryCodecError);

    expect(encodeQueryValue("JSON-string", ["a", 1])).toBe('["a",1]');
    expect(decodeQueryValue("JSON-string", '["a",1]')).toEqual(["a", 1]);
    expect(() => decodeQueryValue("JSON-string", "not-json")).toThrow(QueryCodecError);
    expect(() => encodeQueryValue("JSON-string", [Number.NaN])).toThrow(QueryCodecError);
    expect(() => encodeQueryValue("JSON-string", { omitted: undefined })).toThrow(QueryCodecError);
  });

  it("keeps route and websocket tables on explicit kinds", () => {
    const kinds = [
      ...Object.values(ROUTE_QUERY_CODECS).flatMap((codecs) => codecs.map((codec) => codec.kind)),
      ...WEBSOCKET_QUERY_CODECS.map((codec) => codec.kind),
    ];
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(LOSSY_QUERY_METADATA_KINDS).not.toContain(kind);
      expect(["string", "int", "decimal", "0-or-1", "JSON-string"]).toContain(kind);
    }
  });
});
