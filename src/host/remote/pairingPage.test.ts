import { describe, expect, it } from "vitest";
import { buildLocalPairingPageHtml } from "./pairingPage";

describe("buildLocalPairingPageHtml", () => {
  it("shows the leaf fingerprint for self-signed TLS so a web client can compare it by hand", () => {
    const html = buildLocalPairingPageHtml({
      httpBaseUrl: "https://192.168.1.20:49152",
      certFingerprint: "a".repeat(64),
    });
    expect(html).toContain("Browsers cannot pin");
    expect(html).toContain("Certificate fingerprint");
    expect(html).toContain(`sha256:${"a".repeat(64)}`);
  });

  it("omits the fingerprint block on plaintext hosts", () => {
    const html = buildLocalPairingPageHtml({ httpBaseUrl: "http://127.0.0.1:49152" });
    expect(html).not.toContain("Certificate fingerprint");
    expect(html).not.toContain("Browsers cannot pin");
  });
});
