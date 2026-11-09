import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hostRuntimeTarget } from "../../scripts/server-release-install.mjs";
import { tuiBinaryTarget } from "@/shared/tuiManifest";
import { SelfUpdateError } from "./installerPrefix";
import { runSelfUninstall, windowsDeferredRemovalCommand } from "./cliSelfUninstall";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const posix = process.platform !== "win32";

function tempDir(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-self-update-")));
  roots.push(root);
  return root;
}

function writeRelease(directory: string, version: string, target = hostRuntimeTarget()): void {
  mkdirSync(join(directory, "runtime"), { recursive: true });
  mkdirSync(join(directory, "lib"), { recursive: true });
  writeFileSync(join(directory, "runtime", "node"), "");
  writeFileSync(join(directory, "lib", "server.cjs"), "\n");
  writeFileSync(
    join(directory, "standalone.json"),
    JSON.stringify({
      formatVersion: 1,
      kind: "poracode-standalone-runtime",
      version,
      target,
      node: { version: "26.13.0", executable: "runtime/node" },
    }),
  );
}

/** An installer-managed prefix at 1.0.0. */
function fixture() {
  const root = tempDir();
  const prefix = join(root, "prefix");
  writeRelease(join(prefix, "releases", "1.0.0"), "1.0.0");
  symlinkSync("releases/1.0.0", join(prefix, "current"));
  return { root, prefix };
}

describe("uninstall helpers", () => {
  it("retries the Windows prefix removal without a console-only delay", () => {
    const command = windowsDeferredRemovalCommand(
      "C:\\Users\\a b\\AppData\\Local\\Poracode\\server",
    );
    expect(command.file).toBe("cmd.exe");
    expect(command.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(command.args[3]).toBe(
      '"for /l %n in (1,1,30) do (rmdir /s /q "C:\\Users\\a b\\AppData\\Local\\Poracode\\server" 2>nul & ' +
        'if not exist "C:\\Users\\a b\\AppData\\Local\\Poracode\\server" exit /b 0 & ping -n 2 127.0.0.1 >nul)"',
    );
    expect(command.args[3]).not.toMatch(/timeout/u);
    expect(() => windowsDeferredRemovalCommand('C:\\x"&calc')).toThrow(SelfUpdateError);
  });
});

describe.runIf(posix)("runSelfUninstall", () => {
  it("removes the owned command link and the prefix, keeping foreign commands", async () => {
    const context = fixture();
    const home = join(context.root, "home");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const link = join(home, ".local", "bin", "poracode");
    symlinkSync(join(context.prefix, "current", "bin", "poracode"), link);
    const result = await runSelfUninstall(
      { yes: true, json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        probeOwner: async () => null,
        home,
      },
    );
    expect(result.removedCommands).toEqual([link]);
    expect(existsSync(context.prefix)).toBe(false);

    const other = fixture();
    const otherHome = join(other.root, "home");
    mkdirSync(join(otherHome, ".local", "bin"), { recursive: true });
    symlinkSync(
      "/Applications/Poracode.app/desktop-cli/poracode",
      join(otherHome, ".local", "bin", "poracode"),
    );
    const kept = await runSelfUninstall(
      { yes: true, json: false },
      {
        releaseRoot: join(other.prefix, "releases", "1.0.0"),
        probeOwner: async () => null,
        home: otherHome,
      },
    );
    expect(kept.removedCommands).toEqual([]);
    expect(lstatSync(join(otherHome, ".local", "bin", "poracode")).isSymbolicLink()).toBe(true);
  });

  it("finds the command in PORACODE_BIN_DIR like the installers", async () => {
    const context = fixture();
    const binDir = join(context.root, "custom-bin");
    mkdirSync(binDir);
    symlinkSync(join(context.prefix, "current", "bin", "poracode"), join(binDir, "poracode"));
    const result = await runSelfUninstall(
      { yes: true, json: true },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        probeOwner: async () => null,
        env: { PORACODE_BIN_DIR: binDir },
        home: join(context.root, "home"),
      },
    );
    expect(result.removedCommands).toEqual([join(binDir, "poracode")]);
  });

  it("removes the TUI cache of the installed versions and keeps unrelated ones", async () => {
    const context = fixture();
    const cacheRoot = join(context.root, "tui-cache");
    const target = tuiBinaryTarget(process.platform, process.arch)!;
    const installed = join(cacheRoot, "1.0.0", target);
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(installed, "poracode-tui"), "bytes");
    const unrelated = join(cacheRoot, "9.9.9", target);
    mkdirSync(unrelated, { recursive: true });
    const result = await runSelfUninstall(
      { yes: true, json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        probeOwner: async () => null,
        env: { PORACODE_TUI_CACHE_DIR: cacheRoot },
        home: join(context.root, "home"),
      },
    );
    expect(result.removedCaches).toEqual([join(cacheRoot, "1.0.0")]);
    expect(existsSync(join(cacheRoot, "1.0.0"))).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
  });

  it("never removes outside the TUI cache root for a malformed marker version", async () => {
    const context = fixture();
    writeRelease(join(context.prefix, "releases", "evil"), "../outside");
    const cacheRoot = join(context.root, "tui-cache");
    const outside = join(context.root, "outside");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "keep.txt"), "x");
    const result = await runSelfUninstall(
      { yes: true, json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        probeOwner: async () => null,
        env: { PORACODE_TUI_CACHE_DIR: cacheRoot },
        home: join(context.root, "home"),
      },
    );
    expect(existsSync(join(outside, "keep.txt"))).toBe(true);
    expect(result.removedCaches).toEqual([]);
  });

  it("refuses a managed service, a running owner and an unconfirmed script", async () => {
    const context = fixture();
    const releaseRoot = join(context.prefix, "releases", "1.0.0");
    await expect(
      runSelfUninstall(
        { yes: false, json: false },
        { releaseRoot, probeOwner: async () => null, interactive: false },
      ),
    ).rejects.toThrow(/--yes/u);
    await expect(
      runSelfUninstall(
        { yes: true, json: false },
        { releaseRoot, probeOwner: async () => ({ pid: 1 }) },
      ),
    ).rejects.toThrow(/poracode stop/u);
    writeFileSync(join(context.prefix, "service-registration.json"), "{}");
    await expect(
      runSelfUninstall({ yes: true, json: false }, { releaseRoot, probeOwner: async () => null }),
    ).rejects.toThrow(/service uninstall/u);
    expect(existsSync(context.prefix)).toBe(true);
  });

  it("re-checks the service and owner after the interactive confirmation", async () => {
    const context = fixture();
    const home = join(context.root, "home");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const link = join(home, ".local", "bin", "poracode");
    symlinkSync(join(context.prefix, "current", "bin", "poracode"), link);
    const probes = [null, { pid: 1 }];
    await expect(
      runSelfUninstall(
        { yes: false, json: false },
        {
          releaseRoot: join(context.prefix, "releases", "1.0.0"),
          probeOwner: async () => probes.shift() ?? null,
          confirm: async () => "uninstall",
          interactive: true,
          home,
        },
      ),
    ).rejects.toThrow(/poracode stop/u);
    expect(existsSync(context.prefix)).toBe(true);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });
});
