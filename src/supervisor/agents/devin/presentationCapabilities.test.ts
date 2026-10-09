import { describe, expect, it } from "vitest";
import { capabilitiesForPresentation } from "@/shared/agentSelection";
import { projectModelFamilies } from "@/shared/modelFamilySelection";
import type { AgentCapability, ModelFamilySelection } from "@/shared/contracts";
import { devinDefaultCapabilities } from "./detection";
import { withDevinPresentationCapabilities } from "./presentationCapabilities";

/** A small VALID model-bound relation (both common controls encoded on members). */
const modelBoundRelation: ModelFamilySelection = {
  model: "m1",
  label: "Fixture family",
  selectors: [
    {
      id: "lead",
      labelKey: "modelSelection.lead",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
  ],
  bindings: { effort: "model", fast: "model" },
  members: [
    { model: "m1", selections: { lead: "a" }, effort: "low", fast: false },
    { model: "m2", selections: { lead: "b" }, effort: "high", fast: true },
  ],
};

describe("Devin presentation capabilities", () => {
  it("retains detected models and controls when the GUI override supplies its approval default", () => {
    const source = {
      ...devinDefaultCapabilities,
      models: [{ id: "fixture-model", label: "Fixture model" }],
      efforts: ["low", "high"],
      modelEfforts: { "fixture-model": ["low", "high"] },
      modelDefaultEfforts: { "fixture-model": "low" },
      defaultHiddenModels: ["fixture-hidden"],
      fastModels: ["fixture-model"],
      contextSizes: [{ id: "long", label: "Long" }],
      modelContextSizes: { "fixture-model": ["long"] },
    };
    const capabilities = withDevinPresentationCapabilities(source);
    const gui = capabilitiesForPresentation(capabilities, "gui");
    expect(gui.models).toEqual(source.models);
    expect(gui.efforts).toEqual(source.efforts);
    expect(gui.modelEfforts).toEqual(source.modelEfforts);
    expect(gui.modelDefaultEfforts).toEqual(source.modelDefaultEfforts);
    expect(gui.defaultHiddenModels).toEqual(source.defaultHiddenModels);
    expect(gui.fastModels).toEqual(source.fastModels);
    expect(gui.modelContextSizes).toEqual(source.modelContextSizes);
    expect(gui.presentationMode).toBe("gui");
    expect(gui.defaultApprovalPolicy).toBe("bypass");
    expect(capabilitiesForPresentation(capabilities, "terminal").defaultApprovalPolicy).toBe(
      "smart",
    );
  });

  it("preserves an explicit detected GUI selection instead of replacing it with terminal fields", () => {
    // Detection attaches the ACP-NEGOTIATED menu as the gui override; the
    // terminal catalog (with unlaunchable variants the live session refuses)
    // must never overwrite it again.
    const negotiated = {
      models: [{ id: "swe-1-7-medium", label: "SWE 1.7" }],
      efforts: ["medium", "max"],
      modelEfforts: { "swe-1-7-medium": ["medium", "max"] },
      defaultEffort: "max",
    };
    const source = {
      ...devinDefaultCapabilities,
      // Terminal/base carries the FULL catalog.
      models: [
        { id: "swe-1-7", label: "SWE 1.7" },
        { id: "swe-1-7-max", label: "SWE 1.7" },
      ],
      efforts: ["none", "medium", "high", "max"],
      modelEfforts: { "swe-1-7": ["none", "medium", "high", "max"] },
      presentationCapabilities: { gui: negotiated },
    };
    const capabilities = withDevinPresentationCapabilities(source);
    const gui = capabilitiesForPresentation(capabilities, "gui");
    // The override wins; base fields only fill what it omits.
    expect(gui.models).toEqual(negotiated.models);
    expect(gui.efforts).toEqual(negotiated.efforts);
    expect(gui.modelEfforts).toEqual(negotiated.modelEfforts);
    expect(gui.defaultEffort).toBe("max");
    // Terminal keeps the complete catalog untouched.
    const terminal = capabilitiesForPresentation(capabilities, "terminal");
    expect(terminal.models).toEqual(source.models);
    expect(terminal.efforts).toEqual(source.efforts);
  });

  it("pins the gui runtime identity on a bare approval-default override", () => {
    // The pre-detection shape: only the approval default is set — the shared
    // fold requires full selection fields, so the base fills the rest.
    const capabilities = withDevinPresentationCapabilities(devinDefaultCapabilities);
    const gui = capabilitiesForPresentation(capabilities, "gui");
    expect(gui.models).toEqual([]);
    expect(gui.presentationMode).toBe("gui");
    expect(gui.liveInputMode).toBe("server");
    expect(gui.defaultApprovalPolicy).toBe("bypass");
  });

  it("never installs the model-bound terminal relation on the GUI fallback", () => {
    // The only compiled GUI relation is the accepted-menu one (selection
    // capabilities). A probe enrichment gap must not install the model-bound
    // Terminal relation here: before live narrowing it would offer CLI-only
    // pairs, and after narrowing the surviving model-bound bindings would
    // hide the native Effort/Fast controls. The GUI fallback declares no
    // relation and keeps the ordinary raw models and native controls.
    const source = {
      // Strip the static baseline GUI override so this exercises the true
      // no-override fallback (detection composed no override at all).
      ...(() => {
        const { presentationCapabilities: _baseline, ...bare } = devinDefaultCapabilities;
        return bare;
      })(),
      models: [
        { id: "m1", label: "M1" },
        { id: "m2", label: "M2" },
      ],
      efforts: ["low", "high"],
      modelEfforts: { m1: ["low", "high"] },
      fastModels: ["m1"],
      modelFamilies: [modelBoundRelation],
    };
    const capabilities = withDevinPresentationCapabilities(source as AgentCapability);
    const gui = capabilitiesForPresentation(capabilities, "gui");
    expect(gui.modelFamilies).toBeUndefined();
    expect(projectModelFamilies(gui)).toEqual([]);
    // Ordinary fallback selection fields survive untouched.
    expect(gui.models).toEqual(source.models);
    expect(gui.modelEfforts).toEqual(source.modelEfforts);
    expect(gui.fastModels).toEqual(source.fastModels);
    // Terminal keeps its full relation.
    expect(capabilitiesForPresentation(capabilities, "terminal").modelFamilies).toEqual([
      modelBoundRelation,
    ]);
  });
});
