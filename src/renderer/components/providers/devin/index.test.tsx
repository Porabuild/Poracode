import { primaryModelChoices } from "../modelPickerLayout";
// @vitest-environment node
import type { ThreadConfig } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import { getComposerControls, getConfigNormalizer } from "../providerComposer";
import { getTitleGenDefaults } from "../titleGen";
import { devinDefaultCapabilities } from "@/supervisor/agents/devin/detection";
import "./index";

describe("Devin presentation defaults", () => {
  const guiInput = (approvalPolicy?: string) => ({
    config: {
      model: "",
      ...(approvalPolicy !== undefined ? { approvalPolicy } : {}),
    } as ThreadConfig,
    capabilities: devinDefaultCapabilities,
  });

  it("keeps explicit approval choices in Chat and defaults only unset ones to Bypass", () => {
    const normalizer = getConfigNormalizer("devin");
    expect(normalizer?.({ ...guiInput("smart"), presentationMode: "gui" })).toEqual({});
    expect(normalizer?.({ ...guiInput("ask"), presentationMode: "gui" })).toEqual({});
    expect(normalizer?.({ ...guiInput("normal"), presentationMode: "gui" })).toEqual({});
    expect(normalizer?.({ ...guiInput("bypass"), presentationMode: "gui" })).toEqual({});
    expect(normalizer?.({ ...guiInput(""), presentationMode: "gui" })).toEqual({
      approvalPolicy: "bypass",
    });
    expect(normalizer?.({ ...guiInput(undefined), presentationMode: "gui" })).toEqual({
      approvalPolicy: "bypass",
    });
    // Terminal threads keep their own policy semantics.
    expect(normalizer?.({ ...guiInput(undefined), presentationMode: "terminal" })).toEqual({});
  });

  it("offers the full declared policy set and mode toggle on both surfaces", () => {
    const baseInput = {
      config: { model: "", approvalPolicy: "" } as ThreadConfig,
      capabilities: devinDefaultCapabilities,
      isDisabled: false,
      onConfigChange: vi.fn<(patch: Partial<ThreadConfig>) => void>(),
    };
    for (const presentationMode of ["gui", "terminal"] as const) {
      const controls = getComposerControls("devin")?.({ ...baseInput, presentationMode }) ?? [];
      const permission = controls.find(
        (control) => "iconKind" in control && control.iconKind === "permission",
      ) as { options: ReadonlyArray<{ id: string }> } | undefined;
      expect(permission?.options.map((option) => option.id)).toEqual([
        "normal",
        "accept-edits",
        "smart",
        "bypass",
      ]);
      const mode = controls.find((control) => "iconKind" in control && control.iconKind === "mode");
      expect(mode).toBeDefined();
    }
  });

  it("keeps the utility defaults", () => {
    expect(getTitleGenDefaults("devin")?.model).toBe("swe-1-6-fast");
    expect(getTitleGenDefaults("devin")?.label).toBe("Devin");
  });

  it("adds one paired control only while a Fusion member is selected", () => {
    const baseCapabilities = {
      ...devinDefaultCapabilities,
      models: [
        { id: "solo", label: "Solo" },
        { id: "pair-alpha-x", label: "Fusion (Alpha + X)" },
      ],
      modelFamilies: [
        {
          model: "pair-alpha-x",
          label: "Fusion",
          selectors: [
            {
              id: "lead",
              labelKey: "modelSelection.lead" as const,
              options: [{ id: "alpha", label: "Alpha" }],
            },
            {
              id: "sidekick",
              labelKey: "modelSelection.sidekick" as const,
              options: [{ id: "x", label: "X" }],
            },
          ],
          bindings: { effort: "config" as const, fast: "config" as const },
          members: [{ model: "pair-alpha-x", selections: { lead: "alpha", sidekick: "x" } }],
        },
      ],
    };
    expect(primaryModelChoices("devin", baseCapabilities)).toEqual(["pair-alpha-x"]);
    expect(
      primaryModelChoices("devin", {
        ...baseCapabilities,
        models: [...baseCapabilities.models, { id: "adaptive", label: "Adaptive" }],
      }),
    ).toEqual(["adaptive", "pair-alpha-x"]);
    const input = (model: string) => ({
      config: { model } as ThreadConfig,
      capabilities: baseCapabilities,
      isDisabled: false,
      onConfigChange: vi.fn<(patch: Partial<ThreadConfig>) => void>(),
    });
    for (const presentationMode of ["gui", "terminal"] as const) {
      const inside = getComposerControls("devin")?.({
        ...input("pair-alpha-x"),
        presentationMode,
      });
      expect(
        inside?.filter((control) => control.kind === "effort-context" && control.familySelection)
          .length,
      ).toBe(1);
      const outside = getComposerControls("devin")?.({
        ...input("solo"),
        presentationMode,
      });
      expect(
        outside?.some((control) => control.kind === "effort-context" && control.familySelection),
      ).toBe(false);
    }
  });
});
