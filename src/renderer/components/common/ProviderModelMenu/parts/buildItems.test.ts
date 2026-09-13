import { describe, expect, it } from "vitest";
import type { ProviderModelMenuProvider } from "../ProviderModelMenu";
import { buildProviderModelItems } from "./buildItems";

function makeProvider(
  kind: string,
  label: string,
  models: ReadonlyArray<{ id: string; label: string }>,
  subProviders?: ReadonlyArray<{ id: string; label: string }>,
): ProviderModelMenuProvider {
  return {
    kind,
    label,
    capabilities: {
      models: [...models],
      ...(subProviders ? { subProviders: [...subProviders] } : {}),
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
    },
  };
}

describe("buildProviderModelItems", () => {
  it("decorates searched rows with the provider label when several providers offer the same model", () => {
    const shared = [{ id: "go/shared-model", label: "Shared Model" }];
    const items = buildProviderModelItems({
      providers: [
        makeProvider("alpha", "Alpha", shared, [{ id: "go", label: "Go" }]),
        makeProvider("beta", "Beta", shared, [{ id: "go", label: "Go" }]),
        makeProvider("gamma", "Gamma", [{ id: "gamma-unique", label: "Unique Model" }]),
      ],
      search: "model",
      currentAgentKind: "alpha",
      currentModel: "",
    });

    const rows = items.filter((item) => item.type === "model");
    const byKind = new Map(rows.map((item) => [item.providerKind, item]));
    expect(byKind.get("alpha")?.subProviderLabel).toBe("Go · Alpha");
    expect(byKind.get("beta")?.subProviderLabel).toBe("Go · Beta");
    // A model offered by a single provider stays undecorated.
    expect(byKind.get("gamma")?.subProviderLabel).toBeUndefined();
  });

  it("leaves the unsearched grouped picker undecorated", () => {
    const shared = [{ id: "go/shared-model", label: "Shared Model" }];
    const items = buildProviderModelItems({
      providers: [
        makeProvider("alpha", "Alpha", shared, [{ id: "go", label: "Go" }]),
        makeProvider("beta", "Beta", shared, [{ id: "go", label: "Go" }]),
      ],
      search: "",
      currentAgentKind: "alpha",
      currentModel: "",
    });

    // Unsearched rows group under sub-provider headers, so the row itself
    // carries no sub-provider label and needs no decoration.
    for (const item of items.filter((entry) => entry.type === "model")) {
      expect(item.subProviderLabel).toBeUndefined();
    }
  });

  it("decorates favorite rows while searching ambiguous models", () => {
    const shared = [{ id: "go/shared-model", label: "Shared Model" }];
    const items = buildProviderModelItems({
      providers: [
        makeProvider("alpha", "Alpha", shared, [{ id: "go", label: "Go" }]),
        makeProvider("beta", "Beta", shared, [{ id: "go", label: "Go" }]),
      ],
      search: "shared",
      favorites: [
        { agentKind: "alpha", modelId: "go/shared-model" },
        { agentKind: "beta", modelId: "go/shared-model" },
      ],
      currentAgentKind: "alpha",
      currentModel: "",
    });

    const favRows = items.filter(
      (item): item is Extract<typeof item, { type: "model" }> =>
        item.type === "model" && item.id.startsWith("fav:"),
    );
    expect(favRows).toHaveLength(2);
    const byKind = new Map(favRows.map((item) => [item.providerKind, item]));
    expect(byKind.get("alpha")?.subProviderLabel).toBe("Go · Alpha");
    expect(byKind.get("beta")?.subProviderLabel).toBe("Go · Beta");
  });
});
