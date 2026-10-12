#!/usr/bin/env node
// Thin build/spawn/timeout supervisor for the native-e2e host harness.
// Ports come from PORACODE_NATIVE_E2E_SLOT (base = 49152 + slot * 8).
// The supervisor never prints raw child logs or pairing material.

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import net from "node:net";
import { appendFileSync, mkdirSync, openSync, readFileSync } from "node:fs";
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
    if (requestedMode === "android-real") {
      return runAndroidReal();
    }
    process.stderr.write("Usage: node scripts/native-e2e.mjs <mock|real|ios-ui|android-real>\n");
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

/** android-real entry: signal handlers exist before any child work. */
async function runAndroidReal() {
  let androidShutdown = null;
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (androidShutdown) androidShutdown(0);
      else process.exit(1);
    });
  }
  await runAndroidRealJourney({
    registerShutdown: (shutdown) => {
      androidShutdown = shutdown;
    },
  });
  process.exit(0);
}

// Build/simctl children of the native journeys, so a programmatic shutdown can
// kill the whole tree (an interactive SIGINT reaches them via the terminal
// process group, `kill <pid>` does not).
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

export const IOS_PHYSICAL_UDID_ENV = "NATIVE_E2E_IOS_PHYSICAL_UDID";
export const DEVICE_HOST_ENV = "NATIVE_E2E_DEVICE_HOST";
export const DEVICE_FORWARD_ENV = "NATIVE_E2E_DEVICE_FORWARD";

// Physical UDIDs are either the legacy 40-hex form or a UUID (simulators use
// the same UUID form). Anything else — a device name, a typo — must fail
// before any harness or xcodebuild work starts.
const IOS_DEVICE_UDID_PATTERN =
  /^[0-9A-Fa-f]{40}$|^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

/**
 * Pure iOS target selector for the ios-ui journey. An explicit physical UDID
 * wins and selects the CoreDevice destination (`platform=iOS,id=...`) — the
 * journey then never runs simctl. Without one the fixed simulator is selected
 * (`platform=iOS Simulator,id=...`) exactly as before.
 */
export function selectIosTestDestination({ physicalUdid, simulatorUdid } = {}) {
  const physical = (physicalUdid ?? "").trim();
  if (physical) {
    if (!IOS_DEVICE_UDID_PATTERN.test(physical)) {
      throw new Error(
        `${IOS_PHYSICAL_UDID_ENV} must be a device UDID (40-hex or UUID form), received "${physical}"`,
      );
    }
    return { destination: `platform=iOS,id=${physical}`, physical: true };
  }
  const simulator = (simulatorUdid ?? "").trim();
  if (simulator) {
    return { destination: `platform=iOS Simulator,id=${simulator}`, physical: false };
  }
  throw new Error("an iOS test destination needs a simulator or a physical device UDID");
}

/**
 * Pure loopback rewrite for device-injected URLs. Rewrites ONLY the
 * 127.0.0.1/localhost hostname to `deviceHost`, preserving scheme, port,
 * path, query, and fragment (the real-peer pairing credential rides in the
 * `#token=` fragment). Anything else — an empty host, an unparseable URL, a
 * non-http(s) scheme, or a non-loopback hostname — returns unchanged. The
 * production Host gate already admits raw IP dials on the bound port, so this
 * never widens production admission; device reachability is provided by the
 * opt-in forwarder below, not by this rewrite.
 */
export function rewriteLoopbackUrlHost(rawUrl, deviceHost) {
  const host = (deviceHost ?? "").trim();
  if (!host) return rawUrl;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return rawUrl;
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "127.0.0.1" && hostname !== "localhost") return rawUrl;
  try {
    url.hostname = host;
  } catch {
    throw new Error(`${DEVICE_HOST_ENV} is not a usable host: "${host}"`);
  }
  // WHATWG URL silently ignores an unassignable host (e.g. an unbracketed
  // IPv6 literal); fail loudly instead of leaving the URL on loopback while
  // the operator believes it was rewritten.
  if (url.hostname.toLowerCase() !== host.toLowerCase()) {
    throw new Error(`${DEVICE_HOST_ENV} is not a usable host: "${host}"`);
  }
  return url.toString();
}

/**
 * Unique TCP ports of the harness endpoints a device must dial (control
 * plane, production host). Ports survive the loopback rewrite unchanged, so
 * they are collected from the original URLs.
 */
export function collectForwardPorts(urls) {
  const ports = [];
  for (const raw of urls) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.port) ports.push(Number(url.port));
    } catch {
      // Not a dialable URL; nothing to forward for it.
    }
  }
  return [...new Set(ports)];
}

/**
 * One test-only TCP forwarder: listens on `listenHost` (the device-reachable
 * host) at the harness port and proxies raw bytes to the loopback listener.
 * The harness binds loopback only (tests/native-e2e/harness/loopback.ts), and
 * this proxy does not widen production admission — the proxied connection
 * arrives at the host as loopback traffic, and the pairing/control
 * credentials remain the only authorization. `close()` destroys every socket
 * and resolves once the listener is gone.
 */
export function createLoopbackForwarder({
  listenHost,
  port,
  targetHost = "127.0.0.1",
  targetPort = port,
}) {
  const sockets = new Set();
  const server = net.createServer((clientSocket) => {
    const upstreamSocket = net.connect({ host: targetHost, port: targetPort });
    sockets.add(clientSocket);
    sockets.add(upstreamSocket);
    const teardown = () => {
      clientSocket.destroy();
      upstreamSocket.destroy();
    };
    clientSocket.once("close", teardown);
    upstreamSocket.once("close", teardown);
    clientSocket.on("error", teardown);
    upstreamSocket.on("error", teardown);
    clientSocket.pipe(upstreamSocket).pipe(clientSocket);
  });
  const listening = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, listenHost, () => {
      server.removeListener("error", reject);
      // Reflect the OS-assigned port for ephemeral (port 0) listeners; the
      // device path always passes explicit ports, so this only matters to
      // tests.
      handle.port = server.address().port;
      resolve();
    });
  });
  const handle = {
    port,
    listening,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        // Invokes its callback even when the server never listened.
        server.close(() => resolve());
      }),
  };
  return handle;
}

/**
 * Forwarders for every dialable port, listening on the device-reachable host.
 * Fails closed: if any port cannot bind, every partial listener is closed
 * before the error surfaces.
 */
export async function startLoopbackForwarders({ listenHost, ports, targetHost = "127.0.0.1" }) {
  const forwarders = ports.map((port) => createLoopbackForwarder({ listenHost, port, targetHost }));
  try {
    await Promise.all(forwarders.map((forwarder) => forwarder.listening));
  } catch (error) {
    await Promise.all(forwarders.map((forwarder) => forwarder.close()));
    throw new Error(
      `device forwarder could not listen on ${listenHost} (ports ${ports.join(", ")}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  return {
    ports: forwarders.map((forwarder) => forwarder.port),
    close: async () => {
      await Promise.all(forwarders.map((forwarder) => forwarder.close()));
    },
  };
}

async function runIosUIJourney({ registerShutdown }) {
  // Physical-device opt-in (qualification design §iOS): with
  // IOS_PHYSICAL_UDID_ENV set the journey targets the CoreDevice destination
  // and never runs simctl. DEVICE_HOST_ENV names the host the device dials
  // (the Mac's LAN/VPN address); it is required for the physical path because
  // the device cannot reach the Mac's loopback, and rejected on the simulator
  // path so a stray value can never silently rewrite a simulator run.
  // DEVICE_FORWARD_ENV=1 additionally starts the test-only TCP forwarders
  // that expose the loopback-only harness on the device-reachable host; they
  // are closed in the finally below.
  const physicalUdid = (process.env[IOS_PHYSICAL_UDID_ENV] ?? "").trim();
  const deviceHost = (process.env[DEVICE_HOST_ENV] ?? "").trim();
  const forwardDeviceTraffic = process.env[DEVICE_FORWARD_ENV] === "1";
  if (physicalUdid && !deviceHost) {
    throw new Error(
      `${IOS_PHYSICAL_UDID_ENV} also requires ${DEVICE_HOST_ENV}: ` +
        "a physical device cannot reach the Mac's loopback",
    );
  }
  if (!physicalUdid && deviceHost) {
    throw new Error(
      `${DEVICE_HOST_ENV} only applies to the physical-device journey (${IOS_PHYSICAL_UDID_ENV})`,
    );
  }
  if (forwardDeviceTraffic && !(physicalUdid && deviceHost)) {
    throw new Error(
      `${DEVICE_FORWARD_ENV}=1 requires ${IOS_PHYSICAL_UDID_ENV} and ${DEVICE_HOST_ENV}`,
    );
  }
  // Validate the selector before any harness, simulator, or xcodebuild work.
  const physicalTarget = physicalUdid ? selectIosTestDestination({ physicalUdid }) : null;
  // E.2 real-peer mode: with NATIVE_E2E_PEER_MODE=real the journey runs the
  // family tests against the production headless host instead of the mock
  // wire lab. The harness is then started in real mode (it needs
  // dist/main/server.cjs) and its control plane is the one injected into the
  // xctestrun — the journeys' real-mode completion check polls `/v1/state`
  // and requires `mode=real`.
  const peerMode = process.env.NATIVE_E2E_PEER_MODE === "real" ? "real" : "mock";
  const harnessMode = peerMode === "real" ? "real" : "mock";
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
      harnessMode,
      "--slot",
      uiSlot,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NATIVE_E2E_MODE: harnessMode,
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
  let realPeerPairingUrl;
  // Function scope: the finally closes the forwarders even when a throw (for
  // example a harness startup timeout) happens before they are started.
  let forwarders = null;
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
        if (harnessMode === "real") {
          const runDir = line.match(/runDir=(\S+)/)?.[1];
          if (runDir) realPeerPairingUrl = readRealPeerPairingUrl(runDir);
        }
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

  // Only the simulator path assigns this; the physical path never selects a
  // simulator. `readinessPath` spans both paths (deleted in the finally).
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
    let target = physicalTarget;
    if (target) {
      // Physical device: xcodebuild talks to CoreDevice directly; the
      // physical path never runs simctl (no list, boot, bootstatus, or
      // delete). The device must already be plugged in, unlocked, trusted,
      // and code-signable.
    } else {
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
      target = selectIosTestDestination({ simulatorUdid: simulatorId });
    }
    const buildStatus = await runStreaming(
      "xcodebuild",
      [
        "-project",
        "ios/App/App.xcodeproj",
        "-scheme",
        "App",
        "-destination",
        target.destination,
        "-derivedDataPath",
        derivedData,
        ...iosOnlyTestingFlags(),
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
    // Real-peer family journeys: the pairing credential is minted by the real
    // harness itself (`secrets/real-peer-pairing.json` in its run dir) and
    // never transits a workflow env or log. `NATIVE_E2E_PAIRING_URL` stays as
    // an operator override. Either way the URL carries a secret fragment; it
    // is written only to the 0o600 xctestrun file and the log redactor masks
    // `token=` fragments.
    const realPairingURL = process.env.NATIVE_E2E_PAIRING_URL ?? realPeerPairingUrl;
    if (peerMode === "real" && !realPairingURL) {
      throw new Error(
        "real-peer journey requested but no pairing credential is available " +
          "(the real harness did not mint secrets/real-peer-pairing.json)",
      );
    }
    // Opt-in device rewrite: only the URLs injected for the device are
    // rewritten (control + pairing); every host-side consumer keeps the
    // original loopback URLs. Ports survive the rewrite, so the forwarders
    // below can be collected from the original URLs.
    const injectedControlUrl = rewriteLoopbackUrlHost(controlUrl, deviceHost);
    const injectedPairingUrl = realPairingURL
      ? rewriteLoopbackUrlHost(realPairingURL, deviceHost)
      : undefined;
    await writeFile(
      readinessPath,
      injectXCTestEnvironment(generated, {
        NATIVE_E2E_CONTROL_URL: injectedControlUrl,
        NATIVE_E2E_CONTROL_CAPABILITY: uiCapability,
        ...(peerMode === "real" ? { NATIVE_E2E_PEER_MODE: "real" } : {}),
        ...(peerMode === "real" && injectedPairingUrl
          ? { NATIVE_E2E_PAIRING_URL: injectedPairingUrl }
          : {}),
        ...(interfaceStyle === "Dark" || interfaceStyle === "Light"
          ? { NATIVE_E2E_INTERFACE_STYLE: interfaceStyle }
          : {}),
      }),
      { mode: 0o600 },
    );
    await chmod(readinessPath, 0o600);

    // Opt-in test-only forwarder: the harness binds loopback only, so the
    // device dials the rewritten host through these raw TCP proxies. Closed
    // unconditionally in the finally below.
    if (forwardDeviceTraffic) {
      forwarders = await startLoopbackForwarders({
        listenHost: deviceHost,
        ports: collectForwardPorts([controlUrl, realPairingURL]),
      });
      process.stderr.write(
        redact(
          `native iOS device forwarders: ${deviceHost} -> 127.0.0.1 on ports ${forwarders.ports.join(", ")}\n`,
        ),
      );
    }

    const status = await runStreaming(
      "xcodebuild",
      [
        "-xctestrun",
        readinessPath,
        "-destination",
        target.destination,
        "-resultBundlePath",
        resultBundle,
        ...iosOnlyTestingFlags(),
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
    if (forwarders) await forwarders.close().catch(() => {});
    if (harness.pid) {
      try {
        process.kill(-harness.pid, "SIGTERM");
      } catch {
        harness.kill("SIGTERM");
      }
    }
    // The fixed simulator is kept for reuse; only devices left unavailable by
    // runtime deletions are removed. The physical path never runs simctl.
    if (!physicalTarget) {
      await runBuffered("xcrun", ["simctl", "delete", "unavailable"]).catch(() => {});
    }
    if (readinessPath) await unlink(readinessPath).catch(() => {});
  }
}

async function pruneIosUIRunDirs(nativeE2ERoot) {
  const entries = await readdir(nativeE2ERoot).catch(() => []);
  for (const name of selectPrunableIosRunDirs(entries)) {
    await rm(join(nativeE2ERoot, name), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Reads the one-time real-peer pairing credential the real-mode harness mints
 * into its run dir (`secrets/real-peer-pairing.json`, see
 * tests/native-e2e/harness/cli.ts). Returns null when the harness has not
 * published one. The value is never logged: it carries a secret fragment.
 */
function readRealPeerPairingUrl(runDir) {
  try {
    const parsed = JSON.parse(
      readFileSync(join(runDir, "secrets", "real-peer-pairing.json"), "utf8"),
    );
    const url = parsed?.pairingUrl;
    return typeof url === "string" && url.includes("#token=") ? url : null;
  } catch {
    return null;
  }
}

/**
 * -only-testing flags for the ios-ui journey. `NATIVE_E2E_IOS_ONLY_TESTING`
 * (comma-separated) scopes a run — the real-peer CI leg uses it to run just
 * the terminal-keystroke and git families; the default covers the full mock
 * journey.
 */
function iosOnlyTestingFlags() {
  const fromEnv = (process.env.NATIVE_E2E_IOS_ONLY_TESTING ?? "")
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean)
    .map((flag) => `-only-testing:${flag}`);
  return fromEnv.length > 0
    ? fromEnv
    : [
        "-only-testing:NativeE2ETests/NativeJourneyUITests/testRealNativeRemoteJourney",
        "-only-testing:NativeE2ETests/NativeFamilyJourneyUITests",
      ];
}

const ANDROID_REAL_FAMILY_CLASS = "com.poracode.app.Android37WireLabFamilyInstrumentedTest";

/**
 * android-real journey (E.2): the real-peer leg of the API 37 instrumentation
 * job, run after scripts/ci-android-api37.sh's mock leg (whose EXIT trap has
 * already stopped the mock harness, freeing the slot). The CI shell cannot
 * learn the harness capability or the pairing credential, so this subcommand
 * owns the leg end to end: start the real-mode harness as a direct cli.ts
 * child (the ci-android-api37.sh pattern), wait for its readiness line, read
 * the harness-minted real-peer pairing credential, adb-reverse the control
 * and production ports into the emulator (the device dials the pairing URL's
 * 127.0.0.1 endpoint through the reverse; the production Host gate admits the
 * loopback literal on its own bound port), and drive the family-journey class
 * with peerMode=real. The steer/permission family tests skip themselves in
 * real mode, so the class runs exactly the terminal-keystroke and git
 * families. The pairing URL never appears on stdout; it is passed to
 * instrumentation as a -P argument and redacted from streamed output (the
 * same bearer-material-on-CI class as the mock leg's `capability` argument).
 */
async function runAndroidRealJourney({ registerShutdown }) {
  const capability = randomBytes(32).toString("hex");
  const slot = process.env[SLOT_ENV] ?? "1";
  const evidenceRoot = process.env.RUNNER_TEMP ?? join(repoRoot, ".tmp", "native-e2e");
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  const stdoutPath = join(evidenceRoot, "android-real-host.stdout");
  const stderrPath = join(evidenceRoot, "android-real-host.stderr");
  const startupTimeoutMs = Number(process.env.NATIVE_E2E_STARTUP_TIMEOUT_MS ?? 180_000);
  const testTimeoutMs = Number(process.env.NATIVE_E2E_TEST_TIMEOUT_MS ?? 1_800_000);

  const harness = spawn(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      tsRegisterPath,
      "--no-warnings=ExperimentalWarning",
      cliPath,
      "--mode",
      "real",
      "--slot",
      slot,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NATIVE_E2E_MODE: "real",
        [SLOT_ENV]: slot,
        NATIVE_E2E_CONTROL_CAPABILITY: capability,
        NATIVE_E2E_STARTUP_TIMEOUT_MS: String(startupTimeoutMs),
        NATIVE_E2E_TEST_TIMEOUT_MS: String(testTimeoutMs),
        NATIVE_E2E_SHUTDOWN_TIMEOUT_MS: String(SHUTDOWN_WAIT_MS),
      },
      // Truncate ("w"), not append: the readiness poll below must never see a
      // previous run's readiness line in a reused evidence directory.
      stdio: ["ignore", openSync(stdoutPath, "w"), openSync(stderrPath, "w")],
      detached: process.platform !== "win32",
    },
  );

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
    const killer = setTimeout(() => {
      killHarnessGroup("SIGKILL");
      process.exit(code);
    }, SHUTDOWN_WAIT_MS);
    harness.once("exit", () => {
      clearTimeout(killer);
      process.exit(code);
    });
  });

  const dumpHarnessStderr = (lines) => {
    const text = readFileSync(stderrPath, "utf8");
    process.stderr.write(`${text.split(/\r?\n/).slice(0, lines).join("\n")}\n`);
  };

  // Reverse targets for the finally block; undefined until the readiness
  // descriptor names them, and the finally skips removal until then. Declared
  // at function scope so a throw before the descriptor is read can never hit
  // the temporal dead zone inside the finally.
  let controlPort;
  let productionPort;
  // Everything after the harness spawn runs inside this try so the finally
  // always stops the harness: a stranded detached real host would hold the
  // slot ports and the run dir secrets (including the minted pairing
  // credential) alive.
  try {
    // Wait for the readiness line, mirroring ci-android-api37.sh's poll.
    let readyLine;
    const deadline = Date.now() + startupTimeoutMs;
    for (;;) {
      if (harness.exitCode !== null) {
        dumpHarnessStderr(120);
        throw new Error(`native android real harness exited early (${String(harness.exitCode)})`);
      }
      readyLine = readFileSync(stderrPath, "utf8")
        .split(/\r?\n/)
        .find((line) => line.includes("native-e2e real host ready"));
      if (readyLine) break;
      if (Date.now() > deadline) throw new Error("native android real harness startup timed out");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const runDir = readyLine.match(/runDir=(\S+)/)?.[1];
    if (!runDir) throw new Error("real harness readiness line did not carry runDir");
    const readyDescriptor = JSON.parse(readFileSync(join(runDir, "ready.json"), "utf8"));
    controlPort = readyDescriptor?.ports?.control;
    productionPort = readyDescriptor?.ports?.productionHost;
    if (!controlPort || !productionPort) {
      throw new Error("real harness readiness descriptor is missing control/productionHost ports");
    }
    const pairingUrl = readRealPeerPairingUrl(runDir);
    if (!pairingUrl) {
      throw new Error(
        "real harness did not mint secrets/real-peer-pairing.json — the real-peer leg cannot pair",
      );
    }

    await runBuffered("adb", ["reverse", `tcp:${controlPort}`, `tcp:${controlPort}`]);
    await runBuffered("adb", ["reverse", `tcp:${productionPort}`, `tcp:${productionPort}`]);
    await waitForAndroidFrameworkServices();
    // This real-peer class receives one deliberately one-use pairing URL for
    // its terminal + Git methods. Start the suite clean, then let Orchestrator
    // preserve the first method's stored host for the second method.
    const installedAppPath = await runBuffered("adb", [
      "shell",
      "pm",
      "list",
      "packages",
      "com.lightcodeapp.mobile",
    ]);
    if (hasInstalledAndroidPackage(installedAppPath)) {
      await runBuffered("adb", ["shell", "pm", "clear", "com.lightcodeapp.mobile"]);
    }
    const status = await runStreaming(
      "./gradlew",
      [
        "connectedDebugAndroidTest",
        // Preserve the first method's redeemed host for the second method;
        // build.gradle.kts keeps Orchestrator cleanup enabled by default.
        "-Pporacode.android.clearPackageData=false",
        "-Pandroid.testInstrumentationRunnerArguments.peerMode=real",
        `-Pandroid.testInstrumentationRunnerArguments.pairingUrl=${pairingUrl}`,
        `-Pandroid.testInstrumentationRunnerArguments.capability=${capability}`,
        `-Pandroid.testInstrumentationRunnerArguments.controlPort=${controlPort}`,
        `-Pandroid.testInstrumentationRunnerArguments.class=${ANDROID_REAL_FAMILY_CLASS}`,
        "--no-daemon",
        "--stacktrace",
      ],
      process.env,
      pairingUrl,
      join(repoRoot, "android"),
    );
    if (status !== 0) {
      throw new Error(`android real-peer family journey failed (${String(status)})`);
    }
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      appendFileSync(
        summary,
        "- The real-peer family journey (terminal keystroke + git stage) ran against the production host.\n",
      );
    }
  } finally {
    if (controlPort !== undefined) {
      await runBuffered("adb", ["reverse", "--remove", `tcp:${controlPort}`]).catch(() => {});
    }
    if (productionPort !== undefined) {
      await runBuffered("adb", ["reverse", "--remove", `tcp:${productionPort}`]).catch(() => {});
    }
    killHarnessGroup("SIGTERM");
    const exited = await Promise.race([
      new Promise((resolve) => harness.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_WAIT_MS)),
    ]);
    if (!exited) killHarnessGroup("SIGKILL");
  }
}

export function hasInstalledAndroidPackage(output) {
  return output.split(/\r?\n/).some((line) => line.startsWith("package:"));
}

export async function waitForAndroidFrameworkServices(
  run = runBuffered,
  {
    attempts = 60,
    delayMs = 2_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await run("adb", ["shell", "pm", "path", "android"]);
      await run("adb", ["shell", "am", "get-current-user"]);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw new Error(
    `Android package/activity services did not become ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
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
    // A missing binary must reject, not hang the awaiting journey forever.
    processHandle.once("error", (error) =>
      reject(new Error(`${command} failed to spawn: ${error.message}`)),
    );
  });
}

function runStreaming(command, args, env, exactSecret, cwd = repoRoot) {
  return new Promise((resolve) => {
    const processHandle = trackChildProcess(
      spawn(command, args, {
        cwd,
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

// Initialize every journey constant and helper before dispatching. A top-level
// await earlier in this module pauses evaluation, which previously left the
// Android real-peer class name in its temporal dead zone when main called it.
if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
