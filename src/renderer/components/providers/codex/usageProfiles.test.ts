import { describe, expect, it } from "vitest";
import type { AgentInstanceConfigMap } from "@/shared/contracts";
import { usageProvidersForAgentInstances } from "../usageProviders";
const agentInstances: AgentInstanceConfigMap = {
  "codex-work": {
    id: "codex-work",
    driver: "codex",
    displayName: "Work",
    config: { homeDir: "~/.poracode/codex-profiles/work" },
  },
  "codex-broken": {
    id: "codex-broken",
    driver: "codex",
    displayName: "Broken",
    config: {},
  },
};
describe("Codex profile usage providers", () => {
  it("adds Codex profile providers after the base Codex provider", () => {
    const providers = usageProvidersForAgentInstances(agentInstances);
    const codexIndex = providers.findIndex((provider) => provider.id === "codex");

    // A profile with a malformed config is skipped, like the supervisor does.
    expect(providers.slice(codexIndex, codexIndex + 2).map((provider) => provider.id)).toEqual([
      "codex",
      "codex:codex-work",
    ]);
    expect(providers.find((provider) => provider.id === "codex:codex-work")?.label).toBe(
      "Codex Work",
    );
    expect(providers.find((provider) => provider.id === "codex:codex-broken")).toBeUndefined();
  });
});
