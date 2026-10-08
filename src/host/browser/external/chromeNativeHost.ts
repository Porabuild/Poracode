import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  CHROME_NATIVE_HOST_NAME,
  CHROME_NATIVE_HOST_PROTOCOL_VERSION,
} from "@/shared/chromeSidebarProtocol";

/**
 * Per-user Chrome native messaging host that gives the installed extension the
 * running bridges' tokens, so the extension and the bridge can prove the token
 * to each other without a pairing screen (the token never crosses the socket). Chrome only launches the host for extension IDs listed in the
 * manifest's `allowed_origins`, which is the browser-enforced identity proof a
 * WebSocket `Origin` header cannot give.
 *
 * Everything here is generated at runtime into a private per-user directory
 * (0700 dir, 0600 token files) shared by every Poracode channel and host, and
 * re-rendered on each production start so app moves and updates repair
 * themselves. No secret is ever written into the manifest, launcher, script or
 * extension.
 */

/** Bump when the bridge-entry, script, launcher or manifest shape changes. */
export const CHROME_NATIVE_HOST_ARTIFACT_VERSION = 1;

/** `1` opts a development run into the shared native host; `0` opts any run out. */
export const CHROME_NATIVE_HOST_ENV = "PORACODE_CHROME_NATIVE_HOST";

/**
 * Whether this run registers the shared per-user native host and publishes its
 * bridge through it. The registration is last-writer-wins for every channel
 * and pins this run's runtime binary, so only production runs (the packaged
 * desktop app, the production CLI) do it by default: a dev, worktree or smoke
 * run would otherwise repoint the installed app's launcher at a binary that
 * disappears with the checkout. Such runs keep the unauthenticated relay only,
 * unless `PORACODE_CHROME_NATIVE_HOST=1` opts them in (a branch-isolated
 * server under test; the next production start re-registers its own runtime).
 */
export function chromeNativeHostEnabled(
  production: boolean,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const override = env[CHROME_NATIVE_HOST_ENV]?.trim();
  return override === "1" ? true : override === "0" ? false : production;
}

const SCRIPT_FILE = "native-host.cjs";
const MANIFEST_FILE = `${CHROME_NATIVE_HOST_NAME}.json`;
const BRIDGES_DIR = "bridges";

export function chromeNativeHostDir(homeDir: string): string {
  return join(homeDir, ".poracode-chrome-bridge");
}

function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // mkdir's mode only applies on creation; tighten a pre-existing directory too.
  if (process.platform !== "win32") chmodSync(dir, 0o700);
}

/** Atomic write; the temp file is created with `mode`, so the content is never wider. */
export function writePrivateFile(path: string, body: string, mode = 0o600): void {
  writeFileAtomic(path, body, { encoding: "utf8", mode, exactMode: true });
}

function writeIfChanged(path: string, body: string, mode: number): void {
  try {
    if (readFileSync(path, "utf8") === body) {
      if (process.platform !== "win32") chmodSync(path, mode);
      return;
    }
  } catch {}
  writePrivateFile(path, body, mode);
}

export interface ChromeBridgeEntry {
  port: number;
  token: string;
}

/**
 * Publish one running bridge's `{ port, token }` for the native host. The file
 * name is derived from the owning profile so restarts overwrite their own
 * entry and channels never collide. Returns the entry path.
 */
export function writeChromeBridgeEntry(
  hostDir: string,
  ownerKey: string,
  entry: ChromeBridgeEntry,
): string {
  ensurePrivateDir(hostDir);
  const bridgesDir = join(hostDir, BRIDGES_DIR);
  ensurePrivateDir(bridgesDir);
  const name = createHash("sha256").update(ownerKey).digest("hex").slice(0, 24);
  const path = join(bridgesDir, `${name}.json`);
  writePrivateFile(
    path,
    `${JSON.stringify({
      version: CHROME_NATIVE_HOST_ARTIFACT_VERSION,
      port: entry.port,
      token: entry.token,
      pid: process.pid,
    })}\n`,
    0o600,
  );
  return path;
}

/**
 * Whether `pid` may be one of this user's running bridges. `EPERM` means the
 * pid now belongs to another OS user (typically reused after a reboot), and
 * bridges always run as this user, so it counts as dead. The generated script
 * applies the same rule.
 */
function bridgeProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete entries (any artifact version) whose owning process is gone, so
 * killed or crashed runs do not accumulate. Live and unreadable entries stay.
 */
export function pruneDeadChromeBridgeEntries(hostDir: string): void {
  const bridgesDir = join(hostDir, BRIDGES_DIR);
  let names: string[];
  try {
    names = readdirSync(bridgesDir).filter((name) => name.endsWith(".json"));
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(bridgesDir, name);
    try {
      const { pid } = JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown };
      if (Number.isInteger(pid) && (pid as number) > 0 && !bridgeProcessAlive(pid as number))
        rmSync(path, { force: true });
    } catch {}
  }
}

/** Remove the entry only while it still holds this bridge's token. */
export function removeChromeBridgeEntry(path: string, token: string): void {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { token?: unknown };
    if (parsed.token === token) rmSync(path, { force: true });
  } catch {}
}

/**
 * The host program: reads one length-prefixed request from Chrome, answers
 * with the live bridges, newest first, and exits. Dependency-free CommonJS so
 * any Node runtime (bare Node or Electron-as-Node) executes it.
 */
export function renderChromeNativeHostScript(extensionIds: readonly string[]): string {
  const origins = extensionIds.map((id) => `chrome-extension://${id}/`);
  return `"use strict";
// Generated by Poracode — Chrome native messaging host v${CHROME_NATIVE_HOST_ARTIFACT_VERSION}. Do not edit.
const fs = require("node:fs");
const path = require("node:path");
const ALLOWED_ORIGINS = ${JSON.stringify(origins)};
const BRIDGES_DIR = path.join(__dirname, ${JSON.stringify(BRIDGES_DIR)});
const VERSION = ${CHROME_NATIVE_HOST_PROTOCOL_VERSION};
setTimeout(() => process.exit(1), 5000).unref();
let replying = false;

function reply(message) {
  replying = true;
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]), () => process.exit(0));
}

// EPERM: the pid belongs to another OS user now, never to one of our bridges.
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function liveBridges() {
  let names = [];
  try {
    names = fs.readdirSync(BRIDGES_DIR).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const entries = [];
  for (const name of names) {
    try {
      const file = path.join(BRIDGES_DIR, name);
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (
        parsed.version === ${CHROME_NATIVE_HOST_ARTIFACT_VERSION} &&
        Number.isInteger(parsed.port) &&
        typeof parsed.token === "string" &&
        parsed.token.length > 0 &&
        alive(parsed.pid)
      )
        entries.push({ port: parsed.port, token: parsed.token, mtime: fs.statSync(file).mtimeMs });
    } catch {}
  }
  return entries
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ port, token }) => ({ port, token }));
}

// Chrome passes the calling extension's origin as an argument; it has already
// enforced allowed_origins, so this only guards against a mis-registered copy.
const callerAllowed = process.argv.slice(2).some((arg) => ALLOWED_ORIGINS.includes(arg));
let input = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  if (replying) return;
  input = Buffer.concat([input, chunk]);
  if (input.length < 4) return;
  const length = input.readUInt32LE(0);
  if (length > 65536) process.exit(1);
  if (input.length < 4 + length) return;
  let request = null;
  try {
    request = JSON.parse(input.subarray(4, 4 + length).toString("utf8"));
  } catch {}
  const valid =
    callerAllowed && request && request.type === "getBridges" && request.version === VERSION;
  reply({ type: "bridges", version: VERSION, bridges: valid ? liveBridges() : [] });
});
// Stdout pipes are asynchronous on macOS: let a pending reply flush first.
process.stdin.on("end", () => {
  if (!replying) process.exit(0);
});
`;
}

export interface ChromeNativeHostRuntime {
  /** Absolute runtime binary: bare Node, or the app's Electron binary. */
  path: string;
  /** Run the binary as Node (`ELECTRON_RUN_AS_NODE=1`), never as the app. */
  electron: boolean;
}

export function launcherFileName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "native-host.cmd" : "native-host.sh";
}

/**
 * Chrome executes the manifest `path` directly (via `cmd.exe` on Windows) with
 * no arguments of ours and its own environment, so a tiny launcher pins the
 * runtime and, like the captured supervisor runtime, clears an inherited
 * `NODE_OPTIONS` (e.g. `--require` hooks from a terminal-launched Chrome).
 * Electron-as-Node never initialises the app, so nothing reaches the
 * foreground or the Dock.
 */
export function renderChromeNativeHostLauncher(
  runtime: ChromeNativeHostRuntime,
  platform: NodeJS.Platform,
): string {
  if (platform === "win32") {
    // cmd expands %…% even inside quotes, and `%` is legal in Windows paths.
    const quoted = `"${runtime.path.replaceAll('"', '""').replaceAll("%", "%%")}"`;
    return [
      "@echo off",
      "setlocal",
      "set NODE_OPTIONS=",
      ...(runtime.electron ? ["set ELECTRON_RUN_AS_NODE=1"] : []),
      `${quoted} "%~dp0${SCRIPT_FILE}" %*`,
      "",
    ].join("\r\n");
  }
  const quoted = `'${runtime.path.replaceAll("'", "'\\''")}'`;
  return [
    "#!/bin/sh",
    'dir=$(dirname "$0")',
    `exec env NODE_OPTIONS= ${runtime.electron ? "ELECTRON_RUN_AS_NODE=1 " : ""}${quoted} "$dir/${SCRIPT_FILE}" "$@"`,
    "",
  ].join("\n");
}

export function renderChromeNativeHostManifest(
  launcherPath: string,
  extensionIds: readonly string[],
): string {
  return `${JSON.stringify(
    {
      name: CHROME_NATIVE_HOST_NAME,
      description: "Poracode browser bridge",
      path: launcherPath,
      type: "stdio",
      allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
    },
    null,
    2,
  )}\n`;
}

const MAC_BROWSER_DIRS = [
  "Google/Chrome",
  "Google/Chrome Beta",
  "Google/Chrome Dev",
  "Google/Chrome Canary",
  "Chromium",
  "Microsoft Edge",
  "Microsoft Edge Beta",
  "Microsoft Edge Dev",
  "BraveSoftware/Brave-Browser",
  "Vivaldi",
  "Arc/User Data",
];
const LINUX_BROWSER_DIRS = [
  "google-chrome",
  "google-chrome-beta",
  "google-chrome-unstable",
  "chromium",
  "microsoft-edge",
  "microsoft-edge-beta",
  "microsoft-edge-dev",
  "BraveSoftware/Brave-Browser",
  "vivaldi",
];
const WINDOWS_REGISTRY_ROOTS = [
  "HKCU\\Software\\Google\\Chrome",
  "HKCU\\Software\\Chromium",
  "HKCU\\Software\\Microsoft\\Edge",
  "HKCU\\Software\\BraveSoftware\\Brave-Browser",
];

/** Per-user browser profile roots whose `NativeMessagingHosts` we populate. */
export function chromeBrowserDataDirs(
  platform: NodeJS.Platform,
  homeDir: string,
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  if (platform === "darwin") {
    return MAC_BROWSER_DIRS.map((dir) => join(homeDir, "Library", "Application Support", dir));
  }
  if (platform === "linux" || platform === "freebsd" || platform === "openbsd") {
    const config = env.XDG_CONFIG_HOME?.trim() || join(homeDir, ".config");
    return LINUX_BROWSER_DIRS.map((dir) => join(config, dir));
  }
  return [];
}

export interface RegisterChromeNativeHostOptions {
  hostDir: string;
  homeDir: string;
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  runtime: ChromeNativeHostRuntime;
  extensionIds: readonly string[];
  /** Windows registry writer; defaults to a hidden `reg.exe add`. */
  setRegistryDefault?: (key: string, value: string) => Promise<void>;
}

export interface ChromeNativeHostRegistration {
  manifests: string[];
  registryKeys: string[];
}

function regAdd(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "reg.exe",
      ["add", key, "/ve", "/t", "REG_SZ", "/d", value, "/f"],
      { windowsHide: true, timeout: 10_000 },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

/**
 * Idempotently (re)write the host program, launcher and manifests, and prune
 * entries of runs that died without removing theirs. On macOS and Linux only
 * browsers that already have a profile directory are registered, so this never
 * creates browser state for browsers the user does not have; on Windows the
 * per-user registry keys are written for every supported browser, which
 * creates no browser state.
 */
export async function registerChromeNativeHost(
  options: RegisterChromeNativeHostOptions,
): Promise<ChromeNativeHostRegistration> {
  const { hostDir, platform } = options;
  ensurePrivateDir(hostDir);
  ensurePrivateDir(join(hostDir, BRIDGES_DIR));
  pruneDeadChromeBridgeEntries(hostDir);
  writeIfChanged(
    join(hostDir, SCRIPT_FILE),
    renderChromeNativeHostScript(options.extensionIds),
    0o600,
  );
  const launcherPath = join(hostDir, launcherFileName(platform));
  writeIfChanged(launcherPath, renderChromeNativeHostLauncher(options.runtime, platform), 0o700);
  const manifest = renderChromeNativeHostManifest(launcherPath, options.extensionIds);
  const result: ChromeNativeHostRegistration = { manifests: [], registryKeys: [] };

  if (platform === "win32") {
    const manifestPath = join(hostDir, MANIFEST_FILE);
    writeIfChanged(manifestPath, manifest, 0o600);
    result.manifests.push(manifestPath);
    const setDefault = options.setRegistryDefault ?? regAdd;
    for (const root of WINDOWS_REGISTRY_ROOTS) {
      const key = `${root}\\NativeMessagingHosts\\${CHROME_NATIVE_HOST_NAME}`;
      try {
        await setDefault(key, manifestPath);
        result.registryKeys.push(key);
      } catch {}
    }
    return result;
  }

  for (const browserDir of chromeBrowserDataDirs(platform, options.homeDir, options.env)) {
    if (!existsSync(browserDir)) continue;
    const manifestDir = join(browserDir, "NativeMessagingHosts");
    try {
      mkdirSync(manifestDir, { recursive: true });
      const manifestPath = join(manifestDir, MANIFEST_FILE);
      writeIfChanged(manifestPath, manifest, 0o644);
      result.manifests.push(manifestPath);
    } catch {}
  }
  return result;
}
