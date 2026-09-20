import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { ServerResponse } from "node:http";

const CLIENT_HTML_FILE = "index.html";

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

export function builtClientHtmlFile(pathname: string): string | null {
  return pathname === "/" || pathname === "/index.html" ? CLIENT_HTML_FILE : null;
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

export function isBuiltClientAssetPath(pathname: string): boolean {
  return pathname.startsWith("/assets/") || pathname.startsWith("/icons/");
}

export function tryServeBuiltClientApp(pathname: string, res: ServerResponse): boolean {
  const htmlFile = builtClientHtmlFile(pathname);
  if (htmlFile) return streamFile(join(RENDERER_DIST_DIR, htmlFile), res);

  // Built static asset directories (Vite hashes app code into /assets; the
  // PWA icon set is copied verbatim from public/ into /icons).
  if (isBuiltClientAssetPath(pathname)) {
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
  const stream = createReadStream(normalized);
  stream.on("error", () => {
    stream.destroy();
    if (res.headersSent) {
      res.destroy();
    } else {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
    }
  });
  res.writeHead(200, {
    "content-type": CONTENT_TYPES[extname(normalized)] ?? "application/octet-stream",
    "content-length": stat.size,
  });
  stream.pipe(res);
  return true;
}
