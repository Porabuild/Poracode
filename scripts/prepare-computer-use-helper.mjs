#!/usr/bin/env node

// Stages the native computer-use helper into resources/computer-use-helper/
// (or resources/computer-use-helper-dev/ with --dev). The shared driver lives
// in scripts/lib/native-helper-prepare.mjs; this file is only the helper's
// spec — flags, --dev profile/dir, --hello validation, manifest schema, and
// the missing-toolchain messages all stay byte-compatible.

import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMain, runScript } from "./lib/native-helper-prepare.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientContractPath = join(repoRoot, "src", "shared", "contracts", "computerUse.ts");

function clientProtocolVersion() {
  const source = readFileSync(clientContractPath, "utf8");
  const match = /export const COMPUTER_USE_HELPER_PROTOCOL_VERSION = (\d+);/u.exec(source);
  if (!match)
    throw new Error(`Could not read the client protocol version from ${clientContractPath}`);
  return Number(match[1]);
}

const expectedProtocolVersion = clientProtocolVersion();
const capabilityKeys = [
  "backgroundPointer",
  "backgroundKeyboard",
  "backgroundChords",
  "accessibilityTree",
  "elementActions",
  "occludedCapture",
  "foregroundInput",
  "launchApp",
  "stableWindowIds",
];
const permissionStates = new Set(["granted", "denied", "unknown", "not_required"]);

export const spec = {
  scriptName: "prepare-computer-use-helper",
  noun: "helper",
  label: "Computer-use helper",
  helloNoun: "Helper",
  binaryName: "poracode-computer-use",
  crateRoot: join(repoRoot, "native", "computer-use-helper"),
  repoRoot,
  extraFlags: { dev: true },
  cargoProfile: (options) => (options.dev ? "dev" : "release"),
  resourcesRoot: (options) =>
    join(repoRoot, "resources", options.dev ? "computer-use-helper-dev" : "computer-use-helper"),
  allowMissing: () =>
    /^(1|true|yes)$/i.test(process.env.PORACODE_ALLOW_MISSING_COMPUTER_USE_HELPER ?? ""),
  missingToolMessage: (platform) =>
    platform === "linux"
      ? "Rust cargo/rustup is unavailable; computer use will be unavailable on Linux"
      : "Rust cargo/rustup is unavailable; computer use will use the legacy foreground driver",
  expectedVersion: () => expectedProtocolVersion,
  validateHello(parsed, path, expectedVersion) {
    if (
      typeof parsed?.helperVersion !== "string" ||
      parsed.helperVersion.length === 0 ||
      parsed?.protocolVersion !== expectedVersion ||
      !Number.isInteger(parsed?.minClientProtocolVersion) ||
      parsed.minClientProtocolVersion < 1 ||
      parsed.minClientProtocolVersion > expectedVersion ||
      !["win32", "darwin", "linux"].includes(parsed?.platform) ||
      typeof parsed?.arch !== "string" ||
      parsed.arch.length === 0 ||
      !(parsed?.displayServer === null || ["x11", "wayland"].includes(parsed?.displayServer)) ||
      !parsed?.capabilities ||
      typeof parsed.capabilities !== "object" ||
      Array.isArray(parsed.capabilities) ||
      !capabilityKeys.every((key) => typeof parsed.capabilities[key] === "boolean") ||
      !parsed?.permissions ||
      !permissionStates.has(parsed.permissions.accessibility) ||
      !permissionStates.has(parsed.permissions.screenRecording) ||
      !Array.isArray(parsed?.notes) ||
      !parsed.notes.every((note) => typeof note === "string")
    ) {
      throw new Error(
        `Helper returned an invalid or client-incompatible --hello payload (expected protocol ${expectedVersion}): ${path}`,
      );
    }
  },
  manifestFields: (hello, expectedVersion) => ({
    helperVersion: hello.helperVersion,
    protocolVersion: hello.protocolVersion,
    minClientProtocolVersion: hello.minClientProtocolVersion,
    clientProtocolVersion: expectedVersion,
  }),
  verifyManifest(manifest, expectedVersion) {
    if (
      manifest.protocolVersion !== expectedVersion ||
      manifest.clientProtocolVersion !== expectedVersion ||
      !Number.isInteger(manifest.minClientProtocolVersion) ||
      manifest.minClientProtocolVersion < 1 ||
      manifest.minClientProtocolVersion > expectedVersion
    ) {
      throw new Error(
        `Computer-use helper manifest is incompatible with client protocol ${expectedVersion}`,
      );
    }
  },
  manifestMatchesHello: (manifest, hello) =>
    manifest.helperVersion === hello.helperVersion &&
    manifest.protocolVersion === hello.protocolVersion,
};

if (isMain(import.meta.url)) runScript(spec);
