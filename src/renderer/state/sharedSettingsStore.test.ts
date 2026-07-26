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
      agentInstances: {},
      hiddenModels: {},
      agentSettings: {},
      lastPresentationModeByAgent: {},
      disabledAgents: [],
      favoriteModels: [],
      recentModels: [],
      providerOrder: [],
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

  it("shows and hides sidebar shortcuts", () => {
    useSharedSettings.setState({ sidebarHiddenShortcuts: ["githubActions"] });

    useSharedSettings.getState().setSidebarShortcutVisible("githubActions", true);
    expect(useSharedSettings.getState().sidebarHiddenShortcuts).toEqual([]);

    useSharedSettings.getState().setSidebarShortcutVisible("schedules", false);
    expect(useSharedSettings.getState().sidebarHiddenShortcuts).toEqual(["schedules"]);
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

  it("preserves the last experiment judge configuration", () => {
    useSharedSettings
      .getState()
      .setExperimentJudgeConfig("claude", "claude-opus-4-8", "high", true);

    expect(useSharedSettings.getState()).toMatchObject({
      experimentJudgeProvider: "claude",
      experimentJudgeModel: "claude-opus-4-8",
      experimentJudgeEffort: "high",
      experimentJudgeFast: true,
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

  describe("toggleFavoriteModelAnyMode", () => {
    it("adds a favorite under the fallback mode when none exists", () => {
      const nowFavorite = useSharedSettings
        .getState()
        .toggleFavoriteModelAnyMode("claude", "sonnet", "gui");

      expect(nowFavorite).toBe(true);
      expect(useSharedSettings.getState().favoriteModels).toEqual([
        { agentKind: "claude", modelId: "sonnet", presentationMode: "gui" },
      ]);
    });

    it("removes the favorite when it already exists", () => {
      useSharedSettings.setState({
        favoriteModels: [{ agentKind: "claude", modelId: "sonnet", presentationMode: "terminal" }],
      });

      const nowFavorite = useSharedSettings
        .getState()
        .toggleFavoriteModelAnyMode("claude", "sonnet", "terminal");

      expect(nowFavorite).toBe(false);
      expect(useSharedSettings.getState().favoriteModels).toEqual([]);
    });

    it("removes every stored mode for the model regardless of the fallback mode", () => {
      useSharedSettings.setState({
        favoriteModels: [
          { agentKind: "claude", modelId: "sonnet", presentationMode: "terminal" },
          { agentKind: "claude", modelId: "sonnet", presentationMode: "gui" },
          { agentKind: "codex", modelId: "gpt-5", presentationMode: "terminal" },
        ],
      });

      const nowFavorite = useSharedSettings
        .getState()
        .toggleFavoriteModelAnyMode("claude", "sonnet", "gui");

      expect(nowFavorite).toBe(false);
      expect(useSharedSettings.getState().favoriteModels).toEqual([
        { agentKind: "codex", modelId: "gpt-5", presentationMode: "terminal" },
      ]);
    });
  });

  it("adds and removes Claude profile instances with their profile-scoped settings", () => {
    useSharedSettings.getState().setAgentInstance({
      id: "work",
      driver: "claude",
      displayName: "Work",
      config: { configDir: "~/.poracode/claude-profiles/work" },
    });
    useSharedSettings.setState({
      providerConfigs: {
        claude: { model: "sonnet" },
        "claude:work": { model: "haiku" },
      },
      hiddenModels: { "claude:work": ["sonnet"] },
      agentSettings: { "claude:work": { noFlicker: true } },
      lastPresentationModeByAgent: { "claude:work": "gui" },
      disabledAgents: ["claude:work"],
      favoriteModels: [{ agentKind: "claude:work", modelId: "haiku", presentationMode: "gui" }],
      recentModels: [{ agentKind: "claude:work", modelId: "sonnet", presentationMode: "gui" }],
      providerOrder: ["claude", "claude:work"],
    });

    expect(useSharedSettings.getState().agentInstances.work?.displayName).toBe("Work");

    useSharedSettings.getState().removeAgentInstance("work");

    const state = useSharedSettings.getState();
    expect(state.agentInstances.work).toBeUndefined();
    expect(state.providerConfigs.claude).toEqual({ model: "sonnet" });
    expect(state.providerConfigs["claude:work"]).toBeUndefined();
    expect(state.hiddenModels["claude:work"]).toBeUndefined();
    expect(state.agentSettings["claude:work"]).toBeUndefined();
    expect(state.lastPresentationModeByAgent["claude:work"]).toBeUndefined();
    expect(state.disabledAgents).not.toContain("claude:work");
    expect(state.favoriteModels).toEqual([]);
    expect(state.recentModels).toEqual([]);
    expect(state.providerOrder).toEqual(["claude"]);
  });
});
