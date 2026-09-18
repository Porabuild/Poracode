/**
 * The pairing-link wire format shared by the desktop (QR encoder), the mobile
 * PWA (QR scanner / paste), and the renderer settings UI: the desktop endpoint
 * rides in a `?host=…` query param when the link points at a hosted pairing
 * app, and the credential rides in the `#token=…` fragment so it never reaches
 * the pairing app's server logs.
 */

import { isLoopbackHostname } from "../http";

/**
 * An `http:` endpoint on a non-loopback host. Loopback is excluded because
 * browsers treat it as a secure context, so a page served over https may still
 * talk to it.
 */
export function isCleartextLanUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && !isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

export function buildPairingUrl(input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
  readonly pairingAppUrl?: string;
}): string {
  const pairingUrl = new URL("/", input.pairingAppUrl ?? input.httpBaseUrl);
  if (input.pairingAppUrl) {
    pairingUrl.searchParams.set("host", input.httpBaseUrl);
  }
  pairingUrl.hash = new URLSearchParams([["token", input.credential]]).toString();
  return pairingUrl.toString();
}

export function buildDesktopPairingUrl(input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
}): string {
  const url = new URL("/", input.httpBaseUrl);
  url.hash = new URLSearchParams([["token", input.credential]]).toString();
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
 * the link opens through a hosted pairing app or directly on the desktop. */
export function retargetPairingUrl(value: string, httpBaseUrl: string): string {
  const parts = parsePairingUrlParts(value);
  if (!parts) return value;
  if (parts.host !== null) {
    parts.url.searchParams.set("host", httpBaseUrl);
    return parts.url.toString();
  }
  return buildPairingUrl({ httpBaseUrl, credential: parts.token });
}
