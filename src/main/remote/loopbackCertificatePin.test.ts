import { chromiumCertificateVerdict } from "./remoteCertificatePins";
import { afterEach, describe, expect, it } from "vitest";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import {
  CERTIFICATE_VERIFY_CHROMIUM,
  CERTIFICATE_VERIFY_FAIL,
  CERTIFICATE_VERIFY_OK,
  decideLoopbackCertificateTrust,
  installLoopbackCertificatePin,
  readManagedLoopbackCertificatePin,
  setManagedLoopbackCertificatePin,
} from "./loopbackCertificatePin";

describe("loopback certificate pin (V6 B.3)", () => {
  afterEach(() => {
    setManagedLoopbackCertificatePin(null);
  });

  it("accepts the pinned self-signed leaf on loopback and refuses a swapped cert", () => {
    const trusted = generateSelfSignedTlsMaterial();
    const swapped = generateSelfSignedTlsMaterial();
    expect(
      decideLoopbackCertificateTrust({
        hostname: "127.0.0.1",
        certificatePem: trusted.cert,
        pinnedFingerprint: trusted.fingerprint,
      }),
    ).toBe(CERTIFICATE_VERIFY_OK);
    expect(
      decideLoopbackCertificateTrust({
        hostname: "localhost",
        certificatePem: swapped.cert,
        pinnedFingerprint: trusted.fingerprint,
      }),
    ).toBe(CERTIFICATE_VERIFY_FAIL);
  });

  it("leaves non-loopback hosts to Chromium even when a pin is set", () => {
    const trusted = generateSelfSignedTlsMaterial();
    expect(
      decideLoopbackCertificateTrust({
        hostname: "example.test",
        certificatePem: trusted.cert,
        pinnedFingerprint: trusted.fingerprint,
      }),
    ).toBe(CERTIFICATE_VERIFY_CHROMIUM);
  });

  it("installs a session verify proc that reads the live pin", () => {
    const trusted = generateSelfSignedTlsMaterial();
    setManagedLoopbackCertificatePin(trusted.fingerprint);
    expect(readManagedLoopbackCertificatePin()).toBe(trusted.fingerprint);
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
          { hostname: "evil.example", certificate: { data: trusted.cert }, errorCode: 0 },
          (result) => decisions.push(result),
        );
      },
    };
    installLoopbackCertificatePin(session);
    expect(decisions).toEqual([-202, -202]);
    expect(chromiumCertificateVerdict(session, "https://evil.example", trusted.cert)).toBe(true);
    expect(chromiumCertificateVerdict(session, "https://127.0.0.1", trusted.cert)).toBe(false);
  });
});
