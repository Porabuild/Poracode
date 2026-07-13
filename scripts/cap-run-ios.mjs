// Resolves a concrete iOS target and execs `cap run ios` with it, so the
// interactive device picker never appears. That picker is unusable under
// `concurrently`: stdin is routed to another process, so arrow-key prompts
// cannot be answered.
//
// Target resolution order:
//   1. $PORACODE_IOS_TARGET       - explicit override (simulator/device UDID)
//   2. first already-booted simulator
//   3. first iPhone simulator on the newest available iOS runtime
//   4. first simulator on the newest available iOS runtime
//   5. first connected device
//
// Any extra CLI args are forwarded verbatim to `cap run ios`. If the caller
// passes --target / --target-name explicitly, this script forwards it without
// resolving another target.
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const binDir = fileURLToPath(new URL("../node_modules/.bin/", import.meta.url));
const nativeRunBin = resolve(binDir, "native-run");
const capBin = resolve(binDir, "cap");

const passthroughTargetArgs = new Set(["--target", "--target-name"]);

function hasPassthroughTargetArg(args) {
  return args.some(
    (arg) =>
      passthroughTargetArgs.has(arg) ||
      arg.startsWith("--target=") ||
      arg.startsWith("--target-name="),
  );
}

function listTargets() {
  let raw;
  try {
    raw = execFileSync(nativeRunBin, ["ios", "--list", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error?.message || String(error);
    throw new Error(`could not list iOS targets (is Xcode installed?): ${detail}`, {
      cause: error,
    });
  }
  return JSON.parse(raw);
}

function listBootedSimulatorIds() {
  let raw;
  try {
    raw = execFileSync("xcrun", ["simctl", "list", "devices", "booted", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return new Set();
  }

  try {
    const parsed = JSON.parse(raw);
    const devicesByRuntime = parsed.devices ?? {};
    return new Set(
      Object.values(devicesByRuntime)
        .flat()
        .map((device) => device?.udid)
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

function sdkVersionScore(target) {
  const score = Number.parseFloat(target?.sdkVersion ?? "");
  return Number.isFinite(score) ? score : 0;
}

function pickNewest(targets) {
  return targets
    .map((target, index) => ({ target, index }))
    .sort((a, b) => {
      const sdkDelta = sdkVersionScore(b.target) - sdkVersionScore(a.target);
      return sdkDelta || a.index - b.index;
    })[0]?.target;
}

function formatTarget(target) {
  return target.name ? `${target.name} (${target.id})` : target.id;
}

function resolveTarget() {
  const override = process.env.PORACODE_IOS_TARGET?.trim();
  if (override) return { id: override };

  const list = listTargets();
  const virtualDevices = list.virtualDevices ?? [];
  const devices = list.devices ?? [];

  const bootedSimulatorIds = listBootedSimulatorIds();
  const bootedSimulator = virtualDevices.find((target) => bootedSimulatorIds.has(target.id));
  if (bootedSimulator) return bootedSimulator;

  const iPhones = virtualDevices.filter((target) => target.name?.startsWith("iPhone"));
  const newestIPhone = pickNewest(iPhones);
  if (newestIPhone) return newestIPhone;

  const newestSimulator = pickNewest(virtualDevices);
  if (newestSimulator) return newestSimulator;

  if (devices.length > 0) return devices[0];

  throw new Error(
    "no connected devices or simulators found - install a simulator or connect a device",
  );
}

const rawExtraArgs = process.argv.slice(2);
const extraArgs = rawExtraArgs[0] === "--" ? rawExtraArgs.slice(1) : rawExtraArgs;
const args = ["run", "ios", "--live-reload", "--host", "localhost", "--port", "3100"];

if (hasPassthroughTargetArg(extraArgs)) {
  console.log("[cap-ios] using caller-provided target args");
} else {
  let target;
  try {
    target = resolveTarget();
  } catch (error) {
    console.error(`[cap-ios] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  console.log(`[cap-ios] target: ${formatTarget(target)}`);
  args.push("--target", target.id);
}

args.push(...extraArgs);

if (process.env.PORACODE_CAP_DRY_RUN) {
  console.log(`[cap-ios] dry run: cap ${args.join(" ")}`);
  process.exit(0);
}

const child = spawn(capBin, args, { stdio: "inherit", env: process.env });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
