import { describe, expect, it } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { CrossagentRoutingState } from "@/shared/crossagentRanking";
import { buildCrewHelperOptions } from "./crewHelperOptions";

function status(kind: string, label: string, model: string, defaultEffort: string): AgentStatus {
  return {
    kind,
    label,
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: model, label }],
      efforts: [defaultEffort],
      modelEfforts: { [model]: [defaultEffort] },
      modelDefaultEfforts: { [model]: defaultEffort },
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      mcpScope: { gui: "launch", terminal: "none" },
      settingDefs: [],
    },
  };
}

const settings = {
  disabledAgents: [],
  hiddenModels: {},
  crossagentPausedProviders: [],
  crossagentHiddenModels: {},
};

describe("buildCrewHelperOptions", () => {
  it("uses the first ranked non-lead model and its model-default effort", () => {
    const routing: CrossagentRoutingState = {
      providers: [
        { kind: "codex", label: "Codex", execution: "structured" },
        { kind: "claude", label: "Claude", execution: "structured" },
      ],
      ranked: [
        {
          provider: "codex",
          label: "Codex",
          execution: "structured",
          rank: 1,
          source: "built-in",
          usageCount: 0,
          model: { id: "gpt-5.5", label: "GPT-5.5" },
          fast: false,
          learnedTags: [],
        },
        {
          provider: "claude",
          label: "Claude",
          execution: "structured",
          rank: 2,
          source: "built-in",
          usageCount: 0,
          model: { id: "opus-5.5", label: "Opus 5.5" },
          reasoning: "low",
          fast: true,
          learnedTags: [],
        },
      ],
    };
    const options = buildCrewHelperOptions({
      statuses: [
        status("codex", "Codex", "gpt-5.5", "high"),
        status("claude", "Claude", "opus-5.5", "medium"),
      ],
      settings,
      routing,
    });
    expect(options.defaultSelectionFor("codex")).toEqual({
      agentKind: "claude",
      model: "opus-5.5",
      effort: "medium",
    });
  });

  it("excludes paused providers and models hidden from Crossagents", () => {
    const routing: CrossagentRoutingState = {
      providers: [{ kind: "claude", label: "Claude", execution: "structured" }],
      ranked: [
        {
          provider: "claude",
          label: "Claude",
          execution: "structured",
          rank: 1,
          source: "built-in",
          usageCount: 0,
          model: { id: "opus-5.5", label: "Opus 5.5" },
          fast: false,
          learnedTags: [],
        },
      ],
    };
    const options = buildCrewHelperOptions({
      statuses: [status("claude", "Claude", "opus-5.5", "medium")],
      settings: {
        ...settings,
        crossagentPausedProviders: ["claude"],
      },
      routing,
    });
    expect(options.providers).toEqual([]);
    expect(options.modelLabelOf({ agentKind: "claude", model: "opus-5.5" })).toBe("Claude");
  });
});
