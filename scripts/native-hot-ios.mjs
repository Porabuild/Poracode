import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";
import { sleep } from "./native-dev-lib.mjs";

export const INJECTION_NEXT_VERSION = "2.0.1";
export const INJECTION_NEXT_SHA256 =
  "7390db00a82bebf6fa2b828f28e40d29b12d551e4c749a15779ce79eae1d9737";
export const INJECTION_NEXT_URL = `https://github.com/johnno1962/InjectionNext/releases/download/${INJECTION_NEXT_VERSION}/InjectionNext.zip`;
export const INJECTION_CONTROL_SOCKET = "/tmp/InjectionNext-control.sock";

const CONTROL_TIMEOUT_MS = 5_000;
const HOT_PATCH_TIMEOUT_MS = 15_000;

export function injectionNextPaths(repoRoot) {
  const root = join(
    repoRoot,
    ".tmp",
    "native-hot-reload",
    "ios",
    `injection-next-${INJECTION_NEXT_VERSION}`,
  );
  const app = join(root, "InjectionNext.app");
  return {
    app,
    bundle: join(app, "Contents", "Resources", "iOSInjection.bundle"),
    root,
    zip: join(root, "InjectionNext.zip"),
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function downloadPinnedRelease(zip) {
  process.stdout.write(
    `[native-ios] downloading InjectionNext ${INJECTION_NEXT_VERSION} (one-time, MIT-licensed)\n`,
  );
  const response = await fetch(INJECTION_NEXT_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`InjectionNext download failed with HTTP ${String(response.status)}`);
  }
  await writeFile(zip, new Uint8Array(await response.arrayBuffer()), { mode: 0o600 });
}

async function verifyPinnedRelease(zip) {
  const actual = sha256(await readFile(zip));
  if (actual !== INJECTION_NEXT_SHA256) {
    throw new Error(
      `InjectionNext checksum mismatch; expected ${INJECTION_NEXT_SHA256}, found ${actual}`,
    );
  }
}

export async function injectionControl(request, timeoutMs = CONTROL_TIMEOUT_MS) {
  return await new Promise((resolve, reject) => {
    const socket = connect(INJECTION_CONTROL_SOCKET);
    let response = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    socket.setTimeout(timeoutMs, () =>
      finish(new Error("InjectionNext control request timed out")),
    );
    socket.on("error", (error) => finish(error));
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      const newline = response.indexOf("\n");
      if (newline < 0) return;
      try {
        const parsed = JSON.parse(response.slice(0, newline));
        if (!parsed.success) {
          finish(new Error(parsed.error ?? "InjectionNext rejected the control request"));
          return;
        }
        finish(null, parsed.data ?? {});
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

async function waitForControlServer() {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await injectionControl({ action: "status" }, 1_000);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error(
    `InjectionNext did not expose its local control socket${lastError instanceof Error ? `: ${lastError.message}` : ""}`,
  );
}

async function waitForInjectionNextExit(supervisor) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await supervisor.run("/usr/bin/pgrep", ["-x", "InjectionNext"], {
        capture: true,
        label: "Waiting for the prior iOS hot-patch compiler",
        quiet: true,
        timeoutMs: 1_000,
      });
      await sleep(100);
    } catch {
      return;
    }
  }
  throw new Error("the prior InjectionNext process did not exit cleanly");
}

export async function prepareIosHotReload({ repoRoot, supervisor }) {
  const paths = injectionNextPaths(repoRoot);
  await mkdir(paths.root, { recursive: true });
  if (!existsSync(paths.zip)) await downloadPinnedRelease(paths.zip);
  await verifyPinnedRelease(paths.zip);

  if (!existsSync(paths.app)) {
    await supervisor.run("/usr/bin/ditto", ["-x", "-k", paths.zip, paths.root], {
      label: "Extracting the pinned InjectionNext runtime",
    });
  }
  if (!existsSync(paths.bundle)) {
    throw new Error("the pinned InjectionNext archive does not contain iOSInjection.bundle");
  }

  return paths;
}

export async function recordIosCompilerActivity({ derivedDataPath, stderr, stdout }) {
  const logsDirectory = join(derivedDataPath, "Logs", "Build");
  const path = join(logsDirectory, "PoracodeNativeHotReload.xcactivitylog");
  let output = `${stdout}\n${stderr}`;
  if (!output.includes("swift-frontend") || !output.includes(" -module-name App ")) {
    if (existsSync(path)) return path;
    throw new Error(
      "the iOS build did not emit Swift compiler commands and no prior hot-patch activity log exists",
    );
  }
  const appCommand = output
    .split(/\r?\n/)
    .find((line) => line.includes("swift-frontend") && line.includes(" -module-name App "));
  const sourceListPath = join(
    derivedDataPath,
    "Build",
    "Intermediates.noindex",
    "App.build",
    "Debug-iphonesimulator",
    "App.build",
    "Objects-normal",
    "arm64",
    "sources-1",
  );
  if (!appCommand || !existsSync(sourceListPath)) {
    throw new Error("the iOS build did not expose the App target source list for hot patching");
  }
  const sources = (await readFile(sourceListPath, "utf8"))
    .split(/\r?\n/)
    .map((source) => source.trim())
    .filter(Boolean);
  if (sources.length === 0) throw new Error("the App target source list is empty");
  const sourceArguments = sources
    .map((source) =>
      /[\s'"\\]/.test(source)
        ? ` -primary-file ${source.replaceAll(/([\s'"\\])/g, "\\$1")}`
        : ` -primary-file ${source}`,
    )
    .join("");
  // Xcode may emit only the incrementally recompiled primary files. Add one
  // synthetic command derived from the real invocation and the real source
  // filelist so InjectionNext can locate any later SwiftUI body edit.
  output += `\n${appCommand}${sourceArguments}\n`;
  await mkdir(logsDirectory, { recursive: true });
  await writeFile(path, gzipSync(output), { mode: 0o600 });
  return path;
}

export async function startIosHotReload({ buildLogPath, iosRoot, paths, repoRoot, supervisor }) {
  await supervisor.run(
    "/usr/bin/defaults",
    ["write", "com.johnholdsworth.InjectionNext", "mcpServer", "-bool", "true"],
    { capture: true, label: "Enabling InjectionNext console control", quiet: true },
  );
  await supervisor.run(
    "/usr/bin/defaults",
    ["write", "com.johnholdsworth.InjectionNext", "HotReloadingBuildLogsDir", buildLogPath],
    { capture: true, label: "Registering the iOS compiler activity log", quiet: true },
  );

  // InjectionNext reads the custom log location once at startup. Restart only
  // this development helper so repeated pnpm runs cannot retain a stale path.
  await supervisor
    .run(
      "/usr/bin/osascript",
      ["-e", 'tell application id "com.johnholdsworth.InjectionNext" to quit'],
      { capture: true, label: "Restarting the iOS hot-patch compiler", quiet: true },
    )
    .catch(() => {});
  await waitForInjectionNextExit(supervisor);
  const injectionExecutable = join(paths.app, "Contents", "MacOS", "InjectionNext");
  if (!existsSync(injectionExecutable)) {
    throw new Error("the pinned InjectionNext app does not contain its executable");
  }
  // Keep the helper under the runner's process supervisor. Ctrl+C must stop
  // the file watcher too; leaving a detached GUI helper alive would continue
  // compiling later edits after native development has ended.
  supervisor.startLongRunning(injectionExecutable, ["-projectPath", iosRoot]);
  // The release starts its injection and control listeners on separate queues.
  // Probing the control socket during that short startup window can invalidate
  // the injection listener, so let applicationDidFinishLaunching settle first.
  await sleep(1_500);
  await waitForControlServer();
  // Watch from the repository root so InjectionNext also sees xcactivitylog
  // updates in the runner's isolated .tmp/DerivedData directory.
  await injectionControl({ action: "watch_project", path: repoRoot });
}

function relevantRecompile(logs, changedPaths) {
  const names = new Set(changedPaths.map((path) => basename(path)));
  return logs.some(({ message }) => {
    if (typeof message !== "string" || !message.includes("Recompiling")) return false;
    return [...names].some((name) => message.includes(name));
  });
}

/**
 * InjectionNext owns the Swift file watch. This function waits for proof that
 * it picked up our edit. A compile/link failure or missing proof returns false,
 * allowing the native runner to rebuild and relaunch automatically.
 */
export async function waitForIosHotPatch(changedPaths, startedAtMs = Date.now()) {
  const deadline = Date.now() + HOT_PATCH_TIMEOUT_MS;
  let recompileSeenAt = 0;
  while (Date.now() < deadline) {
    const status = await injectionControl({ action: "status" });
    if (!status.has_connected_client) return false;

    const { error } = await injectionControl({ action: "get_last_error" });
    if (typeof error === "string" && error !== "No error.") return false;

    const logData = await injectionControl({
      action: "get_logs",
      limit: 500,
      since: startedAtMs / 1_000 - 1,
    });
    if (relevantRecompile(logData.logs ?? [], changedPaths)) {
      if (recompileSeenAt === 0) recompileSeenAt = Date.now();
      // Recompiling is logged before compile/link/load. Give that pipeline a
      // quiet window, then confirm it did not publish a compiler error.
      if (Date.now() - recompileSeenAt >= 1_250) {
        const finalError = await injectionControl({ action: "get_last_error" });
        return finalError.error === "No error.";
      }
    }
    await sleep(250);
  }
  return false;
}
