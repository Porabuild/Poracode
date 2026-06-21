export interface PairingLaunch {
  readonly endpoint: string;
  readonly credential: string | null;
}

function normalizeEndpoint(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.pathname = "/";
  return url.toString();
}

let captured: PairingLaunch | null = null;

/**
 * Snapshot the pairing launch parameters (`?host=…#token=…`) exactly once, at
 * boot, BEFORE the hash-history router initializes. When a credential is
 * present the pairing params are stripped from the URL so the router starts on
 * a clean hash rather than trying to route `#token=…`. Idempotent: later calls
 * return the same snapshot, so the bridge/session read consistent values even
 * after the router takes ownership of the URL hash.
 */
export function capturePairingLaunch(location: Location = window.location): PairingLaunch {
  if (captured) return captured;
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  captured = {
    endpoint: normalizeEndpoint(query.get("host") ?? location.origin),
    credential: hash.get("token"),
  };
  if (captured.credential) {
    window.history.replaceState(null, "", appUrlWithoutPairing(location));
  }
  return captured;
}

export function parsePairingLaunch(): PairingLaunch {
  return captured ?? capturePairingLaunch();
}

/**
 * Parse a pairing URL scanned by the in-app QR scanner (or pasted by hand) —
 * the same `?host=…#token=…` shape the desktop encodes into its QR. The
 * endpoint comes from the `host` query param when the link points at a hosted
 * pairing app, otherwise from the link's own origin. Returns null for any URL
 * that doesn't carry a `#token=…` credential (i.e. not a pairing link).
 */
export function parsePairingUrl(value: string): PairingLaunch | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const credential = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
  if (!credential) return null;
  const host = url.searchParams.get("host");
  try {
    return { endpoint: normalizeEndpoint(host ?? url.origin), credential };
  } catch {
    return null;
  }
}

/**
 * A page served over https cannot open http connections to a LAN address
 * (mixed content is blocked by the browser). This is the common failure when
 * the PWA is hosted (e.g. on Vercel) but the desktop only exposes plain http
 * on the LAN. Loopback is exempt — browsers treat it as a secure context.
 */
export function isMixedContentEndpoint(
  endpoint: string,
  location: Location = window.location,
): boolean {
  if (location.protocol !== "https:") return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:") return false;
    const host = url.hostname;
    return !(
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export function appUrlWithoutPairing(location: Location = window.location): string {
  const url = new URL(location.href);
  // On the Vite dev server the app lives at /mobile.html; only the desktop
  // server serves it at /app.
  if (!url.pathname.endsWith("/mobile.html")) {
    url.pathname = "/app";
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}
