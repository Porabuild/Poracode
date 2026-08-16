import { spawn } from "node:child_process";
import { existsSync, statSync, watch } from "node:fs";
import { dirname, resolve } from "node:path";

export const APP_ID = "com.lightcodeapp.mobile";
export const COMMAND_TIMEOUT_MS = 60_000;
export const BUILD_TIMEOUT_MS = 10 * 60_000;
export const BOOT_TIMEOUT_MS = 3 * 60_000;
export const SHUTDOWN_TIMEOUT_MS = 5_000;
export const NATIVE_RELOAD_DEBOUNCE_MS = 350;

const SECRET_ENV_NAMES = new Set([
  "NATIVE_E2E_CONTROL_CAPABILITY",
  "PORACODE_NATIVE_E2E_PAIRING_URL",
  "PORACODE_PAIRING_URL",
]);

export function childEnvironment(env = process.env, additions = {}) {
  const result = { ...env, ...additions };
  for (const name of SECRET_ENV_NAMES) delete result[name];
  return result;
}

export function exactToolVersion(output, label, expected) {
  const match = output.match(new RegExp(`${label}\\s+([0-9]+(?:\\.[0-9]+)*)`, "i"));
  if (!match) throw new Error(`could not read the ${label} version`);
  if (match[1] !== expected) {
    throw new Error(`${label} ${expected} is required; found ${match[1]}`);
  }
  return match[1];
}

export function javaMajorVersion(output) {
  const match = output.match(/version\s+"(?:1\.)?([0-9]+)/i);
  if (!match) throw new Error("could not read the Java version");
  return Number.parseInt(match[1], 10);
}

export function parseAdbDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/, 2))
    .filter((columns) => columns.length === 2 && columns[1] === "device")
    .map(([serial]) => serial);
}

export function processListHasHeadlessAvd(output, avdName) {
  const escapedName = avdName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const avdArgument = new RegExp(`(?:^|\\s)-avd(?:=|\\s+)${escapedName}(?:\\s|$)`);
  return output
    .split(/\r?\n/)
    .some(
      (command) =>
        avdArgument.test(command) &&
        (/(?:^|[\\/])qemu-system-[^\\/\s]*-headless(?:\.exe)?(?:\s|$)/i.test(command) ||
          /(?:^|\s)-no-window(?:\s|$)/.test(command)),
    );
}

export function graphicalAvdProcessId(output, avdName) {
  const escapedName = avdName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const avdArgument = new RegExp(`(?:^|\\s)-avd(?:=|\\s+)${escapedName}(?:\\s|$)`);
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match || !avdArgument.test(match[2])) continue;
    if (
      /(?:^|[\\/])qemu-system-[^\\/\s]*-headless(?:\.exe)?(?:\s|$)/i.test(match[2]) ||
      /(?:^|\s)-no-window(?:\s|$)/.test(match[2])
    ) {
      continue;
    }
    return Number.parseInt(match[1], 10);
  }
  return null;
}

export function selectIosSimulator(simctlList, override) {
  const candidates = Object.entries(simctlList.devices ?? {})
    .filter(([runtime]) => runtime.endsWith(".iOS-26-5"))
    .flatMap(([runtime, devices]) =>
      devices
        .filter((device) => device.isAvailable !== false)
        .map((device) => ({ ...device, runtime })),
    );

  if (override) {
    const selected = candidates.find((device) => device.udid === override);
    if (!selected) {
      throw new Error(
        `PORACODE_IOS_TARGET must identify an available iOS 26.5 simulator; received ${override}`,
      );
    }
    return selected;
  }

  const iPhones = candidates.filter(
    (device) =>
      device.name?.startsWith("iPhone") || device.deviceTypeIdentifier?.includes("iPhone"),
  );
  return (
    iPhones.find((device) => device.state === "Booted") ??
    iPhones.find((device) => device.name === "iPhone 17") ??
    iPhones[0] ??
    null
  );
}

export function iosSimulatorBuildArguments({ simulatorId, derivedDataPath, hotReload = false }) {
  return [
    "-project",
    "App.xcodeproj",
    "-scheme",
    "App",
    "-configuration",
    "Debug",
    "-destination",
    `platform=iOS Simulator,id=${simulatorId}`,
    "-derivedDataPath",
    derivedDataPath,
    "-quiet",
    // Keep simulator code signing enabled. Disabling it strips the application
    // identifier and Keychain entitlements, making credential repair impossible.
    ...(hotReload
      ? [
          "OTHER_LDFLAGS=$(inherited) -Xlinker -interposable",
          "OTHER_SWIFT_FLAGS=$(inherited) -D PORACODE_NATIVE_HOT_RELOAD_V1",
          "EMIT_FRONTEND_COMMAND_LINES=YES",
          "COMPILATION_CACHE_ENABLE_CACHING=NO",
        ]
      : []),
    "build",
  ];
}

export function allChangedPathsHaveExtension(changedPaths, extension) {
  return changedPaths.length > 0 && changedPaths.every((path) => path.endsWith(extension));
}

export function nativeDevWatchEnabled(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length === 0) return true;
  if (normalized.length === 1 && normalized[0] === "--once") return false;
  throw new Error("native development accepts only the optional --once argument");
}

export function androidInstallArguments() {
  return ["--console=plain", ":app:installDebug"];
}

/**
 * Serial, debounced native reload queue. Changes arriving during a build are
 * collapsed into one follow-up build instead of starting concurrent compilers.
 */
export class NativeReloadQueue {
  #changedPaths = new Set();
  #closed = false;
  #debounceMs;
  #onError;
  #reload;
  /** @type {Promise<void> | null} */
  #running = null;
  #timer = null;

  constructor({ reload, onError, debounceMs = NATIVE_RELOAD_DEBOUNCE_MS }) {
    this.#reload = reload;
    this.#onError = onError;
    this.#debounceMs = debounceMs;
  }

  enqueue(changedPath) {
    if (this.#closed) return;
    this.#changedPaths.add(changedPath);
    if (this.#running) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.flushNow();
    }, this.#debounceMs);
  }

  async flushNow() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (this.#running) return await this.#running;
    if (this.#changedPaths.size === 0) return;

    const running = this.#drain();
    this.#running = running;
    try {
      await running;
    } finally {
      if (this.#running === running) this.#running = null;
    }
  }

  async #drain() {
    while (this.#changedPaths.size > 0) {
      const changedPaths = [...this.#changedPaths].sort();
      this.#changedPaths.clear();
      try {
        await this.#reload(changedPaths);
      } catch (error) {
        this.#onError(error);
      }
    }
  }

  async close() {
    this.#closed = true;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (this.#running) await this.#running;
  }
}

/**
 * Watch native source roots. Each target may filter its path relative to the
 * watched root, allowing project roots to ignore DerivedData/Gradle output.
 */
export function watchNativeSources({ targets, reload, onError, debounceMs }) {
  const queue = new NativeReloadQueue({ reload, onError, debounceMs });
  const watchers = [];

  for (const target of targets) {
    const targetPath = resolve(target.path);
    if (!existsSync(targetPath)) continue;
    const isDirectory = statSync(targetPath).isDirectory();
    const recursive = target.recursive ?? isDirectory;
    const watcher = watch(targetPath, { recursive }, (_eventType, filename) => {
      const relativePath = filename?.toString() ?? "";
      if (relativePath && target.include && !target.include(relativePath)) return;
      const changedPath = relativePath
        ? resolve(isDirectory ? targetPath : dirname(targetPath), relativePath)
        : targetPath;
      queue.enqueue(changedPath);
    });
    watcher.on("error", onError);
    watchers.push(watcher);
  }

  if (watchers.length === 0) throw new Error("no native source roots are available to watch");
  return {
    flushNow: () => queue.flushNow(),
    async close() {
      for (const watcher of watchers) watcher.close();
      await queue.close();
    },
  };
}

export function assertIosSimulatorSigning(signatureDetails, applicationIdentifier) {
  const identifier = signatureDetails.match(/^Identifier=(.+)$/m)?.[1]?.trim();
  if (identifier !== APP_ID) {
    throw new Error(
      `the iOS simulator app is not signed with the expected identifier; found ${identifier ?? "none"}`,
    );
  }
  if (!applicationIdentifier.endsWith(`.${APP_ID}`)) {
    throw new Error("the iOS simulator app is missing its application-identifier entitlement");
  }
}

export function optionalPairingUrl(env = process.env) {
  const nativeValue = env.PORACODE_NATIVE_E2E_PAIRING_URL?.trim();
  const generalValue = env.PORACODE_PAIRING_URL?.trim();
  if (nativeValue && generalValue && nativeValue !== generalValue) {
    throw new Error(
      "PORACODE_NATIVE_E2E_PAIRING_URL and PORACODE_PAIRING_URL must match when both are set",
    );
  }

  const value = nativeValue ?? generalValue;
  if (!value) return null;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("the E2E pairing URL environment value is not a valid URL");
  }

  const isCustomPairingLink = parsed.protocol === "poracode:" && parsed.hostname === "pair";
  const isVerifiedPairingLink =
    parsed.protocol === "https:" &&
    parsed.hostname === "poracode.com" &&
    ["/", "/pair", "/app"].includes(parsed.pathname);
  if (!isCustomPairingLink && !isVerifiedPairingLink) {
    throw new Error("the E2E pairing URL must be a supported Poracode pairing deep link");
  }
  return value;
}

export function loopbackPortFromPairingUrl(value) {
  if (!value) return null;
  const pairingUrl = new URL(value);
  const hostValue =
    pairingUrl.protocol === "poracode:" ? pairingUrl.searchParams.get("host") : null;
  if (!hostValue) return null;

  let hostUrl;
  try {
    hostUrl = new URL(hostValue);
  } catch {
    return null;
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(hostUrl.hostname)) return null;
  const port = Number.parseInt(hostUrl.port, 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function signalExitCode(signal) {
  return signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143;
}

function killProcessTree(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The child already exited.
    }
  }
}

export class CommandSupervisor {
  #children = new Map();
  #shuttingDown = false;

  installSignalHandlers() {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.once(signal, () => {
        void this.shutdown().finally(() => process.exit(signalExitCode(signal)));
      });
    }
  }

  async run(command, args, options = {}) {
    const {
      capture = false,
      captureLimit = 1_000_000,
      cwd,
      env = childEnvironment(),
      label = command,
      passthrough = false,
      quiet = false,
      timeoutMs = COMMAND_TIMEOUT_MS,
    } = options;
    if (this.#shuttingDown) throw new Error("native runner is shutting down");
    if (!quiet) process.stdout.write(`[native-dev] ${label}\n`);

    return await new Promise((complete, reject) => {
      const child = spawn(command, args, {
        ...(cwd ? { cwd } : {}),
        detached: process.platform !== "win32",
        env,
        stdio:
          capture || passthrough ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
      });
      const output = { stdout: "", stderr: "" };
      let timeoutError = null;
      const append = (key, destination) => (chunk) => {
        if (passthrough) destination.write(chunk);
        if (!capture) return;
        output[key] += chunk.toString("utf8");
        if (output[key].length > captureLimit) {
          output[key] = output[key].slice(-captureLimit);
        }
      };
      child.stdout?.on("data", append("stdout", process.stdout));
      child.stderr?.on("data", append("stderr", process.stderr));

      let settled = false;
      let forceTimer;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(forceTimer);
        this.#children.delete(child);
        if (error) reject(error);
        else complete(output);
      };
      this.#children.set(child, finish);

      const timeout = setTimeout(() => {
        timeoutError = new Error(`${label} timed out after ${String(timeoutMs)}ms`);
        killProcessTree(child, "SIGTERM");
        forceTimer = setTimeout(() => killProcessTree(child, "SIGKILL"), SHUTDOWN_TIMEOUT_MS);
      }, timeoutMs);
      timeout.unref?.();

      child.once("error", (error) =>
        finish(new Error(`${label} could not start: ${error.message}`)),
      );
      child.once("exit", (code, signal) => {
        if (timeoutError) finish(timeoutError);
        else if (code === 0) finish();
        else {
          const diagnostic = capture ? output.stderr.trim().slice(-12_000) : "";
          finish(
            new Error(
              `${label} exited with ${signal ?? code ?? "unknown status"}${diagnostic ? `\n${diagnostic}` : ""}`,
            ),
          );
        }
      });
    });
  }

  startLongRunning(command, args, options = {}) {
    if (this.#shuttingDown) throw new Error("native runner is shutting down");
    const child = spawn(command, args, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      detached: process.platform !== "win32",
      env: options.env ?? childEnvironment(),
      stdio: "ignore",
    });
    const finish = () => this.#children.delete(child);
    this.#children.set(child, finish);
    child.once("exit", finish);
    child.once("error", finish);
    return {
      child,
      release: () => {
        this.#children.delete(child);
        child.unref();
      },
    };
  }

  async shutdown() {
    if (this.#shuttingDown) return;
    this.#shuttingDown = true;
    const children = [...this.#children.keys()];
    for (const child of children) killProcessTree(child, "SIGTERM");
    if (children.length === 0) return;

    await new Promise((complete) => {
      let remaining = children.length;
      const done = () => {
        remaining -= 1;
        if (remaining === 0) complete();
      };
      for (const child of children) child.once("exit", done);
      const timer = setTimeout(() => {
        for (const child of children) killProcessTree(child, "SIGKILL");
        complete();
      }, SHUTDOWN_TIMEOUT_MS);
      timer.unref?.();
    });
  }
}

export function sleep(ms) {
  return new Promise((complete) => setTimeout(complete, ms));
}
