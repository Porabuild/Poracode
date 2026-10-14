import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { assertWithin } from "./smoke-runtime-files.mjs";

const [root, rawPort] = process.argv.slice(2);
const port = Number(rawPort);
if (!root || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Usage: serve-smoke-renderer.mjs <renderer-dir> <port>");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};
const server = createServer((request, response) => {
  void (async () => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    assertWithin(root, file);
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
      "content-length": info.size,
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else
      createReadStream(file)
        .on("error", () => response.destroy())
        .pipe(response);
  })().catch(() => {
    if (!response.headersSent) response.writeHead(404).end();
    else response.destroy();
  });
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Frozen development renderer listening on ${port}`),
);
