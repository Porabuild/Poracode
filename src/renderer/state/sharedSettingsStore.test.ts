import { beforeEach, describe, expect, it } from "vitest";
import { useSharedSettings } from "./sharedSettingsStore";

describe("sharedSettingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({
      themeMode: "dark",
      staleThreadUnloadMinutes: 20,
      audio: {
        showVoiceInputButton: true,
        microphoneDeviceId: "",
        transcriptionLanguage: "en",
        transcriptionModel: "tiny",
        useWebGpu: true,
      },
      providerConfigs: {},
      lastUsedProjectDirs: {},
    });
  });

  it("defaults theme to dark", () => {
    expect(useSharedSettings.getState().themeMode).toBe("dark");
  });

  it("switches theme mode", () => {
    useSharedSettings.getState().setThemeMode("light");
    expect(useSharedSettings.getState().themeMode).toBe("light");
  });

  it("updates the stale thread unload timing", () => {
    useSharedSettings.getState().setStaleThreadUnloadMinutes(30);
    expect(useSharedSettings.getState().staleThreadUnloadMinutes).toBe(30);
  });

  it("updates audio settings", () => {
    useSharedSettings.getState().setAudioSetting("transcriptionLanguage", "es");
    expect(useSharedSettings.getState().audio.transcriptionLanguage).toBe("es");
  });

  it("updates provider config when only context size, fast, and thinking change", () => {
    useSharedSettings.getState().setProviderConfig("claude", {
      model: "claude-opus-4-7",
      effort: "high",
      contextSize: "1m",
      mode: "agent",
      approvalPolicy: "auto",
    });

    useSharedSettings.getState().setProviderConfig("claude", {
      model: "claude-opus-4-7",
      effort: "high",
      contextSize: "200k",
      fast: true,
      thinking: true,
      mode: "agent",
      approvalPolicy: "auto",
    });

    expect(useSharedSettings.getState().providerConfigs.claude).toMatchObject({
      contextSize: "200k",
      fast: true,
      thinking: true,
    });
  });

  it("records the last-used project directory per runtime key", () => {
    useSharedSettings.getState().setLastUsedProjectDir("native", "/Users/me/code");
    useSharedSettings.getState().setLastUsedProjectDir("Ubuntu", "\\\\wsl.localhost\\Ubuntu\\home");

    expect(useSharedSettings.getState().lastUsedProjectDirs).toEqual({
      native: "/Users/me/code",
      Ubuntu: "\\\\wsl.localhost\\Ubuntu\\home",
    });
  });

  it("overwrites the directory for an existing runtime key", () => {
    useSharedSettings.getState().setLastUsedProjectDir("native", "/Users/me/a");
    useSharedSettings.getState().setLastUsedProjectDir("native", "/Users/me/b");

    expect(useSharedSettings.getState().lastUsedProjectDirs.native).toBe("/Users/me/b");
  });
});
