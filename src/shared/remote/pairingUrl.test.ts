import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDesktopPairingUrl,
  buildPairingUrl,
  isCleartextLanUrl,
  normalizePairingEndpoint,
  parsePairingUrlParts,
  retargetPairingUrl,
} from "./pairingUrl";

/**
 * The shared pairing-URL conformance fixture (protocol/remote/v3/fixtures/
 * pairing-url-cases.json) is asserted verbatim on iOS and Android too: the
 * desktop reference implementation defines the canonical answers, and the
 * fixture's documentedDifferences section carries the cases that legitimately
 * differ per platform (pinned by desktop-only or native-only tests instead).
 */
const pairingUrlCases = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../../protocol/remote/v3/fixtures/pairing-url-cases.json"),
    "utf8",
  ),
) as {
  parseParts: Array<{
    name: string;
    url: string;
    token?: string;
    host?: string;
    expectNull?: boolean;
  }>;
  normalizeEndpoint: Array<{
    name: string;
    url: string;
    endpoint?: string;
    expectInvalid?: boolean;
  }>;
  cleartextLanUrl: Array<{ name: string; url: string; cleartext: boolean }>;
};

describe("shared pairing-url conformance fixture", () => {
  it("parses every shared parseParts case exactly as the natives must", () => {
    const actual = pairingUrlCases.parseParts.map((entry) => {
      const parsed = parsePairingUrlParts(entry.url);
      return { token: parsed?.token ?? null, host: parsed?.host ?? null };
    });
    const expected = pairingUrlCases.parseParts.map((entry) =>
      entry.expectNull
        ? { token: null, host: null }
        : { token: entry.token ?? null, host: entry.host ?? null },
    );
    expect(actual).toEqual(expected);
  });

  it("normalizes every shared normalizeEndpoint case exactly as the natives must", () => {
    const actual = pairingUrlCases.normalizeEndpoint.map((entry) => {
      try {
        return normalizePairingEndpoint(entry.url);
      } catch {
        return null;
      }
    });
    const expected = pairingUrlCases.normalizeEndpoint.map((entry) =>
      entry.expectInvalid ? null : (entry.endpoint ?? null),
    );
    expect(actual).toEqual(expected);
  });

  it("classifies every shared cleartextLanUrl case exactly as the natives must", () => {
    const actual = pairingUrlCases.cleartextLanUrl.map((entry) => isCleartextLanUrl(entry.url));
    const expected = pairingUrlCases.cleartextLanUrl.map((entry) => entry.cleartext);
    expect(actual).toEqual(expected);
  });
});

/**
 * Exactly what a client does with text decoded from the desktop's QR code:
 * parse it, then resolve the endpoint the same way `usePairing` does.
 */
function pairAsScannerWould(decoded: string) {
  const parsed = parsePairingUrlParts(decoded);
  if (!parsed) return null;
  return {
    endpoint: normalizePairingEndpoint(parsed.host ?? parsed.url.toString()),
    token: parsed.token,
  };
}

describe("desktop pairing URL", () => {
  it("opens the canonical client and normalizes back to the server origin", () => {
    const url = buildDesktopPairingUrl({
      httpBaseUrl: "https://desktop.tailnet.ts.net/base",
      credential: "lc_pair_test",
    });

    expect(url).toBe("https://desktop.tailnet.ts.net/#token=lc_pair_test");
    expect(normalizePairingEndpoint(url)).toBe("https://desktop.tailnet.ts.net");
  });
});

/**
 * The desktop's Remote Access panel encodes its pairing URL into the QR code the
 * phone scans, so whatever `buildPairingUrl` emits has to survive the scanner's
 * parse. These pin that contract from both ends — it spans two processes and two
 * codebases, so nothing else would catch a drift in it.
 */
describe("scanning the desktop's QR code", () => {
  it("recovers endpoint and token from a direct LAN pairing link", () => {
    const encoded = buildPairingUrl({
      httpBaseUrl: "http://192.168.1.20:49152",
      credential: "lc_pair_test",
    });

    expect(pairAsScannerWould(encoded)).toEqual({
      endpoint: "http://192.168.1.20:49152",
      token: "lc_pair_test",
    });
  });

  it("follows the host param when the link points at the hosted pairing app", () => {
    const encoded = buildPairingUrl({
      httpBaseUrl: "https://desktop.tailnet.ts.net",
      credential: "lc_pair_test",
      pairingAppUrl: "https://poracode.com",
    });

    // The endpoint is the desktop, not the pairing app that served the page.
    expect(pairAsScannerWould(encoded)).toEqual({
      endpoint: "https://desktop.tailnet.ts.net",
      token: "lc_pair_test",
    });
  });

  it("recovers a link the desktop retargeted to a different endpoint", () => {
    const encoded = retargetPairingUrl(
      buildPairingUrl({
        httpBaseUrl: "https://desktop.tailnet.ts.net",
        credential: "lc_pair_test",
        pairingAppUrl: "https://poracode.com",
      }),
      "http://192.168.1.20:49152",
    );

    expect(pairAsScannerWould(encoded)).toEqual({
      endpoint: "http://192.168.1.20:49152",
      token: "lc_pair_test",
    });
  });

  it("rejects an unrelated QR code instead of pairing with it", () => {
    expect(pairAsScannerWould("https://example.com/some/page")).toBeNull();
    expect(pairAsScannerWould("WIFI:S:MyNetwork;T:WPA;P:hunter2;;")).toBeNull();
    expect(pairAsScannerWould("not a url at all")).toBeNull();
  });
});

describe("retargetPairingUrl", () => {
  it("changes the hosted pairing link endpoint without changing its token", () => {
    const original = buildPairingUrl({
      httpBaseUrl: "https://desktop.tailnet.ts.net",
      credential: "lc_pair_test",
      pairingAppUrl: "https://poracode.com",
    });
    const retargeted = new URL(retargetPairingUrl(original, "http://192.168.1.20:49152"));

    expect(retargeted.origin).toBe("https://poracode.com");
    expect(retargeted.searchParams.get("host")).toBe("http://192.168.1.20:49152");
    expect(new URLSearchParams(retargeted.hash.slice(1)).get("token")).toBe("lc_pair_test");
  });

  it("retargets a direct pairing link to the selected endpoint", () => {
    const original = buildPairingUrl({
      httpBaseUrl: "https://desktop.tailnet.ts.net",
      credential: "lc_pair_test",
    });

    expect(retargetPairingUrl(original, "http://192.168.1.20:49152")).toBe(
      "http://192.168.1.20:49152/#token=lc_pair_test",
    );
  });
});
