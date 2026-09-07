#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const crateRoot = join(repoRoot, "native", "computer-use-helper");
let resourcesRoot = join(repoRoot, "resources", "computer-use-helper");
let cargoProfile = "release";
const binaryName = "poracode-computer-use";
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

const targetTable = {
  win: [
    { arch: "x64", id: "win32-x64", triple: "x86_64-pc-windows-msvc" },
    { arch: "arm64", id: "win32-arm64", triple: "aarch64-pc-windows-msvc" },
  ],
  linux: [{ arch: "x64", id: "linux-x64", triple: "x86_64-unknown-linux-musl" }],
};

function parseArgs(argv) {
  const options = {
    arch: null,
    check: false,
    dev: false,
    force: false,
    hostOnly: false,
    platform: null,
    require: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--dev") options.dev = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--host-only") options.hostOnly = true;
    else if (argument === "--require") options.require = true;
    else if (argument === "--platform" || argument === "--arch") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      options[argument === "--platform" ? "platform" : "arch"] = value;
      index += 1;
    } else if (argument.startsWith("--platform=")) {
      options.platform = argument.slice("--platform=".length);
    } else if (argument.startsWith("--arch=")) {
      options.arch = argument.slice("--arch=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function hostPlatform() {
  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return "mac";
  if (process.platform === "linux") return "linux";
  throw new Error(`Unsupported host platform: ${process.platform}`);
}

function normalizePlatform(value) {
  if (value === "win32") return "win";
  if (value === "darwin") return "mac";
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: crateRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
  if (result.error) {
    throw new Error(`${command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}${detail}`);
  }
  return result.stdout?.trim() ?? "";
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", stdio: "pipe" });
  return !result.error && result.status === 0;
}

function allowMissingHelper() {
  return /^(1|true|yes)$/i.test(process.env.PORACODE_ALLOW_MISSING_COMPUTER_USE_HELPER ?? "");
}

function newestSourceMtime(path) {
  let newest = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "target") continue;
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestSourceMtime(entryPath));
    else if (entry.isFile()) newest = Math.max(newest, statSync(entryPath).mtimeMs);
  }
  return newest;
}

function stagedBinary(id) {
  return join(
    resourcesRoot,
    id,
    process.platform === "win32" && id.startsWith("win32-") ? `${binaryName}.exe` : binaryName,
  );
}

function cargoTargetDirectory() {
  const metadata = JSON.parse(
    run("cargo", ["metadata", "--format-version", "1", "--no-deps"], { capture: true }),
  );
  if (typeof metadata.target_directory !== "string") {
    throw new Error("Cargo metadata did not report target_directory");
  }
  return metadata.target_directory;
}

function builtBinary(targetDirectory, triple, extension = "") {
  return join(
    targetDirectory,
    triple,
    cargoProfile === "dev" ? "debug" : "release",
    `${binaryName}${extension}`,
  );
}

function isCurrent(path, sourceMtime) {
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  return stat.isFile() && stat.size > 0 && stat.mtimeMs >= sourceMtime;
}

function copyBuiltBinary(source, destination) {
  if (!existsSync(source) || statSync(source).size === 0) {
    throw new Error(`Cargo did not produce ${source}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  if (process.platform !== "win32") chmodSync(destination, 0o755);
}

function prepareWindowsOrLinux(platform, targets, sourceMtime, force, targetDirectory) {
  let built = false;
  for (const target of targets) {
    const destination = stagedBinary(target.id);
    if (!force && isCurrent(destination, sourceMtime)) {
      console.log(`[prepare-computer-use-helper] ${target.id} is current, skipping`);
      continue;
    }
    run("rustup", ["target", "add", target.triple]);
    run("cargo", ["build", "--profile", cargoProfile, "--locked", "--target", target.triple]);
    copyBuiltBinary(
      builtBinary(targetDirectory, target.triple, platform === "win" ? ".exe" : ""),
      destination,
    );
    console.log(`[prepare-computer-use-helper] staged ${target.id} -> ${destination}`);
    built = true;
  }
  return built;
}

function prepareMac(sourceMtime, force, targetDirectory) {
  const id = "darwin-universal";
  const destination = stagedBinary(id);
  if (!force && isCurrent(destination, sourceMtime)) {
    console.log(`[prepare-computer-use-helper] ${id} is current, skipping`);
    return false;
  }

  const triples = ["x86_64-apple-darwin", "aarch64-apple-darwin"];
  for (const triple of triples) {
    run("rustup", ["target", "add", triple]);
    run("cargo", ["build", "--profile", cargoProfile, "--locked", "--target", triple]);
  }
  mkdirSync(dirname(destination), { recursive: true });
  run("lipo", [
    "-create",
    builtBinary(targetDirectory, triples[0]),
    builtBinary(targetDirectory, triples[1]),
    "-output",
    destination,
  ]);
  chmodSync(destination, 0o755);
  console.log(`[prepare-computer-use-helper] staged ${id} -> ${destination}`);
  return true;
}

function requestedTargets(platform, arch, hostOnly) {
  if (platform === "mac") {
    if (arch && arch !== "universal") {
      throw new Error(
        "The macOS helper is always staged as a universal binary; use --arch universal",
      );
    }
    return [{ arch: "universal", id: "darwin-universal" }];
  }

  const targets = targetTable[platform];
  if (!targets) throw new Error(`Unknown platform "${platform}". Expected win, mac, or linux.`);
  const selectedArch = arch ?? (hostOnly ? process.arch : null);
  if (!selectedArch) return targets;
  const selected = targets.filter((target) => target.arch === selectedArch);
  if (selected.length === 0) {
    throw new Error(`Unsupported ${platform} helper architecture: ${selectedArch}`);
  }
  return selected;
}

function readHello(path) {
  let parsed;
  try {
    parsed = JSON.parse(run(path, ["--hello"], { capture: true }));
  } catch (error) {
    throw new Error(`Helper handshake failed for ${path}: ${error.message}`, { cause: error });
  }
  if (
    typeof parsed?.helperVersion !== "string" ||
    parsed.helperVersion.length === 0 ||
    parsed?.protocolVersion !== expectedProtocolVersion ||
    !Number.isInteger(parsed?.minClientProtocolVersion) ||
    parsed.minClientProtocolVersion < 1 ||
    parsed.minClientProtocolVersion > expectedProtocolVersion ||
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
      `Helper returned an invalid or client-incompatible --hello payload (expected protocol ${expectedProtocolVersion}): ${path}`,
    );
  }
  return parsed;
}

function runnableBinary(platform) {
  if (platform === "mac") return stagedBinary("darwin-universal");
  if (platform === "win") return stagedBinary(`win32-${process.arch}`);
  if (platform === "linux" && process.arch === "x64") return stagedBinary("linux-x64");
  return null;
}

function discoverStagedTargets() {
  // macOS is staged as one universal binary, so it has no targetTable row.
  const ids = [
    ...Object.values(targetTable)
      .flat()
      .map((target) => target.id),
    "darwin-universal",
  ];
  return ids.filter((id) => {
    const path = stagedBinary(id);
    return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
  });
}

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function writeManifest(hello, built) {
  mkdirSync(resourcesRoot, { recursive: true });
  const manifestPath = join(resourcesRoot, "manifest.json");
  let previous = null;
  if (existsSync(manifestPath)) {
    try {
      previous = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      // Replace malformed generated state.
    }
  }
  const manifest = {
    helperVersion: hello.helperVersion,
    protocolVersion: hello.protocolVersion,
    minClientProtocolVersion: hello.minClientProtocolVersion,
    clientProtocolVersion: expectedProtocolVersion,
    targets: discoverStagedTargets(),
    builtAt:
      built || typeof previous?.builtAt !== "string" ? new Date().toISOString() : previous.builtAt,
    gitSha: gitSha(),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[prepare-computer-use-helper] manifest -> ${manifestPath}`);
  return manifest;
}

function verifyRequested(manifest, targets) {
  if (
    manifest.protocolVersion !== expectedProtocolVersion ||
    manifest.clientProtocolVersion !== expectedProtocolVersion ||
    !Number.isInteger(manifest.minClientProtocolVersion) ||
    manifest.minClientProtocolVersion < 1 ||
    manifest.minClientProtocolVersion > expectedProtocolVersion
  ) {
    throw new Error(
      `Computer-use helper manifest is incompatible with client protocol ${expectedProtocolVersion}`,
    );
  }
  for (const target of targets) {
    if (!manifest.targets.includes(target.id)) {
      throw new Error(`Computer-use helper target is missing from manifest: ${target.id}`);
    }
    const path = stagedBinary(target.id);
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
      throw new Error(`Computer-use helper binary is missing or empty: ${path}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  cargoProfile = options.dev ? "dev" : "release";
  resourcesRoot = join(
    repoRoot,
    "resources",
    options.dev ? "computer-use-helper-dev" : "computer-use-helper",
  );
  const host = hostPlatform();
  const platform = normalizePlatform(options.platform ?? host);
  if (platform !== host) {
    throw new Error(
      `Cross-platform helper builds are unsupported (${host} host, ${platform} requested)`,
    );
  }
  const targets = requestedTargets(platform, options.arch, options.hostOnly);
  const manifestPath = join(resourcesRoot, "manifest.json");

  if (options.check) {
    if (!existsSync(manifestPath)) throw new Error(`Helper manifest is missing: ${manifestPath}`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    verifyRequested(manifest, targets);
    const executable = runnableBinary(platform);
    if (!executable || !existsSync(executable)) {
      throw new Error("No staged helper binary can run on this host for handshake verification");
    }
    const hello = readHello(executable);
    if (
      manifest.helperVersion !== hello.helperVersion ||
      manifest.protocolVersion !== hello.protocolVersion
    ) {
      throw new Error("Helper manifest does not match the staged binary handshake");
    }
    console.log(
      `[prepare-computer-use-helper] verified ${targets.map((target) => target.id).join(", ")}`,
    );
    return;
  }

  if (!commandExists("cargo") || !commandExists("rustup")) {
    const message =
      platform === "linux"
        ? "Rust cargo/rustup is unavailable; computer use will be unavailable on Linux"
        : "Rust cargo/rustup is unavailable; computer use will use the legacy foreground driver";
    if (options.require && !allowMissingHelper()) throw new Error(message);
    if (allowMissingHelper()) mkdirSync(resourcesRoot, { recursive: true });
    console.warn(`[prepare-computer-use-helper] ${message}`);
    return;
  }

  const sourceMtime = newestSourceMtime(crateRoot);
  const targetDirectory = cargoTargetDirectory();
  const built =
    platform === "mac"
      ? prepareMac(sourceMtime, options.force, targetDirectory)
      : prepareWindowsOrLinux(platform, targets, sourceMtime, options.force, targetDirectory);
  const executable = runnableBinary(platform);
  if (!executable || !existsSync(executable)) {
    throw new Error("No staged helper binary can run on this host for handshake verification");
  }
  const manifest = writeManifest(readHello(executable), built);
  verifyRequested(manifest, targets);
}

try {
  main();
} catch (error) {
  console.error(`[prepare-computer-use-helper] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
