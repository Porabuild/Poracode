import { describe, expect, it } from "vitest";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import { chromiumCertificateVerdict } from "./remoteCertificatePins";
import {
  installLoopbackCertificatePin,
  isLoopbackCertificateHostname,
} from "./loopbackCertificatePin";

describe("loopback hostname classification", () => {
  it("accepts only exact loopback spellings", () => {
    for (const host of ["127.0.0.1", "localhost", "::1", "[::1]", "LOCALHOST"]) {
      expect(isLoopbackCertificateHostname(host)).toBe(true);
    }
    for (const host of ["example.test", "192.168.1.5", "127.1.2.3", "0.0.0.0"]) {
      expect(isLoopbackCertificateHostname(host)).toBe(false);
    }
  });
});

describe("installLoopbackCertificatePin", () => {
  it("never caches trust: every handshake returns an error and records the verdict", () => {
    const trusted = generateSelfSignedTlsMaterial();
    const reviewed = generateSelfSignedTlsMaterial();
    const decisions: number[] = [];
    const session = {
      setCertificateVerifyProc: (
        proc: (
          request: { hostname: string; certificate: { data: string }; errorCode?: number },
          callback: (verificationResult: number) => void,
        ) => void,
      ) => {
        proc({ hostname: "127.0.0.1", certificate: { data: trusted.cert } }, (result) =>
          decisions.push(result),
        );
        proc(
          { hostname: "example.test", certificate: { data: reviewed.cert }, errorCode: 0 },
          (result) => decisions.push(result),
        );
      },
    };
    installLoopbackCertificatePin(session);
    expect(decisions).toEqual([-202, -202]);
    expect(chromiumCertificateVerdict(session, "https://example.test", reviewed.cert)).toBe(true);
    expect(chromiumCertificateVerdict(session, "https://127.0.0.1", trusted.cert)).toBe(false);
  });
});
