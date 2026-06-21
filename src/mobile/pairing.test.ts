import { describe, expect, it } from "vitest";
import { parsePairingUrl } from "./pairing";

describe("parsePairingUrl", () => {
  it("reads the token from the hash and the endpoint from the origin", () => {
    expect(parsePairingUrl("http://192.168.1.20:38987/pair#token=lc_pair_abc")).toEqual({
      endpoint: "http://192.168.1.20:38987/",
      credential: "lc_pair_abc",
    });
  });

  it("prefers the ?host= param when the link points at a hosted pairing app", () => {
    const url =
      "https://app.lightcodeapp.com/pair?host=http%3A%2F%2F192.168.1.20%3A38987%2F#token=lc_pair_xyz";
    expect(parsePairingUrl(url)).toEqual({
      endpoint: "http://192.168.1.20:38987/",
      credential: "lc_pair_xyz",
    });
  });

  it("returns null for a URL with no pairing token", () => {
    expect(parsePairingUrl("https://example.com/not-a-pairing-link")).toBeNull();
  });

  it("returns null for non-URL text", () => {
    expect(parsePairingUrl("just some scanned text")).toBeNull();
  });
});
