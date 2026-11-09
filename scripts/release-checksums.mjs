#!/usr/bin/env node
/**
 * Write `SHA256SUMS` for a release: one `<sha256>  <name>` line per regular
 * file at the top of the asset directory (sorted, the file itself excluded).
 * The one-line installers download it from the release and verify the
 * self-contained archive against it before extracting anything.
 *
 * Usage: node scripts/release-checksums.mjs <release-assets-dir>
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSha256Sums, sha256File } from "./standalone-runtime.mjs";

export const RELEASE_CHECKSUMS_FILE = "SHA256SUMS";

export function writeReleaseChecksums(directory) {
  const entries = readdirSync(directory)
    .filter((name) => name !== RELEASE_CHECKSUMS_FILE)
    .filter((name) => statSync(join(directory, name)).isFile())
    .map((name) => ({ name, sha256: sha256File(join(directory, name)) }));
  if (entries.length === 0) throw new Error(`${directory} holds no release assets`);
  const path = join(directory, RELEASE_CHECKSUMS_FILE);
  writeFileSync(path, renderSha256Sums(entries));
  return { path, entries: entries.length };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const directory = process.argv[2];
    if (!directory) throw new Error("Usage: release-checksums.mjs <release-assets-dir>");
    const { path, entries } = writeReleaseChecksums(resolve(directory));
    process.stdout.write(`${path} (${entries} assets)\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
