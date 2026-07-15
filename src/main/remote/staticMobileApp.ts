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
  if (pathname === "/pair" || pathname === "/app" || pathname.startsWith("/app/")) {
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
  const stream = createReadStream(normalized);
  // A read error after statSync (file deleted / permissions / IO race) would
  // otherwise emit an unhandled 'error' that crashes the headless server or
  // hangs the response. Attach the handler before piping. If the error fires
  // before headers are sent we can still return a clean 500; once headers are
  // out we can only tear the socket down so the client sees a truncated body
  // instead of a hung request. Either way, destroy the stream to release its fd.
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
