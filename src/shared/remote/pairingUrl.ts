/**
 * The pairing-link wire format shared by the desktop (QR encoder), the mobile
 * PWA (QR scanner / paste), and the renderer settings UI: the desktop endpoint
 * rides in a `?host=…` query param when the link points at a hosted pairing
 * app, and the credential rides in the `#token=…` fragment so it never reaches
 * the pairing app's server logs.
 */

export function buildPairingUrl(input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
  readonly pairingAppUrl?: string;
}): string {
  const pairingUrl = new URL("/pair", input.pairingAppUrl ?? input.httpBaseUrl);
  if (input.pairingAppUrl) {
    pairingUrl.searchParams.set("host", input.httpBaseUrl);
  }
  pairingUrl.hash = new URLSearchParams([["token", input.credential]]).toString();
  return pairingUrl.toString();
}

export interface PairingUrlParts {
  readonly token: string;
  readonly host: string | null;
  readonly url: URL;
}

/** Returns null for any URL that doesn't carry a `#token=…` credential. */
export function parsePairingUrlParts(value: string): PairingUrlParts | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
  if (!token || token.trim().length === 0) return null;
  return { token, host: url.searchParams.get("host"), url };
}
