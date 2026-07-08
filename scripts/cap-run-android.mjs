// Resolves a concrete Android target and execs `cap run android` with it, so
// the interactive device picker never appears. That picker — shown by
// cap/native-run whenever more than one target exists — is unusable under
// `concurrently`: stdin is routed to the first process (`server`), not this
// one, so the arrow-key prompt can never be answered. We always pass an
// explicit --target instead.
//
// Target resolution order:
//   1. $LIGHTCODE_ANDROID_TARGET      — explicit override (device serial or AVD id)
//   2. first already-connected device — attach to a running emulator / phone
//   3. AVD with the highest API level — boot the newest virtual device
//
// SDK discovery mirrors android-reverse-server-port.mjs: ANDROID_HOME /
// ANDROID_SDK_ROOT, else `sdk.dir` from android/local.properties. Any extra CLI
// args are forwarded verbatim to `cap run android`. `concurrently -k` tears
// this down (and its spawned `cap`) with the rest of `dev:android`.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the locally-linked CLIs directly (not via `pnpm exec`, whose
// "Scope: …" preamble can leak into stdout and break JSON parsing). Anchored to
// this file so the launcher works regardless of the caller's cwd.
const binDir = fileURLToPath(new URL("../node_modules/.bin/", import.meta.url));
const nativeRunBin = resolve(binDir, "native-run");
const capBin = resolve(binDir, "cap");

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

function listTargets() {
  let raw;
  try {
    raw = execFileSync(nativeRunBin, ["android", "--list", "--json"], {
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
  const override = process.env.LIGHTCODE_ANDROID_TARGET?.trim();
  if (override) return override;

  const list = listTargets();

  const devices = list.devices ?? [];
  if (devices.length > 0) return devices[0].id; // attach to a booted device

  const avds = [...(list.virtualDevices ?? [])].sort(
    (a, b) => Number.parseFloat(b.sdkVersion) - Number.parseFloat(a.sdkVersion),
  );
  if (avds.length > 0) return avds[0].id; // boot the newest AVD

  throw new Error("no connected devices or AVDs found — create an AVD or start an emulator");
}

let target;
try {
  target = resolveTarget();
} catch (error) {
  console.error(`[cap-android] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

console.log(`[cap-android] target: ${target}`);

const args = [
  "run",
  "android",
  "--live-reload",
  "--host",
  "localhost",
  "--port",
  "3100",
  "--forwardPorts",
  "3100:3100",
  "--target",
  target,
  ...process.argv.slice(2),
];

if (process.env.LIGHTCODE_CAP_DRY_RUN) {
  console.log(`[cap-android] dry run: cap ${args.join(" ")}`);
  process.exit(0);
}

const child = spawn(capBin, args, { stdio: "inherit", env: childEnv });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
