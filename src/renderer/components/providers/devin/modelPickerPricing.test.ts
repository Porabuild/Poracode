import { describe, expect, it } from "vitest";
import type { ProviderModelMenuProvider } from "../../common/ProviderModelMenu";
import type { ProviderModelItem } from "../../common/ProviderModelMenu/parts/types";
import { buildProviderModelItems } from "../../common/ProviderModelMenu/parts/buildItems";
import { registerModelDescriptionFormatter } from "../modelDescription";
import { formatDevinModelPricing } from "./modelPricing";

interface TestModel {
  id: string;
  label: string;
  description?: string;
}

function makeCapability(
  models: ReadonlyArray<TestModel>,
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

describe("buildProviderModelItems price lines with the real devin Fusion costs", () => {
  // The actual provider leaf parser over verbatim native catalog cost strings:
  // the rows must carry labeled lead rates plus the separately-priced Sidekick
  // component, and the collapsed family row must range both streams.
  const fusionKind = "devin-fusion-fixture";
  registerModelDescriptionFormatter(fusionKind, formatDevinModelPricing);
  const fusionFamilyCapability = (descriptions: Record<string, string | undefined>) =>
    makeCapability(
      ["fusion-a", "fusion-b", "fusion-c"].map((id) => ({
        id,
        label: `Fusion (${id})`,
        ...(descriptions[id] ? { description: descriptions[id] } : {}),
      })),
      {
        modelFamilies: [
          {
            model: "fusion-a",
            label: "Fusion",
            selectors: [
              {
                id: "lead",
                labelKey: "modelSelection.lead",
                options: [
                  { id: "lead-a", label: "Lead A" },
                  { id: "lead-b", label: "Lead B" },
                  { id: "lead-c", label: "Lead C" },
                ],
              },
              {
                id: "sidekick",
                labelKey: "modelSelection.sidekick",
                options: [
                  { id: "sk-x", label: "X" },
                  { id: "sk-y", label: "Y" },
                  { id: "sk-z", label: "Z" },
                ],
              },
            ],
            bindings: { effort: "model", fast: "model" },
            members: [
              {
                model: "fusion-a",
                selections: { lead: "lead-a", sidekick: "sk-x" },
                effort: "low",
                fast: false,
              },
              {
                model: "fusion-b",
                selections: { lead: "lead-b", sidekick: "sk-y" },
                effort: "low",
                fast: false,
              },
              {
                model: "fusion-c",
                selections: { lead: "lead-c", sidekick: "sk-z" },
                effort: "low",
                fast: false,
              },
            ],
          },
        ],
      },
    );
  const nativeFree = "$10 / 1M Input · $0.25 / 1M Cached input · $50 / 1M Output · Sidekick: Free";
  const nativePaidLead =
    "$2 / 1M Input · $0.1 / 1M Cached input · $10 / 1M Output · $4 / 1M Sidekick input · $0.4 / 1M Sidekick cached input · $20 / 1M Sidekick output";
  const nativePaidLeadHigh =
    "$10 / 1M Input · $0.25 / 1M Cached input · $50 / 1M Output · $0.2 / 1M Sidekick input · $0.02 / 1M Sidekick cached input · $1.2 / 1M Sidekick output";

  it("renders component ranges on the family row and the exact member price on favorites", () => {
    const provider: ProviderModelMenuProvider = {
      kind: fusionKind,
      label: "Fixture",
      capabilities: fusionFamilyCapability({
        "fusion-a": nativeFree,
        "fusion-b": nativePaidLead,
        "fusion-c": nativePaidLeadHigh,
      }),
    };
    const items = buildProviderModelItems({
      providers: [provider],
      search: "",
      favorites: [{ agentKind: fusionKind, modelId: "fusion-a" }],
    }).filter(
      (item): item is Extract<ProviderModelItem, { type: "model" }> => item.type === "model",
    );
    // Collapsed family row: honest component ranges over every member, neither
    // stream summed into the other.
    expect(items.find((row) => row.familyModelIds)?.priceLine).toBe(
      "Lead: $2–10 / $10–50 · 1M · Sidekick: $0–4 / $0–20",
    );
    // Exact favorite keeps its own lead + Sidekick price (localized Free).
    const exact = items.find((row) => row.id === `model-exact:${fusionKind}:fusion-a`);
    expect(exact?.priceLine).toBe("Lead: $10 / $50 · 1M · Sidekick: Free");
  });

  it("shows no price when one member's cost text is not parseable", () => {
    const provider: ProviderModelMenuProvider = {
      kind: fusionKind,
      label: "Fixture",
      capabilities: fusionFamilyCapability({
        "fusion-a": nativeFree,
        "fusion-b": nativePaidLead,
        "fusion-c": "ask your accountant",
      }),
    };
    const items = buildProviderModelItems({
      providers: [provider],
      search: "",
    }).filter(
      (item): item is Extract<ProviderModelItem, { type: "model" }> => item.type === "model",
    );
    expect(items.find((row) => row.familyModelIds)?.priceLine).toBeUndefined();
  });
});
