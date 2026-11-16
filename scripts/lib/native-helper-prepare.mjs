// Shared driver for the native helper prepare scripts
// (prepare-computer-use-helper.mjs, prepare-mcp-relay.mjs): argument parsing,
// host/target selection, freshness checks, Windows/Linux and macOS (lipo)
// staging, the `--hello` handshake, manifest write/verify, and the main
// control flow. Each script supplies a spec; the machinery stays identical.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const NATIVE_HELPER_TARGETS = {
  win: [
    { arch: "x64", id: "win32-x64", triple: "x86_64-pc-windows-msvc" },
    { arch: "arm64", id: "win32-arm64", triple: "aarch64-pc-windows-msvc" },
  ],
  linux: [{ arch: "x64", id: "linux-x64", triple: "x86_64-unknown-linux-musl" }],
};

export class UnsupportedArchError extends Error {}

export function parseArgs(argv, extraFlags = {}) {
  const options = {
    arch: null,
    check: false,
    force: false,
    hostOnly: false,
    platform: null,
    require: false,
  };
  for (const flag of Object.keys(extraFlags)) options[flag] = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
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
    } else if (extraFlags[argument.slice(2)] === true && argument.startsWith("--")) {
      options[argument.slice(2)] = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export function hostPlatform() {
  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return "mac";
  if (process.platform === "linux") return "linux";
  throw new Error(`Unsupported host platform: ${process.platform}`);
}

export function normalizePlatform(value) {
  if (value === "win32") return "win";
  if (value === "darwin") return "mac";
  return value;
}

export function run(crateRoot, command, args, options = {}) {
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

export function commandExists(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", stdio: "pipe" });
  return !result.error && result.status === 0;
}

export function newestSourceMtime(path) {
  let newest = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "target") continue;
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestSourceMtime(entryPath));
    else if (entry.isFile()) newest = Math.max(newest, statSync(entryPath).mtimeMs);
  }
  return newest;
}

export function stagedBinary(resourcesRoot, binaryName, id) {
  return join(
    resourcesRoot,
    id,
    process.platform === "win32" && id.startsWith("win32-") ? `${binaryName}.exe` : binaryName,
  );
}

export function cargoTargetDirectory(crateRoot) {
  const metadata = JSON.parse(
    run(crateRoot, "cargo", ["metadata", "--format-version", "1", "--no-deps"], {
      capture: true,
    }),
  );
  if (typeof metadata.target_directory !== "string") {
    throw new Error("Cargo metadata did not report target_directory");
  }
  return metadata.target_directory;
}

export function builtBinary(targetDirectory, triple, profile, binaryName, extension = "") {
  return join(
    targetDirectory,
    triple,
    profile === "dev" ? "debug" : "release",
    `${binaryName}${extension}`,
  );
}

export function isCurrent(path, sourceMtime) {
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  return stat.isFile() && stat.size > 0 && stat.mtimeMs >= sourceMtime;
}

export function copyBuiltBinary(source, destination) {
  if (!existsSync(source) || statSync(source).size === 0) {
    throw new Error(`Cargo did not produce ${source}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  if (process.platform !== "win32") chmodSync(destination, 0o755);
}

// `ctx` carries the per-run values the spec fixed: { crateRoot, resourcesRoot,
// binaryName, noun, scriptName, label, helloNoun, targetTable, profile, repoRoot }.

export function prepareWindowsOrLinux(ctx, platform, targets, sourceMtime, force, targetDirectory) {
  let built = false;
  for (const target of targets) {
    const destination = stagedBinary(ctx.resourcesRoot, ctx.binaryName, target.id);
    if (!force && isCurrent(destination, sourceMtime)) {
      console.log(`[${ctx.scriptName}] ${target.id} is current, skipping`);
      continue;
    }
    run(ctx.crateRoot, "rustup", ["target", "add", target.triple]);
    run(ctx.crateRoot, "cargo", [
      "build",
      "--profile",
      ctx.profile,
      "--locked",
      "--target",
      target.triple,
    ]);
    copyBuiltBinary(
      builtBinary(
        targetDirectory,
        target.triple,
        ctx.profile,
        ctx.binaryName,
        platform === "win" ? ".exe" : "",
      ),
      destination,
    );
    console.log(`[${ctx.scriptName}] staged ${target.id} -> ${destination}`);
    built = true;
  }
  return built;
}

export function prepareMac(ctx, sourceMtime, force, targetDirectory) {
  const id = "darwin-universal";
  const destination = stagedBinary(ctx.resourcesRoot, ctx.binaryName, id);
  if (!force && isCurrent(destination, sourceMtime)) {
    console.log(`[${ctx.scriptName}] ${id} is current, skipping`);
    return false;
  }

  const triples = ["x86_64-apple-darwin", "aarch64-apple-darwin"];
  for (const triple of triples) {
    run(ctx.crateRoot, "rustup", ["target", "add", triple]);
    run(ctx.crateRoot, "cargo", [
      "build",
      "--profile",
      ctx.profile,
      "--locked",
      "--target",
      triple,
    ]);
  }
  mkdirSync(dirname(destination), { recursive: true });
  run(ctx.crateRoot, "lipo", [
    "-create",
    builtBinary(targetDirectory, triples[0], ctx.profile, ctx.binaryName),
    builtBinary(targetDirectory, triples[1], ctx.profile, ctx.binaryName),
    "-output",
    destination,
  ]);
  chmodSync(destination, 0o755);
  console.log(`[${ctx.scriptName}] staged ${id} -> ${destination}`);
  return true;
}

export function requestedTargets(platform, arch, hostOnly, hostArch, targetTable, noun) {
  if (platform === "mac") {
    if (arch && arch !== "universal") {
      throw new Error(
        `The macOS ${noun} is always staged as a universal binary; use --arch universal`,
      );
    }
    return [{ arch: "universal", id: "darwin-universal" }];
  }

  const targets = targetTable[platform];
  if (!targets) throw new Error(`Unknown platform "${platform}". Expected win, mac, or linux.`);
  const selectedArch = arch ?? (hostOnly ? hostArch : null);
  if (!selectedArch) return targets;
  const selected = targets.filter((target) => target.arch === selectedArch);
  if (selected.length === 0) {
    throw new UnsupportedArchError(`Unsupported ${platform} ${noun} architecture: ${selectedArch}`);
  }
  return selected;
}

export function readHello(path, spec, expectedVersion) {
  let parsed;
  try {
    parsed = JSON.parse(run(spec.crateRoot, path, ["--hello"], { capture: true }));
  } catch (error) {
    throw new Error(`${spec.helloNoun} handshake failed for ${path}: ${error.message}`, {
      cause: error,
    });
  }
  spec.validateHello(parsed, path, expectedVersion);
  return parsed;
}

export function runnableBinary(ctx, platform) {
  if (platform === "mac")
    return stagedBinary(ctx.resourcesRoot, ctx.binaryName, "darwin-universal");
  if (platform === "win")
    return stagedBinary(ctx.resourcesRoot, ctx.binaryName, `win32-${process.arch}`);
  if (platform === "linux" && process.arch === "x64")
    return stagedBinary(ctx.resourcesRoot, ctx.binaryName, "linux-x64");
  return null;
}

export function discoverStagedTargets(ctx) {
  // macOS is staged as one universal binary, so it has no targetTable row.
  const ids = [
    ...Object.values(ctx.targetTable)
      .flat()
      .map((target) => target.id),
    "darwin-universal",
  ];
  return ids.filter((id) => {
    const path = stagedBinary(ctx.resourcesRoot, ctx.binaryName, id);
    return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
  });
}

export function gitSha(repoRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function writeManifest(ctx, spec, expectedVersion, hello, built) {
  mkdirSync(ctx.resourcesRoot, { recursive: true });
  const manifestPath = join(ctx.resourcesRoot, "manifest.json");
  let previous = null;
  if (existsSync(manifestPath)) {
    try {
      previous = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      // Replace malformed generated state.
    }
  }
  const manifest = {
    ...spec.manifestFields(hello, expectedVersion),
    targets: discoverStagedTargets(ctx),
    builtAt:
      built || typeof previous?.builtAt !== "string" ? new Date().toISOString() : previous.builtAt,
    gitSha: gitSha(ctx.repoRoot),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[${ctx.scriptName}] manifest -> ${manifestPath}`);
  return manifest;
}

export function verifyRequested(ctx, spec, expectedVersion, manifest, targets) {
  spec.verifyManifest(manifest, expectedVersion);
  for (const target of targets) {
    if (!manifest.targets.includes(target.id)) {
      throw new Error(`${ctx.label} target is missing from manifest: ${target.id}`);
    }
    const path = stagedBinary(ctx.resourcesRoot, ctx.binaryName, target.id);
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
      throw new Error(`${ctx.label} binary is missing or empty: ${path}`);
    }
  }
}

/**
 * Runs one prepare script end to end. `io` exists for tests: it can pin the
 * host platform/arch and argv so target selection and the unsupported-arch
 * fallback can be exercised without cargo.
 */
export function runNativeHelperPrepare(spec, io = {}) {
  const options = parseArgs(io.argv ?? process.argv.slice(2), spec.extraFlags ?? {});
  const profile = spec.cargoProfile(options);
  const resourcesRoot = spec.resourcesRoot(options);
  const ctx = {
    repoRoot: spec.repoRoot,
    crateRoot: spec.crateRoot,
    resourcesRoot,
    binaryName: spec.binaryName,
    noun: spec.noun,
    scriptName: spec.scriptName,
    label: spec.label,
    helloNoun: spec.helloNoun,
    targetTable: spec.targetTable ?? NATIVE_HELPER_TARGETS,
    profile,
  };
  const host = io.platform ?? hostPlatform();
  const hostArch = io.arch ?? process.arch;
  const platform = normalizePlatform(options.platform ?? host);
  if (platform !== host) {
    throw new Error(
      `Cross-platform ${spec.noun} builds are unsupported (${host} host, ${platform} requested)`,
    );
  }
  const manifestPath = join(resourcesRoot, "manifest.json");
  const expectedVersion = spec.expectedVersion();

  let targets;
  try {
    targets = requestedTargets(
      platform,
      options.arch,
      options.hostOnly,
      hostArch,
      ctx.targetTable,
      spec.noun,
    );
  } catch (error) {
    // A host with no target for --host-only (e.g. linux-arm64) warns and
    // exits 0 so the JavaScript fallback is used — unless --require or
    // --check asked for a real artifact, or --arch was given explicitly
    // (an explicit request must fail rather than silently warn).
    if (
      spec.unsupportedHostArch === "warn" &&
      error instanceof UnsupportedArchError &&
      options.hostOnly &&
      !options.require &&
      !options.check &&
      options.arch == null
    ) {
      console.warn(`[${spec.scriptName}] ${error.message}; the JavaScript relay will be used`);
      return;
    }
    throw error;
  }

  if (options.check) {
    if (!existsSync(manifestPath))
      throw new Error(`${spec.helloNoun} manifest is missing: ${manifestPath}`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    verifyRequested(ctx, spec, expectedVersion, manifest, targets);
    const executable = runnableBinary(ctx, platform);
    if (!executable || !existsSync(executable)) {
      throw new Error(
        `No staged ${spec.noun} binary can run on this host for handshake verification`,
      );
    }
    const hello = readHello(executable, spec, expectedVersion);
    if (!spec.manifestMatchesHello(manifest, hello)) {
      throw new Error(`${spec.helloNoun} manifest does not match the staged binary handshake`);
    }
    console.log(`[${spec.scriptName}] verified ${targets.map((target) => target.id).join(", ")}`);
    return;
  }

  if (!commandExists("cargo") || !commandExists("rustup")) {
    const message = spec.missingToolMessage(platform);
    if (options.require && !spec.allowMissing()) throw new Error(message);
    if (spec.allowMissing()) mkdirSync(resourcesRoot, { recursive: true });
    console.warn(`[${spec.scriptName}] ${message}`);
    return;
  }

  const sourceMtime = newestSourceMtime(spec.crateRoot);
  const targetDirectory = cargoTargetDirectory(spec.crateRoot);
  const built =
    platform === "mac"
      ? prepareMac(ctx, sourceMtime, options.force, targetDirectory)
      : prepareWindowsOrLinux(ctx, platform, targets, sourceMtime, options.force, targetDirectory);
  const executable = runnableBinary(ctx, platform);
  if (!executable || !existsSync(executable)) {
    throw new Error(
      `No staged ${spec.noun} binary can run on this host for handshake verification`,
    );
  }
  const manifest = writeManifest(
    ctx,
    spec,
    expectedVersion,
    readHello(executable, spec, expectedVersion),
    built,
  );
  verifyRequested(ctx, spec, expectedVersion, manifest, targets);
}

/** True when this module is the process entry point (not a test import). */
export function isMain(metaUrl) {
  const entry = process.argv[1];
  if (entry == null) return false;
  const metaPath = fileURLToPath(metaUrl);
  try {
    // argv[1] can reach the script through a symlinked path (macOS /tmp,
    // /var, a linked worktree) while import.meta.url is already realpath'd
    // — compare canonical paths or the entry check silently never fires.
    return realpathSync(resolve(entry)) === realpathSync(metaPath);
  } catch {
    return resolve(entry) === metaPath;
  }
}

/** Entry-point wrapper: run the spec, report failures with the log prefix. */
export function runScript(spec) {
  try {
    runNativeHelperPrepare(spec);
  } catch (error) {
    console.error(`[${spec.scriptName}] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
