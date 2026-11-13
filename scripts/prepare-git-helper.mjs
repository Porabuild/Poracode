#!/usr/bin/env node

// Stages the native Git status/worktree helper into resources/wsl-helpers/git-helper/.
// The shared driver lives in scripts/lib/native-helper-prepare.mjs; this
// file is only the helper's spec.

import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMain, runScript } from "./lib/native-helper-prepare.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const protocolPath = join(repoRoot, "src", "supervisor", "git", "gitNativeHelperProtocol.ts");

function gitHelperProtocolVersion() {
  const source = readFileSync(protocolPath, "utf8");
  const match = /export const GIT_HELPER_PROTOCOL_VERSION = (\d+);/u.exec(source);
  if (!match) {
    throw new Error(`Could not read the git helper protocol version from ${protocolPath}`);
  }
  return Number(match[1]);
}

const expectedProtocolVersion = gitHelperProtocolVersion();

export const spec = {
  scriptName: "prepare-git-helper",
  noun: "git-helper",
  label: "Git helper",
  helloNoun: "Git helper",
  binaryName: "poracode-git-helper",
  crateRoot: join(repoRoot, "native", "git-helper"),
  repoRoot,
  cargoProfile: () => "release",
  resourcesRoot: () => join(repoRoot, "resources", "wsl-helpers", "git-helper"),
  missingToolMessage: () =>
    "Rust cargo/rustup is unavailable; Git status batches will use the TypeScript worker fallback",
  allowMissing: () => /^(1|true|yes)$/i.test(process.env.PORACODE_ALLOW_MISSING_GIT_HELPER ?? ""),
  expectedVersion: () => expectedProtocolVersion,
  // A host with no target for --host-only (e.g. linux-arm64) warns and
  // exits 0 so Git status queries keep using the TypeScript fallback.
  unsupportedHostArch: "warn",
  validateHello(parsed, path, expectedVersion) {
    if (
      parsed?.helper !== "poracode-git-helper" ||
      typeof parsed?.helperVersion !== "string" ||
      parsed.helperVersion.length === 0 ||
      parsed?.protocolVersion !== expectedVersion ||
      !["darwin", "win32", "linux"].includes(parsed?.platform) ||
      !["x64", "arm64"].includes(parsed?.arch)
    ) {
      throw new Error(
        `Git helper returned an invalid or incompatible --hello payload (expected protocol version ${expectedVersion}): ${path}`,
      );
    }
  },
  manifestFields: (hello, expectedVersion) => ({
    helper: hello.helper,
    helperVersion: hello.helperVersion,
    protocolVersion: hello.protocolVersion,
    clientProtocolVersion: expectedVersion,
  }),
  verifyManifest(manifest, expectedVersion) {
    if (
      manifest.protocolVersion !== expectedVersion ||
      manifest.clientProtocolVersion !== expectedVersion
    ) {
      throw new Error(
        `Git helper manifest is incompatible with protocol version ${expectedVersion}`,
      );
    }
  },
  manifestMatchesHello: (manifest, hello) => manifest.helperVersion === hello.helperVersion,
};

if (isMain(import.meta.url)) runScript(spec);
