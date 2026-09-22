import { recordChromiumCertificateVerdict } from "./remoteCertificatePins";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackCertificateHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Installs the session's certificate verify proc: Chromium's chain verdict is
 * remembered (hostname-aware) and every handshake is handed back as a
 * certificate error, so nothing is ever cached as trusted. The app-level
 * `certificate-error` handler then makes the exact-origin decision against the
 * session's installed pins (managed loopback bootstrap, remote HTTP bridge).
 */
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
