#!/usr/bin/env node
/**
 * Install a poracode-server tarball into a prefix (V6 D.1/D.2).
 *
 * Layout: `<prefix>/releases/<id>/` with `<prefix>/current` → that release.
 * Applies native-overlay before `npm install` so node-pty skips node-gyp.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyServerNativeOverlay } from "./server-native-overlay.mjs";

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

export function installServerPrefix({ tarball, prefix }) {
  const releaseId = `release-${Date.now().toString(36)}`;
  const releaseDir = join(prefix, "releases", releaseId);
  mkdirSync(releaseDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", releaseDir], { stdio: "pipe" });
  const overlayRoot = join(releaseDir, "native-overlay");
  if (existsSync(join(overlayRoot, "node-pty", "overlay.json"))) {
    applyServerNativeOverlay({ prefix: releaseDir, overlayRoot });
  }
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: releaseDir,
    stdio: "inherit",
    env: { ...process.env, npm_config_audit: "false" },
  });
  const current = join(prefix, "current");
  rmSync(current, { force: true });
  symlinkSync(`releases/${releaseId}`, current, "dir");
  return { prefix, releaseDir, current };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const result = installServerPrefix(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${result.current}\n`);
}
