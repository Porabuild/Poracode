import { describe, expect, it } from "vitest";
import { normalizePairingEndpoint, parsePairingUrl } from "./pairing";

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

  it("prefers the ?host= param when the link points at the dev mobile app", () => {
    const url =
      "http://192.168.1.20:3100/mobile.html?host=http%3A%2F%2F192.168.1.20%3A38987%2F#token=lc_pair_dev";
    expect(parsePairingUrl(url)).toEqual({
      endpoint: "http://192.168.1.20:38987/",
      credential: "lc_pair_dev",
    });
  });

  it("preserves relay-mounted endpoints from a hosted pairing link", () => {
    const url =
      "https://app.lightcodeapp.com/pair?host=https%3A%2F%2Frelay.example.test%2Fs%2Fserver-1%2F#token=lc_pair_relay";
    expect(parsePairingUrl(url)).toEqual({
      endpoint: "https://relay.example.test/s/server-1/",
      credential: "lc_pair_relay",
    });
  });

  it("preserves relay-mounted endpoints when scanning the relay pairing route", () => {
    expect(parsePairingUrl("https://relay.example.test/s/server-1/pair#token=lc_pair_abc")).toEqual(
      {
        endpoint: "https://relay.example.test/s/server-1/",
        credential: "lc_pair_abc",
      },
    );
  });

  it("returns null for a URL with no pairing token", () => {
    expect(parsePairingUrl("https://example.com/not-a-pairing-link")).toBeNull();
  });

  it("returns null for non-URL text", () => {
    expect(parsePairingUrl("just some scanned text")).toBeNull();
  });
});

describe("normalizePairingEndpoint", () => {
  it("maps the Vite dev mobile app origin to the default desktop remote port", () => {
    expect(normalizePairingEndpoint("http://192.168.1.20:3100/")).toBe(
      "http://192.168.1.20:38987/",
    );
  });

  it("keeps a desktop remote endpoint as-is", () => {
    expect(normalizePairingEndpoint("http://192.168.1.20:38987/pair")).toBe(
      "http://192.168.1.20:38987/",
    );
  });

  it("keeps relay path prefixes while stripping remote app routes", () => {
    expect(normalizePairingEndpoint("https://relay.example.test/s/server-1/app")).toBe(
      "https://relay.example.test/s/server-1/",
    );
  });
});
