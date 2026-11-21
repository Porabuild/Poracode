import { describe, expect, it } from "vitest";
import { configureLinuxDesktopSwitches, isHyprlandOrOmarchySession } from "./linuxDesktopEnv";

function fakeCommandLine(initialSwitches: readonly string[] = []) {
  const existing = new Set(initialSwitches);
  const appended: Array<[string, string | undefined]> = [];
  return {
    appended,
    hasSwitch: (name: string) => existing.has(name),
    appendSwitch: (name: string, value?: string) => {
      appended.push([name, value]);
      existing.add(name);
    },
  };
}

describe("linuxDesktopEnv", () => {
  it("detects Hyprland and Omarchy sessions without matching GNOME or KDE", () => {
    expect(isHyprlandOrOmarchySession({ XDG_CURRENT_DESKTOP: "Hyprland" })).toBe(true);
    expect(isHyprlandOrOmarchySession({ XDG_CURRENT_DESKTOP: "Hyprland:wlroots" })).toBe(true);
    expect(isHyprlandOrOmarchySession({ XDG_SESSION_DESKTOP: "omarchy" })).toBe(true);
    expect(isHyprlandOrOmarchySession({ XDG_CURRENT_DESKTOP: "GNOME" })).toBe(false);
    expect(isHyprlandOrOmarchySession({ XDG_CURRENT_DESKTOP: "KDE" })).toBe(false);
    expect(isHyprlandOrOmarchySession({})).toBe(false);
  });

  it("is a no-op outside Linux", () => {
    const commandLine = fakeCommandLine();
    configureLinuxDesktopSwitches({
      platform: "darwin",
      env: { XDG_CURRENT_DESKTOP: "Hyprland" },
      commandLine,
    });
    expect(commandLine.appended).toEqual([]);
  });

  it("enables GlobalShortcutsPortal, auto Wayland ozone, and gnome-libsecret on Omarchy/Hyprland", () => {
    const commandLine = fakeCommandLine();
    configureLinuxDesktopSwitches({
      platform: "linux",
      env: { XDG_CURRENT_DESKTOP: "Hyprland", WAYLAND_DISPLAY: "wayland-1" },
      commandLine,
    });
    expect(commandLine.appended).toEqual([
      ["enable-features", "GlobalShortcutsPortal"],
      ["ozone-platform-hint", "auto"],
      ["password-store", "gnome-libsecret"],
    ]);
  });

  it("leaves GNOME and KDE password-store autodetection untouched", () => {
    const commandLine = fakeCommandLine();
    configureLinuxDesktopSwitches({
      platform: "linux",
      env: { XDG_CURRENT_DESKTOP: "KDE" },
      commandLine,
    });
    expect(commandLine.appended).toEqual([
      ["enable-features", "GlobalShortcutsPortal"],
      ["ozone-platform-hint", "auto"],
    ]);
  });

  it("preserves explicit ozone and password-store overrides and mock keychain mode", () => {
    const withOverrides = fakeCommandLine(["ozone-platform", "password-store"]);
    configureLinuxDesktopSwitches({
      platform: "linux",
      env: { XDG_CURRENT_DESKTOP: "Hyprland" },
      commandLine: withOverrides,
    });
    expect(withOverrides.appended).toEqual([["enable-features", "GlobalShortcutsPortal"]]);

    const withCliMock = fakeCommandLine(["use-mock-keychain"]);
    configureLinuxDesktopSwitches({
      platform: "linux",
      env: { XDG_CURRENT_DESKTOP: "Hyprland" },
      commandLine: withCliMock,
    });
    expect(withCliMock.appended).toEqual([
      ["enable-features", "GlobalShortcutsPortal"],
      ["ozone-platform-hint", "auto"],
    ]);

    const withEnvAndMock = fakeCommandLine();
    configureLinuxDesktopSwitches({
      platform: "linux",
      env: { XDG_CURRENT_DESKTOP: "Hyprland", ELECTRON_OZONE_PLATFORM_HINT: "x11" },
      useMockKeychain: true,
      commandLine: withEnvAndMock,
    });
    expect(withEnvAndMock.appended).toEqual([["enable-features", "GlobalShortcutsPortal"]]);
  });
});
