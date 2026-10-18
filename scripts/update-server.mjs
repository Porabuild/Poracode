/**
 * Local update server for testing electron-updater.
 *
 * Usage:
 *   1. Build the installer:  bun run dist:win
 *   2. Start this server:    node scripts/update-server.mjs
 *   3. Run the *installed* (older) copy of the app — it will discover the
 *      update from http://localhost:5002 and offer to download it.
 *
 * The server serves everything inside `release/` on port 5002.
 */

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const releaseDir = join(__dirname, "..", "release");
const PORT = Number(process.env.UPDATE_SERVER_PORT) || 5002;

const MIME = {
  ".yml": "text/yaml",
  ".yaml": "text/yaml",
  ".exe": "application/octet-stream",
  ".dmg": "application/octet-stream",
  ".AppImage": "application/octet-stream",
  ".deb": "application/octet-stream",
  ".blockmap": "application/octet-stream",
  ".json": "application/json",
};

if (!existsSync(releaseDir)) {
  console.error(`\n  release/ directory not found. Build first:\n    bun run dist:win\n`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const filename = decodeURIComponent(req.url.replace(/^\//, "").split("?")[0]);
  const filepath = join(releaseDir, filename);

  if (!existsSync(filepath) || !statSync(filepath).isFile()) {
    console.log(`  404  ${req.url}`);
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const stat = statSync(filepath);
  const ext = extname(filepath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
  });
  createReadStream(filepath).pipe(res);
  console.log(`  200  ${req.url}  (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
});

server.listen(PORT, () => {
  console.log(`\n  Update server running at http://localhost:${PORT}`);
  console.log(`  Serving files from: ${releaseDir}\n`);
  const files = readdirSync(releaseDir).filter((f) =>
    /\.(yml|yaml|exe|dmg|AppImage|deb|blockmap)$/i.test(f),
  );
  for (const f of files) {
    const size = (statSync(join(releaseDir, f)).size / 1024 / 1024).toFixed(1);
    console.log(`    ${f}  (${size} MB)`);
  }
  console.log();
});
