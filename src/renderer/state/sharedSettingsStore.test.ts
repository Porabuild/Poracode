import { beforeEach, describe, expect, it } from "vitest";
import { useSharedSettings } from "./sharedSettingsStore";

describe("sharedSettingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({
      themeMode: "system",
    });
  });

  it("defaults theme to system", () => {
    expect(useSharedSettings.getState().themeMode).toBe("system");
  });

  it("switches theme mode", () => {
    useSharedSettings.getState().setThemeMode("dark");
    expect(useSharedSettings.getState().themeMode).toBe("dark");
  });
});
