import { beforeEach, describe, expect, it } from "vitest";
import { useSharedSettings } from "./sharedSettingsStore";

describe("sharedSettingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({
      themeMode: "system",
      staleThreadUnloadMinutes: 20,
    });
  });

  it("defaults theme to system", () => {
    expect(useSharedSettings.getState().themeMode).toBe("system");
  });

  it("switches theme mode", () => {
    useSharedSettings.getState().setThemeMode("dark");
    expect(useSharedSettings.getState().themeMode).toBe("dark");
  });

  it("updates the stale thread unload timing", () => {
    useSharedSettings.getState().setStaleThreadUnloadMinutes(30);
    expect(useSharedSettings.getState().staleThreadUnloadMinutes).toBe(30);
  });
});
