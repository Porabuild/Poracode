import { describe, expect, it } from "vitest";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  normalizeSidebarShortcutOrder,
} from "./settings";

describe("shared settings defaults", () => {
  it("normalizes sidebar shortcut order without duplicates or omissions", () => {
    expect(normalizeSidebarShortcutOrder(["schedules", "schedules"])).toEqual([
      "schedules",
      "pullRequests",
      "githubActions",
    ]);
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
});
