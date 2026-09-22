/**
 * `poracode` launcher: resolve the pinned runtime, install it into the
 * versioned cache if needed, then hand the terminal to the real server CLI.
 *
 * Bare invocation starts the foreground server. `--version` and `--help` are
 * answered from the launcher itself and never touch the cache or the network.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRuntimeCacheRoot } from "./cache.mjs";
import { offlineNoCache, PoracodeLauncherError } from "./errors.mjs";
import { ensureRuntime, runtimeDirectory } from "./install.mjs";
import { loadRuntimeManifest, selectRuntimeEntry } from "./manifest.mjs";
import { requireRuntimeTargetKey } from "./target.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

export function launcherVersion() {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  return manifest.version;
}

export function runtimeManifestPath() {
  return join(packageRoot, "runtime-manifest.json");
}

/**
 * The documented operator escape hatch for air-gapped or pre-release installs:
 * both the local tarball and its expected sha256 must be supplied. The bytes
 * are still verified before extraction.
 */
export function resolveArtifactOverride(env) {
  const tarball = env.PORACODE_SERVER_TARBALL?.trim();
  const sha256 = env.PORACODE_SERVER_TARBALL_SHA256?.trim();
  if (!tarball && !sha256) return null;
  if (!tarball || !sha256) {
    throw new PoracodeLauncherError(
      "PORACODE_ARTIFACT_OVERRIDE_INCOMPLETE",
      "PORACODE_SERVER_TARBALL and PORACODE_SERVER_TARBALL_SHA256 must be set together.",
      "Set both to install a local verified runtime tarball, or unset both to use the pinned release asset.",
    );
  }
  if (!/^[0-9a-f]{64}$/u.test(sha256)) {
    throw new PoracodeLauncherError(
      "PORACODE_ARTIFACT_OVERRIDE_INVALID",
      "PORACODE_SERVER_TARBALL_SHA256 must be a lowercase sha256 hex digest.",
    );
  }
  // Existence is checked only when an install is actually needed: a verified
  // cache already installed from these bytes runs without the source tarball.
  return { localTarball: resolve(tarball), sha256 };
}

export async function resolveRuntimeDir(input = {}) {
  const env = input.env ?? process.env;
  const version = launcherVersion();
  const manifest = loadRuntimeManifest(input.manifestPath ?? runtimeManifestPath());
  if (manifest.version !== version) {
    throw new PoracodeLauncherError(
      "PORACODE_RUNTIME_MANIFEST_MISMATCH",
      `The embedded runtime manifest is for ${manifest.version} but the launcher is ${version}.`,
      "Reinstall the poracode package; a mixed package/manifest pair is never used.",
    );
  }
  const target = env.PORACODE_RUNTIME_TARGET?.trim() || requireRuntimeTargetKey();
  const override = resolveArtifactOverride(env);
  const entry = override
    ? { url: `https://poracode.invalid/local/${version}/${target}`, sha256: override.sha256 }
    : selectRuntimeEntry(manifest, target);
  const cacheRoot = resolveRuntimeCacheRoot(env);
  const controller = new AbortController();
  const handlers = FORWARDED_SIGNALS.map((signal) => {
    const handler = () => controller.abort();
    process.on(signal, handler);
    return [signal, handler];
  });
  try {
    return await ensureRuntime({
      version,
      target,
      entry,
      cacheRoot,
      signal: controller.signal,
      ...(override ? { localTarball: override.localTarball } : {}),
      ...(input.installOptions ?? {}),
    });
  } catch (error) {
    if (!override && error?.code === "PORACODE_RUNTIME_DOWNLOAD_FAILED") {
      throw offlineNoCache(entry.url, runtimeDirectory(cacheRoot, version, target));
    }
    throw error;
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  }
}

export function execServer(input) {
  const spawnImpl = input.spawnImpl ?? spawn;
  const entry = join(input.runtimeDir, "lib", "server.cjs");
  const child = spawnImpl(process.execPath, [entry, ...input.args], {
    stdio: "inherit",
    env: { ...input.env, PORACODE_APP_VERSION: input.version },
  });
  const forwards = new Map();
  for (const signal of FORWARDED_SIGNALS) {
    const forward = () => {
      try {
        child.kill(signal);
      } catch {
        // The child already exited.
      }
    };
    forwards.set(signal, forward);
    process.on(signal, forward);
  }
  return new Promise((done, fail) => {
    child.on("error", (error) => {
      for (const [signal, forward] of forwards) process.off(signal, forward);
      fail(error);
    });
    child.on("exit", (code, signal) => {
      for (const [name, forward] of forwards) process.off(name, forward);
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      done(code ?? 0);
    });
  });
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;
  const version = launcherVersion();
  if (argv.length === 1 && ["--version", "-v", "version"].includes(argv[0])) {
    stdout.write(`${version}\n`);
    return 0;
  }
  if (argv.length === 1 && ["--help", "-h", "help"].includes(argv[0])) {
    printHelp(stdout, version);
    return 0;
  }
  if (resolveArtifactOverride(env)) {
    process.stderr.write(
      "[poracode] using PORACODE_SERVER_TARBALL override; the local tarball is verified against " +
        "PORACODE_SERVER_TARBALL_SHA256 before install.\n",
    );
  }
  const runtimeDir = await resolveRuntimeDir({
    env,
    ...(options.installOptions ? { installOptions: options.installOptions } : {}),
  });
  return await execServer({
    runtimeDir,
    args: argv,
    version,
    env,
    ...(options.spawnImpl ? { spawnImpl: options.spawnImpl } : {}),
  });
}

function printHelp(stream, version) {
  stream.write(
    `poracode ${version} — run the Poracode standalone server\n` +
      "\n" +
      "Usage: poracode [server command] [flags]\n" +
      "\n" +
      "With no command, starts the foreground server and serves the bundled web client.\n" +
      "The version-pinned runtime is downloaded once, verified against the embedded\n" +
      "manifest, and cached separately from profile data.\n" +
      "\n" +
      "Server commands (forwarded to the pinned runtime):\n" +
      "  poracode                          start the foreground server (default)\n" +
      "  poracode serve [--host H] [--port P] [--config PATH]\n" +
      "  poracode pair --json [--scope viewer|operator]\n" +
      "  poracode status --json\n" +
      "  poracode doctor [--json] [--log-file PATH]\n" +
      "  poracode backup --to DIR [--json]\n" +
      "  poracode init-tls [--json] [--cert PATH] [--key PATH]\n" +
      "  poracode upgrade --from TARBALL [--prefix PATH] [--json]\n" +
      "  poracode --version | --help\n" +
      "\n" +
      "Environment:\n" +
      "  PORACODE_BASE_DIR          profile namespace (runtime cache lives beside it)\n" +
      "  PORACODE_RUNTIME_CACHE_DIR override the runtime cache root\n" +
      "  PORACODE_SERVER_TARBALL    install a local verified tarball instead of downloading\n" +
      "  PORACODE_SERVER_TARBALL_SHA256  required with PORACODE_SERVER_TARBALL\n",
  );
}
