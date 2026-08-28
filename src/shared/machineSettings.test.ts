import { describe, expect, it } from "vitest";
import {
  defaultMachineScopeModes,
  effectiveAgentSettings,
  effectiveDisabledAgents,
  effectiveHiddenModels,
  effectiveProviderOrder,
} from "./machineSettings";

const base = {
  machineScopeModes: defaultMachineScopeModes,
  machineSettings: {},
  providerOrder: ["claude", "codex"],
  hiddenModels: { cursor: ["auto"] },
  disabledAgents: ["gemini"],
  agentSettings: { cursor: { structuredRuntime: "acp" as const } },
};

describe("effectiveProviderOrder", () => {
  it("returns the global order while synced, even with overrides present", () => {
    const settings = {
      ...base,
      machineSettings: { "local/wsl:Ubuntu": { providerOrder: ["codex"] } },
    };
    expect(effectiveProviderOrder(settings, "local/wsl:Ubuntu")).toEqual(["claude", "codex"]);
  });

  it("prefers the machine override in per-machine mode, falling back to global", () => {
    const settings = {
      ...base,
      machineScopeModes: { ...defaultMachineScopeModes, providerOrder: "per-machine" as const },
      machineSettings: { "local/wsl:Ubuntu": { providerOrder: ["codex"] } },
    };
    expect(effectiveProviderOrder(settings, "local/wsl:Ubuntu")).toEqual(["codex"]);
    expect(effectiveProviderOrder(settings, "local")).toEqual(["claude", "codex"]);
  });
});

describe("effectiveHiddenModels / effectiveDisabledAgents", () => {
  it("respects the scope mode lock", () => {
    const settings = {
      ...base,
      machineSettings: {
        local: { hiddenModels: { cursor: ["gpt"] }, disabledAgents: ["codex"] },
      },
    };
    expect(effectiveHiddenModels(settings, "local", "cursor")).toEqual(["auto"]);
    expect(effectiveDisabledAgents(settings, "local")).toEqual(["gemini"]);
    const perMachine = {
      ...settings,
      machineScopeModes: {
        providerOrder: "synced" as const,
        hiddenModels: "per-machine" as const,
        disabledAgents: "per-machine" as const,
      },
    };
    expect(effectiveHiddenModels(perMachine, "local", "cursor")).toEqual(["gpt"]);
    expect(effectiveDisabledAgents(perMachine, "local")).toEqual(["codex"]);
  });
});

describe("effectiveAgentSettings", () => {
  it("merges machine overrides over global values with no mode gate", () => {
    const settings = {
      ...base,
      machineSettings: {
        "local/wsl:Ubuntu": { agentSettings: { cursor: { structuredRuntime: "sdk" } } },
      },
    };
    expect(effectiveAgentSettings(settings, "local/wsl:Ubuntu", "cursor")).toEqual({
      structuredRuntime: "sdk",
    });
    expect(effectiveAgentSettings(settings, "local", "cursor")).toEqual({
      structuredRuntime: "acp",
    });
    expect(effectiveAgentSettings(settings, "local", "codex")).toEqual({});
  });
});
