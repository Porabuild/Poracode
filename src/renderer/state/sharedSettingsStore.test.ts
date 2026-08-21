import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { useSharedSettings, waitForPendingSharedSettings } from "./sharedSettingsStore";

const originalPoracodeBridge = window.poracode;

describe("sharedSettingsStore", () => {
  afterEach(() => {
    if (originalPoracodeBridge) window.poracode = originalPoracodeBridge;
    else Reflect.deleteProperty(window, "poracode");
  });

  beforeEach(() => {
    localStorage.clear();
    seedBuiltInPlugins();
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
      providerModelPreferences: {},
      agentInstances: {},
      hiddenModels: {},
      agentSettings: {},
      lastPresentationModeByAgent: {},
      disabledAgents: [],
      favoriteModels: [],
      recentModels: [],
      agentSelectionUsage: [],
      crossagentSelectionUsage: [],
      crossagentRoutingOverrides: [],
      providerOrder: [],
      sidebarShortcutOrder: ["pullRequests", "githubActions", "schedules"],
      lastUsedProjectDirs: {},
      enabledMcpServers: {},
      installedPlugins: {},
    });
  });

  it("defaults theme to dark", () => {
    expect(useSharedSettings.getState().themeMode).toBe("dark");
  });

  it("switches theme mode", () => {
    useSharedSettings.getState().setThemeMode("light");
    expect(useSharedSettings.getState().themeMode).toBe("light");
  });

  it("updates the Windows shell path and arguments", () => {
    useSharedSettings.getState().setWindowsShellPath("C:\\Tools\\pwsh.exe");
    useSharedSettings.getState().setWindowsInternalShellPath("C:\\Tools\\pwsh-preview.exe");
    useSharedSettings.getState().setWindowsShellArguments("-NoProfile");

    expect(useSharedSettings.getState()).toMatchObject({
      windowsShellPath: "C:\\Tools\\pwsh.exe",
      windowsInternalShellPath: "C:\\Tools\\pwsh-preview.exe",
      windowsShellArguments: "-NoProfile",
    });
  });

  it("clamps Windows shell arguments to the shared settings maximum", () => {
    useSharedSettings.getState().setWindowsShellArguments("x".repeat(8_193));
    expect(useSharedSettings.getState().windowsShellArguments).toHaveLength(8_192);
  });

  it("exposes pending settings persistence as a launch barrier", async () => {
    let finishWrite!: () => void;
    const setSharedSettings = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    window.poracode = { setSharedSettings } as unknown as typeof window.poracode;

    useSharedSettings.getState().setThemeMode("dark");
    let barrierFinished = false;
    const barrier = waitForPendingSharedSettings().then(() => {
      barrierFinished = true;
    });
    await Promise.resolve();

    expect(setSharedSettings).toHaveBeenCalledOnce();
    expect(barrierFinished).toBe(false);
    finishWrite();
    await barrier;
    expect(barrierFinished).toBe(true);
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

  it("reorders sidebar shortcuts and keeps every supported shortcut", () => {
    useSharedSettings.getState().setSidebarShortcutOrder(["schedules", "pullRequests"]);

    expect(useSharedSettings.getState().sidebarShortcutOrder).toEqual([
      "schedules",
      "pullRequests",
      "githubActions",
    ]);
  });

  it("updates audio settings", () => {
    useSharedSettings.getState().setAudioSetting("transcriptionLanguage", "es");
    expect(useSharedSettings.getState().audio.transcriptionLanguage).toBe("es");
  });

  it("counts repeated normal composer selections for Crossagents fallback ranking", () => {
    const state = useSharedSettings.getState();
    state.pushRecentModel("kimi", "k3", "gui", "max", false);
    state.pushRecentModel("kimi", "k3", "gui", "max", false);

    expect(useSharedSettings.getState().agentSelectionUsage).toEqual([
      expect.objectContaining({
        agentKind: "kimi",
        modelId: "k3",
        effort: "max",
        fast: false,
        count: 2,
      }),
    ]);
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

  it("keeps effort and Fast preferences independent for subprovider model ids", () => {
    const state = useSharedSettings.getState();
    state.setProviderModelPreference("opencode", "openai/gpt-5.6-sol", {
      effort: "high",
      fast: false,
    });
    state.setProviderModelPreference("opencode", "openai/gpt-5.6-luna", {
      effort: "max",
      fast: true,
    });
    state.setProviderModelPreference("opencode", "github-copilot/gpt-5.6-luna", {
      effort: "medium",
      fast: false,
    });
    state.setProviderModelPreference("codex", "openai/gpt-5.6-luna", {
      effort: "low",
      fast: false,
    });

    expect(useSharedSettings.getState().providerModelPreferences.opencode).toEqual({
      "openai/gpt-5.6-sol": { effort: "high", fast: false },
      "openai/gpt-5.6-luna": { effort: "max", fast: true },
      "github-copilot/gpt-5.6-luna": { effort: "medium", fast: false },
    });
    expect(useSharedSettings.getState().providerModelPreferences.codex).toEqual({
      "openai/gpt-5.6-luna": { effort: "low", fast: false },
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

  it("persists plugin lifecycle and contribution mutations", () => {
    const persistedPlugins = () =>
      JSON.parse(localStorage.getItem("poracode-shared-settings") ?? "null").installedPlugins;

    useSharedSettings.getState().installPlugin(pluginFixture("browser-tools"));
    expect(persistedPlugins()).toEqual({
      "browser-tools": {
        version: "1.1.0",
        enabled: true,
        disabledSkillIds: [],
        disabledMcpServerNames: [],
      },
    });

    useSharedSettings.getState().setPluginEnabled(pluginFixture("browser-tools"), false);
    useSharedSettings.getState().setPluginSkillEnabled("browser-tools", "browser-control", false);
    expect(persistedPlugins()["browser-tools"]).toEqual({
      version: "1.1.0",
      enabled: false,
      disabledSkillIds: ["browser-control"],
      disabledMcpServerNames: [],
    });

    useSharedSettings.getState().uninstallPlugin(pluginFixture("browser-tools"));
    expect(useSharedSettings.getState().installedPlugins).toEqual({});
    expect(persistedPlugins()).toEqual({});
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
