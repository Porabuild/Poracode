import { parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import { isNativeApp } from "./pwaInstall";

export interface PairingLaunch {
  readonly endpoint: string;
  readonly credential: string | null;
}

const VITE_DEV_SERVER_PORT = "3100";
const DEFAULT_REMOTE_ACCESS_PORT = "49152";

function normalizeEndpoint(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts.at(-1);
  if (last === "pair" || last === "app" || last === "mobile.html") {
    parts.pop();
  }
  url.pathname = parts.length > 0 ? `/${parts.join("/")}/` : "/";
  return url.toString();
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

/** Non-throwing wrapper: a crafted/malformed `host` (e.g. `http://[`) makes
 * `new URL` throw, which would otherwise propagate out of the boot-time
 * capture and white-screen the pairing UI. Returns "" for anything invalid. */
function safeNormalizePairingEndpoint(value: string): string {
  try {
    return normalizePairingEndpoint(value);
  } catch {
    return "";
  }
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
  const host = query.get("host");
  captured = {
    endpoint: host
      ? safeNormalizePairingEndpoint(host)
      : isNativeApp()
        ? ""
        : safeNormalizePairingEndpoint(location.origin),
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

const launchListeners = new Set<() => void>();

function emitPairingLaunchChange(): void {
  for (const listener of launchListeners) listener();
}

/** Subscribe to pairing-launch changes (for `useSyncExternalStore`). Fires when
 * a native deep link supplies a new offer via {@link setPairingLaunch}. */
export function subscribePairingLaunch(listener: () => void): () => void {
  launchListeners.add(listener);
  return () => {
    launchListeners.delete(listener);
  };
}

/**
 * Feed a pairing offer from a native deep link into the same captured-launch
 * slot the PWA boot path uses, so the pairing screen surfaces it for the user
 * to CONFIRM — rather than pairing silently (a tapped attacker link must not
 * bind the device to an arbitrary endpoint without consent). Notifies
 * subscribers so an already-mounted pairing screen re-prefills.
 */
export function setPairingLaunch(launch: PairingLaunch): void {
  captured = launch;
  emitPairingLaunchChange();
}

/**
 * Consume any pending launch/deep-link pairing credential after it has been
 * accepted. The next read re-captures from the current app URL, which has
 * already had the original credential stripped (PWA boot) or never carried it
 * (native app-link handoff), so the old token cannot reopen the pairing drawer.
 */
export function clearPairingLaunch(): void {
  captured = null;
  emitPairingLaunchChange();
}

/**
 * Parse a pairing URL scanned by the in-app QR scanner (or pasted by hand) —
 * the same `?host=…#token=…` shape the desktop encodes into its QR. The
 * endpoint comes from the `host` query param when the link points at a hosted
 * pairing app, otherwise from the link's own origin. Returns null for any URL
 * that doesn't carry a `#token=…` credential (i.e. not a pairing link).
 */
export function parsePairingUrl(value: string): PairingLaunch | null {
  const parts = parsePairingUrlParts(value);
  if (!parts) return null;
  try {
    return {
      endpoint: normalizePairingEndpoint(parts.host ?? parts.url.toString()),
      credential: parts.token,
    };
  } catch {
    return null;
  }
}

/**
 * A page served over https cannot open http connections to a LAN address
 * (mixed content is blocked by the browser). This is the common failure when
 * the PWA is hosted (e.g. on Vercel) but the desktop only exposes plain http
 * on the LAN. Loopback is exempt — browsers treat it as a secure context.
 * The native shells are exempt too: they serve the bundle from an https/app
 * scheme origin but allow cleartext LAN traffic themselves (Android
 * `cleartext`/`allowMixedContent`, iOS ATS exceptions).
 */
export function isMixedContentEndpoint(
  endpoint: string,
  location: Location = window.location,
): boolean {
  if (isNativeApp()) return false;
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
    if (url.pathname.endsWith("/pair")) {
      url.pathname = `${url.pathname.slice(0, -"/pair".length)}/app`;
    } else if (!url.pathname.endsWith("/app")) {
      const basePath = import.meta.env.BASE_URL;
      url.pathname = basePath.startsWith("/") ? `${basePath}app` : "/app";
    }
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}
