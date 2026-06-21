import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { ServerResponse } from "node:http";

const MOBILE_HTML_FILE = "mobile.html";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const RENDERER_DIST_DIR = resolve(__dirname, "../renderer");

export function tryServeBuiltMobileApp(pathname: string, res: ServerResponse): boolean {
  if (pathname === "/pair" || pathname === "/app") {
    return streamFile(join(RENDERER_DIST_DIR, MOBILE_HTML_FILE), res);
  }

  // Built static asset directories (Vite hashes app code into /assets; the
  // PWA icon set is copied verbatim from public/ into /icons).
  if (pathname.startsWith("/assets/") || pathname.startsWith("/icons/")) {
    return streamFile(join(RENDERER_DIST_DIR, pathname), res);
  }

  return false;
}

function streamFile(filePath: string, res: ServerResponse): boolean {
  const root = `${normalize(RENDERER_DIST_DIR)}${sep}`;
  const normalized = normalize(filePath);
  if (!normalized.startsWith(root) || !existsSync(normalized)) {
    return false;
  }
  const stat = statSync(normalized);
  if (!stat.isFile()) {
    return false;
  }
  res.writeHead(200, {
    "content-type": CONTENT_TYPES[extname(normalized)] ?? "application/octet-stream",
    "content-length": stat.size,
  });
  createReadStream(normalized).pipe(res);
  return true;
}
