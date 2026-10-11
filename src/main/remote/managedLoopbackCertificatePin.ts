import { parsePairingCertFingerprint } from "@/shared/remote/pairingUrl";
import { isLoopbackCertificateHostname } from "./loopbackCertificatePin";
import { registerRemoteCertificatePin, removeRemoteCertificatePin } from "./remoteCertificatePins";

/**
 * Electron-main authority for the managed loopback hop's TLS trust.
 *
 * The backend child mints the renderer attach bootstrap (endpoint + one-time
 * pairing URL) and puts the LOOPBACK server's leaf fingerprint in the pairing
 * URL fragment (`#fp=sha256:…`, the same evidence mobile pairing consumes).
 * Main installs that evidence here as a per-session, EXACT-ORIGIN
 * (`https://127.0.0.1:<port>`) certificate pin before handing the bootstrap to
 * the renderer: the native `certificate-error` handler accepts only the pinned
 * origin+leaf and keeps Chromium's default verdict path for everything else.
 *
 * Pins are lifecycle-bound: every bootstrap answer refreshes or replaces the
 * session's managed pin, a changed endpoint drops the previous origin, and a
 * null bootstrap (stopping/disposed server) clears it. The pin is never a
 * host-wide loopback bypass, and a swapped certificate fails closed.
 */
const managedOrigins = new WeakMap<object, string>();

/** Exact HTTPS origin of a loopback bootstrap endpoint, or null when it cannot
 * be a managed TLS listener (non-loopback, cleartext, or malformed). */
function managedEndpointOrigin(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return null;
    if (!isLoopbackCertificateHostname(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Installs (or clears) the session's managed loopback certificate pin from one
 * authenticated backend bootstrap answer. Returns the pinned origin, if any.
 */
export function installManagedLoopbackCertificatePin(
  session: object,
  bootstrap: { readonly endpoint: string; readonly pairingUrl: string } | null,
): string | null {
  const previous = managedOrigins.get(session);
  const origin = bootstrap ? managedEndpointOrigin(bootstrap.endpoint) : null;
  const fingerprint = bootstrap ? parsePairingCertFingerprint(bootstrap.pairingUrl) : null;
  if (!origin || !fingerprint) {
    if (previous !== undefined) {
      removeRemoteCertificatePin(session, previous);
      managedOrigins.delete(session);
    }
    return null;
  }
  registerRemoteCertificatePin(session, origin, fingerprint);
  if (previous !== undefined && previous !== origin) {
    removeRemoteCertificatePin(session, previous);
  }
  managedOrigins.set(session, origin);
  return origin;
}
