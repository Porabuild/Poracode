import { RemoteClientError } from "./clientErrors";
import type { RemoteCertFingerprintProbe, RemoteDesktopClientOptions } from "./clientTypes";
import { endpointUrl } from "./clientTypes";

export class RemoteClientPinCore {
  /** The pin this client enforces on every request (adopted at first pair). */
  protected pinnedCertFingerprint: string | undefined;
  protected readonly certFingerprintProbe: RemoteCertFingerprintProbe | undefined;
  protected readonly onCertFingerprintValidated: ((fingerprint: string) => void) | undefined;
  /** Memoized one-shot probe, so one client instance asks the transport once. */
  protected certFingerprintVerification: Promise<string | null> | undefined;

  constructor(
    readonly endpoint: string,
    pin: Pick<
      RemoteDesktopClientOptions,
      "certFingerprint" | "certFingerprintProbe" | "onCertFingerprintValidated"
    > = {},
  ) {
    this.pinnedCertFingerprint = pin.certFingerprint?.toLowerCase();
    this.certFingerprintProbe = pin.certFingerprintProbe;
    this.onCertFingerprintValidated = pin.onCertFingerprintValidated;
  }

  /** Sets (or clears) the pinned server certificate fingerprint after
   * construction — same contract as the `certFingerprint` option. */
  setCertFingerprintPin(fingerprint: string | undefined): void {
    this.pinnedCertFingerprint = fingerprint?.toLowerCase();
  }

  /**
   * Gate 6 item 4.2: refuses a pairing whose QR-asserted fingerprint contradicts
   * what this client can verify (probed server certificate, else the stored
   * pin). Returns silently when there is no QR assertion or nothing to check
   * it against.
   */
  protected async refuseCertFingerprintMismatch(claimed: string | undefined): Promise<void> {
    if (!claimed) return;
    const probed = await this.probeCertFingerprint();
    const reference = this.pinnedCertFingerprint ?? probed;
    if (reference && reference.toLowerCase() !== claimed.toLowerCase()) {
      throw new RemoteClientError(
        "The pairing link's certificate fingerprint does not match the server's TLS certificate. The link may be cloned, or the server certificate changed — re-generate the pairing QR on the desktop.",
        502,
        "certificate_fingerprint_mismatch",
      );
    }
  }

  private probeCertFingerprintVerification(): Promise<string | null> {
    this.certFingerprintVerification ??= (async () => {
      try {
        return await this.certFingerprintProbe!(endpointUrl(this.endpoint, "/"));
      } catch {
        return null;
      }
    })();
    return this.certFingerprintVerification;
  }

  protected probeCertFingerprint(): Promise<string | null> {
    if (!this.certFingerprintProbe) return Promise.resolve(null);
    return this.probeCertFingerprintVerification();
  }
}

/** Shared transport-independent certificate mismatch surfaced by native TLS paths. */
export function remoteCertificateMismatchError(): RemoteClientError {
  return new RemoteClientError(
    "The server's TLS certificate no longer matches the fingerprint pinned at pairing. Re-pair the device from the desktop's Remote Access panel.",
    502,
    "certificate_fingerprint_mismatch",
  );
}
