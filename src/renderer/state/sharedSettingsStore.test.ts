import { beforeEach, describe, expect, it } from "vitest";
import { readEnvironmentMode, useSharedSettings } from "./sharedSettingsStore";

describe("sharedSettingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({
      environmentMode: "windows",
      themeMode: "system",
    });
  });

  it("defaults to windows mode", () => {
    expect(useSharedSettings.getState().environmentMode).toBe("windows");
  });

  it("switches environment mode", () => {
    useSharedSettings.getState().setEnvironmentMode("wsl");
    expect(useSharedSettings.getState().environmentMode).toBe("wsl");
  });

  it("defaults theme to system", () => {
    expect(useSharedSettings.getState().themeMode).toBe("system");
  });

  it("reads environment mode from localStorage", () => {
    localStorage.setItem(
      "lightcode-shared-settings",
      JSON.stringify({ state: { environmentMode: "wsl", themeMode: "dark" }, version: 1 }),
    );
    expect(readEnvironmentMode()).toBe("wsl");
  });

  it("returns windows when localStorage is empty", () => {
    expect(readEnvironmentMode()).toBe("windows");
  });
});
