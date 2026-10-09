import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callNativeHost as callHost } from "./chromeNativeHost.fixture";
import {
  chromeNativeHostDir,
  chromeNativeHostEnabled,
  registerChromeNativeHost,
  removeChromeBridgeEntry,
  renderChromeNativeHostLauncher,
  writeChromeBridgeEntry,
} from "./chromeNativeHost";
import { CHROME_NATIVE_HOST_NAME } from "@/shared/chromeSidebarProtocol";

const ID = "nebjdbpljbmgchnecchddbiondbcdbbd";
const ORIGIN = `chrome-extension://${ID}/`;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function tempHome() {
  const root = mkdtempSync(join(tmpdir(), "poracode-native-host-"));
  roots.push(root);
  return root;
}

const nodeRuntime = { path: process.execPath, electron: false };

/** A pid that is certainly not running: above every platform's pid ceiling. */
const DEAD_PID = 2 ** 31 - 2;
/** pid 1 is init/launchd: `kill(1, 0)` is EPERM for a non-root test user. */
const OTHER_USER_PID = 1;
const runsAsRoot = process.getuid?.() === 0;

function writeEntry(hostDir: string, name: string, entry: Record<string, unknown>) {
  const path = join(hostDir, "bridges", `${name}.json`);
  writeFileSync(path, JSON.stringify({ version: 1, ...entry }), { mode: 0o600 });
  return path;
}

describe("chrome native host enablement", () => {
  it.each([
    { production: true, value: undefined, enabled: true },
    { production: false, value: undefined, enabled: false },
    { production: false, value: "1", enabled: true },
    { production: true, value: "0", enabled: false },
    { production: false, value: "yes", enabled: false },
  ])(
    "production=$production with PORACODE_CHROME_NATIVE_HOST=$value → $enabled",
    ({ production, value, enabled }) => {
      const env = value === undefined ? {} : { PORACODE_CHROME_NATIVE_HOST: value };
      expect(chromeNativeHostEnabled(production, env)).toBe(enabled);
    },
  );
});

describe("chrome native host registration", () => {
  it("registers only installed browsers on macOS with a pinned allowed_origins manifest", async () => {
    const home = tempHome();
    const chrome = join(home, "Library", "Application Support", "Google", "Chrome");
    mkdirSync(chrome, { recursive: true });
    const hostDir = chromeNativeHostDir(home);
    const result = await registerChromeNativeHost({
      hostDir,
      homeDir: home,
      platform: "darwin",
      env: {},
      runtime: nodeRuntime,
      extensionIds: [ID],
    });
    const manifestPath = join(chrome, "NativeMessagingHosts", `${CHROME_NATIVE_HOST_NAME}.json`);
    expect(result.manifests).toEqual([manifestPath]);
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual({
      name: CHROME_NATIVE_HOST_NAME,
      description: "Poracode browser bridge",
      path: join(hostDir, "native-host.sh"),
      type: "stdio",
      allowed_origins: [ORIGIN],
    });
    // Nothing is created for browsers the user does not have.
    expect(existsSync(join(home, "Library", "Application Support", "Microsoft Edge"))).toBe(false);
    const manifest = readFileSync(manifestPath, "utf8");
    expect(manifest).not.toMatch(/token/i);
    const posix = process.platform !== "win32";
    expect(posix ? statSync(hostDir).mode & 0o777 : 0o700).toBe(0o700);
    expect(posix ? statSync(join(hostDir, "native-host.sh")).mode & 0o777 : 0o700).toBe(0o700);
  });

  it.skipIf(process.platform === "win32")(
    "tightens unchanged native files and directories without rewriting their content",
    async () => {
      const home = tempHome();
      const hostDir = chromeNativeHostDir(home);
      const options = {
        hostDir,
        homeDir: home,
        platform: "linux" as const,
        env: {},
        runtime: nodeRuntime,
        extensionIds: [ID],
      };
      const browserDir = join(home, ".config", "chromium");
      mkdirSync(browserDir, { recursive: true });
      const result = await registerChromeNativeHost(options);
      const files = [
        [join(hostDir, "native-host.cjs"), 0o600],
        [join(hostDir, "native-host.sh"), 0o700],
        [result.manifests[0]!, 0o644],
      ] as const;
      const before = files.map(([path]) => {
        chmodSync(path, 0o777);
        utimesSync(path, 1, 1);
        return readFileSync(path, "utf8");
      });
      chmodSync(hostDir, 0o777);
      await registerChromeNativeHost(options);
      expect(statSync(hostDir).mode & 0o777).toBe(0o700);
      files.forEach(([path, mode], index) => {
        expect(statSync(path).mode & 0o777).toBe(mode);
        expect(statSync(path).mtimeMs).toBe(1000);
        expect(readFileSync(path, "utf8")).toBe(before[index]);
      });
    },
  );

  it("honours XDG_CONFIG_HOME on Linux", async () => {
    const home = tempHome();
    const config = join(home, "xdg");
    mkdirSync(join(config, "chromium"), { recursive: true });
    const result = await registerChromeNativeHost({
      hostDir: chromeNativeHostDir(home),
      homeDir: home,
      platform: "linux",
      env: { XDG_CONFIG_HOME: config },
      runtime: nodeRuntime,
      extensionIds: [ID],
    });
    expect(result.manifests).toEqual([
      join(config, "chromium", "NativeMessagingHosts", `${CHROME_NATIVE_HOST_NAME}.json`),
    ]);
  });

  it("registers per-user HKCU keys on Windows without touching HKLM", async () => {
    const home = tempHome();
    const hostDir = chromeNativeHostDir(home);
    const setRegistryDefault = vi.fn<(key: string, value: string) => Promise<void>>(async () => {});
    const result = await registerChromeNativeHost({
      hostDir,
      homeDir: home,
      platform: "win32",
      env: {},
      runtime: { path: "C:\\Program Files\\Poracode\\Poracode.exe", electron: true },
      extensionIds: [ID],
      setRegistryDefault,
    });
    const manifestPath = join(hostDir, `${CHROME_NATIVE_HOST_NAME}.json`);
    expect(result.manifests).toEqual([manifestPath]);
    expect(setRegistryDefault).toHaveBeenCalledWith(
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${CHROME_NATIVE_HOST_NAME}`,
      manifestPath,
    );
    for (const [key] of setRegistryDefault.mock.calls) {
      expect(key.startsWith("HKCU\\")).toBe(true);
    }
    expect(readFileSync(join(hostDir, "native-host.cmd"), "utf8")).toBe(
      [
        "@echo off",
        "setlocal",
        "set NODE_OPTIONS=",
        "set ELECTRON_RUN_AS_NODE=1",
        '"C:\\Program Files\\Poracode\\Poracode.exe" "%~dp0native-host.cjs" %*',
        "",
      ].join("\r\n"),
    );
  });

  it("escapes % in a Windows runtime path so cmd never expands it", () => {
    const launcher = renderChromeNativeHostLauncher(
      { path: "C:\\Users\\a%USERNAME%b\\Poracode.exe", electron: true },
      "win32",
    );
    expect(launcher).toContain(
      '"C:\\Users\\a%%USERNAME%%b\\Poracode.exe" "%~dp0native-host.cjs" %*',
    );
  });

  it("runs the packaged Electron binary as Node so nothing reaches the foreground", () => {
    expect(
      renderChromeNativeHostLauncher(
        { path: "/Applications/Poracode.app/Contents/MacOS/Poracode", electron: true },
        "darwin",
      ),
    ).toContain(
      `exec env NODE_OPTIONS= ELECTRON_RUN_AS_NODE=1 '/Applications/Poracode.app/Contents/MacOS/Poracode' "$dir/native-host.cjs" "$@"`,
    );
  });

  it.skipIf(process.platform === "win32")(
    "prunes entries of dead runs at registration and keeps live or unreadable ones",
    async () => {
      const home = tempHome();
      const hostDir = chromeNativeHostDir(home);
      mkdirSync(join(hostDir, "bridges"), { recursive: true });
      const live = writeEntry(hostDir, "live", { port: 47820, token: "a", pid: process.pid });
      const newer = writeEntry(hostDir, "newer", {
        version: 2,
        port: 47821,
        token: "b",
        pid: process.pid,
      });
      const dead = writeEntry(hostDir, "dead", { port: 47822, token: "c", pid: DEAD_PID });
      const otherUser = writeEntry(hostDir, "other-user", {
        port: 47823,
        token: "d",
        pid: OTHER_USER_PID,
      });
      const unreadable = join(hostDir, "bridges", "partial.json");
      writeFileSync(unreadable, "{");
      await registerChromeNativeHost({
        hostDir,
        homeDir: home,
        platform: process.platform,
        env: {},
        runtime: nodeRuntime,
        extensionIds: [ID],
      });
      expect(existsSync(live)).toBe(true);
      expect(existsSync(newer)).toBe(true);
      expect(existsSync(unreadable)).toBe(true);
      expect(existsSync(dead)).toBe(false);
      // Root may signal any pid, so there the entry is (correctly) not provably dead.
      expect(existsSync(otherUser)).toBe(runsAsRoot);
    },
  );
});

describe.skipIf(process.platform === "win32")("chrome native host handshake", () => {
  async function installed() {
    const home = tempHome();
    const hostDir = chromeNativeHostDir(home);
    await registerChromeNativeHost({
      hostDir,
      homeDir: home,
      platform: process.platform,
      env: {},
      runtime: nodeRuntime,
      extensionIds: [ID],
    });
    return { hostDir, launcher: join(hostDir, "native-host.sh") };
  }

  it("returns the live bridge tokens to the pinned extension, newest first", async () => {
    const { hostDir, launcher } = await installed();
    const older = writeChromeBridgeEntry(hostDir, "/profile/a", { port: 47820, token: "tok-a" });
    const newest = writeChromeBridgeEntry(hostDir, "/profile/b", { port: 47821, token: "tok-b" });
    const middle = writeChromeBridgeEntry(hostDir, "/profile/c", { port: 47822, token: "tok-c" });
    expect(statSync(older).mode & 0o777).toBe(0o600);
    const now = Date.now() / 1000;
    utimesSync(older, now - 30, now - 30);
    utimesSync(middle, now - 20, now - 20);
    utimesSync(newest, now - 10, now - 10);
    const reply = await callHost(launcher, [ORIGIN, "--parent-window=0"], {
      type: "getBridges",
      version: 1,
    });
    expect(reply).toEqual({
      type: "bridges",
      version: 1,
      bridges: [
        { port: 47821, token: "tok-b" },
        { port: 47822, token: "tok-c" },
        { port: 47820, token: "tok-a" },
      ],
    });
  });

  it("ignores an inherited NODE_OPTIONS from the browser's environment", async () => {
    const { hostDir, launcher } = await installed();
    writeChromeBridgeEntry(hostDir, "/profile/a", { port: 47820, token: "tok-a" });
    const hook = join(hostDir, "hook.cjs");
    writeFileSync(hook, 'process.stdout.write("hijacked"); process.exit(3);\n');
    const reply = await callHost(
      launcher,
      [ORIGIN],
      { type: "getBridges", version: 1 },
      { ...process.env, NODE_OPTIONS: `--require ${hook}` },
    );
    expect(reply).toMatchObject({ bridges: [{ port: 47820, token: "tok-a" }] });
  });

  it("gives nothing to another extension origin, a bad request, or a dead bridge", async () => {
    const { hostDir, launcher } = await installed();
    writeChromeBridgeEntry(hostDir, "/profile/a", { port: 47820, token: "tok-a" });
    const otherOrigin = `chrome-extension://${"a".repeat(32)}/`;
    expect(await callHost(launcher, [otherOrigin], { type: "getBridges", version: 1 })).toEqual({
      type: "bridges",
      version: 1,
      bridges: [],
    });
    expect(await callHost(launcher, [ORIGIN], { type: "getBridges", version: 2 })).toMatchObject({
      bridges: [],
    });
    writeEntry(hostDir, "stale", { port: 47821, token: "stale", pid: DEAD_PID });
    // A pid reused by another OS user after a reboot is not one of our bridges.
    if (!runsAsRoot)
      writeEntry(hostDir, "reused", { port: 47822, token: "reused", pid: OTHER_USER_PID });
    const live = await callHost(launcher, [ORIGIN], { type: "getBridges", version: 1 });
    expect(live).toEqual({
      type: "bridges",
      version: 1,
      bridges: [{ port: 47820, token: "tok-a" }],
    });
  });

  it("removes an entry only while it still holds the owner's token", async () => {
    const { hostDir } = await installed();
    const entry = writeChromeBridgeEntry(hostDir, "/profile/a", { port: 1, token: "new" });
    removeChromeBridgeEntry(entry, "old");
    expect(readFileSync(entry, "utf8")).toContain('"new"');
    removeChromeBridgeEntry(entry, "new");
    expect(existsSync(entry)).toBe(false);
  });
});
