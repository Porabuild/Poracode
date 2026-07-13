// Keeps `adb reverse tcp:<port> tcp:<port>` applied to every connected Android
// device and emulator so the mobile app reaches the dev remote server at
// http://127.0.0.1:<port>/ — the same endpoint the iOS simulator uses. (The
// sim shares the Mac's loopback; Android needs adb reverse, which covers
// emulators and USB devices alike. Capacitor's --forwardPorts only carries a
// single port pair — the Vite one — hence this watcher for the server port.)
// Runs until killed, re-applying as devices appear or restart; `concurrently
// -k` tears it down with the rest of `dev:android`.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const POLL_INTERVAL_MS = 3000;

function parsePort(value) {
  const port = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Expected a TCP port between 1 and 65535, received: ${value ?? "<missing>"}`);
  }

  return port;
}

function resolveAdb() {
  const adbExecutable = process.platform === "win32" ? "adb.exe" : "adb";
  const sdkRoot = (process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "").trim();
  if (sdkRoot) {
    return resolve(sdkRoot, "platform-tools", adbExecutable);
  }

  try {
    const properties = readFileSync(resolve(process.cwd(), "android/local.properties"), "utf8");
    const sdkDir = properties.match(/^sdk\.dir=(.+)$/m)?.[1]?.trim();
    if (sdkDir) {
      return resolve(sdkDir, "platform-tools", adbExecutable);
    }
  } catch {
    // No local.properties — fall back to PATH.
  }

  return "adb";
}

const port = parsePort(process.argv[2] ?? process.env.PORACODE_REMOTE_ACCESS_PORT ?? "38987");
const adb = resolveAdb();
const reversedSerials = new Set();

async function listDeviceSerials() {
  // `adb devices` also boots the adb server when it isn't running yet.
  const { stdout } = await execFileAsync(adb, ["devices"]);

  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((columns) => columns.length === 2 && columns[1] === "device")
    .map((columns) => columns[0]);
}

async function applyReverse() {
  let serials;
  try {
    serials = await listDeviceSerials();
  } catch (error) {
    console.error(
      `[adb-reverse] cannot run ${adb}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  // A serial that disappeared lost its reverses (device restart) — re-apply
  // when it comes back.
  for (const serial of reversedSerials) {
    if (!serials.includes(serial)) {
      reversedSerials.delete(serial);
    }
  }

  for (const serial of serials) {
    if (reversedSerials.has(serial)) {
      continue;
    }

    try {
      await execFileAsync(adb, ["-s", serial, "reverse", `tcp:${port}`, `tcp:${port}`]);
      reversedSerials.add(serial);
      console.log(`[adb-reverse] ${serial}: device 127.0.0.1:${port} → host ${port}`);
    } catch (error) {
      console.warn(
        `[adb-reverse] ${serial}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

console.log(`[adb-reverse] exposing the dev remote server (port ${port}) to Android devices`);
await applyReverse();
setInterval(() => void applyReverse(), POLL_INTERVAL_MS);
