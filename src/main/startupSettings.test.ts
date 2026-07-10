import type { App } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  isWindowsStartupLaunch,
  shouldStartMinimized,
  syncWindowsStartupRegistration,
  WINDOWS_STARTUP_ARGUMENT,
} from "./startupSettings";

describe("Windows startup settings", () => {
  it("recognizes only Windows login launches", () => {
    expect(isWindowsStartupLaunch(["Poracode.exe", WINDOWS_STARTUP_ARGUMENT], "win32")).toBe(true);
    expect(isWindowsStartupLaunch(["Poracode.exe"], "win32")).toBe(false);
    expect(isWindowsStartupLaunch(["Poracode", WINDOWS_STARTUP_ARGUMENT], "darwin")).toBe(false);
  });

  it("starts hidden only for enabled automatic login launches", () => {
    const argv = ["Poracode.exe", WINDOWS_STARTUP_ARGUMENT];
    expect(
      shouldStartMinimized({ launchAtStartup: true, startMinimized: true }, argv, "win32"),
    ).toBe(true);
    expect(
      shouldStartMinimized({ launchAtStartup: true, startMinimized: false }, argv, "win32"),
    ).toBe(false);
    expect(
      shouldStartMinimized(
        { launchAtStartup: true, startMinimized: true },
        ["Poracode.exe"],
        "win32",
      ),
    ).toBe(false);
  });

  it("registers and unregisters the packaged Windows app with the startup argument", () => {
    const setLoginItemSettings = vi.fn<App["setLoginItemSettings"]>();
    const electronApp = { setLoginItemSettings };

    syncWindowsStartupRegistration(
      electronApp,
      { launchAtStartup: true, startMinimized: true },
      "win32",
      false,
    );
    syncWindowsStartupRegistration(
      electronApp,
      { launchAtStartup: false, startMinimized: true },
      "win32",
      false,
    );

    expect(setLoginItemSettings).toHaveBeenNthCalledWith(1, {
      openAtLogin: true,
      args: [WINDOWS_STARTUP_ARGUMENT],
    });
    expect(setLoginItemSettings).toHaveBeenNthCalledWith(2, {
      openAtLogin: false,
      args: [WINDOWS_STARTUP_ARGUMENT],
    });
  });

  it("does not modify login items outside packaged Windows builds", () => {
    const setLoginItemSettings = vi.fn<App["setLoginItemSettings"]>();
    const electronApp = { setLoginItemSettings };

    syncWindowsStartupRegistration(
      electronApp,
      { launchAtStartup: true, startMinimized: true },
      "linux",
      false,
    );
    syncWindowsStartupRegistration(
      electronApp,
      { launchAtStartup: true, startMinimized: true },
      "win32",
      true,
    );

    expect(setLoginItemSettings).not.toHaveBeenCalled();
  });
});
