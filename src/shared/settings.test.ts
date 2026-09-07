import { describe, expect, it } from "vitest";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  normalizeSidebarShortcutOrder,
  normalizeThreadDocksOrder,
  reorderVisibleThreadDocks,
} from "./settings";

describe("shared settings defaults", () => {
  it("normalizes sidebar shortcut order without duplicates or omissions", () => {
    expect(normalizeSidebarShortcutOrder(["schedules", "schedules"])).toEqual([
      "schedules",
      "pullRequests",
      "githubActions",
    ]);
  });

  it("normalizes and reorders thread docks without moving hidden dock slots", () => {
    expect(normalizeThreadDocksOrder(["plan", "plan"])).toEqual([
      "plan",
      "goal",
      "agents",
      "backgroundTasks",
      "images",
    ]);
    expect(
      reorderVisibleThreadDocks(
        ["goal", "plan", "agents", "backgroundTasks", "images"],
        ["plan", "backgroundTasks", "images"],
        2,
        0,
      ),
    ).toEqual(["goal", "images", "agents", "plan", "backgroundTasks"]);
  });

  it("enables notifications and displays them for visible threads by default", () => {
    expect(defaultSharedSettings.notificationsEnabled).toBe(true);
    expect(defaultSharedSettings.remotePushEnabled).toBe(true);
    expect(defaultSharedSettings.notificationFilter).toBe("all");
  });

  it("defaults preventSleep to while-remote-access", () => {
    expect(defaultSharedSettings.preventSleep).toBe("while-remote-access");
    expect(normalizeSharedSettings({}).preventSleep).toBe("while-remote-access");
  });

  it("preserves global provider and model effort/Fast preferences", () => {
    expect(
      normalizeSharedSettings({
        providerModelPreferences: {
          codex: {
            "gpt-5.6-luna": { effort: "max", fast: true },
            "gpt-5.6-sol": { effort: "high", fast: false },
          },
        },
      }).providerModelPreferences,
    ).toEqual({
      codex: {
        "gpt-5.6-luna": { effort: "max", fast: true },
        "gpt-5.6-sol": { effort: "high", fast: false },
      },
    });
  });

  it("adds an empty model preference map to the previous shared-settings shape", () => {
    expect(
      normalizeSharedSettings({
        providerConfigs: { codex: { model: "gpt-5.6-sol", effort: "high", fast: false } },
      }).providerModelPreferences,
    ).toEqual({});
  });

  it("adds automatic Windows shell settings to a previous settings shape", () => {
    const normalized = normalizeSharedSettings({ terminalPosition: "right" });
    expect(normalized).toMatchObject({
      terminalPosition: "right",
      windowsShellPath: "auto",
      windowsInternalShellPath: "auto",
      windowsShellArguments: "",
    });
  });

  it("migrates legacy sleep booleans into preventSleep", () => {
    expect(
      normalizeSharedSettings({
        preventSleepWhileWorking: true,
        remoteAccessPreventSleep: false,
      }).preventSleep,
    ).toBe("while-working");
    expect(
      normalizeSharedSettings({
        preventSleepWhileWorking: false,
        remoteAccessPreventSleep: true,
      }).preventSleep,
    ).toBe("while-remote-access");
    expect(normalizeSharedSettings({ remoteAccessPreventSleep: true }).preventSleep).toBe(
      "while-remote-access",
    );
    expect(
      normalizeSharedSettings({
        preventSleepWhileWorking: false,
        remoteAccessPreventSleep: false,
      }).preventSleep,
    ).toBe("while-working");
  });

  it("lets an explicit preventSleep value win over legacy booleans", () => {
    const migrated = normalizeSharedSettings({
      preventSleep: "always",
      preventSleepWhileWorking: true,
      remoteAccessPreventSleep: true,
    });
    expect(migrated.preventSleep).toBe("always");
    expect(migrated).not.toHaveProperty("preventSleepWhileWorking");
    expect(migrated).not.toHaveProperty("remoteAccessPreventSleep");
  });

  it("falls back via migration when preventSleep is invalid", () => {
    expect(
      normalizeSharedSettings({
        preventSleep: "never",
        preventSleepWhileWorking: true,
        remoteAccessPreventSleep: false,
      }).preventSleep,
    ).toBe("while-working");
    expect(
      normalizeSharedSettings({
        preventSleep: "never",
        remoteAccessPreventSleep: true,
      }).preventSleep,
    ).toBe("while-remote-access");
  });

  it("drops legacy sleep keys from the normalized output", () => {
    const migrated = normalizeSharedSettings({
      preventSleepWhileWorking: true,
      remoteAccessPreventSleep: true,
    });
    expect(migrated.preventSleep).toBe("while-remote-access");
    expect(migrated).not.toHaveProperty("preventSleepWhileWorking");
    expect(migrated).not.toHaveProperty("remoteAccessPreventSleep");
  });

  it("enables Crossagents as the standing MCP default and preserves opt-outs", () => {
    expect(defaultSharedSettings.enabledMcpServers.crossagents).toBe(true);
    expect(normalizeSharedSettings({}).enabledMcpServers.crossagents).toBe(true);
    expect(
      normalizeSharedSettings({ enabledMcpServers: { crossagents: false } }).enabledMcpServers
        .crossagents,
    ).toBe(false);
  });

  it("defaults to squash merging and preserves a valid selected merge method", () => {
    expect(defaultSharedSettings.prMergeMethod).toBe("squash");
    expect(normalizeSharedSettings({ prMergeMethod: "merge" }).prMergeMethod).toBe("merge");
    expect(normalizeSharedSettings({ prMergeMethod: "invalid" }).prMergeMethod).toBe("squash");
  });

  it("migrates legacy pull request automation defaults", () => {
    expect(normalizeSharedSettings({ prWatchDefault: true }).prAutomationDefault).toBe("fix");
    expect(
      normalizeSharedSettings({ prWatchDefault: true, prAutoMergeDefault: true })
        .prAutomationDefault,
    ).toBe("merge");
    expect(
      normalizeSharedSettings({
        prAutomationDefault: "off",
        prWatchDefault: true,
        prAutoMergeDefault: true,
      }).prAutomationDefault,
    ).toBe("off");
  });

  it("migrates the retired Qwen 3.8 preview model without changing other providers", () => {
    const migrated = normalizeSharedSettings({
      providerConfigs: {
        qwen: { model: "qwen3.8-max-preview", mode: "agent", approvalPolicy: "auto" },
        "claude:qwen": { model: "qwen3.8-max-preview" },
      },
      providerModelPreferences: {
        qwen: { "qwen3.8-max-preview": { effort: "xhigh", fast: false } },
        "claude:qwen": { "qwen3.8-max-preview": { effort: "high", fast: true } },
      },
      commitGenProvider: "qwen",
      commitGenModel: "qwen3.8-max-preview",
      favoriteModels: [
        { agentKind: "qwen", modelId: "qwen3.8-max-preview", presentationMode: "gui" },
      ],
      recentModels: [
        { agentKind: "qwen", modelId: "qwen3.8-max-preview", presentationMode: "gui" },
        { agentKind: "claude:qwen", modelId: "qwen3.8-max-preview", presentationMode: "gui" },
      ],
      agentSelectionUsage: [
        {
          agentKind: "qwen",
          modelId: "qwen3.8-max-preview",
          fast: false,
          count: 2,
          lastUsedAt: 1,
        },
      ],
      crossagentSelectionUsage: [
        {
          agentKind: "qwen",
          modelId: "qwen3.8-max-preview",
          fast: false,
          count: 1,
          lastUsedAt: 1,
        },
      ],
      crossagentRoutingOverrides: [
        {
          tags: ["review"],
          agentKind: "qwen",
          modelId: "qwen3.8-max-preview",
          updatedAt: 1,
        },
      ],
      hiddenModels: { qwen: ["qwen3.8-max-preview", "qwen3.8-max"] },
    });

    expect(migrated.providerConfigs.qwen?.model).toBe("qwen3.8-max");
    expect(migrated.providerConfigs["claude:qwen"]?.model).toBe("qwen3.8-max-preview");
    expect(migrated.providerModelPreferences).toMatchObject({
      qwen: { "qwen3.8-max": { effort: "xhigh", fast: false } },
      "claude:qwen": { "qwen3.8-max-preview": { effort: "high", fast: true } },
    });
    expect(migrated.commitGenModel).toBe("qwen3.8-max");
    expect(migrated.favoriteModels).toEqual([
      { agentKind: "qwen", modelId: "qwen3.8-max", presentationMode: "gui" },
    ]);
    expect(migrated.recentModels).toEqual([
      { agentKind: "claude:qwen", modelId: "qwen3.8-max-preview", presentationMode: "gui" },
    ]);
    expect(migrated.agentSelectionUsage).toEqual([]);
    expect(migrated.crossagentSelectionUsage).toEqual([]);
    expect(migrated.crossagentRoutingOverrides[0]?.modelId).toBe("qwen3.8-max");
    expect(migrated.hiddenModels.qwen).toEqual(["qwen3.8-max"]);
  });

  it("adopts an existing generic Antigravity ACP install without duplicate provider settings", () => {
    const legacyKind = "acp-generic:antigravity-acp";
    const legacyId = "antigravity-acp";
    const migrated = normalizeSharedSettings({
      acpRegistryInstalledAgents: {
        "antigravity-acp": {
          id: "antigravity-acp",
          name: "Google Antigravity",
          version: "1.0.0",
          installedAt: "2026-08-01T00:00:00.000Z",
          adapterKind: legacyKind,
          installKind: "generic",
        },
      },
      providerConfigs: {
        [legacyKind]: { model: "gemini" },
        antigravity: { model: "gemini", effort: "medium" },
      },
      providerModelPreferences: {
        [legacyKind]: { gemini: { effort: "high" } },
        antigravity: { agy: { effort: "low" } },
      },
      providerOrder: ["claude", legacyKind, "antigravity"],
      disabledAgents: [legacyKind],
      hiddenModels: { [legacyKind]: ["legacy-model"], antigravity: ["cli-model"] },
      agentSettings: {
        [legacyKind]: { chatSetting: true },
        antigravity: { terminalSetting: "kept" },
      },
      machineSettings: {
        local: {
          providerOrder: [legacyKind, "antigravity"],
          disabledAgents: [legacyKind],
          hiddenModels: { [legacyKind]: ["legacy-hidden"], antigravity: ["cli-hidden"] },
          agentSettings: {
            [legacyKind]: { chatMachine: true },
            antigravity: { terminalMachine: true },
          },
        },
      },
      agentInstances: {
        [legacyId]: {
          id: legacyId,
          driver: "acp-generic",
          displayName: "Google Antigravity",
          enabled: true,
          config: { binary: "antigravity-acp", args: [], cwd: "project", authMode: "none" },
        },
      },
      favoriteModels: [{ agentKind: legacyKind, modelId: "gemini", presentationMode: "gui" }],
      commitGenProvider: legacyKind,
    });

    expect(migrated.acpRegistryInstalledAgents["antigravity-acp"]).toMatchObject({
      adapterKind: "antigravity",
      installKind: "first-class",
      version: "1.0.0",
    });
    expect(migrated.providerConfigs.antigravity).toMatchObject({
      model: "gemini",
      effort: "medium",
    });
    expect(migrated.providerConfigs[legacyKind]).toBeUndefined();
    expect(migrated.providerModelPreferences.antigravity).toEqual({
      gemini: { effort: "high" },
      agy: { effort: "low" },
    });
    expect(migrated.providerOrder).toEqual(["claude", "antigravity"]);
    // The chat provider's disable must not disable the whole provider: the
    // adopted chat runtime is disabled (and auto-install opts out) while the
    // CLI surface stays available.
    expect(migrated.disabledAgents).toEqual([]);
    expect(migrated.agentInstances[legacyId]).toMatchObject({ enabled: false });
    expect(migrated.acpRegistryAutoInstallOptOuts).toEqual([legacyId]);
    expect(migrated.favoriteModels[0]?.agentKind).toBe("antigravity");
    expect(migrated.commitGenProvider).toBe("antigravity");
    expect(migrated.hiddenModels.antigravity).toEqual(["legacy-model", "cli-model"]);
    expect(migrated.agentSettings.antigravity).toEqual({
      chatSetting: true,
      terminalSetting: "kept",
    });
    expect(migrated.machineSettings.local).toEqual({
      providerOrder: ["antigravity"],
      disabledAgents: [],
      hiddenModels: { antigravity: ["legacy-hidden", "cli-hidden"] },
      agentSettings: {
        antigravity: { chatMachine: true, terminalMachine: true },
      },
    });
  });

  it("normalizes persisted Antigravity ACP model variants", () => {
    const migrated = normalizeSharedSettings({
      providerConfigs: {
        antigravity: { model: "gemini-3-flash-agent" },
      },
      providerModelPreferences: {
        antigravity: {
          "gemini-3-flash-agent": { fast: true },
          "gemini-3.5-flash-low": { fast: false },
          "gemini-3.5-flash-extra-low": {},
        },
      },
      hiddenModels: { antigravity: ["gemini-pro-agent", "gemini-3.1-pro"] },
      favoriteModels: [
        {
          agentKind: "antigravity",
          modelId: "gemini-3.6-flash-medium",
          presentationMode: "gui",
        },
      ],
      agentSelectionUsage: [
        {
          agentKind: "antigravity",
          modelId: "gemini-3-flash-agent",
          count: 1,
          lastUsedAt: 1,
        },
      ],
      commitGenProvider: "antigravity",
      commitGenModel: "gemini-3.1-pro-low",
    });

    expect(migrated.providerConfigs.antigravity).toMatchObject({
      model: "gemini-3.5-flash",
      effort: "High",
    });
    expect(migrated.providerModelPreferences.antigravity).toEqual({
      "gemini-3.5-flash": { effort: "High", fast: true },
      "gemini-3.5-flash-low": { fast: false },
    });
    expect(migrated.hiddenModels.antigravity).toEqual(["gemini-3.1-pro"]);
    expect(migrated.favoriteModels[0]).toMatchObject({
      modelId: "gemini-3.6-flash",
    });
    expect(migrated.agentSelectionUsage[0]).toMatchObject({
      modelId: "gemini-3.5-flash",
      effort: "High",
    });
    expect(migrated.commitGenModel).toBe("gemini-3.1-pro");
    expect(migrated.commitGenEffort).toBe("Low");
  });

  it("does not reinterpret the ambiguous terminal 3.5 Flash Low slug as ACP Medium", () => {
    const terminal = normalizeSharedSettings({
      providerConfigs: {
        antigravity: { model: "gemini-3.5-flash-low", effort: "Low" },
      },
    });
    expect(terminal.providerConfigs.antigravity).toMatchObject({
      model: "gemini-3.5-flash-low",
      effort: "Low",
    });

    const legacyAcp = normalizeSharedSettings({
      providerConfigs: {
        "acp-generic:antigravity-acp": {
          model: "gemini-3.5-flash-low",
        },
      },
    });
    expect(legacyAcp.providerConfigs.antigravity).toMatchObject({
      model: "gemini-3.5-flash",
      effort: "Medium",
    });
  });

  it("migrates a profile whose only legacy remnant is the provider order", () => {
    const migrated = normalizeSharedSettings({
      providerOrder: ["claude", "acp-generic:antigravity-acp"],
    });

    expect(migrated.providerOrder).toEqual(["claude", "antigravity"]);
  });

  it("migrates a profile whose only legacy remnant is a generation provider", () => {
    const migrated = normalizeSharedSettings({
      commitGenProvider: "acp-generic:antigravity-acp",
    });

    expect(migrated.commitGenProvider).toBe("antigravity");
  });

  it("migrates a profile whose only legacy remnant is a hook-support cache entry", () => {
    const entry = {
      agentBinaryVersion: "1.0.0",
      pluginVersion: "0.1.0",
      protocolVersion: 1,
      platform: "win32",
      verifiedAt: "2026-08-01T00:00:00.000Z",
      supportsL1: true,
    };
    const migrated = normalizeSharedSettings({
      agentHookSupport: {
        "acp-generic:antigravity-acp": entry,
        // Environment-scoped cache keys move with the kind.
        "acp-generic:antigravity-acp::wsl::Ubuntu": entry,
      },
    });

    expect(migrated.agentHookSupport.antigravity).toMatchObject({ supportsL1: true });
    expect(migrated.agentHookSupport["antigravity::wsl::Ubuntu"]).toMatchObject({
      supportsL1: true,
    });
    expect(migrated.agentHookSupport["acp-generic:antigravity-acp"]).toBeUndefined();
    expect(migrated.agentHookSupport["acp-generic:antigravity-acp::wsl::Ubuntu"]).toBeUndefined();
  });
});

describe("machine-scoped settings normalization", () => {
  it("defaults pre-machine settings files to today's synced semantics", () => {
    const normalized = normalizeSharedSettings({
      providerOrder: ["claude"],
      agentSettings: { cursor: { structuredRuntime: "sdk" } },
    });
    expect(normalized.machineScopeModes).toEqual({
      providerOrder: "synced",
      hiddenModels: "synced",
      disabledAgents: "synced",
    });
    expect(normalized.machineSettings).toEqual({});
    expect(normalized.providerOrder).toEqual(["claude"]);
  });

  it("drops entries with unparseable machine keys but keeps valid siblings", () => {
    const normalized = normalizeSharedSettings({
      machineSettings: {
        "local/wsl:Ubuntu": { providerOrder: ["codex"] },
        "not-a-machine": { providerOrder: ["claude"] },
        "remote:": { providerOrder: ["claude"] },
        local: { agentSettings: { cursor: { structuredRuntime: "acp" } } },
        "local/wsl:Debian": { providerOrder: "corrupt" },
      },
    });
    expect(Object.keys(normalized.machineSettings).sort()).toEqual(["local", "local/wsl:Ubuntu"]);
    expect(normalized.machineSettings["local/wsl:Ubuntu"]).toEqual({ providerOrder: ["codex"] });
  });

  it("recovers an entirely corrupt machineSettings value", () => {
    expect(normalizeSharedSettings({ machineSettings: "garbage" }).machineSettings).toEqual({});
  });
});
