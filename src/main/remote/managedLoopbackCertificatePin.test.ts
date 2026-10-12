import { describe, expect, it } from "vitest";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import { buildPairingUrl } from "@/shared/remote/pairingUrl";
import { installManagedLoopbackCertificatePin } from "./managedLoopbackCertificatePin";
import { hasRemoteCertificatePin, matchesRemoteCertificatePin } from "./remoteCertificatePins";

function session(): object {
  return {};
}

function bootstrap(endpoint: string, fingerprint: string, credential = "renderer-token") {
  return {
    endpoint,
    pairingUrl: buildPairingUrl({
      httpBaseUrl: endpoint,
      credential,
      certFingerprint: fingerprint,
    }),
  };
}

describe("installManagedLoopbackCertificatePin", () => {
  it("pins the exact loopback origin/leaf from the pairing-url fingerprint", () => {
    const material = generateSelfSignedTlsMaterial();
    const target = session();
    const endpoint = "https://127.0.0.1:49152/";
    expect(
      installManagedLoopbackCertificatePin(target, bootstrap(endpoint, material.fingerprint)),
    ).toBe("https://127.0.0.1:49152");
    expect(hasRemoteCertificatePin(target, "https://127.0.0.1:49152/")).toBe(true);
    expect(matchesRemoteCertificatePin(target, "https://127.0.0.1:49152/ws", material.cert)).toBe(
      true,
    );
  });

  it("refuses a swapped certificate on the same origin", () => {
    const material = generateSelfSignedTlsMaterial();
    const swapped = generateSelfSignedTlsMaterial();
    const target = session();
    installManagedLoopbackCertificatePin(
      target,
      bootstrap("https://127.0.0.1:49152/", material.fingerprint),
    );
    expect(matchesRemoteCertificatePin(target, "https://127.0.0.1:49152/", swapped.cert)).toBe(
      false,
    );
  });

  it("does not pin a different origin (port, scheme, or non-loopback host)", () => {
    const material = generateSelfSignedTlsMaterial();
    const target = session();
    installManagedLoopbackCertificatePin(
      target,
      bootstrap("https://127.0.0.1:49152/", material.fingerprint),
    );
    expect(matchesRemoteCertificatePin(target, "https://127.0.0.1:49153/", material.cert)).toBe(
      false,
    );
    expect(matchesRemoteCertificatePin(target, "https://localhost:49152/", material.cert)).toBe(
      false,
    );

    const nonLoopback = session();
    expect(
      installManagedLoopbackCertificatePin(
        nonLoopback,
        bootstrap("https://example.test:49152/", material.fingerprint),
      ),
    ).toBeNull();
    expect(hasRemoteCertificatePin(nonLoopback, "https://example.test:49152/")).toBe(false);
  });

  it("does not pin cleartext loopback or a pairing URL without a fingerprint", () => {
    const material = generateSelfSignedTlsMaterial();
    const cleartext = session();
    expect(
      installManagedLoopbackCertificatePin(
        cleartext,
        bootstrap("http://127.0.0.1:49152/", material.fingerprint),
      ),
    ).toBeNull();
    expect(hasRemoteCertificatePin(cleartext, "https://127.0.0.1:49152/")).toBe(false);

    const missing = session();
    expect(
      installManagedLoopbackCertificatePin(missing, {
        endpoint: "https://127.0.0.1:49152/",
        pairingUrl: buildPairingUrl({
          httpBaseUrl: "https://127.0.0.1:49152/",
          credential: "renderer-token",
        }),
      }),
    ).toBeNull();
    expect(hasRemoteCertificatePin(missing, "https://127.0.0.1:49152/")).toBe(false);
  });

  it("rotates the pin on a fresh bootstrap and drops the previous origin on a port change", () => {
    const first = generateSelfSignedTlsMaterial();
    const second = generateSelfSignedTlsMaterial();
    const target = session();
    installManagedLoopbackCertificatePin(
      target,
      bootstrap("https://127.0.0.1:49152/", first.fingerprint, "token-1"),
    );
    // Rotation: same origin, new leaf from the newer bootstrap.
    installManagedLoopbackCertificatePin(
      target,
      bootstrap("https://127.0.0.1:49152/", second.fingerprint, "token-2"),
    );
    expect(matchesRemoteCertificatePin(target, "https://127.0.0.1:49152/", second.cert)).toBe(true);
    expect(matchesRemoteCertificatePin(target, "https://127.0.0.1:49152/", first.cert)).toBe(false);
    // Port change: the retired origin is unpinned, not left behind.
    installManagedLoopbackCertificatePin(
      target,
      bootstrap("https://127.0.0.1:49153/", second.fingerprint, "token-3"),
    );
    expect(hasRemoteCertificatePin(target, "https://127.0.0.1:49152/")).toBe(false);
    expect(matchesRemoteCertificatePin(target, "https://127.0.0.1:49153/", second.cert)).toBe(true);
  });

  it("clears the managed pin when the bootstrap is gone (reset/disposal)", () => {
    const material = generateSelfSignedTlsMaterial();
    const target = session();
    installManagedLoopbackCertificatePin(
      target,
      bootstrap("https://127.0.0.1:49152/", material.fingerprint),
    );
    expect(installManagedLoopbackCertificatePin(target, null)).toBeNull();
    expect(hasRemoteCertificatePin(target, "https://127.0.0.1:49152/")).toBe(false);
    // Idempotent: clearing an already-clear session stays clear.
    expect(installManagedLoopbackCertificatePin(target, null)).toBeNull();
  });

  it("keeps sessions independent", () => {
    const material = generateSelfSignedTlsMaterial();
    const first = session();
    const second = session();
    installManagedLoopbackCertificatePin(
      first,
      bootstrap("https://127.0.0.1:49152/", material.fingerprint),
    );
    expect(hasRemoteCertificatePin(second, "https://127.0.0.1:49152/")).toBe(false);
  });
});
