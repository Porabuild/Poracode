import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { win32 } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WINDOWS_SHELL_AUTO } from "@/shared/settings";
import {
  createWindowsPowerShellLaunchResolver,
  detectPowerShell,
  detectWindowsShells,
  inferPwshVersion,
  inferWindowsShellKind,
  isWindowsAppExecutionAlias,
  parseAppxInstallLocations,
  parsePwshVersion,
  parseWindowsShellArguments,
  selectWindowsShell,
  setWindowsPowerShellPreferenceResolver,
  windowsPwshWellKnownPaths,
} from "./shellPreference";

describe("Windows shell preference", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  const storeAlias = "C:\\Users\\a\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe";
  const msixImage =
    "C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.1.0_x64__8wekyb3d8bbwe\\pwsh.exe";
  const msiImage = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
  const scoopImage = "C:\\Users\\a\\scoop\\apps\\pwsh\\current\\pwsh.exe";

  it("selects the PATH PowerShell without spawning discovery or probing its version", () => {
    vi.stubEnv("Path", 'C:\\first;"C:\\preferred"');
    const preferred = "C:\\preferred\\pwsh.exe";
    const resolveExecutable = vi.fn<(name: string) => string | undefined>(() => {
      throw new Error("Launch selection must not spawn where.exe");
    });
    const resolve = createWindowsPowerShellLaunchResolver(
      resolveExecutable,
      (path) => path === "C:\\first\\pwsh.exe" || path === preferred,
    );

    expect(resolve(WINDOWS_SHELL_AUTO)).toEqual({ path: preferred, kind: "pwsh" });
    expect(resolveExecutable).not.toHaveBeenCalled();
  });

  it("uses a known install instead of a Store alias without enumerating the catalog", () => {
    vi.stubEnv("Path", win32.dirname(storeAlias));
    vi.stubEnv("ProgramFiles", "C:\\Program Files");
    const resolveExecutable = vi.fn<(name: string) => string | undefined>(() => {
      throw new Error("A known PowerShell does not need executable discovery");
    });
    const resolve = createWindowsPowerShellLaunchResolver(
      resolveExecutable,
      (path) => path === storeAlias || path === msiImage,
    );

    expect(resolve(WINDOWS_SHELL_AUTO)).toEqual({ path: msiImage, kind: "pwsh" });
    expect(resolveExecutable).not.toHaveBeenCalled();
  });

  it("keeps the launch selection after the Settings catalog's 60-second expiry", () => {
    vi.useFakeTimers();
    vi.stubEnv("Path", "C:\\original;C:\\new");
    const original = "C:\\original\\pwsh.exe";
    const newer = "C:\\new\\pwsh.exe";
    const existing = new Set([original]);
    const resolveExecutable = vi.fn<() => string | undefined>();
    const resolve = createWindowsPowerShellLaunchResolver(resolveExecutable, (path) =>
      existing.has(path),
    );

    expect(resolve(WINDOWS_SHELL_AUTO)?.path).toBe(original);
    existing.add(newer);
    vi.advanceTimersByTime(120_000);
    expect(resolve(WINDOWS_SHELL_AUTO)?.path).toBe(original);
    existing.delete(original);
    expect(resolve(WINDOWS_SHELL_AUTO)?.path).toBe(newer);
    expect(resolveExecutable).not.toHaveBeenCalled();
  });

  it("honors setting changes immediately and recovers from a missing configured executable", () => {
    vi.stubEnv("Path", "C:\\automatic");
    const automatic = "C:\\automatic\\pwsh.exe";
    const explicit = "C:\\selected\\pwsh.exe";
    const legacy = "C:\\selected\\powershell.exe";
    const existing = new Set([automatic, explicit, legacy]);
    const resolve = createWindowsPowerShellLaunchResolver(
      () => undefined,
      (path) => existing.has(path),
    );

    expect(resolve(WINDOWS_SHELL_AUTO)?.path).toBe(automatic);
    expect(resolve(explicit)).toEqual({ path: explicit, kind: "pwsh" });
    expect(resolve(legacy)).toEqual({ path: legacy, kind: "powershell" });
    existing.delete(legacy);
    expect(resolve(legacy)?.path).toBe(automatic);
    expect(resolve(WINDOWS_SHELL_AUTO)?.path).toBe(automatic);
  });

  it("retains executable-resolution fallback for installations outside the inherited PATH", () => {
    vi.stubEnv("Path", "");
    const custom = "C:\\custom\\pwsh.exe";
    const resolveExecutable = vi.fn<(name: string) => string | undefined>(() => custom);
    const resolve = createWindowsPowerShellLaunchResolver(
      resolveExecutable,
      (path) => path === custom,
    );

    expect(resolve(WINDOWS_SHELL_AUTO)).toEqual({ path: custom, kind: "pwsh" });
    expect(resolveExecutable).toHaveBeenCalledExactlyOnceWith("pwsh.exe");
  });

  it("detects MSIX package images in automatic preference order", async () => {
    const shells = await detectWindowsShells(
      (name) => {
        if (name === "pwsh.exe") return msixImage;
        if (name === "powershell.exe") {
          return "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
        }
        if (name === "cmd.exe") return "C:\\Windows\\System32\\cmd.exe";
        return undefined;
      },
      () => false,
    );

    expect(shells.map((shell) => shell.kind)).toEqual(["pwsh", "powershell", "cmd"]);
    expect(shells[0]?.path).toBe(msixImage);
  });

  it("replaces a Windows Store execution alias with a launchable MSI or MSIX image", async () => {
    const fromMsi = await detectWindowsShells(
      (name) => (name === "pwsh.exe" ? storeAlias : undefined),
      (path) => path === msiImage,
      { extraPwshPaths: [msiImage, storeAlias], resolvePwshVersion: () => undefined },
    );
    expect(fromMsi[0]).toEqual({ kind: "pwsh", path: msiImage, version: "7" });

    const fromMsix = await detectWindowsShells(
      (name) => (name === "pwsh.exe" ? storeAlias : undefined),
      (path) => path === msixImage,
      { extraPwshPaths: [msixImage] },
    );
    expect(fromMsix[0]).toEqual({ kind: "pwsh", path: msixImage, version: "7.6.1" });
  });

  it("finds installer-layout pwsh when PATH has no hit", async () => {
    const shells = await detectWindowsShells(
      () => undefined,
      (path) => path === scoopImage,
      {
        extraPwshPaths: [scoopImage],
      },
    );
    expect(shells[0]).toEqual({ kind: "pwsh", path: scoopImage });
  });

  it("lists every launchable pwsh location so side-by-side versions can be chosen", async () => {
    const v71 = "C:\\Program Files\\PowerShell\\7.1\\pwsh.exe";
    const v72 = "C:\\Program Files\\PowerShell\\7.2\\pwsh.exe";
    const shells = await detectWindowsShells(
      (name) => (name === "pwsh.exe" ? v72 : undefined),
      (path) => path === v71 || path === v72,
      { extraPwshPaths: [v71, v72] },
    );
    expect(shells.filter((shell) => shell.kind === "pwsh")).toEqual([
      { kind: "pwsh", path: v72, version: "7.2" },
      { kind: "pwsh", path: v71, version: "7.1" },
    ]);
  });

  it("probes the product version when the install folder only identifies PowerShell 7", async () => {
    const resolvePwshVersion = vi.fn<(path: string) => string>(() => "7.6.5");
    const shells = await detectWindowsShells(
      (name) => (name === "pwsh.exe" ? msiImage : undefined),
      (path) => path === msiImage,
      { extraPwshPaths: [msiImage], resolvePwshVersion },
    );

    expect(shells[0]).toEqual({ kind: "pwsh", path: msiImage, version: "7.6.5" });
    expect(resolvePwshVersion).toHaveBeenCalledWith(msiImage);
  });

  it("probes Preview MSIX images instead of presenting their package version as stable", async () => {
    const previewImage =
      "C:\\Program Files\\WindowsApps\\Microsoft.PowerShellPreview_7.6.0.0_x64__8wekyb3d8bbwe\\pwsh.exe";
    const resolvePwshVersion = vi.fn<(path: string) => string>(() => "7.6.0-preview.3");
    const shells = await detectWindowsShells(
      (name) => (name === "pwsh.exe" ? previewImage : undefined),
      (path) => path === previewImage,
      { extraPwshPaths: [previewImage], resolvePwshVersion },
    );

    expect(shells[0]).toEqual({
      kind: "pwsh",
      path: previewImage,
      version: "7.6.0-preview.3",
    });
    expect(resolvePwshVersion).toHaveBeenCalledWith(previewImage);
  });

  it("parses stable and preview PowerShell version output", () => {
    expect(parsePwshVersion("7.6.5\r\n")).toBe("7.6.5");
    expect(parsePwshVersion("warning\n7.7.0-preview.3\n")).toBe("7.7.0-preview.3");
    expect(parsePwshVersion("warning only")).toBeUndefined();
  });

  it("uses the shared configured PowerShell resolver for internal command builders", () => {
    const configured = { kind: "pwsh" as const, path: "C:\\PowerShell\\7.1\\pwsh.exe" };
    const dispose = setWindowsPowerShellPreferenceResolver(() => configured);
    try {
      expect(detectPowerShell(() => "C:\\PowerShell\\7.2\\pwsh.exe")).toEqual(configured);
    } finally {
      dispose();
    }

    expect(detectPowerShell(() => "C:\\PowerShell\\7.2\\pwsh.exe")).toEqual({
      kind: "pwsh",
      path: "C:\\PowerShell\\7.2\\pwsh.exe",
      version: "7.2",
    });
  });

  it("keeps the Store alias only when no launchable pwsh image exists", async () => {
    const shells = await detectWindowsShells(
      (name) => (name === "pwsh.exe" ? storeAlias : undefined),
      () => false,
      { extraPwshPaths: [] },
    );
    expect(shells[0]).toEqual({ kind: "pwsh", path: storeAlias });
  });

  it("lists MSI, preview, Scoop, Chocolatey, and WinGet well-known layouts", () => {
    const previous = {
      ProgramW6432: process.env.ProgramW6432,
      ProgramFiles: process.env.ProgramFiles,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      ChocolateyInstall: process.env.ChocolateyInstall,
    };
    process.env.ProgramW6432 = "C:\\Program Files";
    process.env.ProgramFiles = "C:\\Program Files";
    process.env.LOCALAPPDATA = "C:\\Users\\a\\AppData\\Local";
    process.env.ChocolateyInstall = "C:\\ProgramData\\chocolatey";
    try {
      expect(windowsPwshWellKnownPaths()).toEqual(
        expect.arrayContaining([
          "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
          "C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe",
          win32.join(homedir(), "scoop", "apps", "pwsh", "current", "pwsh.exe"),
          "C:\\ProgramData\\chocolatey\\bin\\pwsh.exe",
          "C:\\Users\\a\\AppData\\Local\\Microsoft\\WinGet\\Links\\pwsh.exe",
        ]),
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("parses Get-AppxPackage install locations and ignores alias stubs", () => {
    expect(
      parseAppxInstallLocations(
        `${msixImage.replace(/\\pwsh\.exe$/u, "")}\r\nC:\\Program Files\\WindowsApps\\Microsoft.PowerShellPreview_7.6.0.0_x64__8wekyb3d8bbwe\r\n`,
      ),
    ).toEqual([
      "C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.1.0_x64__8wekyb3d8bbwe",
      "C:\\Program Files\\WindowsApps\\Microsoft.PowerShellPreview_7.6.0.0_x64__8wekyb3d8bbwe",
    ]);
    expect(isWindowsAppExecutionAlias(storeAlias)).toBe(true);
    expect(isWindowsAppExecutionAlias(msixImage)).toBe(false);
    expect(isWindowsAppExecutionAlias(msiImage)).toBe(false);
  });

  it("falls back from a stale override without applying that override's arguments", () => {
    expect(
      selectWindowsShell(
        {
          windowsShellPath: "C:\\removed\\pwsh.exe",
          windowsShellArguments: '-NoProfile -File "C:\\profile scripts\\init.ps1"',
        },
        [
          { kind: "powershell", path: "C:\\Windows\\powershell.exe" },
          { kind: "cmd", path: "C:\\Windows\\cmd.exe" },
        ],
      ),
    ).toEqual({
      shell: "C:\\Windows\\powershell.exe",
      kind: "powershell",
      args: ["-NoLogo"],
    });
  });

  it("honors an explicit detected shell and falls back to cmd when none are detected", () => {
    const cmd = { kind: "cmd" as const, path: "C:\\Windows\\System32\\cmd.exe" };
    expect(
      selectWindowsShell(
        { windowsShellPath: cmd.path, windowsShellArguments: '/q /k "echo ready"' },
        [{ kind: "pwsh", path: "C:\\PowerShell\\pwsh.exe" }, cmd],
      ),
    ).toEqual({
      shell: cmd.path,
      kind: "cmd",
      args: ["/q", "/k", "echo ready"],
    });

    expect(
      selectWindowsShell({ windowsShellPath: WINDOWS_SHELL_AUTO, windowsShellArguments: "/q" }, []),
    ).toMatchObject({ kind: "cmd", args: ["/q"] });
  });

  it("parses quoted and escaped arguments without invoking a shell", () => {
    expect(
      parseWindowsShellArguments(`-NoProfile "two words" 'three words' "say \\"hi\\""`),
    ).toEqual(["-NoProfile", "two words", "three words", 'say "hi"']);
    expect(parseWindowsShellArguments("")).toEqual([]);
    expect(parseWindowsShellArguments("   \t  ")).toEqual([]);
    expect(parseWindowsShellArguments(`-Flag\t"unclosed`)).toEqual(["-Flag", "unclosed"]);
    expect(parseWindowsShellArguments(`""`)).toEqual([""]);
  });

  it("infers pwsh versions from install folders and MSIX package names", () => {
    expect(inferPwshVersion(msiImage)).toBe("7");
    expect(inferPwshVersion("C:\\Program Files\\PowerShell\\7.2\\pwsh.exe")).toBe("7.2");
    expect(inferPwshVersion(msixImage)).toBe("7.6.1");
    expect(inferPwshVersion(scoopImage)).toBeUndefined();
    expect(inferPwshVersion("C:\\Users\\a\\scoop\\apps\\pwsh\\7.4.6\\pwsh.exe")).toBe("7.4.6");
  });

  it("infers shell kind from the executable basename", () => {
    expect(inferWindowsShellKind("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("pwsh");
    expect(
      inferWindowsShellKind("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
    ).toBe("powershell");
    expect(inferWindowsShellKind("C:\\Windows\\System32\\cmd.exe")).toBe("cmd");
  });
});

describe.skipIf(process.platform !== "win32")("installed Windows pwsh 7", () => {
  it("discovers MSI, Store/MSIX, or installer pwsh without returning the execution alias", async () => {
    const wellKnown = windowsPwshWellKnownPaths().find((path) => existsSync(path));
    const pwsh = (await detectWindowsShells(() => undefined)).find(
      (shell) => shell.kind === "pwsh",
    );
    expect(wellKnown ? pwsh?.path.toLowerCase() : wellKnown).toBe(wellKnown?.toLowerCase());
    expect(pwsh ? isWindowsAppExecutionAlias(pwsh.path) : false).toBe(false);
    expect(pwsh ? existsSync(pwsh.path) : true).toBe(true);
    expect(pwsh?.version ?? "7.0").toMatch(/^7\.\d+/u);
  });
});
