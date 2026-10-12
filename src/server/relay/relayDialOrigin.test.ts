import { describe, expect, it } from "vitest";
import {
  RELAY_LOOPBACK_HOP_HEADER,
  relayLoopbackHopSecret,
} from "@/host/remote/server/relayHopSecret";
import {
  RELAY_ORIGIN_DIAL_TABLE,
  forwardedForIdentity,
  relayDialOriginHeaders,
} from "./relayDialOrigin";

describe("relayDialOriginHeaders", () => {
  it("stamps the hop secret and visitor identity on every dial shape", () => {
    const secret = relayLoopbackHopSecret();
    for (const shape of Object.keys(RELAY_ORIGIN_DIAL_TABLE) as Array<
      keyof typeof RELAY_ORIGIN_DIAL_TABLE
    >) {
      const extra = RELAY_ORIGIN_DIAL_TABLE[shape].extra;
      const headers = relayDialOriginHeaders(shape, "abc123", extra);
      expect(headers[RELAY_LOOPBACK_HOP_HEADER]).toBe(secret);
      expect(headers["x-forwarded-for"]).toBe(forwardedForIdentity("abc123"));
      for (const [name, value] of Object.entries(extra)) {
        expect(headers[name]).toBe(value);
      }
    }
  });

  it("overwrites a visitor-supplied hop marker or forwarded-for in extra headers", () => {
    const headers = relayDialOriginHeaders("http", "peer-1", {
      [RELAY_LOOPBACK_HOP_HEADER]: "0",
      "x-forwarded-for": "6.6.6.6",
    });
    expect(headers[RELAY_LOOPBACK_HOP_HEADER]).toBe(relayLoopbackHopSecret());
    expect(headers["x-forwarded-for"]).toBe("relay:peer-1");
  });
});
