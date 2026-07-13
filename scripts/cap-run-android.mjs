// Resolves a concrete Android target and runs the debug APK with live reload, so
// the interactive device picker never appears. That picker - shown by
// cap/native-run whenever more than one target exists - is unusable under
// `concurrently`: stdin is routed to the first process (`server`), not this
// one, so the arrow-key prompt can never be answered. We always pass an
// explicit --target instead.
//
// Target resolution order:
//   1. $PORACODE_ANDROID_TARGET      - explicit override (device serial or AVD id)
//   2. first already-connected device - attach to a running emulator / phone
//   3. AVD with the highest API level - boot the newest virtual device
//
// SDK discovery mirrors android-reverse-server-port.mjs: ANDROID_HOME /
// ANDROID_SDK_ROOT, else `sdk.dir` from android/local.properties.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve real Node entrypoints directly. The .bin shell shims are brittle from
// Node child processes on Windows, and Capacitor's own Windows `cap run android`
// path currently invokes `./gradlew` instead of `gradlew.bat`.
const nativeRunBin = fileURLToPath(
  new URL("../node_modules/native-run/bin/native-run", import.meta.url),
);
const androidDir = resolve(process.cwd(), "android");
const capacitorConfigPath = resolve(androidDir, "app/src/main/assets/capacitor.config.json");

function resolveSdkRoot() {
  const fromEnv = (process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "").trim();
  if (fromEnv) return fromEnv;

  try {
    const properties = readFileSync(resolve(process.cwd(), "android/local.properties"), "utf8");
    return properties.match(/^sdk\.dir=(.+)$/m)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

const sdkRoot = resolveSdkRoot();
const childEnv = { ...process.env };
if (sdkRoot) {
  childEnv.ANDROID_HOME = sdkRoot;
  childEnv.ANDROID_SDK_ROOT = sdkRoot;
}

let activeChild = null;

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: childEnv,
      ...options,
    });
    activeChild = child;

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      activeChild = activeChild === child ? null : activeChild;
      if (code === 0) {
        resolveRun();
      } else {
        reject(new Error(`${command} exited with ${signal ?? code ?? "unknown status"}`));
      }
    });
  });
}

function listTargets() {
  let raw;
  try {
    raw = execFileSync(process.execPath, [nativeRunBin, "android", "--list", "--json"], {
      encoding: "utf8",
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error?.message || String(error);
    throw new Error(
      `could not list Android targets (is the SDK installed / ANDROID_HOME set?): ${detail}`,
      {
        cause: error,
      },
    );
  }
  return JSON.parse(raw);
}

function resolveTarget() {
  const override = process.env.PORACODE_ANDROID_TARGET?.trim();
  if (override) return override;

  const list = listTargets();

  const devices = list.devices ?? [];
  if (devices.length > 0) return devices[0].id; // attach to a booted device

  const avds = [...(list.virtualDevices ?? [])].sort(
    (a, b) => Number.parseFloat(b.sdkVersion) - Number.parseFloat(a.sdkVersion),
  );
  if (avds.length > 0) return avds[0].id; // boot the newest AVD

  throw new Error("no connected devices or AVDs found - create an AVD or start an emulator");
}

let target;
try {
  target = resolveTarget();
} catch (error) {
  console.error(`[cap-android] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

console.log(`[cap-android] target: ${target}`);

const gradleCommand = process.platform === "win32" ? "cmd.exe" : "./gradlew";
const gradleArgs =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "gradlew.bat", "assembleDebug"]
    : ["assembleDebug"];
const apkPath = resolve(androidDir, "app/build/outputs/apk/debug/app-debug.apk");
const nativeRunArgs = [
  "android",
  "--app",
  apkPath,
  "--target",
  target,
  "--forward",
  "3100:3100",
  ...process.argv.slice(2),
];

if (process.env.PORACODE_CAP_DRY_RUN) {
  console.log(`[cap-android] dry run: ${gradleCommand} ${gradleArgs.join(" ")}`);
  console.log(`[cap-android] dry run: node ${nativeRunBin} ${nativeRunArgs.join(" ")}`);
  process.exit(0);
}

let originalConfig = "";

function writeLiveReloadConfig() {
  originalConfig = readFileSync(capacitorConfigPath, "utf8");
  const config = JSON.parse(originalConfig);
  config.server = {
    ...config.server,
    url: "http://localhost:3100",
  };
  writeFileSync(capacitorConfigPath, `${JSON.stringify(config, null, "\t")}\n`);
}

function revertLiveReloadConfig() {
  if (originalConfig) {
    writeFileSync(capacitorConfigPath, originalConfig);
    originalConfig = "";
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    revertLiveReloadConfig();
    activeChild?.kill(signal);
    process.exit(0);
  });
}

try {
  writeLiveReloadConfig();
  await run(gradleCommand, gradleArgs, { cwd: androidDir });
  await run(process.execPath, [nativeRunBin, ...nativeRunArgs]);
  console.log("[cap-android] app running with live reload at http://localhost:3100");
  await new Promise(() => {
    setInterval(() => {}, 1000);
  });
} catch (error) {
  revertLiveReloadConfig();
  console.error(`[cap-android] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
