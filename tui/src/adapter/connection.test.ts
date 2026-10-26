import { X509Certificate } from "node:crypto";
import { createServer } from "node:tls";
import { describe, expect, it } from "bun:test";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import {
  pairingEndpoint,
  probePinnedCertificate,
  RemoteTlsPinError,
  verifyCertificateSan,
  verifyPinnedCertificate,
} from "./connection";

describe("TUI TLS certificate pinning", () => {
  const material = generateSelfSignedTlsMaterial({
    commonName: "localhost",
    dnsNames: ["localhost"],
    ipAddresses: ["127.0.0.1"],
  });
  const certificate = new X509Certificate(material.cert);

  it("accepts the pairing fingerprint only for a leaf with a matching SAN", () => {
    expect(
      verifyPinnedCertificate(certificate.raw, "127.0.0.1", material.fingerprint),
    ).toMatchObject({ fingerprint: material.fingerprint });
    expect(() => verifyCertificateSan(certificate, "wrong.local")).toThrow(
      "no subject alternative name matching",
    );
  });

  it("refuses a mismatched fingerprint and a certificate with no SAN", () => {
    expect(() => verifyPinnedCertificate(certificate.raw, "localhost", "00".repeat(32))).toThrow(
      RemoteTlsPinError,
    );
    expect(() =>
      verifyCertificateSan(
        { subjectAltName: undefined } as unknown as X509Certificate,
        "localhost",
      ),
    ).toThrow("no subject alternative name");
  });

  it("probes the live leaf certificate over TLS before returning its pin", async () => {
    const server = createServer({ cert: material.cert, key: material.key }, (socket) => {
      socket.end();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TLS test server has no address");
    try {
      const pin = await probePinnedCertificate(
        `https://127.0.0.1:${address.port}`,
        material.fingerprint,
      );
      expect(pin.fingerprint).toBe(material.fingerprint);
      expect(pin.pem).toContain("-----BEGIN CERTIFICATE-----");
      await expect(
        probePinnedCertificate(`https://127.0.0.1:${address.port}`, "00".repeat(32)),
      ).rejects.toThrow("does not match the fingerprint");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("requires a valid certificate fingerprint for HTTPS pairing", () => {
    expect(() => pairingEndpoint("https://localhost:49152/#token=token")).toThrow(
      "missing its certificate fingerprint",
    );
    expect(
      pairingEndpoint(`https://localhost:49152/#token=token&fp=sha256:${material.fingerprint}`),
    ).toMatchObject({
      endpoint: "https://localhost:49152",
      credential: "token",
      certFingerprint: material.fingerprint,
    });
  });
});
