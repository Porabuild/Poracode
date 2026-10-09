import { describe, expect, it } from "vitest";
import {
  capabilitiesForPresentation,
  hasSelectableReasoning,
  modelSelectionFor,
  resolveReasoningSelection,
} from "@/shared/agentSelection";
import type { AcpProbeResult } from "../acp";
import {
  devinCloudSelectionCapabilities,
  devinNegotiatedGuiSelectionCapabilities,
} from "./selectionCapabilities";
import { DEVIN_CLOUD_DEFAULT_MODEL_ID } from "./models";
import { devinDefaultCapabilities } from "./detection";

describe("devinNegotiatedGuiSelectionCapabilities", () => {
  const negotiated: AcpProbeResult = {
    models: [
      { id: "swe-2-high", label: "Swe 2 High" },
      { id: "swe-1-7-lightning-medium", label: "Swe 1 7 Lightning Medium" },
      {
        id: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
        label: "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)",
      },
    ],
    efforts: ["medium", "high", "max"],
    defaultEffort: "max",
    modelEfforts: { "swe-2-high": ["medium", "high", "max"] },
    modelDefaultEfforts: { "swe-2-high": "max" },
    fastModels: ["swe-1-7-lightning-medium"],
    thinkingModels: [],
    contextSizes: [{ id: "1m", label: "1M" }],
    modelContextSizes: { "swe-2-high": ["default", "1m"] },
  };
  const catalog = [
    {
      id: "swe-1-7",
      label: "SWE 1.7",
      variants: [
        { id: "swe-1-7", effort: "", thinking: false, fast: false, context: "default" },
        {
          id: "swe-1-7-lightning-medium",
          effort: "medium",
          thinking: false,
          fast: true,
          context: "default",
          cost: "$0.10 / 1M",
        },
      ],
    },
    {
      id: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
      label: "Fusion",
      variants: [
        {
          id: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
          composite: "Fable 5.1 Medium + SWE-2 Medium",
          effort: "",
          thinking: false,
          fast: false,
          context: "default",
        },
      ],
    },
    {
      // The SOURCE+LIVE checkpoint pair the app model picker selected.
      id: "fusion-gpt-6-astra-high-sidekick-swe-2-high",
      label: "Fusion",
      variants: [
        {
          id: "fusion-gpt-6-astra-high-sidekick-swe-2-high",
          composite: "GPT-6 Astra High Thinking + SWE-2 High",
          effort: "",
          thinking: false,
          fast: false,
          context: "default",
        },
      ],
    },
  ];

  it("projects the negotiated menu, not the catalog, as the GUI selection", () => {
    const result = devinNegotiatedGuiSelectionCapabilities(
      devinDefaultCapabilities,
      negotiated,
      catalog,
    );
    expect(result).toBeDefined();
    const gui = capabilitiesForPresentation({ ...devinDefaultCapabilities, ...result! }, "gui");
    // Exactly the accepted values — the full catalog (with ids the live
    // session would refuse) never leaks into the GUI override.
    expect(gui.models.map((model) => model.id)).toEqual([
      "swe-2-high",
      "swe-1-7-lightning-medium",
      "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
    ]);
    // Catalog pricing cannot erase the native menu's speed/context or pair identity.
    expect(gui.models[1]).toMatchObject({
      label: "Swe 1 7 Lightning Medium",
      description: "$0.10 / 1M",
    });
    expect(gui.models[2]?.label).toBe("Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)");
    expect(gui.models[0]?.label).toBe("Swe 2 High");
  });

  it("declares the separate thought-level ladder and observed per-model controls", () => {
    const gui = capabilitiesForPresentation(
      {
        ...devinDefaultCapabilities,
        ...devinNegotiatedGuiSelectionCapabilities(devinDefaultCapabilities, negotiated, catalog)!,
      },
      "gui",
    );
    expect(gui.efforts).toEqual(["medium", "high", "max"]);
    expect(gui.defaultEffort).toBe("max");
    // Explicitly negotiated per-model ladders are kept verbatim; ids missing
    // from the bounded probe carry NO entry and inherit the global ladder
    // through the shared fold — native-proven support included.
    expect(gui.modelEfforts).toEqual({
      "swe-2-high": ["medium", "high", "max"],
    });
    expect(gui.modelDefaultEfforts).toEqual({ "swe-2-high": "max" });
    expect(gui.fastModels).toEqual(["swe-1-7-lightning-medium"]);
    expect(gui.contextSizes).toEqual([{ id: "1m", label: "1M" }]);
    // Schema-complete runtime identity so the shared fold needs no filling.
    expect(gui.presentationMode).toBe("gui");
    expect(gui.liveInputMode).toBe("server");
    expect(gui.settingDefs).toEqual([]);
    expect(gui.models.length).toBeGreaterThan(0);
  });

  it("returns undefined without a negotiated menu so the catalog fills the GUI", () => {
    expect(
      devinNegotiatedGuiSelectionCapabilities(devinDefaultCapabilities, {}, catalog),
    ).toBeUndefined();
  });

  it("passes grouped-menu sections through verbatim and keeps pair entries exact", () => {
    const fusionId = "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium";
    const grouped: AcpProbeResult = {
      ...negotiated,
      subProviders: [
        { id: "flagship", label: "Flagship" },
        { id: "fusion", label: "Fusion" },
      ],
      modelSubProvider: {
        "swe-2-high": "flagship",
        "swe-1-7-lightning-medium": "flagship",
        [fusionId]: "fusion",
      },
    };
    const gui = capabilitiesForPresentation(
      {
        ...devinDefaultCapabilities,
        ...devinNegotiatedGuiSelectionCapabilities(devinDefaultCapabilities, grouped, catalog)!,
      },
      "gui",
    );
    // Sections and membership are provider content: order and labels verbatim.
    expect(gui.subProviders).toEqual(grouped.subProviders);
    expect(gui.modelSubProvider).toEqual(grouped.modelSubProvider);
    // Grouping never invents, drops, or reorders entries — the Fusion pair is
    // still one first-class exact-label id inside its section.
    expect(gui.models.map((model) => model.id)).toEqual(
      negotiated.models!.map((model) => model.id),
    );
    expect(gui.models.find((model) => model.id === fusionId)?.label).toBe(
      "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)",
    );
    // Effort separation is untouched by the group projection.
    expect(gui.efforts).toEqual(["medium", "high", "max"]);
    expect(gui.modelEfforts).toEqual({
      "swe-2-high": ["medium", "high", "max"],
    });
  });

  it("keeps the override free of group fields for flat menus", () => {
    const gui = capabilitiesForPresentation(
      {
        ...devinDefaultCapabilities,
        ...devinNegotiatedGuiSelectionCapabilities(devinDefaultCapabilities, negotiated, catalog)!,
      },
      "gui",
    );
    expect(gui).not.toHaveProperty("subProviders");
    expect(gui).not.toHaveProperty("modelSubProvider");
  });

  it("inherits the negotiated thought-level ladder for a bounded-probe pair — the native effort carrier", () => {
    // Live bounded-probe shape (checkpoint L): the menu advertises the exact
    // Fusion pair, but the per-model effort sweep covered only the regular
    // control. The pair's effort is REAL native support — the session exposes
    // its own graded thought_level select for the pair, accepts a standard
    // write on it and echoes the level — so the shared fold's global-ladder
    // inheritance is kept and the reasoning control is NOT hidden (hiding it
    // would duplicate nothing and hide a valid native control).
    const pairId = "fusion-gpt-6-astra-high-sidekick-swe-2-high";
    // Real checkpoint-L ladder (checkpoint-l-pair-low-native-echo.json).
    const pairThoughtLadder = ["low", "medium", "high", "xhigh", "max"];
    const bounded: AcpProbeResult = {
      models: [
        { id: "swe-2-high", label: "SWE-2 High" },
        { id: pairId, label: "Fusion (GPT-6 Astra High Thinking + SWE-2 High)" },
      ],
      efforts: pairThoughtLadder,
      defaultEffort: "high",
      modelEfforts: { "swe-2-high": pairThoughtLadder },
      fastModels: [],
      thinkingModels: [],
      contextSizes: [{ id: "1m", label: "1M" }],
    };
    const gui = capabilitiesForPresentation(
      {
        ...devinDefaultCapabilities,
        ...devinNegotiatedGuiSelectionCapabilities(devinDefaultCapabilities, bounded, catalog)!,
      },
      "gui",
    );
    // The pair carries no per-model entry: the shared fold inherits the
    // negotiated global ladder, and the five native choices stay selectable.
    expect(gui.modelEfforts[pairId]).toBeUndefined();
    expect(modelSelectionFor(gui, pairId).reasoning.values).toEqual(pairThoughtLadder);
    expect(hasSelectableReasoning(gui, pairId)).toBe(true);
    // Every native level — including the "low" the real standard setter
    // accepted and echoed — resolves for the pair.
    for (const level of pairThoughtLadder) {
      expect(resolveReasoningSelection(gui, pairId, level)).toBe(level);
    }
    expect(resolveReasoningSelection(gui, pairId)).toBe("high");
    // Regular controls keep their negotiated ladder and default untouched.
    expect(gui.modelEfforts["swe-2-high"]).toEqual(pairThoughtLadder);
    expect(gui.efforts).toEqual(pairThoughtLadder);
    expect(gui.defaultEffort).toBe("high");
    expect(resolveReasoningSelection(gui, "swe-2-high", "medium")).toBe("medium");
    // The pair's identity stays exact — id and native label.
    expect(gui.models.find((model) => model.id === pairId)?.label).toBe(
      "Fusion (GPT-6 Astra High Thinking + SWE-2 High)",
    );
  });

  it("keeps an explicitly negotiated effort ladder for a composite id verbatim", () => {
    // The probe is the authority: if it DID negotiate a ladder for the pair,
    // the projection preserves it instead of overwriting with the empty one.
    const pairId = "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium";
    const covered: AcpProbeResult = {
      ...negotiated,
      modelEfforts: { ...negotiated.modelEfforts!, [pairId]: ["low"] },
    };
    const gui = capabilitiesForPresentation(
      {
        ...devinDefaultCapabilities,
        ...devinNegotiatedGuiSelectionCapabilities(devinDefaultCapabilities, covered, catalog)!,
      },
      "gui",
    );
    expect(gui.modelEfforts[pairId]).toEqual(["low"]);
  });

  it("projects effort identically without the catalog: classification never gates the ladder", () => {
    // Effort projection consults no catalog classification: a cold catalog
    // and a warm one yield the SAME global-ladder inheritance for every
    // negotiated id (the earlier warm-catalog empty-ladder special case was
    // removed when the pair's native thought-level support was proven).
    // Catalog classification still enriches pricing only.
    const cold = capabilitiesForPresentation(
      {
        ...devinDefaultCapabilities,
        ...devinNegotiatedGuiSelectionCapabilities(devinDefaultCapabilities, negotiated, [])!,
      },
      "gui",
    );
    const warm = capabilitiesForPresentation(
      {
        ...devinDefaultCapabilities,
        ...devinNegotiatedGuiSelectionCapabilities(devinDefaultCapabilities, negotiated, catalog)!,
      },
      "gui",
    );
    expect(
      cold.modelEfforts["fusion-claude-fable-5-1-medium-sidekick-swe-2-medium"],
    ).toBeUndefined();
    expect(cold.modelEfforts).toEqual(warm.modelEfforts);
    expect(cold.efforts).toEqual(warm.efforts);
    expect(cold.efforts).toEqual(["medium", "high", "max"]);
    // Pricing enrichment still follows the catalog.
    expect(warm.models[1]?.description).toBe("$0.10 / 1M");
    expect(cold.models[1]?.description).toBeUndefined();
  });
});

describe("devinCloudSelectionCapabilities", () => {
  it("starts cloud on the single provider-owned native-default choice with no invented modes", () => {
    const projection = devinCloudSelectionCapabilities(devinDefaultCapabilities);
    // Both surfaces see exactly one honest entry (a zero-model provider is
    // hidden by the pickers and the draft refuses an empty model).
    expect(projection.models).toEqual([{ id: DEVIN_CLOUD_DEFAULT_MODEL_ID, label: "Default" }]);
    expect(projection.efforts).toEqual([]);
    expect(projection.modelEfforts).toEqual({ [DEVIN_CLOUD_DEFAULT_MODEL_ID]: [] });
    expect(projection.modes).toEqual([]);
    expect(projection.approvalPolicies).toEqual([]);
    const gui = capabilitiesForPresentation({ ...devinDefaultCapabilities, ...projection }, "gui");
    expect(gui.models).toEqual(projection.models);
    expect(gui.modes).toEqual([]);
    expect(gui.approvalPolicies).toEqual([]);
    expect(gui.presentationMode).toBe("gui");
    expect(gui.liveInputMode).toBe("server");
    // Cloud exposes no model menu at all, so it never declares sections.
    expect(gui).not.toHaveProperty("subProviders");
    expect(gui).not.toHaveProperty("modelSubProvider");
  });
});
