import { createHash, createPrivateKey, X509Certificate } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateSelfSignedTlsMaterial,
  loadRemoteAccessTlsMaterial,
  tlsCertificateFingerprint,
} from "./tlsMaterial";

const tempDirs: string[] = [];
const envStack: Array<NodeJS.ProcessEnv> = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  // Every TLS env override in this suite goes through withEnv.
  while (envStack.length > 0) {
    const previous = envStack.pop()!;
    process.env.PORACODE_REMOTE_TLS_CERT = previous.PORACODE_REMOTE_TLS_CERT;
    process.env.PORACODE_REMOTE_TLS_KEY = previous.PORACODE_REMOTE_TLS_KEY;
  }
});

function withEnv(certPath: string | undefined, keyPath: string | undefined): void {
  envStack.push({
    PORACODE_REMOTE_TLS_CERT: process.env.PORACODE_REMOTE_TLS_CERT,
    PORACODE_REMOTE_TLS_KEY: process.env.PORACODE_REMOTE_TLS_KEY,
  });
  if (certPath === undefined) delete process.env.PORACODE_REMOTE_TLS_CERT;
  else process.env.PORACODE_REMOTE_TLS_CERT = certPath;
  if (keyPath === undefined) delete process.env.PORACODE_REMOTE_TLS_KEY;
  else process.env.PORACODE_REMOTE_TLS_KEY = keyPath;
}

describe("generateSelfSignedTlsMaterial (Gate 6 item 4.2)", () => {
  it("mints a parsable self-signed certificate whose key matches and fingerprint is the DER sha256", () => {
    const material = generateSelfSignedTlsMaterial({ commonName: "test-host" });

    const certificate = new X509Certificate(material.cert);
    expect(certificate.subject.split("\n").join(" ")).toContain("CN=test-host");
    expect(certificate.issuer).toBe(certificate.subject); // self-signed
    expect(certificate.checkPrivateKey(createPrivateKey(material.key))).toBe(true);

    // SANs always answer loopback, plus the requested name.
    expect(certificate.subjectAltName).toContain("DNS:localhost");
    expect(certificate.subjectAltName).toContain("DNS:test-host");
    expect(certificate.subjectAltName).toContain("IP Address:127.0.0.1");
    // Node renders the ::1 SAN in expanded form.
    expect(certificate.subjectAltName).toContain("IP Address:0:0:0:0:0:0:0:1");

    expect(material.fingerprint).toBe(createHash("sha256").update(certificate.raw).digest("hex"));
    expect(material.fingerprint).toBe(tlsCertificateFingerprint(material.cert));
    expect(material.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("honors extra SANs and the validity window", () => {
    const now = new Date("2026-09-18T00:00:00.000Z");
    const material = generateSelfSignedTlsMaterial({
      commonName: "host-1",
      dnsNames: ["host-1.tailnet.ts.net"],
      ipAddresses: ["192.168.1.20"],
      validityDays: 365,
      now,
    });

    const certificate = new X509Certificate(material.cert);
    expect(certificate.subjectAltName).toContain("DNS:host-1.tailnet.ts.net");
    expect(certificate.subjectAltName).toContain("IP Address:192.168.1.20");
    expect(new Date(certificate.validFrom).getTime()).toBeLessThanOrEqual(now.getTime());
    expect(new Date(certificate.validTo).toISOString()).toBe(
      new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(material.expiresAt).toBe(new Date(certificate.validTo).toISOString());
  });

  it("generates a fresh key and serial every call", () => {
    const first = generateSelfSignedTlsMaterial();
    const second = generateSelfSignedTlsMaterial();
    expect(first.key).not.toBe(second.key);
    expect(first.cert).not.toBe(second.cert);
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });
});

describe("loadRemoteAccessTlsMaterial (Gate 6 item 4.2)", () => {
  it("resolves to null (plaintext) when nothing is configured", () => {
    withEnv(undefined, undefined);
    expect(loadRemoteAccessTlsMaterial()).toBeNull();
  });

  it("refuses a partial configuration loudly instead of downgrading to plaintext", () => {
    withEnv("/tmp/only-cert.pem", undefined);
    expect(() => loadRemoteAccessTlsMaterial()).toThrow(/PORACODE_REMOTE_TLS_KEY/);
    expect(() => loadRemoteAccessTlsMaterial()).toThrow(/Refusing to start plaintext/);

    withEnv(undefined, "/tmp/only-key.pem");
    expect(() => loadRemoteAccessTlsMaterial()).toThrow(/PORACODE_REMOTE_TLS_CERT/);
  });

  it("names the missing file when a path does not exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "lc-tls-missing-"));
    tempDirs.push(dir);
    const keyPath = join(dir, "key.pem");
    writeFileSync(keyPath, "not-empty");
    withEnv(join(dir, "cert.pem"), keyPath);
    expect(() => loadRemoteAccessTlsMaterial()).toThrow(/PORACODE_REMOTE_TLS_CERT.*missing/);
  });

  it("refuses an unparsable certificate", () => {
    const dir = mkdtempSync(join(tmpdir(), "lc-tls-garbage-"));
    tempDirs.push(dir);
    const certPath = join(dir, "cert.pem");
    const keyPath = join(dir, "key.pem");
    writeFileSync(certPath, "-----BEGIN CERTIFICATE-----\ngarbage\n-----END CERTIFICATE-----\n");
    writeFileSync(keyPath, "-----BEGIN PRIVATE KEY-----\ngarbage\n-----END PRIVATE KEY-----\n");
    withEnv(certPath, keyPath);
    expect(() => loadRemoteAccessTlsMaterial()).toThrow(/not a parsable PEM certificate/);
  });

  it("round-trips generated material through the loader with the same fingerprint", () => {
    const dir = mkdtempSync(join(tmpdir(), "lc-tls-roundtrip-"));
    tempDirs.push(dir);
    const generated = generateSelfSignedTlsMaterial({ commonName: "roundtrip" });
    const certPath = join(dir, "cert.pem");
    const keyPath = join(dir, "key.pem");
    writeFileSync(certPath, generated.cert);
    writeFileSync(keyPath, generated.key);
    withEnv(certPath, keyPath);

    const loaded = loadRemoteAccessTlsMaterial();
    expect(loaded).not.toBeNull();
    expect(loaded!.fingerprint).toBe(generated.fingerprint);
    expect(loaded!.certPath).toBe(certPath);
    expect(loaded!.keyPath).toBe(keyPath);
    expect(loaded!.cert).toBe(generated.cert);
    expect(loaded!.key).toBe(generated.key);
  });
});
