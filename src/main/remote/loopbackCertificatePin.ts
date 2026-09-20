import { recordChromiumCertificateVerdict } from "./remoteCertificatePins";
import { tlsCertificateFingerprint } from "@/host/remote/server/tlsMaterial";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Chromium verification callback codes used by `session.setCertificateVerifyProc`.
 * 0 accepts, -2 rejects, -3 uses Chromium's built-in result.
 */
export const CERTIFICATE_VERIFY_OK = 0;
export const CERTIFICATE_VERIFY_FAIL = -2;
export const CERTIFICATE_VERIFY_CHROMIUM = -3;

let pinnedFingerprint: string | null = null;

/** SHA-256 leaf pin (lowercase hex, no separators) for the managed loopback hop. */
export function setManagedLoopbackCertificatePin(fingerprint: string | null): void {
  pinnedFingerprint = fingerprint ? fingerprint.toLowerCase() : null;
}

export function readManagedLoopbackCertificatePin(): string | null {
  return pinnedFingerprint;
}

export function isLoopbackCertificateHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export function normalizeCertificateFingerprint(value: string): string {
  return value.replaceAll(":", "").toLowerCase();
}

/**
 * Trust decision for one TLS handshake (V6 B.3). Loopback hosts matching the
 * pinned leaf are accepted so the managed renderer can use HTTPS; every other
 * host keeps Chromium's default (self-signed LAN/internet stays refused).
 */
export function decideLoopbackCertificateTrust(input: {
  readonly hostname: string;
  readonly certificatePem: string;
  readonly pinnedFingerprint: string | null;
}):
  | typeof CERTIFICATE_VERIFY_OK
  | typeof CERTIFICATE_VERIFY_FAIL
  | typeof CERTIFICATE_VERIFY_CHROMIUM {
  if (!input.pinnedFingerprint || !isLoopbackCertificateHostname(input.hostname)) {
    return CERTIFICATE_VERIFY_CHROMIUM;
  }
  let presented: string;
  try {
    presented = tlsCertificateFingerprint(input.certificatePem);
  } catch {
    return CERTIFICATE_VERIFY_FAIL;
  }
  if (presented === normalizeCertificateFingerprint(input.pinnedFingerprint)) {
    return CERTIFICATE_VERIFY_OK;
  }
  return CERTIFICATE_VERIFY_FAIL;
}

export function installLoopbackCertificatePin(session: {
  setCertificateVerifyProc(
    proc:
      | ((
          request: { hostname: string; certificate: { data: string }; errorCode?: number },
          callback: (verificationResult: number) => void,
        ) => void)
      | null,
  ): void;
}): void {
  session.setCertificateVerifyProc((request, callback) => {
    recordChromiumCertificateVerdict(
      session,
      request.hostname,
      request.certificate.data,
      request.errorCode === 0,
    );
    // Never cache a success: pins can change after this handshake. The
    // certificate-error handler has the URL (including port), unlike this hook.
    callback(-202);
  });
}
