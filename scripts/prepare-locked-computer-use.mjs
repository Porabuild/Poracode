#!/usr/bin/env node

// Builds and stages the macOS Locked Computer Use authorization plug-in.
//
// Output (resources/locked-computer-use/, packaged to
// process.resourcesPath/locked-computer-use/):
//   PoracodeLockedUse.bundle          universal (arm64 + x86_64) SecurityAgent plug-in
//   locked-computer-use-installer     root installer (install/uninstall/status)
//   README.md                         install, recovery, and IT/MDM notes
//
// The bundle is ad-hoc signed here so it is structurally valid; release
// packaging re-signs it with the Developer ID identity (electron-builder
// `mac.binaries`). Nothing is installed by this script.
//
// Environment:
//   PORACODE_LCU_TEAM_ID             Developer ID team that must sign the helper.
//                                    Empty => the plug-in always denies (unsigned_build).
//   PORACODE_LCU_HELPER_IDENTIFIER   Helper code-signing identifier
//                                    (default: poracode-computer-use).

import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repoRoot, "native", "locked-computer-use");
const bundleName = "PoracodeLockedUse.bundle";
const executableName = "PoracodeLockedUse";
const installerName = "locked-computer-use-installer";
export const DEFAULT_HELPER_IDENTIFIER = "poracode-computer-use";
const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const LOG_PREFIX = "[prepare-locked-computer-use]";

function parseArgs(argv) {
  const options = {
    out: join(repoRoot, "resources", "locked-computer-use"),
    platform: null,
    requireTeam: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require-team") options.requireTeam = true;
    else if (argument === "--platform" || argument === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      if (argument === "--platform") options.platform = value;
      else options.out = resolve(value);
      index += 1;
    } else if (argument.startsWith("--platform=")) {
      options.platform = argument.slice("--platform=".length);
    } else if (argument.startsWith("--out=")) {
      options.out = resolve(argument.slice("--out=".length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function normalizePlatform(value) {
  if (value === "darwin") return "mac";
  if (value === "win32") return "win";
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe", ...options });
  if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

export function resolveSigningDefines(env = process.env) {
  const teamId = (env.PORACODE_LCU_TEAM_ID ?? "").trim();
  const helperIdentifier =
    (env.PORACODE_LCU_HELPER_IDENTIFIER ?? "").trim() || DEFAULT_HELPER_IDENTIFIER;
  // Both values are spliced into a code-signing requirement string; restrict
  // them to their documented character sets so they cannot alter its meaning.
  if (teamId !== "" && !TEAM_ID_PATTERN.test(teamId)) {
    throw new Error("PORACODE_LCU_TEAM_ID must be a 10-character Apple team identifier");
  }
  if (!IDENTIFIER_PATTERN.test(helperIdentifier)) {
    throw new Error("PORACODE_LCU_HELPER_IDENTIFIER contains unsupported characters");
  }
  return { teamId, helperIdentifier };
}

function buildBundle(stageRoot, { teamId, helperIdentifier }) {
  const bundleRoot = join(stageRoot, bundleName);
  const macosDir = join(bundleRoot, "Contents", "MacOS");
  mkdirSync(macosDir, { recursive: true });
  copyFileSync(join(sourceRoot, "Info.plist"), join(bundleRoot, "Contents", "Info.plist"));
  const executable = join(macosDir, executableName);
  run("xcrun", [
    "clang",
    "-arch",
    "arm64",
    "-arch",
    "x86_64",
    "-bundle",
    "-mmacosx-version-min=14.0",
    "-fvisibility=hidden",
    "-fstack-protector-strong",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-O2",
    `-DPORACODE_LCU_TEAM_ID="${teamId}"`,
    `-DPORACODE_LCU_HELPER_IDENTIFIER="${helperIdentifier}"`,
    "-framework",
    "Security",
    "-framework",
    "SystemConfiguration",
    "-framework",
    "CoreFoundation",
    "-o",
    executable,
    join(sourceRoot, "src", "plugin.c"),
    join(sourceRoot, "src", "lcu_logic.c"),
  ]);

  const arches = run("lipo", ["-archs", executable]).split(/\s+/u);
  if (!arches.includes("arm64") || !arches.includes("x86_64")) {
    throw new Error(`Plug-in is not universal (found: ${arches.join(", ")})`);
  }
  const exported = run("nm", ["-gU", executable]);
  if (!/\b_AuthorizationPluginCreate\b/u.test(exported)) {
    throw new Error("Plug-in does not export AuthorizationPluginCreate");
  }
  // Ad-hoc signature keeps the bundle structurally valid for local checks;
  // release packaging replaces it with the Developer ID signature.
  run("codesign", ["--force", "--sign", "-", "--timestamp=none", bundleRoot]);
  run("codesign", ["--verify", "--strict", bundleRoot]);
  return bundleRoot;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const platform = normalizePlatform(options.platform ?? process.platform);
  if (platform !== "mac") {
    console.log(`${LOG_PREFIX} skipped: the authorization plug-in is macOS only (${platform})`);
    return;
  }
  if (process.platform !== "darwin") {
    throw new Error("The macOS authorization plug-in can only be built on macOS");
  }

  const defines = resolveSigningDefines();
  if (defines.teamId === "") {
    if (options.requireTeam) {
      throw new Error("PORACODE_LCU_TEAM_ID is required for release builds (--require-team)");
    }
    console.warn(
      `${LOG_PREFIX} PORACODE_LCU_TEAM_ID is empty: this plug-in build always denies (unsigned_build)`,
    );
  }

  const stageRoot = `${options.out}.tmp-${process.pid}`;
  rmSync(stageRoot, { recursive: true, force: true });
  mkdirSync(stageRoot, { recursive: true });
  try {
    buildBundle(stageRoot, defines);
    const installer = join(stageRoot, installerName);
    copyFileSync(join(sourceRoot, installerName), installer);
    chmodSync(installer, 0o755);
    copyFileSync(join(sourceRoot, "README.md"), join(stageRoot, "README.md"));
    rmSync(options.out, { recursive: true, force: true });
    mkdirSync(dirname(options.out), { recursive: true });
    renameSync(stageRoot, options.out);
  } finally {
    if (existsSync(stageRoot)) rmSync(stageRoot, { recursive: true, force: true });
  }
  console.log(
    `${LOG_PREFIX} staged ${options.out} (team ${defines.teamId || "<none>"}, helper identifier ${defines.helperIdentifier})`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`${LOG_PREFIX} ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
