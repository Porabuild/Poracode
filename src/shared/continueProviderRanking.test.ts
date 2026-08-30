import { describe, expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "./contracts";
import { crossagentRankingPreferences } from "./crossagentRanking";
import {
  continueRankingCandidate,
  rankContinueProviders,
  resolveInitialPresentationMode,
} from "./continueProviderRanking";

function capability(overrides: Partial<AgentCapability> = {}): AgentCapability {
  return {
    presentationMode: "gui",
    presentationModes: ["gui", "terminal"],
    models: [{ id: "fast-model" }, { id: "deep-model" }],
    efforts: ["low", "high"],
    defaultEffort: "low",
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    ...overrides,
  } as AgentCapability;
}

function agent(kind: string, overrides: Partial<AgentCapability> = {}): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    capabilities: capability(overrides),
  } as AgentStatus;
}

describe("continueRankingCandidate", () => {
  it("reads models and per-model reasoning from the presentation the agent would open in", () => {
    const candidate = continueRankingCandidate(
      agent("copilot", {
        modelEfforts: { "deep-model": ["medium", "max"] },
        modelDefaultEfforts: { "deep-model": "max" },
        fastModels: ["fast-model"],
      }),
      "gui",
    );

    expect(candidate.provider).toBe("copilot");
    expect(candidate.defaultModel).toBe("fast-model");
    expect(candidate.models).toEqual([
      { id: "fast-model", efforts: ["low", "high"], defaultEffort: "low", fastAvailable: true },
      { id: "deep-model", efforts: ["medium", "max"], defaultEffort: "max", fastAvailable: false },
    ]);
  });

  it("marks Fast unavailable when the provider reports it disabled", () => {
    const candidate = continueRankingCandidate(
      agent("claude", { fastModels: ["fast-model"], fastDisabledReason: "plan-not-eligible" }),
      "gui",
    );

    expect(candidate.models[0]?.fastAvailable).toBe(false);
  });

  it("uses the presentation override's models when one exists", () => {
    const candidate = continueRankingCandidate(
      agent("codex", {
        presentationCapabilities: {
          terminal: { models: [{ id: "cli-only-model" }] },
        } as AgentCapability["presentationCapabilities"],
      }),
      "terminal",
    );

    expect(candidate.models.map((model) => model.id)).toEqual(["cli-only-model"]);
  });
});

describe("rankContinueProviders", () => {
  const agents = [agent("claude"), agent("copilot"), agent("codex")];

  it("proposes the most-used provider ahead of installed-registry order", () => {
    const ranked = rankContinueProviders(
      agents,
      {},
      "gui",
      crossagentRankingPreferences({
        agentSelectionUsage: [
          {
            agentKind: "codex",
            modelId: "deep-model",
            effort: "high",
            fast: false,
            count: 9,
            lastUsedAt: 30,
          },
          {
            agentKind: "copilot",
            modelId: "fast-model",
            effort: "low",
            fast: false,
            count: 2,
            lastUsedAt: 20,
          },
        ],
      }),
    );

    expect(ranked[0]?.provider).toBe("codex");
    // The whole point of ranking here: the first agent in the list does not win.
    expect(ranked[0]?.provider).not.toBe(agents[0]!.kind);
  });

  it("carries the model and reasoning that provider is normally launched with", () => {
    const ranked = rankContinueProviders(
      agents,
      {},
      "gui",
      crossagentRankingPreferences({
        agentSelectionUsage: [
          {
            agentKind: "copilot",
            modelId: "deep-model",
            effort: "high",
            fast: false,
            count: 5,
            lastUsedAt: 40,
          },
        ],
      }),
    );

    expect(ranked[0]?.provider).toBe("copilot");
    expect(ranked[0]?.preferredSelection).toMatchObject({ model: "deep-model", effort: "high" });
  });

  it("ignores a remembered selection whose model the provider no longer offers", () => {
    const ranked = rankContinueProviders(
      [agent("copilot")],
      {},
      "gui",
      crossagentRankingPreferences({
        agentSelectionUsage: [
          {
            agentKind: "copilot",
            modelId: "retired-model",
            effort: "high",
            fast: false,
            count: 5,
            lastUsedAt: 40,
          },
        ],
      }),
    );

    expect(ranked[0]?.preferredSelection.model).toBe("fast-model");
  });

  it("falls back to registry order when nothing has been used yet", () => {
    const ranked = rankContinueProviders(agents, {}, "gui", crossagentRankingPreferences({}));

    expect(ranked.map((entry) => entry.provider)).toEqual(["claude", "copilot", "codex"]);
  });
});

describe("resolveInitialPresentationMode", () => {
  it("prefers the mode this agent was last opened in", () => {
    expect(resolveInitialPresentationMode(agent("copilot"), { copilot: "terminal" }, "gui")).toBe(
      "terminal",
    );
  });

  it("otherwise mirrors the source thread's mode", () => {
    expect(resolveInitialPresentationMode(agent("copilot"), {}, "terminal")).toBe("terminal");
  });

  it("ignores a remembered mode the agent does not support", () => {
    const guiOnly = agent("copilot", { presentationModes: ["gui"], presentationMode: "gui" });
    expect(resolveInitialPresentationMode(guiOnly, { copilot: "terminal" }, "terminal")).toBe(
      "gui",
    );
  });
});
