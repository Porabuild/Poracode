/**
 * The embedded runtime manifest: one entry per published target, each pinned
 * to the exact released tarball URL and its qualified sha256. The release
 * workflow regenerates this file from `server-artifact.json`; the launcher
 * never consults a mutable `latest` and never installs unverified bytes.
 */
import { existsSync, readFileSync } from "node:fs";
import { unsupportedTarget } from "./errors.mjs";

export const RUNTIME_MANIFEST_VERSION = 1;

export function parseRuntimeManifest(value) {
  if (!value || typeof value !== "object") {
    throw new Error("runtime-manifest.json is not an object");
  }
  if (value.formatVersion !== RUNTIME_MANIFEST_VERSION) {
    throw new Error(
      `runtime-manifest.json formatVersion ${value.formatVersion} is not supported ` +
        `(expected ${RUNTIME_MANIFEST_VERSION}); upgrade the poracode package`,
    );
  }
  if (typeof value.version !== "string" || value.version.length === 0) {
    throw new Error("runtime-manifest.json is missing its version");
  }
  const targets = value.targets;
  if (!targets || typeof targets !== "object" || Array.isArray(targets)) {
    throw new Error("runtime-manifest.json is missing its targets table");
  }
  for (const [target, entry] of Object.entries(targets)) {
    if (!entry || typeof entry.url !== "string" || typeof entry.sha256 !== "string") {
      throw new Error(`runtime-manifest.json target ${target} needs url and sha256`);
    }
    if (!/^[0-9a-f]{64}$/u.test(entry.sha256)) {
      throw new Error(`runtime-manifest.json target ${target} has a malformed sha256`);
    }
    if (!entry.url.startsWith("https://")) {
      throw new Error(`runtime-manifest.json target ${target} must use an https URL`);
    }
  }
  return { formatVersion: RUNTIME_MANIFEST_VERSION, version: value.version, targets };
}

export function loadRuntimeManifest(path) {
  if (!existsSync(path)) {
    throw new Error(`runtime-manifest.json is missing from the poracode package at ${path}`);
  }
  return parseRuntimeManifest(JSON.parse(readFileSync(path, "utf8")));
}

export function selectRuntimeEntry(manifest, target) {
  const entry = manifest.targets[target];
  if (!entry) {
    throw unsupportedTarget(target, Object.keys(manifest.targets).sort());
  }
  return entry;
}
