#!/usr/bin/env node
/**
 * Install a poracode-server tarball into a prefix (V6 D.1/D.2).
 *
 * Layout: `<prefix>/releases/<id>/` with `<prefix>/current` → that release.
 * The release-directory install (safe extraction, `npm install
 * --ignore-scripts`, then the verified native overlay) is the shared
 * `server-release-install.mjs` contract.
 */
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installServerRelease, writeCurrentSymlink } from "./server-release-install.mjs";

function parseArgs(argv) {
  let tarball;
  let prefix = "/opt/poracode";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--tarball") tarball = resolve(argv[++index]);
    else if (argument === "--prefix") prefix = resolve(argv[++index]);
  }
  if (!tarball) {
    throw new Error("Usage: install-server-prefix.mjs --tarball <file> [--prefix <dir>]");
  }
  return { tarball, prefix };
}

export function installServerPrefix({ tarball, prefix, releaseId }) {
  const id = releaseId ?? `release-${Date.now().toString(36)}`;
  const releaseDir = join(prefix, "releases", id);
  installServerRelease({ tarball, releaseDir });
  writeCurrentSymlink(prefix, releaseDir);
  return { prefix, releaseDir, current: join(prefix, "current") };
}

// realpath on both sides: a bootstrap directory under a symlinked path (e.g.
// macOS `/tmp` -> `/private/tmp`, `mktemp -d` under `/var/folders`) must still
// run the installer instead of silently exiting 0.
const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const result = installServerPrefix(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${result.current}\n`);
}
