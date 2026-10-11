#!/usr/bin/env node
/**
 * Generate (or verify) `packages/poracode-cli/runtime-manifest.json` from the
 * qualified `server-artifact.json` files. The release workflow runs this after
 * the artifact workflow has qualified every tarball, so the launcher embeds the
 * exact qualified hashes — never a rebuilt lookalike.
 *
 * One artifact covers one tarball (and the targets it advertises); the release
 * matrix builds one artifact per machine family (Linux cross targets on
 * ubuntu, macOS on macos), so both modes accept repeated `--artifact` flags
 * and merge them into one per-target manifest. Duplicate target claims fail
 * closed: two tarballs must never fight over the same published target.
 *
 * Usage:
 *   node scripts/generate-runtime-manifest.mjs --artifact <server-artifact.json> \
 *     [--artifact <more.json> ...] [--base-url <release download base>] [--out <manifest path>]
 *   node scripts/generate-runtime-manifest.mjs --verify --artifact <...> [--artifact <...>] \
 *     --manifest <...>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readServerArtifactMetadata } from "./server-artifact-metadata.mjs";

export const RUNTIME_MANIFEST_VERSION = 1;

export function releaseDownloadBaseUrl(version, repository = "Porabuild/Poracode") {
  return `https://github.com/${repository}/releases/download/v${version}`;
}

function artifactList(artifacts) {
  return Array.isArray(artifacts) ? artifacts : [artifacts];
}

export function buildRuntimeManifest(artifacts, baseUrl) {
  const list = artifactList(artifacts);
  if (list.length === 0) throw new Error("At least one server-artifact.json is required");
  const version = list[0].version;
  const targets = {};
  for (const artifact of list) {
    if (artifact.version !== version) {
      throw new Error(`qualified artifacts disagree on version: ${artifact.version} vs ${version}`);
    }
    for (const target of artifact.targets) {
      if (Object.hasOwn(targets, target)) {
        throw new Error(`qualified artifacts claim the target ${target} more than once`);
      }
      targets[target] = {
        url: `${baseUrl.replace(/\/+$/u, "")}/${artifact.tarball.name}`,
        sha256: artifact.tarball.sha256,
      };
    }
  }
  return { formatVersion: RUNTIME_MANIFEST_VERSION, version, targets };
}

export function verifyRuntimeManifest(artifacts, manifest) {
  const list = artifactList(artifacts);
  if (manifest?.formatVersion !== RUNTIME_MANIFEST_VERSION) {
    throw new Error(`runtime manifest formatVersion ${manifest?.formatVersion} is unsupported`);
  }
  const expected = new Map();
  for (const artifact of list) {
    if (manifest.version !== artifact.version) {
      throw new Error(
        `runtime manifest version ${manifest.version} does not match artifact ${artifact.version}`,
      );
    }
    for (const target of artifact.targets) {
      if (expected.has(target)) {
        throw new Error(`qualified artifacts claim the target ${target} more than once`);
      }
      expected.set(target, artifact.tarball);
    }
  }
  const declared = Object.keys(manifest.targets ?? {}).sort();
  const expectedTargets = [...expected.keys()].sort();
  if (JSON.stringify(declared) !== JSON.stringify(expectedTargets)) {
    throw new Error(
      `runtime manifest targets [${declared}] do not match the qualified artifacts ` +
        `[${expectedTargets}]`,
    );
  }
  for (const [target, tarball] of expected) {
    const entry = manifest.targets[target];
    if (entry.sha256 !== tarball.sha256) {
      throw new Error(
        `runtime manifest ${target} sha256 ${entry.sha256} does not match the qualified ` +
          `tarball ${tarball.sha256}`,
      );
    }
    if (!entry.url.endsWith(`/${tarball.name}`)) {
      throw new Error(`runtime manifest ${target} does not point at ${tarball.name}`);
    }
  }
  return true;
}

function parseArgs(argv) {
  const options = { verify: false, repository: "Porabuild/Poracode", artifacts: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--verify") options.verify = true;
    else if (argument === "--artifact") options.artifacts.push(resolve(argv[++index]));
    else if (argument === "--manifest") options.manifest = resolve(argv[++index]);
    else if (argument === "--out") options.out = resolve(argv[++index]);
    else if (argument === "--base-url") options.baseUrl = argv[++index];
    else if (argument === "--repository") options.repository = argv[++index];
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.artifacts.length === 0) {
    throw new Error(
      "Usage: generate-runtime-manifest.mjs --artifact <server-artifact.json> " +
        "[--artifact <more.json>] [--base-url <url>] [--out <path>] | " +
        "--verify --artifact <...> --manifest <path>",
    );
  }
  const artifacts = options.artifacts.map((path) => readServerArtifactMetadata(path));
  if (options.verify) {
    if (!options.manifest || !existsSync(options.manifest)) {
      throw new Error("--verify needs --manifest <path>");
    }
    verifyRuntimeManifest(artifacts, JSON.parse(readFileSync(options.manifest, "utf8")));
    process.stdout.write("runtime manifest matches the qualified artifacts\n");
    return;
  }
  const baseUrl =
    options.baseUrl ?? releaseDownloadBaseUrl(artifacts[0].version, options.repository);
  const manifest = buildRuntimeManifest(artifacts, baseUrl);
  const out = options.out ?? resolve("packages", "poracode-cli", "runtime-manifest.json");
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${out}\n`);
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
