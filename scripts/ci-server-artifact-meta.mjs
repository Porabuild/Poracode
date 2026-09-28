#!/usr/bin/env node
/**
 * Metadata handling for the reusable server-artifact workflow. Values arrive
 * through environment variables (never interpolated into shell source), so
 * Windows paths with backslashes and spaces are safe on every runner shell.
 *
 *   native-target   env QUALIFIED_DIR, TARGET [, GITHUB_ENV]
 *     Verifies the downloaded leg advertises TARGET and that its tarball hash
 *     matches; appends TARBALL and META to $GITHUB_ENV.
 *   aggregate-leg   env METADATA_FILE, OUT_DIR [, RELEASE_VERSION]
 *     Verifies one leg (version pin, tarball present, hash) and copies its
 *     tarball, checksum and metadata into OUT_DIR; prints the copied
 *     `server-artifact-<platform>-<arch>.json` path.
 */
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readMetadata(path) {
  if (!existsSync(path)) throw new Error(`qualified metadata missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function verifyNativeTarget(env = process.env) {
  const qualifiedDir = requireEnv(env, "QUALIFIED_DIR");
  const target = requireEnv(env, "TARGET");
  const meta = join(qualifiedDir, "server-artifact.json");
  const metadata = readMetadata(meta);
  if (!Array.isArray(metadata.targets) || !metadata.targets.includes(target)) {
    throw new Error(`${target} is not advertised by the build leg`);
  }
  const tarball = join(qualifiedDir, metadata.tarball.name);
  if (!existsSync(tarball)) throw new Error(`qualified tarball ${metadata.tarball.name} missing`);
  if (sha256File(tarball) !== metadata.tarball.sha256) {
    throw new Error(`${metadata.tarball.name} hash mismatch`);
  }
  if (env.GITHUB_ENV) appendFileSync(env.GITHUB_ENV, `TARBALL=${tarball}\nMETA=${meta}\n`);
  return { tarball, meta };
}

export function copyAggregateLeg(env = process.env) {
  const metadataFile = requireEnv(env, "METADATA_FILE");
  const outDir = requireEnv(env, "OUT_DIR");
  const metadata = readMetadata(metadataFile);
  const { name, sha256 } = metadata.tarball;
  if (env.RELEASE_VERSION && metadata.version !== env.RELEASE_VERSION) {
    throw new Error(`${name} carries version ${metadata.version}, expected ${env.RELEASE_VERSION}`);
  }
  const legDir = dirname(metadataFile);
  const tarball = join(legDir, name);
  if (!existsSync(tarball)) throw new Error(`leg is missing ${name}`);
  if (sha256File(tarball) !== sha256) throw new Error(`${name} hash mismatch in its leg`);
  mkdirSync(outDir, { recursive: true });
  copyFileSync(tarball, join(outDir, name));
  copyFileSync(`${tarball}.sha256`, join(outDir, `${name}.sha256`));
  const destination = join(outDir, `server-artifact-${metadata.platform}-${metadata.arch}.json`);
  copyFileSync(metadataFile, destination);
  return { destination, version: metadata.version };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const command = process.argv[2];
    if (command === "native-target") {
      process.stdout.write(`${verifyNativeTarget().tarball}\n`);
    } else if (command === "aggregate-leg") {
      const { destination, version } = copyAggregateLeg();
      // Line one is the copied metadata path, line two the leg version.
      process.stdout.write(`${destination}\n${version}\n`);
    } else {
      throw new Error("Usage: ci-server-artifact-meta.mjs native-target|aggregate-leg");
    }
  } catch (error) {
    process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
