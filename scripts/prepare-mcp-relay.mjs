#!/usr/bin/env node

// Stages the native MCP HTTP relay into resources/wsl-helpers/mcp-relay/.
// The shared driver lives in scripts/lib/native-helper-prepare.mjs; this
// file is only the relay's spec.

import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMain, runScript } from "./lib/native-helper-prepare.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(repoRoot, "src", "supervisor", "mcp", "mcpToolFilterConfig.ts");

function relayConfigVersion() {
  const source = readFileSync(configPath, "utf8");
  const match = /export const MCP_HTTP_RELAY_CONFIG_VERSION = (\d+);/u.exec(source);
  if (!match) {
    throw new Error(`Could not read the relay config version from ${configPath}`);
  }
  return Number(match[1]);
}

const expectedConfigVersion = relayConfigVersion();

export const spec = {
  scriptName: "prepare-mcp-relay",
  noun: "relay",
  label: "MCP relay",
  helloNoun: "Relay",
  binaryName: "poracode-mcp-relay",
  crateRoot: join(repoRoot, "native", "mcp-relay"),
  repoRoot,
  cargoProfile: () => "release",
  resourcesRoot: () => join(repoRoot, "resources", "wsl-helpers", "mcp-relay"),
  missingToolMessage: () =>
    "Rust cargo/rustup is unavailable; MCP HTTP endpoints will use the JavaScript relay",
  allowMissing: () => /^(1|true|yes)$/i.test(process.env.PORACODE_ALLOW_MISSING_MCP_RELAY ?? ""),
  expectedVersion: () => expectedConfigVersion,
  // A host with no target for --host-only (e.g. linux-arm64) warns and
  // exits 0 so endpoints keep using the JavaScript relay.
  unsupportedHostArch: "warn",
  validateHello(parsed, path, expectedVersion) {
    if (
      parsed?.helper !== "poracode-mcp-relay" ||
      typeof parsed?.helperVersion !== "string" ||
      parsed.helperVersion.length === 0 ||
      parsed?.relayConfigVersion !== expectedVersion ||
      !["darwin", "win32", "linux"].includes(parsed?.platform) ||
      !["x64", "arm64"].includes(parsed?.arch)
    ) {
      throw new Error(
        `Relay returned an invalid or incompatible --hello payload (expected config version ${expectedVersion}): ${path}`,
      );
    }
  },
  manifestFields: (hello, expectedVersion) => ({
    helper: hello.helper,
    helperVersion: hello.helperVersion,
    relayConfigVersion: hello.relayConfigVersion,
    clientRelayConfigVersion: expectedVersion,
  }),
  verifyManifest(manifest, expectedVersion) {
    if (
      manifest.relayConfigVersion !== expectedVersion ||
      manifest.clientRelayConfigVersion !== expectedVersion
    ) {
      throw new Error(
        `MCP relay manifest is incompatible with relay config version ${expectedVersion}`,
      );
    }
  },
  manifestMatchesHello: (manifest, hello) => manifest.helperVersion === hello.helperVersion,
};

if (isMain(import.meta.url)) runScript(spec);
