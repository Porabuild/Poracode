import { describe, expect, it } from "vitest";
import { mintLoopbackRendererCredential } from "@/host/remote/remoteAccessServerPairing";
import type { RemoteAccessServerHost } from "@/host/remote/remoteAccessServerTypes";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import { parsePairingCertFingerprint } from "@/shared/remote/pairingUrl";
import { installManagedLoopbackCertificatePin } from "./managedLoopbackCertificatePin";
import { hasRemoteCertificatePin, matchesRemoteCertificatePin } from "./remoteCertificatePins";

/**
 * TLS seam composition (V6 B.3 / E1): the backend mints the managed loopback
 * renderer bootstrap, and the SAME pairing URL's fingerprint is what Electron
 * main installs as the exact-origin pin. No extra wire field is involved.
 */
function backendMintedBootstrap(tlsFingerprint: string) {
  const endpoint = "https://127.0.0.1:49152";
  const host = {
    stopping: false,
    info: {
      httpBaseUrl: endpoint,
      localHttpBaseUrl: endpoint,
      wsBaseUrl: "wss://127.0.0.1:49152/ws",
      pairingUrl: `${endpoint}/pair#token=displayed`,
      pairingExpiresAt: "2026-09-13T00:10:00.000Z",
    },
    auth: {
      issuePairingCredential: () => ({
        id: "pairing-1",
        credential: "lc_pair_renderer",
        scopes: [],
        label: "Managed renderer",
        expiresAt: "2026-09-13T00:10:00.000Z",
      }),
    },
    tls: { cert: "", key: "", fingerprint: tlsFingerprint },
    options: {},
  } as unknown as RemoteAccessServerHost;
  const credential = mintLoopbackRendererCredential(host);
  expect(credential).not.toBeNull();
  return { endpoint: credential!.endpoint, pairingUrl: credential!.pairingUrl };
}

describe("managed loopback bootstrap trust seam", () => {
  it("pins the leaf the backend actually serves, taken from the minted pairing URL", () => {
    const material = generateSelfSignedTlsMaterial();
    const session = {};
    const bootstrap = backendMintedBootstrap(material.fingerprint);
    expect(bootstrap.pairingUrl).toContain("#token=lc_pair_renderer");
    expect(parsePairingCertFingerprint(bootstrap.pairingUrl)).toBe(material.fingerprint);
    expect(installManagedLoopbackCertificatePin(session, bootstrap)).toBe(
      "https://127.0.0.1:49152",
    );
    expect(matchesRemoteCertificatePin(session, "https://127.0.0.1:49152/", material.cert)).toBe(
      true,
    );
  });

  it("refuses a swapped leaf for the same endpoint even with a valid-looking bootstrap", () => {
    const served = generateSelfSignedTlsMaterial();
    const swapped = generateSelfSignedTlsMaterial();
    const session = {};
    installManagedLoopbackCertificatePin(session, backendMintedBootstrap(served.fingerprint));
    expect(matchesRemoteCertificatePin(session, "https://127.0.0.1:49152/", swapped.cert)).toBe(
      false,
    );
  });

  it("leaves a cleartext backend bootstrap unpinned", () => {
    const host = {
      stopping: false,
      info: {
        httpBaseUrl: "http://127.0.0.1:49152",
        localHttpBaseUrl: "http://127.0.0.1:49152",
        wsBaseUrl: "ws://127.0.0.1:49152/ws",
        pairingUrl: "http://127.0.0.1:49152/pair#token=displayed",
        pairingExpiresAt: "2026-09-13T00:10:00.000Z",
      },
      auth: {
        issuePairingCredential: () => ({
          id: "pairing-1",
          credential: "lc_pair_renderer",
          scopes: [],
          label: "Managed renderer",
          expiresAt: "2026-09-13T00:10:00.000Z",
        }),
      },
      tls: null,
      options: {},
    } as unknown as RemoteAccessServerHost;
    const credential = mintLoopbackRendererCredential(host)!;
    const session = {};
    expect(
      installManagedLoopbackCertificatePin(session, {
        endpoint: credential.endpoint,
        pairingUrl: credential.pairingUrl,
      }),
    ).toBeNull();
    expect(hasRemoteCertificatePin(session, "https://127.0.0.1:49152/")).toBe(false);
  });
});
