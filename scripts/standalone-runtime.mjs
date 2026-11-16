#!/usr/bin/env node
/**
 * Self-contained ("standalone") CLI archives: the qualified server tarball plus
 * its installed dependencies and a pinned Node executable, one archive per
 * target. One-line installers, the npm launcher and package managers install
 * these so no host Node, npm, registry access or compiler is required.
 *
 * This module owns the pinned Node runtime, archive naming and the sidecar
 * metadata (`standalone-<target>.json`) the release workflows verify. The
 * in-archive `standalone.json` marker is read by the shipped installer
 * (`server-release-install.mjs`), which must stay importable on its own.
 *
 * Refresh the pins after bumping STANDALONE_NODE_VERSION:
 *   node scripts/standalone-runtime.mjs refresh-node-pins
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STANDALONE_RUNTIME_FORMAT_VERSION,
  STANDALONE_RUNTIME_KIND,
} from "./server-release-install.mjs";

/**
 * Node.js bundled into standalone archives. It must satisfy the server's
 * `engines.node` floor; the builder refuses an artifact whose floor it misses.
 * This is separate from `src/supervisor/runtime/pinnedNode.ts`, which pins the
 * Node used to run provider CLIs, not the server.
 */
export const STANDALONE_NODE_VERSION = "26.13.0";

/** Official nodejs.org archive sha256 per standalone target (SHASUMS256.txt). */
export const STANDALONE_NODE_ARCHIVE_SHA256 = {
  "darwin-arm64": "d38bd5e5a2ddce6bbb5ce45e46e208337da4d51fffe611e567fd32073d6439f6",
  "darwin-x64": "525c9b29bb0263d687de60a4cec0e2a6db876a8eb032369e5795eca71e7c358e",
  "linux-arm64": "439e9c438acdf6a6ffe47418da709153d66c4bed812e30a473faacb107dd2791",
  "linux-x64": "5848553868b402d3fabb5b09270649977780a390f832155721025a08b5104455",
  "win32-x64": "dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a",
};

/** Targets that get a standalone archive (each must have a native release leg). */
export const STANDALONE_TARGETS = Object.freeze(Object.keys(STANDALONE_NODE_ARCHIVE_SHA256));

/** Sidecar metadata beside each archive; verified by the release workflows. */
export const STANDALONE_ARCHIVE_METADATA_VERSION = 1;
export const STANDALONE_ARCHIVE_KIND = "poracode-standalone-archive";

export { STANDALONE_RUNTIME_FORMAT_VERSION, STANDALONE_RUNTIME_KIND };

export function isWindowsTarget(target) {
  return target.startsWith("win32-");
}

/** `poracode-<version>-<target>.tar.gz`, or `.zip` for Windows. */
export function standaloneArchiveName(version, target) {
  return `poracode-${version}-${target}.${isWindowsTarget(target) ? "zip" : "tar.gz"}`;
}

export function standaloneMetadataName(target) {
  return `standalone-${target}.json`;
}

/** nodejs.org's platform spelling: `win-x64` rather than `win32-x64`. */
export function nodeDistTriple(target) {
  return isWindowsTarget(target) ? target.replace(/^win32-/u, "win-") : target;
}

export function nodeArchiveFileName(target, version = STANDALONE_NODE_VERSION) {
  return `node-v${version}-${nodeDistTriple(target)}.${isWindowsTarget(target) ? "zip" : "tar.gz"}`;
}

export function nodeArchiveUrl(target, version = STANDALONE_NODE_VERSION) {
  return `https://nodejs.org/dist/v${version}/${nodeArchiveFileName(target, version)}`;
}

/** Archive member paths of the Node executable and its license. */
export function nodeArchiveMembers(target, version = STANDALONE_NODE_VERSION) {
  const root = `node-v${version}-${nodeDistTriple(target)}`;
  return isWindowsTarget(target)
    ? { executable: `${root}/node.exe`, license: `${root}/LICENSE` }
    : { executable: `${root}/bin/node`, license: `${root}/LICENSE` };
}

/** Where the Node executable lives inside a standalone release. */
export function standaloneNodeRelativePath(target) {
  return isWindowsTarget(target) ? "runtime/node.exe" : "runtime/node";
}

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/u.exec(String(value ?? "").trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

/**
 * True when `version` satisfies an `engines.node` floor. Only `>=X.Y.Z` (the
 * form the server artifact records) is understood; anything else fails closed.
 */
export function satisfiesNodeFloor(version, floor) {
  if (floor === null || floor === undefined || floor === "") return true;
  const match = /^>=\s*(\d+\.\d+\.\d+)$/u.exec(String(floor).trim());
  if (!match) {
    throw new Error(`Unsupported engines.node range "${floor}"; expected ">=X.Y.Z".`);
  }
  const have = parseVersion(version);
  const need = parseVersion(match[1]);
  if (!have || !need) return false;
  for (let index = 0; index < 3; index += 1) {
    if (have[index] !== need[index]) return have[index] > need[index];
  }
  return true;
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`standalone metadata: ${field} must be a non-empty string`);
  }
  return value;
}

function assertSha256(value, field) {
  assertString(value, field);
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`standalone metadata: ${field} is not a sha256 digest`);
  }
  return value;
}

/** Validate a sidecar document. Unknown formats fail closed. */
export function assertStandaloneArchiveMetadata(value) {
  if (!value || typeof value !== "object") throw new Error("standalone metadata: not an object");
  if (value.formatVersion !== STANDALONE_ARCHIVE_METADATA_VERSION) {
    throw new Error(`standalone metadata: unsupported formatVersion ${value.formatVersion}`);
  }
  if (value.kind !== STANDALONE_ARCHIVE_KIND) {
    throw new Error(`standalone metadata: unexpected kind ${value.kind}`);
  }
  assertString(value.version, "version");
  assertString(value.target, "target");
  if (!value.archive || typeof value.archive !== "object") {
    throw new Error("standalone metadata: archive is required");
  }
  assertString(value.archive.name, "archive.name");
  assertSha256(value.archive.sha256, "archive.sha256");
  if (!Number.isSafeInteger(value.archive.bytes) || value.archive.bytes <= 0) {
    throw new Error("standalone metadata: archive.bytes must be a positive integer");
  }
  if (value.archive.name !== standaloneArchiveName(value.version, value.target)) {
    throw new Error(`standalone metadata: archive.name ${value.archive.name} is not canonical`);
  }
  if (value.runtime?.kind !== STANDALONE_RUNTIME_KIND) {
    throw new Error("standalone metadata: runtime marker is missing");
  }
  assertString(value.runtime.node?.version, "runtime.node.version");
  return value;
}

export function readStandaloneArchiveMetadata(path) {
  if (!existsSync(path)) throw new Error(`standalone metadata is missing at ${path}`);
  return assertStandaloneArchiveMetadata(JSON.parse(readFileSync(path, "utf8")));
}

export function writeStandaloneArchiveMetadata(path, metadata) {
  const document = {
    formatVersion: STANDALONE_ARCHIVE_METADATA_VERSION,
    kind: STANDALONE_ARCHIVE_KIND,
    ...metadata,
  };
  assertStandaloneArchiveMetadata(document);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

/** `SHA256SUMS` text (`<sha256>  <name>` per line, sorted by name). */
export function renderSha256Sums(entries) {
  return [...entries]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => `${assertSha256(entry.sha256, entry.name)}  ${entry.name}\n`)
    .join("");
}

async function refreshNodePins() {
  const url = `https://nodejs.org/dist/v${STANDALONE_NODE_VERSION}/SHASUMS256.txt`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  const sums = new Map();
  for (const line of (await response.text()).split(/\r?\n/u)) {
    const match = /^([0-9a-f]{64})\s+(\S+)$/u.exec(line.trim());
    if (match) sums.set(match[2], match[1]);
  }
  const file = fileURLToPath(import.meta.url);
  let source = readFileSync(file, "utf8");
  for (const target of STANDALONE_TARGETS) {
    const name = nodeArchiveFileName(target);
    const sha = sums.get(name);
    if (!sha) throw new Error(`${name} is not listed in ${url}`);
    source = source.replace(new RegExp(`("${target}": ")[0-9a-f]{64}(")`, "u"), `$1${sha}$2`);
    process.stdout.write(`${target.padEnd(14)} ${sha}\n`);
  }
  writeFileSync(file, source);
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  if (process.argv[2] !== "refresh-node-pins") {
    process.stderr.write("Usage: standalone-runtime.mjs refresh-node-pins\n");
    process.exit(2);
  }
  refreshNodePins().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
