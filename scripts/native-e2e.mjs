#!/usr/bin/env node
// Thin build/spawn/timeout supervisor for the native-e2e host harness.
// Ports come from PORACODE_NATIVE_E2E_SLOT (base = 49152 + slot * 8).
// The supervisor never prints raw child logs or pairing material.

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const STARTUP_TIMEOUT_MS = Number(process.env.NATIVE_E2E_STARTUP_TIMEOUT_MS ?? 30_000);
const TEST_TIMEOUT_MS = Number(process.env.NATIVE_E2E_TEST_TIMEOUT_MS ?? 120_000);
const SHUTDOWN_WAIT_MS = 5_000;
const SLOT_ENV = "PORACODE_NATIVE_E2E_SLOT";

// The ios-ui journey reuses ONE fixed simulator across runs (the iOS analogue
// of the Android `poracode-pixel9-api37` convention) instead of creating a
// `Poracode Native E2E <pid>` device per run, which leaked a simulator and a
// result bundle on every killed run.
export const IOS_UI_SIMULATOR_NAME = "Poracode Native E2E";
const IOS_UI_DEVICE_TYPE = "com.apple.CoreSimulator.SimDeviceType.iPhone-17";
const IOS_UI_RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-5";
// Bounded retention for per-run `.tmp/native-e2e/ios-ui-<ms>-<pid>` dirs
// (result bundle + operation journal). `ios-ui-derived-data-*` is a reusable
// build cache and is never pruned here.
export const IOS_UI_MAX_RUN_DIRS = 5;
const IOS_UI_RUN_DIR_PATTERN = /^ios-ui-\d+-\d+$/;

const SECRET_VALUE_PATTERN = /(lc_pair_|lc_access_|lc_ws_)[A-Za-z0-9_-]+/g;
const FRAGMENT_SECRET_PATTERN = /([#&?](?:token|ticket|access_token|capability)=)[^&\s"']+/gi;
const AUTH_HEADER_PATTERN = /(authorization\s*[:=]\s*)(bearer|harness)\s+\S+/gi;
const COOKIE_HEADER_PATTERN = /(cookie\s*[:=]\s*)[^\r\n]+/gi;
const CONTROL_CAPABILITY_PATTERN =
  /(NATIVE_E2E_CONTROL_CAPABILITY|control capability)\s*[:=]\s*\S+/gi;

function redact(line) {
  return line
    .replace(SECRET_VALUE_PATTERN, "[redacted]")
    .replace(FRAGMENT_SECRET_PATTERN, "$1[redacted]")
    .replace(AUTH_HEADER_PATTERN, "$1$2 [redacted]")
    .replace(COOKIE_HEADER_PATTERN, "$1[redacted]")
    .replace(CONTROL_CAPABILITY_PATTERN, "$1=[redacted]");
}

function isReadyLine(line) {
  return /native-e2e (?:mock|real) host ready/.test(line);
}

function createLineRedactor(write, onLine) {
  let pending = "";
  return (chunk) => {
    pending += chunk.toString("utf8");
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const redacted = redact(line);
      write(`${redacted}\n`);
      onLine?.(redacted);
    }
  };
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "tests/native-e2e/harness/cli.ts");
const tsRegisterPath = join(repoRoot, "scripts/remote-v3-ts-register.mjs");

function main() {
  const requestedMode = process.argv[2];
  const mode = requestedMode === "real" ? "real" : requestedMode === "mock" ? "mock" : null;
  if (!mode) {
    if (requestedMode === "ios-ui") {
      return runIosUI();
    }
    process.stderr.write("Usage: node scripts/native-e2e.mjs <mock|real|ios-ui>\n");
    process.exit(2);
  }

  if (process.env.NATIVE_E2E_HOST_PORT || process.env.NATIVE_E2E_CONTROL_PORT) {
    process.stderr.write(
      "native-e2e supervisor: set PORACODE_NATIVE_E2E_SLOT instead of host/control ports\n",
    );
    process.exit(2);
  }

  const capability = randomBytes(32).toString("base64url");
  const slot = process.env[SLOT_ENV] ?? "0";

  const child = spawn(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      tsRegisterPath,
      "--no-warnings=ExperimentalWarning",
      cliPath,
      "--mode",
      mode,
      "--slot",
      slot,
      ...process.argv.slice(3),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NATIVE_E2E_MODE: mode,
        [SLOT_ENV]: slot,
        NATIVE_E2E_CONTROL_CAPABILITY: capability,
        NATIVE_E2E_STARTUP_TIMEOUT_MS: String(STARTUP_TIMEOUT_MS),
        NATIVE_E2E_TEST_TIMEOUT_MS: String(TEST_TIMEOUT_MS),
        NATIVE_E2E_SHUTDOWN_TIMEOUT_MS: String(SHUTDOWN_WAIT_MS),
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );

  let shuttingDown = false;
  const killGroup = (signal) => {
    if (!child.pid) return;
    try {
      if (process.platform !== "win32") process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // already gone
      }
    }
  };

  const shutdown = (code = 1) => {
    if (shuttingDown) return;
    shuttingDown = true;
    killGroup("SIGTERM");
    const killer = setTimeout(() => {
      killGroup("SIGKILL");
      process.exit(code);
    }, SHUTDOWN_WAIT_MS);
    child.once("exit", () => {
      clearTimeout(killer);
      process.exit(code);
    });
  };

  const startupTimer = setTimeout(() => {
    process.stderr.write("native-e2e supervisor: startup timed out\n");
    shutdown(1);
  }, STARTUP_TIMEOUT_MS);

  const testTimer = setTimeout(() => {
    process.stderr.write("native-e2e supervisor: test timeout reached\n");
    shutdown(1);
  }, TEST_TIMEOUT_MS);

  let hostReady = false;
  const markReady = (line) => {
    if (hostReady || !isReadyLine(line)) return;
    hostReady = true;
    clearTimeout(startupTimer);
  };

  const writeOut = createLineRedactor((text) => process.stdout.write(text), markReady);
  const writeErr = createLineRedactor((text) => process.stderr.write(text), markReady);
  child.stdout?.on("data", writeOut);
  child.stderr?.on("data", writeErr);

  child.on("exit", (code, signal) => {
    clearTimeout(startupTimer);
    clearTimeout(testTimer);
    if (shuttingDown) return;
    process.exit(code ?? (signal ? 1 : 0));
  });

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => shutdown(0));
  }
}

/** ios-ui entry: signal handlers exist before any child or simulator work. */
async function runIosUI() {
  let iosUiShutdown = null;
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (iosUiShutdown) iosUiShutdown(0);
      else process.exit(1);
    });
  }
  await runIosUIJourney({
    registerShutdown: (shutdown) => {
      iosUiShutdown = shutdown;
    },
  });
  process.exit(0);
}

// Build/simctl children of the ios-ui journey, so a programmatic shutdown can
// kill the whole tree (an interactive SIGINT reaches them via the terminal
// process group, `kill <pid>` does not). Declared before the entry guard
// below: top-level `await main()` pauses module evaluation, so anything the
// journey touches must be initialized before it.
const liveChildProcesses = new Set();

function trackChildProcess(processHandle) {
  liveChildProcesses.add(processHandle);
  processHandle.once("exit", () => liveChildProcesses.delete(processHandle));
  return processHandle;
}

function killTrackedChildren(signal) {
  for (const processHandle of liveChildProcesses) {
    try {
      processHandle.kill(signal);
    } catch {
      // already gone
    }
  }
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

/**
 * Picks the fixed ios-ui simulator from `xcrun simctl list devices --json`
 * output. Returns null when the fixed device does not exist yet (the caller
 * creates it once and reuses it on every later run).
 */
export function selectFixedIosSimulator(simctlList, name = IOS_UI_SIMULATOR_NAME) {
  const candidates = Object.entries(simctlList.devices ?? {})
    .filter(([runtime]) => runtime.endsWith(".iOS-26-5"))
    .flatMap(([, devices]) => devices ?? [])
    .filter((device) => device.isAvailable !== false && device.name === name);
  return candidates.find((device) => device.state === "Booted") ?? candidates[0] ?? null;
}

/**
 * Selects the per-run `ios-ui-<ms>-<pid>` directories to delete, keeping the
 * newest `keep` runs. Reusable build-cache dirs (`ios-ui-derived-data-*`) and
 * anything else are never prunable here.
 */
export function selectPrunableIosRunDirs(names, keep = IOS_UI_MAX_RUN_DIRS) {
  const runs = names
    .filter((name) => IOS_UI_RUN_DIR_PATTERN.test(name))
    .sort((a, b) => {
      const [, aMs, aPid] = a.split("-").map(Number);
      const [, bMs, bPid] = b.split("-").map(Number);
      return bMs - aMs || bPid - aPid;
    });
  return runs.slice(keep);
}

async function runIosUIJourney({ registerShutdown }) {
  const uiCapability = randomBytes(32).toString("base64url");
  const uiSlot = process.env[SLOT_ENV] ?? "0";
  const nativeE2ERoot = join(repoRoot, ".tmp/native-e2e");
  const uiRoot = join(nativeE2ERoot, `ios-ui-${Date.now()}-${process.pid}`);
  const resultBundle = join(uiRoot, "NativeE2E.xcresult");
  const observedPath = join(uiRoot, "observed-operations.json");
  const derivedData = join(nativeE2ERoot, `ios-ui-derived-data-${uiSlot}`);
  await mkdir(uiRoot, { recursive: true, mode: 0o700 });
  await pruneIosUIRunDirs(nativeE2ERoot);

  const harness = spawn(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      tsRegisterPath,
      "--no-warnings=ExperimentalWarning",
      cliPath,
      "--mode",
      "mock",
      "--slot",
      uiSlot,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NATIVE_E2E_MODE: "mock",
        [SLOT_ENV]: uiSlot,
        NATIVE_E2E_CONTROL_CAPABILITY: uiCapability,
        NATIVE_E2E_STARTUP_TIMEOUT_MS: String(STARTUP_TIMEOUT_MS),
        NATIVE_E2E_TEST_TIMEOUT_MS: String(Math.max(TEST_TIMEOUT_MS, 300_000)),
        NATIVE_E2E_SHUTDOWN_TIMEOUT_MS: String(SHUTDOWN_WAIT_MS),
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );

  let controlUrl;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("native iOS harness startup timed out")),
      STARTUP_TIMEOUT_MS,
    );
    const consume = createLineRedactor(
      (output) => process.stderr.write(output),
      (line) => {
        const match = line.match(/control=(http:\/\/127\.0\.0\.1:\d+)/);
        if (!match) return;
        controlUrl = match[1];
        clearTimeout(timer);
        resolve();
      },
    );
    harness.stdout?.on("data", consume);
    harness.stderr?.on("data", consume);
    harness.once("exit", (code) =>
      reject(new Error(`native iOS harness exited early (${String(code)})`)),
    );
  });

  let simulatorId;
  let readinessPath;
  // Kill the harness process group on signals; the fixed simulator survives
  // (it is reused), and per-run artifacts stay bounded through pruning.
  let shuttingDown = false;
  const killHarnessGroup = (signal) => {
    if (!harness.pid) return;
    try {
      if (process.platform !== "win32") process.kill(-harness.pid, signal);
      else harness.kill(signal);
    } catch {
      try {
        harness.kill(signal);
      } catch {
        // already gone
      }
    }
  };
  registerShutdown((code = 1) => {
    if (shuttingDown) return;
    shuttingDown = true;
    killHarnessGroup("SIGTERM");
    killTrackedChildren("SIGTERM");
    const killer = setTimeout(() => {
      killHarnessGroup("SIGKILL");
      killTrackedChildren("SIGKILL");
      process.exit(code);
    }, SHUTDOWN_WAIT_MS);
    harness.once("exit", () => {
      clearTimeout(killer);
      process.exit(code);
    });
  });
  try {
    await ready;
    const deviceList = JSON.parse(
      await runBuffered("xcrun", ["simctl", "list", "devices", "--json"]),
    );
    const fixed = selectFixedIosSimulator(deviceList);
    if (fixed?.udid) {
      simulatorId = fixed.udid;
      if (fixed.state !== "Booted") {
        // Tolerate a boot race; bootstatus below waits for completion.
        await runBuffered("xcrun", ["simctl", "boot", simulatorId]).catch(() => {});
      }
    } else {
      simulatorId = (
        await runBuffered("xcrun", [
          "simctl",
          "create",
          IOS_UI_SIMULATOR_NAME,
          IOS_UI_DEVICE_TYPE,
          IOS_UI_RUNTIME,
        ])
      ).trim();
      await runBuffered("xcrun", ["simctl", "boot", simulatorId]);
    }
    await runBuffered("xcrun", ["simctl", "bootstatus", simulatorId, "-b"]);
    const buildStatus = await runStreaming(
      "xcodebuild",
      [
        "-project",
        "ios/App/App.xcodeproj",
        "-scheme",
        "App",
        "-destination",
        `platform=iOS Simulator,id=${simulatorId}`,
        "-derivedDataPath",
        derivedData,
        "-only-testing:NativeE2ETests/NativeJourneyUITests/testRealNativeRemoteJourney",
        "build-for-testing",
      ],
      process.env,
      uiCapability,
    );
    if (buildStatus !== 0) {
      throw new Error(`native iOS UI build-for-testing failed (${String(buildStatus)})`);
    }
    const products = join(derivedData, "Build", "Products");
    const generatedName = (await readdir(products)).find((name) => name.endsWith(".xctestrun"));
    if (!generatedName) throw new Error("native iOS build did not produce an xctestrun file");
    readinessPath = join(products, "NativeE2E-readiness.xctestrun");
    const generated = await readFile(join(products, generatedName), "utf8");
    const interfaceStyle = process.env.NATIVE_E2E_INTERFACE_STYLE;
    await writeFile(
      readinessPath,
      injectXCTestEnvironment(generated, {
        NATIVE_E2E_CONTROL_URL: controlUrl,
        NATIVE_E2E_CONTROL_CAPABILITY: uiCapability,
        ...(interfaceStyle === "Dark" || interfaceStyle === "Light"
          ? { NATIVE_E2E_INTERFACE_STYLE: interfaceStyle }
          : {}),
      }),
      { mode: 0o600 },
    );
    await chmod(readinessPath, 0o600);

    const status = await runStreaming(
      "xcodebuild",
      [
        "-xctestrun",
        readinessPath,
        "-destination",
        `platform=iOS Simulator,id=${simulatorId}`,
        "-resultBundlePath",
        resultBundle,
        "-only-testing:NativeE2ETests/NativeJourneyUITests/testRealNativeRemoteJourney",
        "test-without-building",
      ],
      process.env,
      uiCapability,
    );
    const response = await fetch(new URL("/v1/scenario/state", controlUrl), {
      headers: { authorization: `Harness ${uiCapability}` },
    });
    if (response.ok) {
      await writeFile(observedPath, `${JSON.stringify(await response.json(), null, 2)}\n`, {
        mode: 0o600,
      });
    }
    process.stderr.write(`native iOS result bundle: ${resultBundle}\n`);
    process.stderr.write(`native iOS operation journal: ${observedPath}\n`);
    if (status !== 0) throw new Error(`native iOS UI journey failed (${String(status)})`);
  } finally {
    if (harness.pid) {
      try {
        process.kill(-harness.pid, "SIGTERM");
      } catch {
        harness.kill("SIGTERM");
      }
    }
    // The fixed simulator is kept for reuse; only devices left unavailable by
    // runtime deletions are removed.
    await runBuffered("xcrun", ["simctl", "delete", "unavailable"]).catch(() => {});
    if (readinessPath) await unlink(readinessPath).catch(() => {});
  }
}

async function pruneIosUIRunDirs(nativeE2ERoot) {
  const entries = await readdir(nativeE2ERoot).catch(() => []);
  for (const name of selectPrunableIosRunDirs(entries)) {
    await rm(join(nativeE2ERoot, name), { recursive: true, force: true }).catch(() => {});
  }
}

function injectXCTestEnvironment(plist, environment) {
  const blueprint = "<key>BlueprintName</key>\n\t\t\t\t\t<string>NativeE2ETests</string>";
  const blueprintIndex = plist.indexOf(blueprint);
  if (blueprintIndex < 0) throw new Error("NativeE2ETests missing from xctestrun file");
  const environmentIndex = plist.indexOf("<key>EnvironmentVariables</key>", blueprintIndex);
  const dictionaryIndex = plist.indexOf("<dict>", environmentIndex);
  if (environmentIndex < 0 || dictionaryIndex < 0) {
    throw new Error("NativeE2ETests environment dictionary missing from xctestrun file");
  }
  const entries = Object.entries(environment)
    .map(
      ([key, value]) =>
        `\n\t\t\t\t\t\t<key>${xmlEscape(key)}</key>\n\t\t\t\t\t\t<string>${xmlEscape(value)}</string>`,
    )
    .join("");
  const insertion = dictionaryIndex + "<dict>".length;
  const withEnvironment = `${plist.slice(0, insertion)}${entries}${plist.slice(insertion)}`;
  const parallelKey = "<key>ParallelizationEnabled</key>\n\t\t\t\t\t<true/>";
  const parallelIndex = withEnvironment.indexOf(parallelKey, blueprintIndex);
  if (parallelIndex < 0) throw new Error("NativeE2ETests parallelization setting missing");
  return `${withEnvironment.slice(0, parallelIndex)}${parallelKey.replace("<true/>", "<false/>")}${withEnvironment.slice(parallelIndex + parallelKey.length)}`;
}

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function runBuffered(command, args) {
  return new Promise((resolve, reject) => {
    const processHandle = trackChildProcess(
      spawn(command, args, {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    let stdout = "";
    let stderr = "";
    processHandle.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    processHandle.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    processHandle.once("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} failed (${String(code)}): ${redact(stderr)}`));
    });
  });
}

function runStreaming(command, args, env, exactSecret) {
  return new Promise((resolve) => {
    const processHandle = trackChildProcess(
      spawn(command, args, {
        cwd: repoRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    const writer = createLineRedactor((output) => {
      process.stderr.write(output.replaceAll(exactSecret, "[redacted]"));
    });
    processHandle.stdout?.on("data", writer);
    processHandle.stderr?.on("data", writer);
    processHandle.once("exit", (code) => resolve(code ?? 1));
  });
}
