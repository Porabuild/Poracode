#!/usr/bin/env node
/**
 * Immutable build/version metadata for the standalone server artifact (plan D3,
 * consumed later by D4 upgrade identity).
 *
 * The metadata is written once by `assemble-server-tarball.mjs`, next to the
 * tarball it describes. Release qualification and promotion read it to prove
 * that published bytes are the qualified bytes; D4 can add the fields to the
 * authenticated describe without re-deriving them from environment variables.
 *
 * Helper paths for D4 integration:
 *   scripts/server-artifact-metadata.mjs  (writer + reader + validator)
 *   dist/server-artifact.json             (produced artifact metadata)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const SERVER_ARTIFACT_METADATA_VERSION = 1;
export const SERVER_ARTIFACT_KIND = "poracode-server-artifact";
export const SERVER_ARTIFACT_FILE_NAME = "server-artifact.json";

function assertString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`server-artifact metadata: ${field} must be a non-empty string`);
  }
  return value;
}

function assertSha256(value, field) {
  assertString(value, field);
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`server-artifact metadata: ${field} is not a sha256 digest`);
  }
  return value;
}

/**
 * Validate a parsed metadata document. Strict enough that a release job cannot
 * promote a lookalike: unknown versions and missing hashes fail closed.
 */
export function assertServerArtifactMetadata(value) {
  if (!value || typeof value !== "object") {
    throw new Error("server-artifact metadata: not an object");
  }
  if (value.formatVersion !== SERVER_ARTIFACT_METADATA_VERSION) {
    throw new Error(`server-artifact metadata: unsupported formatVersion ${value.formatVersion}`);
  }
  if (value.kind !== SERVER_ARTIFACT_KIND) {
    throw new Error(`server-artifact metadata: unexpected kind ${value.kind}`);
  }
  assertString(value.version, "version");
  if (!Array.isArray(value.targets) || value.targets.length === 0) {
    throw new Error("server-artifact metadata: targets must be a non-empty array");
  }
  for (const target of value.targets) assertString(target, "targets[]");
  if (!value.tarball || typeof value.tarball !== "object") {
    throw new Error("server-artifact metadata: tarball is required");
  }
  assertString(value.tarball.name, "tarball.name");
  assertSha256(value.tarball.sha256, "tarball.sha256");
  if (!Number.isSafeInteger(value.tarball.bytes) || value.tarball.bytes <= 0) {
    throw new Error("server-artifact metadata: tarball.bytes must be a positive integer");
  }
  if (!value.runtime || typeof value.runtime !== "object") {
    throw new Error("server-artifact metadata: runtime is required");
  }
  assertString(value.runtime.nodePty, "runtime.nodePty");
  assertString(value.runtime.betterSqlite3, "runtime.betterSqlite3");
  return value;
}

export function writeServerArtifactMetadata(outDir, metadata) {
  const document = {
    formatVersion: SERVER_ARTIFACT_METADATA_VERSION,
    kind: SERVER_ARTIFACT_KIND,
    ...metadata,
  };
  assertServerArtifactMetadata(document);
  const path = `${outDir}/${SERVER_ARTIFACT_FILE_NAME}`;
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return path;
}

export function readServerArtifactMetadata(path) {
  if (!existsSync(path)) throw new Error(`server-artifact metadata is missing at ${path}`);
  return assertServerArtifactMetadata(JSON.parse(readFileSync(path, "utf8")));
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
