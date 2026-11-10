#!/usr/bin/env node
/**
 * Metadata handling for the reusable server-artifact workflow. Values arrive
 * through environment variables (never interpolated into shell source), so
 * Windows paths with backslashes and spaces are safe on every runner shell.
 *
 *   native-target   env QUALIFIED_DIR, TARGET [, RELEASE_VERSION, GITHUB_ENV]
 *     Verifies the downloaded leg's version pin, advertised TARGET and tarball
 *     hash; appends TARBALL and META to $GITHUB_ENV.
 *   aggregate-leg   env METADATA_FILE, OUT_DIR [, RELEASE_VERSION]
 *     Verifies one leg (version pin, tarball present, hash) and copies its
 *     tarball, checksum and metadata into OUT_DIR; prints the copied
 *     `server-artifact-<platform>-<arch>.json` path.
 *   standalone-archive   env STANDALONE_DIR, TARGET [, RELEASE_VERSION]
 *     Verifies the built self-contained archive for TARGET against its
 *     sidecar; prints the archive path and the sidecar path.
 *   aggregate-standalone   env METADATA_FILE, OUT_DIR [, RELEASE_VERSION]
 *     Verifies one standalone leg and copies its archive, checksum and
 *     sidecar into OUT_DIR; prints the copied sidecar path.
 *   verify-standalone-release   env ASSETS [, RELEASE_VERSION]
 *     Verifies every `standalone-*.json` in ASSETS against its archive and
 *     prints each sidecar path for `generate-runtime-manifest.mjs --verify`.
 */
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readStandaloneArchiveMetadata,
  sha256File,
  STANDALONE_TARGETS,
  standaloneMetadataName,
} from "./standalone-runtime.mjs";

function requireEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readMetadata(path) {
  if (!existsSync(path)) throw new Error(`qualified metadata missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertReleaseVersion(metadata, env) {
  if (env.RELEASE_VERSION && metadata.version !== env.RELEASE_VERSION) {
    throw new Error(
      `${metadata.tarball.name} carries version ${metadata.version}, expected ${env.RELEASE_VERSION}`,
    );
  }
}

export function verifyNativeTarget(env = process.env) {
  const qualifiedDir = requireEnv(env, "QUALIFIED_DIR");
  const target = requireEnv(env, "TARGET");
  const meta = join(qualifiedDir, "server-artifact.json");
  const metadata = readMetadata(meta);
  assertReleaseVersion(metadata, env);
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
  assertReleaseVersion(metadata, env);
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

/** Read a standalone sidecar and prove its archive beside it is the recorded bytes. */
function verifyStandaloneSidecar(metadataFile, env, expectedTarget) {
  const metadata = readStandaloneArchiveMetadata(metadataFile);
  if (env.RELEASE_VERSION && metadata.version !== env.RELEASE_VERSION) {
    throw new Error(
      `${metadata.archive.name} carries version ${metadata.version}, expected ${env.RELEASE_VERSION}`,
    );
  }
  if (expectedTarget && metadata.target !== expectedTarget) {
    throw new Error(`${metadataFile} describes ${metadata.target}, expected ${expectedTarget}`);
  }
  const archive = join(dirname(metadataFile), metadata.archive.name);
  if (!existsSync(archive)) throw new Error(`standalone archive ${metadata.archive.name} missing`);
  if (sha256File(archive) !== metadata.archive.sha256) {
    throw new Error(`${metadata.archive.name} hash mismatch`);
  }
  return { metadata, archive };
}

export function locateStandaloneArchive(env = process.env) {
  const directory = requireEnv(env, "STANDALONE_DIR");
  const target = requireEnv(env, "TARGET");
  const metadataFile = join(directory, standaloneMetadataName(target));
  const { archive } = verifyStandaloneSidecar(metadataFile, env, target);
  return { archive, metadataFile };
}

export function copyStandaloneLeg(env = process.env) {
  const metadataFile = requireEnv(env, "METADATA_FILE");
  const outDir = requireEnv(env, "OUT_DIR");
  const { metadata, archive } = verifyStandaloneSidecar(metadataFile, env);
  mkdirSync(outDir, { recursive: true });
  copyFileSync(archive, join(outDir, metadata.archive.name));
  copyFileSync(`${archive}.sha256`, join(outDir, `${metadata.archive.name}.sha256`));
  const destination = join(outDir, standaloneMetadataName(metadata.target));
  copyFileSync(metadataFile, destination);
  return { destination };
}

export function verifyStandaloneRelease(env = process.env) {
  const assets = requireEnv(env, "ASSETS");
  const sidecars = readdirSync(assets)
    .filter((name) => /^standalone-.+\.json$/u.test(name))
    .sort()
    .map((name) => join(assets, name));
  if (sidecars.length === 0)
    throw new Error("no qualified standalone archives in the release assets");
  const byTarget = new Map();
  for (const sidecar of sidecars) {
    const { metadata } = verifyStandaloneSidecar(sidecar, env);
    byTarget.set(metadata.target, [...(byTarget.get(metadata.target) ?? []), sidecar]);
  }
  const missing = STANDALONE_TARGETS.filter((target) => !byTarget.has(target));
  const unexpected = [...byTarget.keys()].filter((target) => !STANDALONE_TARGETS.includes(target));
  const duplicated = [...byTarget.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([target]) => target);
  if (missing.length > 0 || unexpected.length > 0 || duplicated.length > 0) {
    throw new Error(
      "release assets must carry exactly one standalone sidecar per target; " +
        `missing ${missing.join(", ") || "none"}, ` +
        `unexpected ${unexpected.join(", ") || "none"}, ` +
        `duplicated ${duplicated.join(", ") || "none"}`,
    );
  }
  return sidecars;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const command = process.argv[2];
    if (command === "native-target") {
      // Same-step consumers read these lines: $GITHUB_ENV only reaches later
      // steps, so the qualify step cannot use it.
      const { tarball, meta } = verifyNativeTarget();
      process.stdout.write(`${tarball}\n${meta}\n`);
    } else if (command === "aggregate-leg") {
      const { destination, version } = copyAggregateLeg();
      // Line one is the copied metadata path, line two the leg version.
      process.stdout.write(`${destination}\n${version}\n`);
    } else if (command === "standalone-archive") {
      const { archive, metadataFile } = locateStandaloneArchive();
      process.stdout.write(`${archive}\n${metadataFile}\n`);
    } else if (command === "aggregate-standalone") {
      process.stdout.write(`${copyStandaloneLeg().destination}\n`);
    } else if (command === "verify-standalone-release") {
      process.stdout.write(`${verifyStandaloneRelease().join("\n")}\n`);
    } else {
      throw new Error(
        "Usage: ci-server-artifact-meta.mjs native-target|aggregate-leg|standalone-archive|" +
          "aggregate-standalone|verify-standalone-release",
      );
    }
  } catch (error) {
    process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
