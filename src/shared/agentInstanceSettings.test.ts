import { describe, expect, it } from "vitest";
import { defaultSharedSettings, type SharedSettings } from "./settings";
import {
  AGENT_INSTANCE_REMOVAL_FIELDS,
  removeAgentInstanceSettings,
} from "./agentInstanceSettings";

describe("agent instance settings removal", () => {
  it("removes exactly the desktop's scoped keys without mutating its input", () => {
    const instance = { id: "work", driver: "claude", displayName: "Work" };
    const current: SharedSettings = {
      ...structuredClone(defaultSharedSettings),
      agentInstances: { work: instance, workshop: { ...instance, id: "workshop" } },
      providerConfigs: { "claude:work": { model: "small" }, "claude:workshop": { model: "large" } },
      providerModelPreferences: {
        "claude:work": { small: { fast: true } },
        "claude:workshop": { large: { effort: "high" } },
      },
      hiddenModels: { "claude:work": ["small"], "claude:workshop": ["large"] },
      agentSettings: {
        "claude:work": { structuredRuntime: "sdk" },
        "claude:workshop": { structuredRuntime: "sdk" },
      },
      lastPresentationModeByAgent: { "claude:work": "gui", "claude:workshop": "terminal" },
      disabledAgents: ["claude:work", "claude:workshop"],
      favoriteModels: [
        { agentKind: "claude:work", modelId: "small", presentationMode: "gui" },
        { agentKind: "claude:workshop", modelId: "large", presentationMode: "gui" },
      ],
      recentModels: [
        { agentKind: "claude:work", modelId: "small", presentationMode: "gui" },
        { agentKind: "claude:workshop", modelId: "large", presentationMode: "gui" },
      ],
      providerOrder: ["claude", "claude:work", "claude:workshop"],
    };
    const before = structuredClone(current);
    const removed = removeAgentInstanceSettings(current, instance);
    expect(Object.keys(removed).sort()).toEqual([...AGENT_INSTANCE_REMOVAL_FIELDS].sort());
    expect(removed.agentInstances).toEqual({ workshop: current.agentInstances.workshop });
    for (const field of [
      "providerConfigs",
      "providerModelPreferences",
      "hiddenModels",
      "agentSettings",
      "lastPresentationModeByAgent",
    ] as const) {
      expect(removed[field]).not.toHaveProperty("claude:work");
      expect(removed[field]["claude:workshop"]).toEqual(current[field]["claude:workshop"]);
    }
    expect(removed.disabledAgents).toEqual(["claude:workshop"]);
    expect(removed.favoriteModels).toEqual([current.favoriteModels[1]]);
    expect(removed.recentModels).toEqual([current.recentModels[1]]);
    expect(removed.providerOrder).toEqual(["claude", "claude:workshop"]);
    expect(current).toEqual(before);
  });
});
