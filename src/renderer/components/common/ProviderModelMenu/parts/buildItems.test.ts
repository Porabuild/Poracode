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

function makeCapability(
  models: ReadonlyArray<{ id: string; label: string }>,
  extra: Partial<ProviderModelMenuProvider["capabilities"]> = {},
): ProviderModelMenuProvider["capabilities"] {
  return {
    models: [...models],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
    ...extra,
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

  it("omits selectable or Default context from parameterized ACP model rows", () => {
    const items = buildProviderModelItems({
      providers: [
        {
          kind: "cursor",
          label: "Cursor",
          presentationMode: "gui",
          capabilities: makeCapability(
            [
              { id: "gpt-5.5", label: "GPT-5.5" },
              { id: "composer-2.5", label: "Composer 2.5" },
              { id: "gpt-5.2", label: "GPT-5.2" },
            ],
            {
              efforts: ["low", "medium", "high"],
              modelEfforts: { "gpt-5.5": ["low", "medium", "high"] },
              fastModels: ["gpt-5.5", "composer-2.5"],
              contextSizes: [
                { id: "default", label: "Default" },
                { id: "272k", label: "272K" },
                { id: "1m", label: "1M" },
              ],
              modelContextSizes: {
                "gpt-5.5": ["default", "272k", "1m"],
                "composer-2.5": ["default"],
                "gpt-5.2": ["272k"],
              },
            },
          ),
        },
      ],
      search: "",
      currentAgentKind: "cursor",
      currentModel: "gpt-5.5",
      lockedAgentKind: "cursor",
    });

    const rows = items.filter((item) => item.type === "model");
    const gpt = rows.find((item) => item.modelId === "gpt-5.5");
    const composer = rows.find((item) => item.modelId === "composer-2.5");
    const gpt52 = rows.find((item) => item.modelId === "gpt-5.2");
    expect(gpt?.label).toBe("GPT-5.5");
    expect(gpt?.contextDescription).toBeUndefined();
    expect(composer?.label).toBe("Composer 2.5");
    expect(composer?.contextDescription).toBeUndefined();
    expect(gpt52?.contextDescription).toBe("272K");
  });
});
