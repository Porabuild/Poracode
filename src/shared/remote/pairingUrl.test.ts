import { describe, expect, it } from "vitest";
import {
  buildDesktopPairingUrl,
  buildPairingUrl,
  normalizePairingEndpoint,
  retargetPairingUrl,
} from "./pairingUrl";

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
