import type { IncomingMessage } from "node:http";
import { extname, resolve } from "node:path";

/**
 * The canonical web client bundled into the standalone install layout (plan D2).
 *
 * `renderer/` is an additive, optional member of the install layout: it sits
 * beside the running server bundle's parent — `<prefix>/renderer` for the
 * published install prefix, `dist/renderer` inside a repository checkout. The
 * build copies the canonical web build there (`scripts/assemble-server-tarball.mjs`),
 * so the router can serve the real app instead of shadowing it with the
 * pairing-page artifacts.
 *
 * Its absence is the explicit API-only deployment: the pairing page stays the
 * entry, and every bundled path either falls back to the pairing artifact
 * where one exists or answers a truthful 404.
 */
export function resolveBundledWebClientDir(): string {
  return resolve(__dirname, "../renderer");
}

/**
 * Root files the canonical web build emits that the PWA shell loads directly.
 * Kept in sync with the pairing service worker's static whitelist
 * (`pairingPage.ts`) and the hosted-PWA headers in `vercel.json`.
 */
const BUNDLED_ROOT_FILES: ReadonlySet<string> = new Set([
  "app-icon-nightly.svg",
  "app-icon.svg",
  "manifest.webmanifest",
  "notification.mp3",
  "robots.txt",
  "service-worker.js",
]);

/** Hashed build output and the verbatim icon set copied from `public/`. */
const BUNDLED_ASSET_DIRECTORIES: readonly string[] = ["assets", "icons"];

/**
 * The browser SSH runtime embedded by `finalize-web-build.mjs`. Exactly the
 * two files the Vite dev middleware serves (`vite.config.ts`), so the served
 * surface cannot grow without an explicit change here.
 */
const SSH_RUNTIME_DIRECTORY = "poracode-ssh-runtime";
const BUNDLED_SSH_RUNTIME_FILES: ReadonlySet<string> = new Set(["manifest.json", "runtime.bin"]);

/** API/auth namespaces the SPA fallback must never answer for. */
const RESERVED_ROUTE_SEGMENTS: readonly string[] = ["api", "oauth", ".well-known", "forward"];

export function bundledWebClientDocumentPath(pathname: string): string | null {
  return pathname === "/" || pathname === "/index.html" ? "index.html" : null;
}

/**
 * Resolves a request pathname to the bundled file it may serve, or null when
 * the path is not part of the explicit web-client allowlist. Returning null
 * keeps every other path (API namespaces and arbitrary files alike) outside
 * the static surface, so a missing file can only ever be a 404.
 */
export function bundledWebClientAssetPath(pathname: string): string | null {
  const relative = pathname.startsWith("/") ? pathname.slice(1) : "";
  if (relative === "" || relative.includes("\\") || relative.includes("\0")) return null;
  if (BUNDLED_ROOT_FILES.has(relative)) return relative;
  for (const directory of BUNDLED_ASSET_DIRECTORIES) {
    const prefix = `${directory}/`;
    if (relative.startsWith(prefix) && relative.length > prefix.length) return relative;
  }
  const sshPrefix = `${SSH_RUNTIME_DIRECTORY}/`;
  if (
    relative.startsWith(sshPrefix) &&
    BUNDLED_SSH_RUNTIME_FILES.has(relative.slice(sshPrefix.length))
  ) {
    return relative;
  }
  return null;
}

export function isLegacyClientPath(pathname: string): boolean {
  return (
    pathname === "/mobile.html" ||
    pathname === "/pair" ||
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/desktop" ||
    pathname.startsWith("/desktop/")
  );
}

/**
 * Whether an unmatched request is a client-side navigation that should get the
 * bundled app shell (deep-link refresh, including push-notification
 * navigations). Programmatic/API traffic, static namespaces (a missing asset is
 * a truthful 404, never an HTML shell), paths that look like file requests,
 * legacy redirect entries and reserved namespaces are excluded, so the
 * fallback can never swallow an API error, an auth flow or an arbitrary file
 * request.
 */
export function isSpaNavigationRequest(req: IncomingMessage, pathname: string): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const accept = req.headers.accept;
  const acceptsHtml = Array.isArray(accept) ? accept.join(",") : (accept ?? "");
  if (!acceptsHtml.includes("text/html")) return false;
  if (pathname === "/ws" || extname(pathname) !== "") return false;
  if (isLegacyClientPath(pathname)) return false;
  if (bundledWebClientAssetPath(pathname) !== null) return false;
  const firstSegment = pathname.startsWith("/") ? (pathname.slice(1).split("/", 1)[0] ?? "") : "";
  return !RESERVED_ROUTE_SEGMENTS.includes(firstSegment);
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".bin": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function bundledWebClientContentType(relativePath: string): string {
  return CONTENT_TYPES[extname(relativePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Cache policy mirrors the hosted PWA (`vercel.json`): hashed build output is
 * immutable, icons cache for a week, and the service worker is never stored so
 * an upgrade takes effect on the next navigation. Everything else — the app
 * document, manifest, root files and the embedded SSH runtime — revalidates, so
 * a server upgrade cannot strand a stale shell.
 */
export function bundledWebClientCacheControl(relativePath: string): string {
  if (relativePath.startsWith("assets/")) return "public, max-age=31536000, immutable";
  if (relativePath.startsWith("icons/")) return "public, max-age=604800";
  if (relativePath === "service-worker.js") return "no-cache, no-store, must-revalidate";
  return "no-cache";
}
