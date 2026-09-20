/**
 * The pairing-link wire format shared by the desktop (QR encoder), the mobile
 * PWA (QR scanner / paste), and the renderer settings UI: the desktop endpoint
 * rides in a `?host=…` query param when the link points at a hosted pairing
 * app, and the credential rides in the `#token=…` fragment so it never reaches
 * the pairing app's server logs.
 *
 * Gate 6 item 4.2 (TLS): when the host serves HTTPS with its own certificate,
 * the pairing link also carries `#fp=sha256:<hex>` — the SHA-256 fingerprint of
 * the leaf certificate — so a scanning client can pin (TOFU) the exact server it
 * paired with and refuse a later mismatch. The `fp` parameter is ADDITIVE and
 * desktop-reference-only for now (the shared cross-platform fixture still pins
 * the token/host parse, which is unchanged); natives that ignore it keep
 * pairing exactly as before.
 */

import { isCleartextLanEndpoint } from "./contract/pairingMachine";

/** Prefix of the certificate fingerprint carried by the pairing fragment. */
export const PAIRING_CERT_FINGERPRINT_PREFIX = "sha256:";
const CERT_FINGERPRINT_HEX = /^[0-9a-f]{64}$/;

/** Builds the `#fp=…` fragment value for a certificate fingerprint. Accepts
 * either the bare 64-hex digest or an already-prefixed `sha256:<hex>` value
 * (so parsed assertions round-trip through builders unchanged) and normalizes
 * to lowercase. */
export function formatCertFingerprint(sha256Hex: string): string {
  const normalized = sha256Hex.trim().toLowerCase();
  const bare = normalized.startsWith(PAIRING_CERT_FINGERPRINT_PREFIX)
    ? normalized.slice(PAIRING_CERT_FINGERPRINT_PREFIX.length)
    : normalized;
  if (!CERT_FINGERPRINT_HEX.test(bare)) {
    throw new Error("A certificate fingerprint must be 64 lowercase hex characters.");
  }
  return `${PAIRING_CERT_FINGERPRINT_PREFIX}${bare}`;
}

/**
 * Extracts `sha256:<hex>` from a pairing link's fragment (desktop reference).
 * Returns null when absent or malformed — never throws, so a corrupted QR code
 * degrades to "no fingerprint asserted" rather than breaking pairing.
 */
export function parsePairingCertFingerprint(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const raw = new URLSearchParams(url.hash.replace(/^#/, "")).get("fp");
  if (!raw) return null;
  if (!raw.startsWith(PAIRING_CERT_FINGERPRINT_PREFIX)) return null;
  const hex = raw.slice(PAIRING_CERT_FINGERPRINT_PREFIX.length).toLowerCase();
  return CERT_FINGERPRINT_HEX.test(hex) ? hex : null;
}

/**
 * An `http:` endpoint on a non-loopback host. Loopback is excluded because
 * browsers treat it as a secure context, so a page served over https may still
 * talk to it.
 */
export function isCleartextLanUrl(value: string): boolean {
  // Deep-review dedup: the pairing machine spec executor owns this
  // classification; this alias keeps the historical export for any external
  // caller without a second copy of the rule.
  return isCleartextLanEndpoint(value);
}

export function buildPairingUrl(input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
  readonly pairingAppUrl?: string;
  /** Gate 6 item 4.2: leaf-certificate fingerprint (`sha256:<hex>`) for TLS hosts. */
  readonly certFingerprint?: string;
}): string {
  const pairingUrl = new URL("/", input.pairingAppUrl ?? input.httpBaseUrl);
  if (input.pairingAppUrl) {
    pairingUrl.searchParams.set("host", input.httpBaseUrl);
  }
  const fragment = new URLSearchParams([["token", input.credential]]);
  if (input.certFingerprint) {
    fragment.set("fp", formatCertFingerprint(input.certFingerprint));
  }
  pairingUrl.hash = fragment.toString();
  return pairingUrl.toString();
}

export function buildDesktopPairingUrl(input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
  readonly certFingerprint?: string;
}): string {
  const url = new URL("/", input.httpBaseUrl);
  const fragment = new URLSearchParams([["token", input.credential]]);
  if (input.certFingerprint) {
    fragment.set("fp", formatCertFingerprint(input.certFingerprint));
  }
  url.hash = fragment.toString();
  return url.toString();
}

const VITE_DEV_SERVER_PORT = "3100";
const DEFAULT_REMOTE_ACCESS_PORT = "49152";

function normalizeEndpoint(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts.at(-1);
  if (
    last === "pair" ||
    last === "app" ||
    last === "desktop" ||
    last === "mobile.html" ||
    last === "index.html"
  ) {
    parts.pop();
  }
  url.pathname = parts.length > 0 ? `/${parts.join("/")}/` : "/";
  return url.toString().replace(/\/$/, "");
}

export function normalizePairingEndpoint(value: string): string {
  const url = new URL(value.trim());
  const hostParam = url.searchParams.get("host");
  if (hostParam) return normalizeEndpoint(hostParam);

  if (url.port === VITE_DEV_SERVER_PORT) {
    url.port = DEFAULT_REMOTE_ACCESS_PORT;
  }
  return normalizeEndpoint(url.toString());
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

/** Reuses a pairing credential with another endpoint while preserving whether
 * the link opens through a hosted pairing app or directly on the desktop (and
 * any asserted TLS certificate fingerprint). */
export function retargetPairingUrl(value: string, httpBaseUrl: string): string {
  const parts = parsePairingUrlParts(value);
  if (!parts) return value;
  const certFingerprint = parsePairingCertFingerprint(value);
  if (parts.host !== null) {
    parts.url.searchParams.set("host", httpBaseUrl);
    return parts.url.toString();
  }
  return buildPairingUrl({
    httpBaseUrl,
    credential: parts.token,
    ...(certFingerprint ? { certFingerprint } : {}),
  });
}
