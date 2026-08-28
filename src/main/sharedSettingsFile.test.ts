import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allUsageProviderDescriptors } from "@poracode/agents-usage";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { decryptSecret, isEncryptedSecret } from "@/shared/secretStorage";
import {
  DEFAULT_USAGE_DISABLED_PROVIDER_IDS,
  DEFAULT_USAGE_ENABLED_PROVIDER_IDS,
  defaultSharedSettings,
  type SharedSettings,
} from "@/shared/settings";
import {
  applyAgentSecretSetting,
  applyCreateProfile,
  applyProfileEnvironment,
  mergeManagedSharedSettings,
  patchSharedSettingsFile,
  readSharedSettingsFile,
  writeSharedSettingsFile,
} from "./sharedSettingsFile";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-settings-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures in tests
    }
  }
});

describe("sharedSettingsFile", () => {
  it("preserves supervisor-managed Crossagents routing data during renderer writes", () => {
    const onDisk: SharedSettings = {
      ...defaultSharedSettings,
      crossagentSelectionUsage: [
        {
          agentKind: "kimi",
          modelId: "k3",
          effort: "max",
          fast: false,
          tags: ["mobile", "simulator"],
          count: 4,
          lastUsedAt: 10,
        },
      ],
      crossagentRoutingOverrides: [
        {
          tags: ["frontend", "design"],
          agentKind: "claude",
          modelId: "opus",
          effort: "max",
          fast: false,
          updatedAt: 11,
        },
      ],
    };
    const {
      agentHookSupport: _agentHookSupport,
      crossagentSelectionUsage: _crossagentSelectionUsage,
      crossagentRoutingOverrides: _crossagentRoutingOverrides,
      ...incoming
    } = defaultSharedSettings;

    const merged = mergeManagedSharedSettings(onDisk, incoming);
    expect(merged.crossagentSelectionUsage).toEqual(onDisk.crossagentSelectionUsage);
    expect(merged.crossagentRoutingOverrides).toEqual(onDisk.crossagentRoutingOverrides);
  });

  it("writes and reads shared settings as readable JSON", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeSharedSettingsFile(settingsPath, {
      themeMode: "dark",
      themePreset: "default",
      locale: "system",
      gitTextLanguage: "en",
      terminalPosition: "right",
      windowsShellPath: "auto",
      windowsInternalShellPath: "auto",
      windowsShellArguments: "",
      commitGenProvider: "auto",
      commitGenModel: "",
      commitGenEffort: "",
      commitGenFast: false,
      titleGenProvider: "auto",
      titleGenModel: "",
      titleGenEffort: "",
      titleGenFast: false,
      conflictResolverProvider: "auto",
      conflictResolverModel: "",
      conflictResolverEffort: "",
      conflictResolverFast: false,
      experimentJudgeProvider: "",
      experimentJudgeModel: "",
      experimentJudgeEffort: "",
      experimentJudgeFast: false,
      conflictResolverPresentationMode: "gui",
      wslCommitGenProvider: "auto",
      wslCommitGenModel: "",
      wslCommitGenEffort: "",
      wslCommitGenFast: false,
      wslTitleGenProvider: "auto",
      wslTitleGenModel: "",
      wslTitleGenEffort: "",
      wslTitleGenFast: false,
      wslConflictResolverProvider: "auto",
      wslConflictResolverModel: "",
      wslConflictResolverEffort: "",
      wslConflictResolverFast: false,
      wslConflictResolverPresentationMode: "gui",
      agentSettings: {},
      machineScopeModes: {
        providerOrder: "synced",
        hiddenModels: "synced",
        disabledAgents: "synced",
      },
      machineSettings: {},
      hiddenModels: {},
      disabledAgents: [],
      providerOrder: [],
      acpRegistryInstalledAgents: {},
      agentInstances: {},
      collapseTerminalComposer: false,
      cliPickerTarget: "ask",
      staleThreadUnloadMinutes: 20,
      autoArchiveDoneAfterDays: 7,
      scrollSpeed: 2,
      agentTerminalFontSize: 12,
      guiChatFontSize: 13,
      terminalPanelFontSize: 12,
      preventSleep: "while-remote-access",
      launchAtStartup: true,
      startMinimized: true,
      closeToTray: true,
      remoteAccessEnabled: false,
      remoteAccessTailscaleHttps: false,
      remoteAccessAdvertisedUrl: "",
      threadRemoveAction: "archive",
      autoMarkDoneOnPrMerge: true,
      newThreadMode: "page",
      homeScopeEnabled: true,
      sidebarHiddenShortcuts: ["githubActions"],
      sidebarShortcutOrder: ["pullRequests", "githubActions", "schedules"],
      sidebarTranslucency: false,
      sidebarGlassTint: { light: null, dark: null },
      autoShowTerminalPanel: true,
      worktreeStorageMode: "global",
      worktreeBasePath: "",
      wslWorktreeBasePath: "",
      gitReviewMode: "panel",
      prCreateMode: "dialog",
      prAutomationDefault: "off",
      prMergeMethod: "squash",
      commitDefaultAction: "commit-push",
      providerConfigs: {},
      providerModelPreferences: {},
      lastPresentationModeByAgent: {},
      lastUsedProjectDirs: {},
      editorLspEnabled: false,
      searchUseIgnoreFiles: true,
      searchExclude: {},
      disableCliHookPlugin: false,
      dismissedHookInstallProposals: {},
      notificationsEnabled: true,
      notificationSound: true,
      notificationFilter: "unfocused",
      notificationStatuses: { done: true, needsAttention: true, error: true },
      notifyL2Cli: true,
      remotePushEnabled: true,
      remotePushRedactContent: false,
      workspaces: [],
      favoriteModels: [],
      recentModels: [],
      agentSelectionUsage: [],
      crossagentSelectionUsage: [],
      crossagentRoutingOverrides: [],
      crossagentPausedProviders: [],
      crossagentHiddenModels: {},
      agentHookSupport: {},
      enabledMcpServers: {},
      mcpServers: [],
      disabledBuiltInMcpServers: {},
      disabledBuiltInMcpTools: {},
      installedPlugins: {},
      browser: {
        allowEval: false,
        allowDataAccess: false,
        linkOpenTarget: "internal",
        linkPresentationMode: "panel",
      },
      audio: {
        showVoiceInputButton: true,
        microphoneDeviceId: "",
        transcriptionLanguage: "en",
        transcriptionModel: "tiny",
        useWebGpu: true,
      },
      usage: {
        autoRefresh: true,
        refreshIntervalMinutes: 5,
        providerRefreshIntervals: {},
        showEstimatedCost: false,
        showInSidebar: true,
        sidebarHiddenProviders: [],
        disabledProviders: [],
        providerOrder: [],
        collapsedProviders: [],
        selectedRingGroups: {},
      },
      crossagentRoutingGuide: "",
    });

    expect(readSharedSettingsFile(settingsPath)).toEqual({
      themeMode: "dark",
      themePreset: "default",
      locale: "system",
      gitTextLanguage: "en",
      terminalPosition: "right",
      windowsShellPath: "auto",
      windowsInternalShellPath: "auto",
      windowsShellArguments: "",
      commitGenProvider: "auto",
      commitGenModel: "",
      commitGenEffort: "",
      commitGenFast: false,
      titleGenProvider: "auto",
      titleGenModel: "",
      titleGenEffort: "",
      titleGenFast: false,
      conflictResolverProvider: "auto",
      conflictResolverModel: "",
      conflictResolverEffort: "",
      conflictResolverFast: false,
      experimentJudgeProvider: "",
      experimentJudgeModel: "",
      experimentJudgeEffort: "",
      experimentJudgeFast: false,
      conflictResolverPresentationMode: "gui",
      wslCommitGenProvider: "auto",
      wslCommitGenModel: "",
      wslCommitGenEffort: "",
      wslCommitGenFast: false,
      wslTitleGenProvider: "auto",
      wslTitleGenModel: "",
      wslTitleGenEffort: "",
      wslTitleGenFast: false,
      wslConflictResolverProvider: "auto",
      wslConflictResolverModel: "",
      wslConflictResolverEffort: "",
      wslConflictResolverFast: false,
      wslConflictResolverPresentationMode: "gui",
      agentSettings: {},
      machineScopeModes: {
        providerOrder: "synced",
        hiddenModels: "synced",
        disabledAgents: "synced",
      },
      machineSettings: {},
      hiddenModels: {},
      disabledAgents: [],
      providerOrder: [],
      acpRegistryInstalledAgents: {},
      agentInstances: {},
      collapseTerminalComposer: false,
      cliPickerTarget: "ask",
      staleThreadUnloadMinutes: 20,
      autoArchiveDoneAfterDays: 7,
      scrollSpeed: 2,
      agentTerminalFontSize: 12,
      guiChatFontSize: 13,
      terminalPanelFontSize: 12,
      preventSleep: "while-remote-access",
      launchAtStartup: true,
      startMinimized: true,
      closeToTray: true,
      remoteAccessEnabled: false,
      remoteAccessTailscaleHttps: false,
      remoteAccessAdvertisedUrl: "",
      threadRemoveAction: "archive",
      autoMarkDoneOnPrMerge: true,
      newThreadMode: "page",
      homeScopeEnabled: true,
      sidebarHiddenShortcuts: ["githubActions"],
      sidebarShortcutOrder: ["pullRequests", "githubActions", "schedules"],
      sidebarTranslucency: false,
      sidebarGlassTint: { light: null, dark: null },
      autoShowTerminalPanel: true,
      worktreeStorageMode: "global",
      worktreeBasePath: "",
      wslWorktreeBasePath: "",
      gitReviewMode: "panel",
      prCreateMode: "dialog",
      prAutomationDefault: "off",
      prMergeMethod: "squash",
      commitDefaultAction: "commit-push",
      providerConfigs: {},
      providerModelPreferences: {},
      lastPresentationModeByAgent: {},
      lastUsedProjectDirs: {},
      editorLspEnabled: false,
      searchUseIgnoreFiles: true,
      searchExclude: {},
      disableCliHookPlugin: false,
      dismissedHookInstallProposals: {},
      notificationsEnabled: true,
      notificationSound: true,
      notificationFilter: "unfocused",
      notificationStatuses: { done: true, needsAttention: true, error: true },
      notifyL2Cli: true,
      remotePushEnabled: true,
      remotePushRedactContent: false,
      workspaces: [],
      favoriteModels: [],
      recentModels: [],
      agentSelectionUsage: [],
      crossagentSelectionUsage: [],
      crossagentRoutingOverrides: [],
      crossagentPausedProviders: [],
      crossagentHiddenModels: {},
      agentHookSupport: {},
      enabledMcpServers: { crossagents: true },
      mcpServers: [],
      disabledBuiltInMcpServers: {},
      disabledBuiltInMcpTools: {},
      installedPlugins: {},
      browser: {
        allowEval: false,
        allowDataAccess: false,
        linkOpenTarget: "internal",
        linkPresentationMode: "panel",
      },
      audio: {
        showVoiceInputButton: true,
        microphoneDeviceId: "",
        transcriptionLanguage: "en",
        transcriptionModel: "tiny",
        useWebGpu: true,
      },
      usage: {
        autoRefresh: true,
        refreshIntervalMinutes: 5,
        providerRefreshIntervals: {},
        showEstimatedCost: false,
        showInSidebar: true,
        sidebarHiddenProviders: [],
        disabledProviders: [],
        providerOrder: [],
        collapsedProviders: [],
        selectedRingGroups: {},
      },
      crossagentRoutingGuide: "",
    });
    expect(readFileSync(settingsPath, "utf8")).toContain('"themeMode": "dark"');
  });

  it("returns defaults when the settings file does not exist", () => {
    const settingsPath = join(makeTempDir(), "missing.json");
    expect(readSharedSettingsFile(settingsPath)).toEqual(defaultSharedSettings);
    expect(readSharedSettingsFile(settingsPath).usage.disabledProviders).toEqual([
      ...DEFAULT_USAGE_DISABLED_PROVIDER_IDS,
    ]);
  });

  it("migrates legacy prevent-sleep booleans from a previous released settings shape", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        preventSleepWhileWorking: true,
        remoteAccessPreventSleep: false,
      }),
      "utf8",
    );

    const settings = readSharedSettingsFile(settingsPath);
    expect(settings.preventSleep).toBe("while-working");
    expect(settings).not.toHaveProperty("preventSleepWhileWorking");
    expect(settings).not.toHaveProperty("remoteAccessPreventSleep");
  });

  it("defaults usage tracking to Claude and Codex only", () => {
    const defaultEnabled = allUsageProviderDescriptors()
      .map((provider) => provider.id)
      .filter((id) => !DEFAULT_USAGE_DISABLED_PROVIDER_IDS.includes(id));

    expect(defaultEnabled).toEqual([...DEFAULT_USAGE_ENABLED_PROVIDER_IDS]);
  });

  it("returns defaults when the settings file contains invalid JSON", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(settingsPath, "{not: valid: json}", "utf8");
    expect(readSharedSettingsFile(settingsPath)).toEqual(defaultSharedSettings);
  });

  it("returns defaults when the settings file is empty", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(settingsPath, "", "utf8");
    expect(readSharedSettingsFile(settingsPath)).toEqual(defaultSharedSettings);
  });

  it("returns defaults when the settings file contains a non-object root", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(settingsPath, "[1, 2, 3]", "utf8");
    const settings = readSharedSettingsFile(settingsPath);
    // normalizeSharedSettings should reject arrays / non-records — even if it
    // chooses to coerce rather than throw, the result must still be a valid
    // SharedSettings object containing all required defaults.
    expect(settings.themeMode).toBe(defaultSharedSettings.themeMode);
    expect(settings.providerConfigs).toEqual({});
  });

  it("creates parent directories on write", () => {
    const settingsPath = join(makeTempDir(), "nested/deep/settings.json");
    writeSharedSettingsFile(settingsPath, defaultSharedSettings);
    expect(readSharedSettingsFile(settingsPath)).toEqual(defaultSharedSettings);
  });

  it("writes pretty-printed JSON terminated by a newline", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeSharedSettingsFile(settingsPath, defaultSharedSettings);
    const raw = readFileSync(settingsPath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain("\n  "); // two-space indent
  });

  it("round-trips app-wide provider model preferences", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeSharedSettingsFile(settingsPath, {
      ...defaultSharedSettings,
      providerModelPreferences: {
        codex: {
          "gpt-5.6-luna": { effort: "max", fast: true },
          "gpt-5.6-sol": { effort: "high", fast: false },
        },
      },
    });

    expect(readSharedSettingsFile(settingsPath).providerModelPreferences).toEqual({
      codex: {
        "gpt-5.6-luna": { effort: "max", fast: true },
        "gpt-5.6-sol": { effort: "high", fast: false },
      },
    });
  });

  it("preserves valid settings when provider configs contain invalid entries", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        themeMode: "dark",
        terminalPosition: "right",
        autoShowTerminalPanel: false,
        providerConfigs: {
          codex: {
            model: "",
            effort: "high",
          },
        },
      }),
      "utf8",
    );

    expect(readSharedSettingsFile(settingsPath)).toMatchObject({
      themeMode: "dark",
      terminalPosition: "right",
      autoShowTerminalPanel: false,
      providerConfigs: {},
    });
  });

  it("normalizes older browser settings without dropping existing flags", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        browser: { allowEval: true, allowDataAccess: true },
      }),
      "utf8",
    );

    expect(readSharedSettingsFile(settingsPath).browser).toEqual({
      allowEval: true,
      allowDataAccess: true,
      linkOpenTarget: "internal",
      linkPresentationMode: "panel",
    });
  });

  it("normalizes older audio settings without dropping existing values", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        audio: { microphoneDeviceId: "mic-1" },
      }),
      "utf8",
    );

    expect(readSharedSettingsFile(settingsPath).audio).toEqual({
      showVoiceInputButton: true,
      microphoneDeviceId: "mic-1",
      transcriptionLanguage: "en",
      transcriptionModel: "tiny",
      useWebGpu: true,
    });
  });

  it("keeps usage providers enabled for existing settings without usage opt-outs", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(settingsPath, JSON.stringify({ themeMode: "dark" }), "utf8");

    expect(readSharedSettingsFile(settingsPath).usage.disabledProviders).toEqual([]);
  });

  it("keeps usage providers enabled for existing usage settings without disabled providers", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({ usage: { autoRefresh: false, refreshIntervalMinutes: 15 } }),
      "utf8",
    );

    expect(readSharedSettingsFile(settingsPath).usage).toMatchObject({
      autoRefresh: false,
      refreshIntervalMinutes: 15,
      disabledProviders: [],
    });
  });

  it("normalizes removed audio models without dropping existing values", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        audio: {
          microphoneDeviceId: "mic-1",
          transcriptionLanguage: "es",
          transcriptionModel: "small",
        },
      }),
      "utf8",
    );

    expect(readSharedSettingsFile(settingsPath).audio).toEqual({
      showVoiceInputButton: true,
      microphoneDeviceId: "mic-1",
      transcriptionLanguage: "es",
      transcriptionModel: "tiny",
      useWebGpu: true,
    });
  });
});

describe("applyAgentSecretSetting", () => {
  it("seals Cursor SDK API keys and lets the supervisor decrypt the stored value", () => {
    const dir = makeTempDir();
    const { settings, storedValue } = applyAgentSecretSetting(
      defaultSharedSettings,
      { agentKind: "cursor", key: "sdkApiKey", value: " cursor-secret " },
      dir,
    );

    expect(storedValue).not.toBeNull();
    expect(isEncryptedSecret(storedValue ?? "")).toBe(true);
    expect(storedValue).not.toContain("cursor-secret");
    expect(settings.agentSettings.cursor?.sdkApiKey).toBe(storedValue);
    expect(decryptSecret(dir, storedValue ?? "")).toBe("cursor-secret");
  });

  it("pins encrypted agent secrets during ordinary renderer settings writes", () => {
    const dir = makeTempDir();
    const { settings: onDisk, storedValue } = applyAgentSecretSetting(
      defaultSharedSettings,
      { agentKind: "cursor", key: "sdkApiKey", value: "cursor-secret" },
      dir,
    );
    const incoming = {
      ...defaultSharedSettings,
      agentSettings: {
        cursor: { sdkApiKey: "plaintext-overwrite", structuredRuntime: "sdk" },
      },
    };

    const merged = mergeManagedSharedSettings(onDisk, incoming);
    expect(merged.agentSettings.cursor).toEqual({
      sdkApiKey: storedValue,
      structuredRuntime: "sdk",
    });
  });

  it("clears a saved key only through the dedicated secret path", () => {
    const dir = makeTempDir();
    const saved = applyAgentSecretSetting(
      defaultSharedSettings,
      { agentKind: "cursor", key: "sdkApiKey", value: "cursor-secret" },
      dir,
    );
    const cleared = applyAgentSecretSetting(
      saved.settings,
      { agentKind: "cursor", key: "sdkApiKey", value: "" },
      dir,
    );

    expect(cleared.storedValue).toBeNull();
    expect(cleared.settings.agentSettings.cursor?.sdkApiKey).toBeUndefined();
  });

  it("preserves a saved key when a remote patch replaces ordinary agent settings", () => {
    const dir = makeTempDir();
    const settingsPath = join(dir, "settings.json");
    const saved = applyAgentSecretSetting(
      defaultSharedSettings,
      { agentKind: "cursor", key: "sdkApiKey", value: "cursor-secret" },
      dir,
    );
    writeSharedSettingsFile(settingsPath, saved.settings);

    const patched = patchSharedSettingsFile(settingsPath, {
      agentSettings: { cursor: { structuredRuntime: "acp" } },
    });

    expect(patched.agentSettings.cursor).toEqual({
      structuredRuntime: "acp",
      sdkApiKey: saved.storedValue,
    });
  });
});

describe("applyProfileEnvironment (single-credential provider)", () => {
  function cursorProfileSettings(): SharedSettings {
    return {
      ...defaultSharedSettings,
      agentInstances: {
        work: { id: "work", driver: "cursor", displayName: "Work" },
      },
    };
  }

  it("seals a Cursor profile key and pins it during renderer writes", () => {
    const dir = makeTempDir();
    const saved = applyProfileEnvironment(
      cursorProfileSettings(),
      {
        instanceId: "work",
        environment: { CURSOR_API_KEY: { value: "profile-secret", sensitive: false } },
      },
      dir,
    );
    const stored = saved.instance.environment?.CURSOR_API_KEY?.value ?? "";

    expect(isEncryptedSecret(stored)).toBe(true);
    expect(decryptSecret(dir, stored)).toBe("profile-secret");
    expect(JSON.stringify(saved.settings)).not.toContain("profile-secret");

    const merged = mergeManagedSharedSettings(saved.settings, {
      ...saved.settings,
      agentInstances: {
        work: { id: "work", driver: "cursor", displayName: "Renamed" },
      },
    });
    expect(merged.agentInstances.work?.displayName).toBe("Renamed");
    expect(merged.agentInstances.work?.environment?.CURSOR_API_KEY?.value).toBe(stored);
  });

  it("rejects environment variables outside a single-credential profile's declaration", () => {
    expect(() =>
      applyProfileEnvironment(
        cursorProfileSettings(),
        { instanceId: "work", environment: { NODE_OPTIONS: { value: "--inspect" } } },
        makeTempDir(),
      ),
    ).toThrow("only support CURSOR_API_KEY");
  });

  it("rejects instances whose driver does not support profiles", () => {
    expect(() =>
      applyProfileEnvironment(
        {
          ...defaultSharedSettings,
          agentInstances: {
            gadget: { id: "gadget", driver: "acp-generic", displayName: "Gadget" },
          },
        },
        { instanceId: "gadget", environment: { CURSOR_API_KEY: { value: "secret" } } },
        makeTempDir(),
      ),
    ).toThrow("Agent profile not found");
  });

  it("rejects a missing instance", () => {
    expect(() =>
      applyProfileEnvironment(
        { ...defaultSharedSettings, agentInstances: {} },
        { instanceId: "missing", environment: {} },
        makeTempDir(),
      ),
    ).toThrow("Agent profile not found");
  });

  it("drops the stored key when the payload key is empty", () => {
    const settings = cursorProfileSettings();
    settings.agentInstances.work!.environment = {
      CURSOR_API_KEY: { value: "lc-safe:encrypted", sensitive: true },
    };

    const cleared = applyProfileEnvironment(
      settings,
      { instanceId: "work", environment: { CURSOR_API_KEY: { value: "", sensitive: true } } },
      ".",
    );

    expect(cleared.instance.environment).toBeUndefined();
    expect(cleared.settings.agentInstances.work?.environment).toBeUndefined();
    expect(cleared.settings.agentInstances.work?.displayName).toBe("Work");
  });
});

describe("applyCreateProfile", () => {
  it("creates the profile and seals its key in one settings result", () => {
    const dir = makeTempDir();
    const created = applyCreateProfile(
      defaultSharedSettings,
      {
        driver: "cursor",
        id: "work",
        displayName: " Work ",
        environment: { CURSOR_API_KEY: { value: " profile-secret " } },
      },
      dir,
    );
    const stored = created.instance.environment?.CURSOR_API_KEY?.value ?? "";

    expect(created.settings.agentInstances.work).toBe(created.instance);
    expect(created.instance.displayName).toBe("Work");
    expect(decryptSecret(dir, stored)).toBe(" profile-secret ");
    expect(JSON.stringify(created.settings)).not.toContain(" profile-secret ");
  });

  it("creates a config-only profile for a provider with no credential", () => {
    const created = applyCreateProfile(
      defaultSharedSettings,
      { driver: "claude", id: "work", displayName: "Work", config: { configDir: "~/x" } },
      makeTempDir(),
    );

    expect(created.instance.config).toEqual({ configDir: "~/x" });
    expect(created.instance.environment).toBeUndefined();
  });

  it("does not mutate settings when creation validation fails", () => {
    const settings = { ...defaultSharedSettings, agentInstances: {} };

    expect(() =>
      applyCreateProfile(
        settings,
        { driver: "cursor", id: "work", displayName: "   " },
        makeTempDir(),
      ),
    ).toThrow("require a name");
    expect(() =>
      applyCreateProfile(
        settings,
        { driver: "acp-generic", id: "gadget", displayName: "Gadget" },
        makeTempDir(),
      ),
    ).toThrow("does not support profiles");
    expect(settings.agentInstances).toEqual({});
  });
});

describe("applyProfileEnvironment (free-form environment provider)", () => {
  function claudeProfileSettings(environment?: AgentInstanceConfig["environment"]): SharedSettings {
    const instance: AgentInstanceConfig = {
      id: "glm",
      driver: "claude",
      displayName: "GLM",
      config: { configDir: "~/.poracode/claude-profiles/glm" },
      ...(environment ? { environment } : {}),
    };
    return { ...defaultSharedSettings, agentInstances: { glm: instance } };
  }

  it("seals sensitive values and stores non-sensitive ones as plaintext", () => {
    const { settings, instance } = applyProfileEnvironment(
      claudeProfileSettings(),
      {
        instanceId: "glm",
        environment: {
          ANTHROPIC_BASE_URL: { value: "https://api.z.ai/api/anthropic" },
          ANTHROPIC_AUTH_TOKEN: { value: "sk-secret-123", sensitive: true },
        },
      },
      makeTempDir(),
    );

    expect(instance.environment?.ANTHROPIC_BASE_URL).toEqual({
      value: "https://api.z.ai/api/anthropic",
    });
    const token = instance.environment?.ANTHROPIC_AUTH_TOKEN;
    expect(token?.sensitive).toBe(true);
    expect(isEncryptedSecret(token?.value ?? "")).toBe(true);
    expect(token?.value).not.toContain("sk-secret-123");
    // The returned instance is the one written into the settings map.
    expect(settings.agentInstances.glm).toBe(instance);
  });

  it("round-trips an already-sealed secret without re-sealing it", () => {
    const dir = makeTempDir();
    const first = applyProfileEnvironment(
      claudeProfileSettings(),
      { instanceId: "glm", environment: { TOKEN: { value: "plain", sensitive: true } } },
      dir,
    );
    const sealed = first.instance.environment?.TOKEN?.value ?? "";

    const second = applyProfileEnvironment(
      claudeProfileSettings(),
      { instanceId: "glm", environment: { TOKEN: { value: sealed, sensitive: true } } },
      dir,
    );
    expect(second.instance.environment?.TOKEN?.value).toBe(sealed);
  });

  it("drops empty values and removes the environment field when all are empty", () => {
    const { instance } = applyProfileEnvironment(
      claudeProfileSettings({ OLD: { value: "x" } }),
      { instanceId: "glm", environment: { OLD: { value: "" }, "": { value: "ignored" } } },
      makeTempDir(),
    );
    expect(instance.environment).toBeUndefined();
  });

  it("throws for a missing instance or a non-Claude driver", () => {
    expect(() =>
      applyProfileEnvironment(
        claudeProfileSettings(),
        { instanceId: "nope", environment: {} },
        makeTempDir(),
      ),
    ).toThrow(/not found/i);

    const acpSettings: SharedSettings = {
      ...defaultSharedSettings,
      agentInstances: {
        droid: { id: "droid", driver: "acp-generic", config: { binary: "droid" } },
      },
    };
    expect(() =>
      applyProfileEnvironment(acpSettings, { instanceId: "droid", environment: {} }, makeTempDir()),
    ).toThrow(/not found/i);
  });
});
