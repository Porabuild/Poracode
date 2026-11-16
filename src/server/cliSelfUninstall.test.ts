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
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { hostRuntimeTarget } from "../../scripts/server-release-install.mjs";
import { tuiBinaryTarget } from "@/shared/tuiManifest";
import { SelfUpdateError } from "./installerPrefix";
import {
  ServerServiceRefusedError,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import {
  installerShimTargetsPrefix,
  launcherTargetsPrefix,
  removeOwnedCommandLinks,
  runSelfUninstall,
  windowsDeferredRemovalCommand,
} from "./cliSelfUninstall";

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

  it("matches a Windows shim or launcher literally, case-insensitively", () => {
    expect(launcherTargetsPrefix("C:\\P\\current\\bin\\PORACODE.CMD", "c:\\p", "win32")).toBe(true);
    expect(
      installerShimTargetsPrefix(
        '@echo off\r\nrem poracode-installer-shim v1\r\n"C:\\P\\current\\bin\\poracode.cmd" %*\r\n',
        "c:\\p",
      ),
    ).toBe(true);
    expect(
      installerShimTargetsPrefix(
        '@echo off\r\n"C:\\P\\current\\bin\\poracode.cmd" %*\r\n',
        "c:\\p",
      ),
    ).toBe(false);
    expect(launcherTargetsPrefix("C:\\P\\current\\bin\\poracode", "c:\\p", "win32")).toBe(false);
    expect(launcherTargetsPrefix("relative\\current\\bin\\poracode.cmd", "c:\\p", "win32")).toBe(
      false,
    );
  });

  it("recognizes the ASCII relative Windows shim for a Unicode home", () => {
    const bin = "C:\\Users\\Jos\u00e9\\AppData\\Local\\Poracode\\bin";
    const prefix = "C:\\Users\\Jos\u00e9\\AppData\\Local\\Poracode\\server";
    const shim =
      '@echo off\r\nrem poracode-installer-shim v1\r\n"%~dp0..\\server\\current\\bin\\poracode.cmd" %*\r\n';
    expect(installerShimTargetsPrefix(shim, prefix, bin)).toBe(true);
    expect(installerShimTargetsPrefix(shim, "C:\\other", bin)).toBe(false);
  });
});

describe.runIf(posix)("runSelfUninstall", () => {
  it("refuses to remove a prefix that contains the shared or explicitly overridden runtime cache", async () => {
    const root = tempDir();
    const prefix = join(root, ".local", "share", "poracode");
    const release = join(prefix, "releases", "1.0.0");
    writeRelease(release, "1.0.0");
    symlinkSync("releases/1.0.0", join(prefix, "current"));
    for (const [env, cache] of [
      [{}, join(prefix, "runtime-cache")],
      [{ PORACODE_RUNTIME_CACHE_DIR: join(prefix, "custom-cache") }, join(prefix, "custom-cache")],
    ] as const) {
      mkdirSync(cache, { recursive: true });
      writeFileSync(join(cache, "in-use"), "other profile");
      await expect(
        runSelfUninstall(
          { yes: true, json: false },
          {
            releaseRoot: release,
            env,
            home: root,
            platform: "linux",
            probeOwner: async () => null,
          },
        ),
      ).rejects.toThrow(/runtime cache .* inside/u);
      expect(existsSync(join(cache, "in-use"))).toBe(true);
      rmSync(cache, { recursive: true });
    }
  });
  it("preserves an unrecognized cache from another process even without its override", async () => {
    const f = fixture();
    const cache = join(f.prefix, "other-process-cache", "version");
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, "in-use"), "another profile");
    await expect(
      runSelfUninstall(
        { yes: true, json: false },
        {
          releaseRoot: join(f.prefix, "releases", "1.0.0"),
          env: {},
          home: f.root,
          probeOwner: async () => null,
        },
      ),
    ).rejects.toThrow(/files not owned/u);
    expect(existsSync(join(cache, "in-use"))).toBe(true);
  });
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

  it("removes a command link whose prefix spelling crosses a symlink", async () => {
    const root = tempDir();
    const real = join(root, "real");
    const alias = join(root, "alias");
    mkdirSync(real, { recursive: true });
    symlinkSync(real, alias, "dir");
    const prefix = join(alias, "prefix");
    writeRelease(join(prefix, "releases", "1.0.0"), "1.0.0");
    symlinkSync("releases/1.0.0", join(prefix, "current"));
    const home = join(root, "home");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const link = join(home, ".local", "bin", "poracode");
    symlinkSync(join(alias, "prefix", "current", "bin", "poracode"), link);
    const result = await runSelfUninstall(
      { yes: true, json: false },
      {
        releaseRoot: join(alias, "prefix", "releases", "1.0.0"),
        probeOwner: async () => null,
        home,
      },
    );
    expect(result.removedCommands).toEqual([link]);
    expect(existsSync(link)).toBe(false);
    expect(existsSync(join(real, "prefix"))).toBe(false);
  });

  it("keeps links to another prefix's alias and to a release directory", () => {
    const root = tempDir();
    const real = join(root, "real");
    const alias = join(root, "alias");
    const otherReal = join(root, "other-real");
    const otherAlias = join(root, "other-alias");
    for (const dir of [real, otherReal]) mkdirSync(dir, { recursive: true });
    symlinkSync(real, alias, "dir");
    symlinkSync(otherReal, otherAlias, "dir");
    mkdirSync(join(otherAlias, "prefix"), { recursive: true });
    const prefix = join(real, "prefix");
    mkdirSync(prefix, { recursive: true });
    const cases: readonly (readonly [string, string])[] = [
      ["foreign-alias", join(otherAlias, "prefix", "current", "bin", "poracode")],
      ["direct-release", join(alias, "prefix", "releases", "1.0.0", "bin", "poracode")],
    ];
    for (const [name, target] of cases) {
      const binDir = join(root, name);
      mkdirSync(binDir);
      const link = join(binDir, "poracode");
      symlinkSync(target, link);
      expect(
        removeOwnedCommandLinks({ prefix, binDir, platform: "linux", home: join(root, "home") }),
      ).toEqual([]);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
    }
  });

  it("matches a junctioned prefix spelling through realpath on either platform", () => {
    const root = tempDir();
    const real = join(root, "real");
    const alias = join(root, "alias");
    mkdirSync(real, { recursive: true });
    symlinkSync(real, alias, "dir");
    const prefix = join(real, "prefix");
    mkdirSync(prefix, { recursive: true });
    expect(
      launcherTargetsPrefix(join(alias, "prefix", "current", "bin", "poracode"), prefix, "linux"),
    ).toBe(true);
    expect(launcherTargetsPrefix(join(prefix, "current", "bin", "poracode"), prefix, "linux")).toBe(
      true,
    );
    expect(
      launcherTargetsPrefix(
        join(alias, "prefix", "releases", "1.0.0", "bin", "poracode"),
        prefix,
        "linux",
      ),
    ).toBe(false);
    expect(
      launcherTargetsPrefix(join(alias, "missing", "current", "bin", "poracode"), prefix, "linux"),
    ).toBe(false);
    const launcher = `${join(alias, "prefix")}\\current\\bin\\poracode.cmd`;
    const shim = `@echo off\r\nrem poracode-installer-shim v1\r\n"${launcher}" %*\r\n`;
    expect(installerShimTargetsPrefix(shim, prefix)).toBe(true);
    expect(installerShimTargetsPrefix(shim.replace("poracode.cmd", "poracode.exe"), prefix)).toBe(
      false,
    );
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

  it("refuses a script, a running owner and an unusable registration", async () => {
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
    ).rejects.toThrow(/Nothing was removed/u);
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

  function installedRegistration(
    profileNamespace: string,
    installPrefix: string,
    state: "prepared" | "installed" | "removing" = "installed",
  ): ServerServiceRegistration {
    return {
      state,
      registrationId: "poracode-0123456789abcdef0123456789abcdef",
      profileNamespace,
      installPrefix,
    } as unknown as ServerServiceRegistration;
  }

  it("removes the registered service before the link and the prefix", async () => {
    const context = fixture();
    const home = join(context.root, "home");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const link = join(home, ".local", "bin", "poracode");
    symlinkSync(join(context.prefix, "current", "bin", "poracode"), link);
    const profile = join(context.root, "profile");
    const registration = installedRegistration(
      resolveHostRootPaths(profile).profileNamespace,
      context.prefix,
    );
    const removals: [string, string][] = [];
    let linkAliveDuringRemoval = false;
    const result = await runSelfUninstall(
      { yes: true, json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        probeOwner: async () => null,
        home,
        profile,
        readRegistration: () => registration,
        removeService: async (profileNamespace, prefix) => {
          removals.push([profileNamespace, prefix]);
          linkAliveDuringRemoval = lstatSync(link).isSymbolicLink();
        },
      },
    );
    expect(removals).toEqual([[registration.profileNamespace, context.prefix]]);
    expect(linkAliveDuringRemoval).toBe(true);
    expect(result.removedService).toBe(registration.registrationId);
    expect(result.removedCommands).toEqual([link]);
    expect(existsSync(link)).toBe(false);
    expect(existsSync(context.prefix)).toBe(false);
  });

  it("keeps the prefix and link when the service refuses to be removed", async () => {
    const context = fixture();
    const home = join(context.root, "home");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const link = join(home, ".local", "bin", "poracode");
    symlinkSync(join(context.prefix, "current", "bin", "poracode"), link);
    const profile = join(context.root, "profile");
    const registration = installedRegistration(
      resolveHostRootPaths(profile).profileNamespace,
      context.prefix,
    );
    await expect(
      runSelfUninstall(
        { yes: true, json: false },
        {
          releaseRoot: join(context.prefix, "releases", "1.0.0"),
          probeOwner: async () => null,
          home,
          profile,
          readRegistration: () => registration,
          removeService: async () => {
            throw new ServerServiceRefusedError("the service manager refused");
          },
        },
      ),
    ).rejects.toThrow(/Could not remove the background service/u);
    expect(existsSync(context.prefix)).toBe(true);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it("refuses unfinished registrations before confirming, naming --recover", async () => {
    for (const state of ["prepared", "removing"] as const) {
      const context = fixture();
      const profile = join(context.root, "profile");
      const registration = installedRegistration(
        resolveHostRootPaths(profile).profileNamespace,
        context.prefix,
        state,
      );
      let confirmCalls = 0;
      let removeCalls = 0;
      await expect(
        runSelfUninstall(
          { yes: false, json: false },
          {
            releaseRoot: join(context.prefix, "releases", "1.0.0"),
            probeOwner: async () => null,
            profile,
            readRegistration: () => registration,
            removeService: async () => {
              removeCalls += 1;
            },
            confirm: async () => {
              confirmCalls += 1;
              return "uninstall";
            },
            interactive: true,
          },
        ),
      ).rejects.toThrow(/--recover/u);
      expect(confirmCalls).toBe(0);
      expect(removeCalls).toBe(0);
      expect(existsSync(context.prefix)).toBe(true);
    }
  });

  it("lets the registered service's own running owner be removed", async () => {
    const context = fixture();
    const profile = join(context.root, "profile");
    const registration = installedRegistration(
      resolveHostRootPaths(profile).profileNamespace,
      context.prefix,
    );
    const probes = [{ pid: 7 }, null];
    const result = await runSelfUninstall(
      { yes: true, json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        probeOwner: async () => probes.shift() ?? null,
        profile,
        readRegistration: () => registration,
        removeService: async () => {},
      },
    );
    expect(result.removedService).toBe(registration.registrationId);
    expect(existsSync(context.prefix)).toBe(false);
  });

  it("refuses a running owner registered for a different profile", async () => {
    const context = fixture();
    const profile = join(context.root, "profile");
    const registration = installedRegistration(
      resolveHostRootPaths(join(context.root, "other-profile")).profileNamespace,
      context.prefix,
    );
    let removeCalls = 0;
    await expect(
      runSelfUninstall(
        { yes: true, json: false },
        {
          releaseRoot: join(context.prefix, "releases", "1.0.0"),
          probeOwner: async () => ({ pid: 7 }),
          profile,
          readRegistration: () => registration,
          removeService: async () => {
            removeCalls += 1;
          },
        },
      ),
    ).rejects.toThrow(/poracode stop/u);
    expect(removeCalls).toBe(0);
    expect(existsSync(context.prefix)).toBe(true);
  });

  it("keeps the prefix when a server still runs after the service is removed", async () => {
    const context = fixture();
    const home = join(context.root, "home");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const link = join(home, ".local", "bin", "poracode");
    symlinkSync(join(context.prefix, "current", "bin", "poracode"), link);
    const profile = join(context.root, "profile");
    const registration = installedRegistration(
      resolveHostRootPaths(profile).profileNamespace,
      context.prefix,
    );
    const probes = [null, null, { pid: 9 }];
    let removeCalls = 0;
    await expect(
      runSelfUninstall(
        { yes: true, json: false },
        {
          releaseRoot: join(context.prefix, "releases", "1.0.0"),
          probeOwner: async () => probes.shift() ?? null,
          home,
          profile,
          readRegistration: () => registration,
          removeService: async () => {
            removeCalls += 1;
          },
        },
      ),
    ).rejects.toThrow(/still runs/u);
    expect(removeCalls).toBe(1);
    expect(existsSync(context.prefix)).toBe(true);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it("mentions the background service in the interactive confirmation", async () => {
    const context = fixture();
    const profile = join(context.root, "profile");
    const registration = installedRegistration(
      resolveHostRootPaths(profile).profileNamespace,
      context.prefix,
    );
    const questions: string[] = [];
    const result = await runSelfUninstall(
      { yes: false, json: false },
      {
        releaseRoot: join(context.prefix, "releases", "1.0.0"),
        probeOwner: async () => null,
        profile,
        readRegistration: () => registration,
        removeService: async () => {},
        confirm: async (question) => {
          questions.push(question);
          return "uninstall";
        },
        interactive: true,
      },
    );
    expect(questions[0]).toContain("its background service");
    expect(result.removedService).toBe(registration.registrationId);
  });
});
