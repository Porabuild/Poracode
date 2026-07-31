import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrlWithoutPairing, normalizePairingEndpoint, parsePairingUrl } from "./pairing";

const globalWithCapacitor = globalThis as typeof globalThis & {
  Capacitor?: { isNativePlatform: () => boolean };
};

function locationFromUrl(value: string): Location {
  return new URL(value) as unknown as Location;
}

async function importFreshPairing() {
  vi.resetModules();
  return import("./pairing");
}

afterEach(() => {
  delete globalWithCapacitor.Capacitor;
});

describe("parsePairingUrl", () => {
  it("reads the token from the hash and the endpoint from the origin", () => {
    expect(parsePairingUrl("http://192.168.1.20:38987/pair#token=lc_pair_abc")).toEqual({
      endpoint: "http://192.168.1.20:38987",
      credential: "lc_pair_abc",
    });
  });

  it("prefers the ?host= param when the link points at a hosted pairing app", () => {
    const url =
      "https://app.poracodeapp.com/pair?host=http%3A%2F%2F192.168.1.20%3A38987%2F#token=lc_pair_xyz";
    expect(parsePairingUrl(url)).toEqual({
      endpoint: "http://192.168.1.20:38987",
      credential: "lc_pair_xyz",
    });
  });

  it("prefers the ?host= param when the link points at the dev mobile app", () => {
    const url =
      "http://192.168.1.20:3100/mobile.html?host=http%3A%2F%2F192.168.1.20%3A38987%2F#token=lc_pair_dev";
    expect(parsePairingUrl(url)).toEqual({
      endpoint: "http://192.168.1.20:38987",
      credential: "lc_pair_dev",
    });
  });

  it("preserves relay-mounted endpoints from a hosted pairing link", () => {
    const url =
      "https://app.poracodeapp.com/pair?host=https%3A%2F%2Frelay.example.test%2Fs%2Fserver-1%2F#token=lc_pair_relay";
    expect(parsePairingUrl(url)).toEqual({
      endpoint: "https://relay.example.test/s/server-1",
      credential: "lc_pair_relay",
    });
  });

  it("preserves relay-mounted endpoints when scanning the relay pairing route", () => {
    expect(parsePairingUrl("https://relay.example.test/s/server-1/pair#token=lc_pair_abc")).toEqual(
      {
        endpoint: "https://relay.example.test/s/server-1",
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
    expect(normalizePairingEndpoint("http://192.168.1.20:3100/")).toBe("http://192.168.1.20:49152");
  });

  it("keeps a desktop remote endpoint as-is", () => {
    expect(normalizePairingEndpoint("http://192.168.1.20:38987/pair")).toBe(
      "http://192.168.1.20:38987",
    );
  });

  it("keeps relay path prefixes while stripping remote app routes", () => {
    expect(normalizePairingEndpoint("https://relay.example.test/s/server-1/app")).toBe(
      "https://relay.example.test/s/server-1",
    );
  });
});

describe("capturePairingLaunch", () => {
  it("defaults to the current origin for LAN PWA launches", async () => {
    const { capturePairingLaunch } = await importFreshPairing();

    expect(capturePairingLaunch(locationFromUrl("http://192.168.1.20:38987/app"))).toEqual({
      endpoint: "http://192.168.1.20:38987",
      credential: null,
    });
  });

  it("leaves native Capacitor launches blank when no desktop host is present", async () => {
    globalWithCapacitor.Capacitor = { isNativePlatform: () => true };
    const { capturePairingLaunch } = await importFreshPairing();

    expect(capturePairingLaunch(locationFromUrl("capacitor://localhost/"))).toEqual({
      endpoint: "",
      credential: null,
    });
  });

  it("uses the host parameter for native app-link launches", async () => {
    globalWithCapacitor.Capacitor = { isNativePlatform: () => true };
    const { capturePairingLaunch } = await importFreshPairing();

    expect(
      capturePairingLaunch(
        locationFromUrl("capacitor://localhost/pair?host=http%3A%2F%2F192.168.1.20%3A38987%2F"),
      ),
    ).toEqual({
      endpoint: "http://192.168.1.20:38987",
      credential: null,
    });
  });

  it("does not throw on a malformed host param (white-screen guard)", async () => {
    const { capturePairingLaunch } = await importFreshPairing();
    // `http://[` makes new URL throw inside normalizePairingEndpoint; capture
    // must swallow it and yield an empty endpoint rather than propagating out of
    // render. (No #token, so this stays in the node env's window-free path.)
    expect(capturePairingLaunch(locationFromUrl("http://192.168.1.20/app?host=http://["))).toEqual({
      endpoint: "",
      credential: null,
    });
  });
});

describe("appUrlWithoutPairing", () => {
  it("preserves a hosted path prefix when stripping pairing credentials", () => {
    expect(
      appUrlWithoutPairing(
        locationFromUrl("https://poracode.com/pwa/pair?host=https://desktop.test/#token=pair"),
      ),
    ).toBe("https://poracode.com/pwa");
  });
});

describe("isMixedContentEndpoint", () => {
  it("flags http LAN endpoints on hosted https pages", async () => {
    const { isMixedContentEndpoint } = await importFreshPairing();

    expect(
      isMixedContentEndpoint(
        "http://192.168.1.20:38987/",
        locationFromUrl("https://app.poracodeapp.com/app"),
      ),
    ).toBe(true);
  });

  it("does not flag http LAN endpoints inside the native shell", async () => {
    globalWithCapacitor.Capacitor = { isNativePlatform: () => true };
    const { isMixedContentEndpoint } = await importFreshPairing();

    expect(
      isMixedContentEndpoint(
        "http://10.0.2.2:38999/",
        locationFromUrl("https://localhost/index.html"),
      ),
    ).toBe(false);
  });
});
