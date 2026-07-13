#!/usr/bin/env node
/**
 * Release-prep helper: fetches the official SHASUMS256.txt for the pinned
 * Node.js LTS version and writes the relevant rows into
 * `src/supervisor/runtime/pinnedNode.ts`.
 *
 * Run after bumping `PORACODE_PINNED_NODE_VERSION` in that file:
 *
 *   pnpm tsx scripts/refresh-node-checksums.mjs
 *
 * Covers every target poracode ships a managed-runtime install for:
 *   - linux-x64 / linux-arm64        (.tar.xz)   — WSL + native Linux
 *   - darwin-x64 / darwin-arm64      (.tar.xz)   — native macOS
 *   - win-x64 / win-arm64            (.zip)      — native Windows
 *
 * Alpine/musl users are expected to surface their own node via the probe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const indexFile = join(repoRoot, "src", "supervisor", "runtime", "pinnedNode.ts");

const TARGETS = /** @type {const} */ ([
  { triple: "linux-x64", ext: "tar.xz" },
  { triple: "linux-arm64", ext: "tar.xz" },
  { triple: "darwin-x64", ext: "tar.xz" },
  { triple: "darwin-arm64", ext: "tar.xz" },
  { triple: "win-x64", ext: "zip" },
  { triple: "win-arm64", ext: "zip" },
]);

function readPinnedVersion() {
  const src = readFileSync(indexFile, "utf8");
  const match = /PORACODE_PINNED_NODE_VERSION\s*=\s*"([^"]+)"/.exec(src);
  if (!match) {
    throw new Error(
      `could not find PORACODE_PINNED_NODE_VERSION in ${indexFile} — has the constant been renamed?`,
    );
  }
  return match[1];
}

async function fetchOfficialManifest(version) {
  const url = `https://nodejs.org/dist/v${version}/SHASUMS256.txt`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
}

function parseManifest(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // SHASUMS256.txt format: "<sha256>  <filename>" (two spaces).
    const m = /^([0-9a-f]{64})\s+(.+)$/i.exec(trimmed);
    if (m) map.set(m[2], m[1].toLowerCase());
  }
  return map;
}

function archiveFileName(version, triple, ext) {
  return `node-v${version}-${triple}.${ext}`;
}

async function main() {
  const version = readPinnedVersion();
  console.log(`refreshing Node archive checksums for v${version}`);

  const manifest = parseManifest(await fetchOfficialManifest(version));

  /** @type {Record<string, string>} */
  const newChecksums = {};
  for (const { triple, ext } of TARGETS) {
    const filename = archiveFileName(version, triple, ext);
    const sha = manifest.get(filename);
    if (!sha) {
      throw new Error(
        `${filename} not found in official SHASUMS256.txt for v${version}; ` +
          `the version may not have a complete release set yet`,
      );
    }
    newChecksums[triple] = sha;
    console.log(`  ${triple.padEnd(20)} ${sha}`);
  }

  let src = readFileSync(indexFile, "utf8");
  const startMarker = "export const NODE_TARBALL_CHECKSUMS: Record<NodeTargetTriple, string> = {";
  const endMarker = "};";
  const startIdx = src.indexOf(startMarker);
  if (startIdx < 0) {
    throw new Error(`could not find ${startMarker} in ${indexFile}`);
  }
  const blockEndIdx = src.indexOf(endMarker, startIdx);
  if (blockEndIdx < 0) {
    throw new Error(`could not find closing brace of NODE_TARBALL_CHECKSUMS`);
  }

  const lines = [
    startMarker,
    ...TARGETS.map(({ triple, ext }) => {
      const filename = archiveFileName(version, triple, ext);
      return `  // ${filename}\n  "${triple}": "${newChecksums[triple]}",`;
    }),
  ];
  const replacement = `${lines.join("\n")}\n${endMarker}`;
  src = `${src.slice(0, startIdx)}${replacement}${src.slice(blockEndIdx + endMarker.length)}`;
  writeFileSync(indexFile, src, "utf8");

  console.log(`updated ${indexFile}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
