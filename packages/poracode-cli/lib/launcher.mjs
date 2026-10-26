/**
 * `poracode` launcher: resolve the pinned runtime, install it into the
 * versioned cache if needed, then hand the terminal to the real server CLI.
 *
 * The pinned runtime decides whether a bare invocation opens the TUI or serves
 * based on its terminal. `--version` and `--help` are answered here without
 * touching the cache or the network.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRuntimeCacheRoot } from "./cache.mjs";
import { offlineNoCache, PoracodeLauncherError } from "./errors.mjs";
import { ensureRuntime, runtimeDirectory } from "./install.mjs";
import { loadRuntimeManifest, selectRuntimeEntry } from "./manifest.mjs";
import {
  attachChildSignalHandling,
  forwardedSignals,
  isServeInvocation,
  runServerStop,
  signalExitCode,
  windowsHardKillDeadlineMs,
} from "./signals.mjs";
import { requireRuntimeTargetKey } from "./target.mjs";
import { CLI_COMPLETION_HELP, renderCompletion } from "./completion.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  const handlers = forwardedSignals().map((signal) => {
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
  const platform = input.platform ?? process.platform;
  const entry = join(input.runtimeDir, "lib", "server.cjs");
  const childEnv = { ...input.env, PORACODE_APP_VERSION: input.version };
  const child = spawnImpl(process.execPath, [entry, ...input.args], {
    stdio: "inherit",
    env: childEnv,
  });
  let childFinished = false;
  const detach = attachChildSignalHandling({
    child,
    platform,
    gracefulStop: isServeInvocation(input.args),
    hardKillDeadlineMs: windowsHardKillDeadlineMs(childEnv),
    // `node server.cjs stop` is its own small process; keep the call behind
    // this seam so the win32 shutdown path is testable without a real server.
    stop: () =>
      childFinished
        ? null
        : (input.stopServer ?? runServerStop)({
            entry,
            env: childEnv,
            timeoutMs: windowsHardKillDeadlineMs(childEnv),
            expectedPid: child.pid,
          }),
    ...(input.processImpl ? { processImpl: input.processImpl } : {}),
    ...(input.setTimeoutImpl ? { setTimeoutImpl: input.setTimeoutImpl } : {}),
    ...(input.clearTimeoutImpl ? { clearTimeoutImpl: input.clearTimeoutImpl } : {}),
  });
  return new Promise((done, fail) => {
    child.on("error", (error) => {
      childFinished = true;
      detach();
      fail(error);
    });
    child.on("exit", (code, signal) => {
      childFinished = true;
      detach();
      if (signal) {
        // Windows cannot re-raise a signal on itself; report it as an exit code.
        if (platform === "win32") {
          done(signalExitCode(signal));
          return;
        }
        (input.killSelf ?? process.kill.bind(process))(process.pid, signal);
        return;
      }
      done(code ?? 0);
    });
  });
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout ?? process.stdout;
  if (argv[0] === "completion") {
    stdout.write(renderCompletion(argv.slice(1)));
    return 0;
  }
  let env = options.env ?? process.env;
  const args = [];
  let baseDir;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--base-dir") {
      args.push(argv[index]);
      continue;
    }
    const value = argv[++index];
    if (!value || value.startsWith("--") || baseDir !== undefined)
      throw new PoracodeLauncherError(
        "PORACODE_INVALID_BASE_DIR",
        "Pass --base-dir <profile namespace path> once.",
      );
    baseDir = resolve(value);
  }
  if (baseDir) env = { ...env, PORACODE_BASE_DIR: baseDir };
  argv = args;
  const version = launcherVersion();
  if (argv[0] === "completion") {
    stdout.write(renderCompletion(argv.slice(1)));
    return 0;
  }
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
      "With no command, starts the foreground server and opens the bundled web app\n" +
      "in a local interactive terminal. Use serve or --no-open for server only.\n" +
      "The version-pinned runtime is downloaded once, verified against the embedded\n" +
      "manifest, and cached separately from profile data.\n" +
      "\n" +
      "Server commands (forwarded to the pinned runtime):\n" +
      "  poracode setup [--config PATH] [--start|--no-start] [--skip-auth] [--provider ID] [--method ID] [--runtime ID] [--wsl DISTRO]\n" +
      "    Interactive configure/start/login. Starting is explicit and stays in the foreground; no service installation.\n" +
      "    Or setup --start --profile-env [--profile ID] [--prompt-env NAME ...] for sealed saved-profile values, without an account-login claim.\n" +
      "    Create explicitly with --new-profile ID --driver DRIVER [--profile-config-file JSON] --prompt-env NAME ...; profile config is separate from server --config.\n" +
      "  poracode                          start server + open web app (default)\n" +
      "  poracode serve [--host H] [--port P] [--config PATH] [--open|--no-open]\n" +
      "    Server only by default. --open requests a browser; headless/SSH automatic opening is skipped.\n" +
      "  poracode configure [--host H] [--port P] [--config PATH] [--unset FIELD ...] [--show|--effective] [--json]\n" +
      "    Also: --bind-mode, --tls-cert/--tls-key, --relay-url, --trusted-proxies, --log-level,\n" +
      "    --log-max-bytes, --log-max-files, --shutdown-drain-deadline-ms. Applies on next start.\n" +
      "  poracode providers list|catalog|drivers|install|add|configure|remove|unset-env [flags] [--json]\n" +
      "    drivers lists the running owner's saved-profile definitions and declared key names, not installation/account status (local-admin v5).\n" +
      "    add/configure accept --env-file JSON, piped JSON with --env-stdin, or repeated --prompt-env NAME for hidden terminal entry.\n" +
      "    Hidden add checks config/dependencies before values (local-admin v5), then revalidates the fresh snapshot when saving.\n" +
      "    Interactive providers configure offers saved profiles and hidden environment entry; scripts supply an explicit ID.\n" +
      "  poracode auth list|accounts|methods|login|logout [PROVIDER] [flags] [--json]\n" +
      "  poracode plugins list|refresh [--json]\n" +
      "  poracode plugins catalogs list|add|inspect|refresh|remove [CATALOG_ID] [flags] [--json]\n" +
      "  poracode plugins inspect|install|update CATALOG_ID ENTRY [--review-digest SHA256] [--yes] [--json]\n" +
      "  poracode plugins remove|enable|disable NAME [--yes] [--json]\n" +
      "    local-admin v12: inspect before installing/updating; scripts require --yes and the reviewed digest. New packages start disabled.\n" +
      "    Removing a catalog keeps installed packages; package removal requires an unmodified catalog-owned installation.\n" +
      "  poracode plugins accounts list|select|logout PLUGIN [--server NAME --account UUID] [--yes (logout)] [--json]\n" +
      "  poracode plugins accounts login PLUGIN --server NAME --label TEXT [--account UUID] [--json]\n" +
      "  poracode mcp list|inspect|enable|disable|remove [SERVER_ID] [--json]\n" +
      "    local-admin v4: global plugin discovery and saved-user MCP metadata; no credential values or connection health.\n" +
      "    local-admin v6: enable/disable/remove saved user MCP configuration by exact ID; removal requires typed confirmation or --yes.\n" +
      "  poracode mcp add|configure SERVER_ID (--config-file JSON | --config-stdin) [--yes (configure)] [--json]\n" +
      "    local-admin v7: full definitions with matching id; configure requires typed confirmation or --yes and refuses a changed target.\n" +
      "    Omitted optional definition fields take defaults. Omit definition input for guided terminal setup, with hidden transport values.\n" +
      "  poracode mcp auth status|login|logout SERVER_ID [--yes (logout)] [--json]\n" +
      "    Account inventory/select/logout require local-admin v10; OAuth login requires v11. Keep the terminal open or Ctrl+C to cancel.\n" +
      "    Provider logins, plugin service accounts and user MCP OAuth are separate. No credential values are returned.\n" +
      "    Provider resolution applies saved config; running sessions/native copies and OAuth credentials have separate lifecycles.\n" +
      "  poracode sessions list [--limit 1..100] [--cursor CURSOR] [--project PROJECT_ID] [--json]\n" +
      "  poracode projects list [--limit 1..100] [--cursor CURSOR] [--json]\n" +
      "  poracode projects inspect PROJECT_ID [--json]\n" +
      "  poracode projects add DIRECTORY [--name NAME] [--json]\n" +
      "    Register an existing host directory without starting a provider; existing locations keep their ID/settings.\n" +
      "  poracode sessions inspect THREAD_ID [--json]\n" +
      "  poracode run [--standalone] (--project PROJECT_ID | --directory PATH) --provider PROVIDER --model MODEL [flags] PROMPT\n" +
      "    --directory registers an existing native folder (local-admin v20), retaining existing project settings; it can also be used with --options.\n" +
      "  poracode run [--standalone] --session SESSION_ID [--prompt-stdin] [--format text|json] [PROMPT]\n" +
      "    Add --file PATH repeatedly to new or saved tasks (local-admin v21): 16 native regular files/20 MiB total, relative to this CLI's cwd.\n" +
      "    Add --interactive with a quoted prompt (local-admin v23): terminal stdin/stderr required; choose option numbers or j for hidden JSON replies.\n" +
      "    Requests stay on stderr; no automatic approval. Ctrl+C cancels; --prompt-stdin/--options cannot be interactive. Provider authentication stays separate.\n" +
      "    Changed files, symlinks, directories, WSL files and --options with files refuse. Copies stay with history; provider/model support applies.\n" +
      "    Default: use the running owner. --standalone owns the profile for this task and joins shutdown; existing owners refuse.\n" +
      "  poracode sessions export THREAD_ID [--output FILE|-]\n" +
      "    Export a consistent persisted transcript as JSON; files publish after verification and never overwrite. Conversation content may be sensitive.\n" +
      "  poracode sessions stop THREAD_ID [--yes] [--json]\n" +
      "    local-admin v8: saved-thread inventory; stop confirms owned runtime retirement and preserves history. Scripts/JSON require --yes.\n" +
      "  poracode clients list|revoke|remove [ID] [--json]\n" +
      "  poracode pairings list|revoke [ID] [--json]\n" +
      "  poracode pairings create [--preset viewer|operator | --scope SCOPE ...] [--label TEXT] [--ttl 10m] [--qr | --json]\n" +
      "    Independent grant; TTL 1s..24h, default 10m. Existing desktop QR stays valid.\n" +
      "  poracode pair|connect [--scope viewer|operator] [--json]\n" +
      "  poracode status [--details] [--json]\n" +
      "  poracode stop [--if-pid PID]       gracefully stop this profile's running server\n" +
      "  poracode service install|start|stop|restart|status|uninstall --prefix PATH [--json]\n" +
      "    One registration per explicit installed prefix, bound to one account/profile; additional profiles need separate prefixes.\n" +
      "    Native systemd --user, Windows scheduled task, or macOS launchd; install enables without starting, start/restart never upgrade.\n" +
      "    Windows and macOS require a logged-on graphical user. stop/uninstall refuse desktop owners and require joined headless retirement.\n" +
      "  poracode doctor [--json] [--log-file PATH]\n" +
      "  poracode logs [--follow] [--lines 1..1000] [--log-file PATH] [--json]\n" +
      "    Read bounded, redacted local log lines without starting an owner; follow waits for new complete lines.\n" +
      "  poracode backup --to DIR [--json]\n" +
      "  poracode init-tls [--json] [--cert PATH] [--key PATH]\n" +
      "  poracode upgrade --from TARBALL [--prefix PATH] [--json]\n" +
      "  poracode --version | --help\n" +
      CLI_COMPLETION_HELP +
      "  All commands accept --base-dir PATH for an independent profile.\n" +
      "  Subcommand details: poracode providers configure --help or poracode auth login --help (from the runtime).\n" +
      "\n" +
      "Environment:\n" +
      "  PORACODE_BASE_DIR          profile namespace (runtime cache lives beside it)\n" +
      "  PORACODE_RUNTIME_CACHE_DIR override the runtime cache root\n" +
      "  PORACODE_SERVER_TARBALL    install a local verified tarball instead of downloading\n" +
      "  PORACODE_SERVER_TARBALL_SHA256  required with PORACODE_SERVER_TARBALL\n",
  );
}
