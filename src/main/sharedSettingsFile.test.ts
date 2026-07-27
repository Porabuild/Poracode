import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allUsageProviderDescriptors } from "@poracode/agents-usage";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { isEncryptedSecret } from "@/shared/secretStorage";
import {
  DEFAULT_USAGE_DISABLED_PROVIDER_IDS,
  DEFAULT_USAGE_ENABLED_PROVIDER_IDS,
  defaultSharedSettings,
  type SharedSettings,
} from "@/shared/settings";
import {
  applyClaudeProfileEnvironment,
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
  it("writes and reads shared settings as readable JSON", () => {
    const settingsPath = join(makeTempDir(), "settings.json");
    writeSharedSettingsFile(settingsPath, {
      themeMode: "dark",
      themePreset: "default",
      locale: "system",
      gitTextLanguage: "en",
      terminalPosition: "right",
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
      preventSleepWhileWorking: true,
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
      sidebarTranslucency: false,
      sidebarGlassTint: { light: null, dark: null },
      autoShowTerminalPanel: true,
      worktreeStorageMode: "global",
      worktreeBasePath: "",
      wslWorktreeBasePath: "",
      gitReviewMode: "panel",
      prCreateMode: "dialog",
      prWatchDefault: false,
      prAutoMergeDefault: false,
      commitDefaultAction: "commit-push",
      providerConfigs: {},
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
      favoriteModels: [],
      recentModels: [],
      agentHookSupport: {},
      enabledMcpServers: {},
      mcpServers: [],
      disabledBuiltInMcpServers: {},
      disabledBuiltInMcpTools: {},
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
      preventSleepWhileWorking: true,
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
      sidebarTranslucency: false,
      sidebarGlassTint: { light: null, dark: null },
      autoShowTerminalPanel: true,
      worktreeStorageMode: "global",
      worktreeBasePath: "",
      wslWorktreeBasePath: "",
      gitReviewMode: "panel",
      prCreateMode: "dialog",
      prWatchDefault: false,
      prAutoMergeDefault: false,
      commitDefaultAction: "commit-push",
      providerConfigs: {},
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
      favoriteModels: [],
      recentModels: [],
      agentHookSupport: {},
      enabledMcpServers: {},
      mcpServers: [],
      disabledBuiltInMcpServers: {},
      disabledBuiltInMcpTools: {},
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

describe("applyClaudeProfileEnvironment", () => {
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
    const { settings, instance } = applyClaudeProfileEnvironment(
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
    const first = applyClaudeProfileEnvironment(
      claudeProfileSettings(),
      { instanceId: "glm", environment: { TOKEN: { value: "plain", sensitive: true } } },
      dir,
    );
    const sealed = first.instance.environment?.TOKEN?.value ?? "";

    const second = applyClaudeProfileEnvironment(
      claudeProfileSettings(),
      { instanceId: "glm", environment: { TOKEN: { value: sealed, sensitive: true } } },
      dir,
    );
    expect(second.instance.environment?.TOKEN?.value).toBe(sealed);
  });

  it("drops empty values and removes the environment field when all are empty", () => {
    const { instance } = applyClaudeProfileEnvironment(
      claudeProfileSettings({ OLD: { value: "x" } }),
      { instanceId: "glm", environment: { OLD: { value: "" }, "": { value: "ignored" } } },
      makeTempDir(),
    );
    expect(instance.environment).toBeUndefined();
  });

  it("throws for a missing instance or a non-Claude driver", () => {
    expect(() =>
      applyClaudeProfileEnvironment(
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
      applyClaudeProfileEnvironment(
        acpSettings,
        { instanceId: "droid", environment: {} },
        makeTempDir(),
      ),
    ).toThrow(/not found/i);
  });
});
