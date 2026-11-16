import { describe, expect, it } from "vitest";
import type { AgentInstanceConfigMap } from "@/shared/contracts";
import { usageProvidersForAgentInstances } from "../usageProviders";

const agentInstances: AgentInstanceConfigMap = {
  "gemini-work": {
    id: "gemini-work",
    driver: "gemini",
    displayName: "Work",
    config: { homeDir: "~/.poracode/gemini-profiles/work" },
  },
  "gemini-broken": {
    id: "gemini-broken",
    driver: "gemini",
    displayName: "Broken",
    config: {},
  },
};

describe("Gemini profile usage providers", () => {
  it("adds Gemini profile providers after the base Gemini provider", () => {
    const providers = usageProvidersForAgentInstances(agentInstances);
    const geminiIndex = providers.findIndex((provider) => provider.id === "gemini");

    expect(geminiIndex).toBeGreaterThanOrEqual(0);
    expect(providers.slice(geminiIndex, geminiIndex + 2).map((provider) => provider.id)).toEqual([
      "gemini",
      "gemini:gemini-work",
    ]);
    expect(providers.find((provider) => provider.id === "gemini:gemini-work")?.label).toBe(
      "Gemini Work",
    );
    expect(providers.find((provider) => provider.id === "gemini:gemini-broken")).toBeUndefined();
  });
});
