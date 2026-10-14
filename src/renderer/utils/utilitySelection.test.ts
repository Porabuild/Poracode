import { describe, expect, it } from "vitest";
import relationTerminal from "@/shared/fixtures/selection-binding-v1/relation-terminal.json";
import { modelFamilySelectionSchema } from "@/shared/contracts/agent.ts";
import type { AgentCapability } from "@/shared/contracts";
import { SelectionBindingRefusalError } from "@/shared/selectionBinding";
import type { ModelSelection, SelectionBindingOwner } from "@/shared/selectionBinding.schemas";
import {
  applyUtilityPresetMutation,
  buildUnstampedSelection,
  resolveUtilitySelection,
  readUtilitySelection,
  relationForResolvedMember,
  utilitySelectionOwner,
  type UtilityPresetEdit,
} from "./utilitySelection";

const terminalRelation = modelFamilySelectionSchema.parse(relationTerminal.relation);
const member = "lead-a+sidekick-b";

const owner: SelectionBindingOwner = {
  agentKind: "devin:profile-1",
  presentationMode: "terminal",
};

function selectionWithBinding(overrides: Partial<ModelSelection> = {}): ModelSelection {
  return {
    model: member,
    effort: "",
    fast: false,
    thinking: false,
    contextSize: "default",
    selectionBinding: {
      version: 1,
      kind: "family-member",
      owner,
      model: member,
      inertValues: { effort: "", fast: false },
    },
    ...overrides,
  };
}

describe("buildUnstampedSelection", () => {
  it("carries the exact scalar tuple with present empty/false carriers and no binding", () => {
    expect(buildUnstampedSelection({ model: "m1", effort: "", fast: false })).toEqual({
      model: "m1",
      effort: "",
      fast: false,
    });
    expect(
      Object.hasOwn(buildUnstampedSelection({ model: "", effort: "", fast: false }), "thinking"),
    ).toBe(false);
  });
});

describe("readUtilitySelection", () => {
  it("builds the unstamped scalar tuple when no canonical object is present", () => {
    expect(readUtilitySelection(undefined, { model: "m1", effort: "", fast: false })).toEqual({
      model: "m1",
      effort: "",
      fast: false,
    });
  });

  it("returns the present canonical tuple verbatim, binding and carriers intact", () => {
    const canonical = selectionWithBinding();
    expect(
      readUtilitySelection(canonical, { model: "scalar", effort: "high", fast: true }),
    ).toEqual(canonical);
  });

  it("treats a present-but-invalid object as absent and falls back to the scalars", () => {
    const invalid = {
      model: "m1",
      effort: "",
      fast: false,
      bogusAxis: true,
    } as unknown as ModelSelection;
    expect(readUtilitySelection(invalid, { model: "m1", effort: "high", fast: false })).toEqual({
      model: "m1",
      effort: "high",
      fast: false,
    });
  });
});

describe("utilitySelectionOwner", () => {
  it("keeps the full adapter kind (profile suffix included) and declares no instance id", () => {
    expect(utilitySelectionOwner("devin:profile-1", "gui")).toEqual({
      agentKind: "devin:profile-1",
      presentationMode: "gui",
    });
    expect(Object.hasOwn(utilitySelectionOwner("devin:profile-1", "gui"), "agentInstanceId")).toBe(
      false,
    );
  });
});

describe("resolveUtilitySelection", () => {
  const legacy = { model: "legacy", effort: "low", fast: false };
  it("does not normalize any explicit modern axis or UID", () => {
    const source = selectionWithBinding();
    expect(
      resolveUtilitySelection(source, legacy, () => {
        throw new Error("must not resolve");
      }),
    ).toStrictEqual(source);
  });
  it("resolves only an implicit model without adding omitted controls", () => {
    expect(resolveUtilitySelection({ model: "" }, legacy, () => legacy)).toStrictEqual({
      model: "legacy",
    });
  });
  it("normalizes absent-object legacy scalars separately", () => {
    expect(resolveUtilitySelection(undefined, legacy, () => legacy)).toStrictEqual(legacy);
  });
});

describe("relationForResolvedMember", () => {
  it("resolves the projected relation of an actual member", () => {
    expect(relationForResolvedMember(capabilitiesWithRelation(), member)?.model).toBe(
      terminalRelation.model,
    );
  });

  it("returns undefined for raw picks outside every relation", () => {
    expect(relationForResolvedMember(capabilitiesWithRelation(), "plain-model")).toBeUndefined();
    expect(relationForResolvedMember(capabilitiesWithRelation(), undefined)).toBeUndefined();
  });
});

function capabilitiesWithRelation() {
  // Only the fields the family projection reads are populated; the projection
  // consumes `models` ids and `modelFamilies` alone.
  return {
    models: [
      { id: member, label: member },
      { id: "plain-model", label: "plain-model" },
    ],
    efforts: [],
    modelEfforts: {},
    modelFamilies: [terminalRelation],
  } as unknown as AgentCapability;
}

function mutationInput(
  edit: UtilityPresetEdit,
  overrides: Partial<Parameters<typeof applyUtilityPresetMutation>[0]> = {},
) {
  return {
    previous: buildUnstampedSelection({ model: "m1", effort: "", fast: false }),
    previousProvider: "devin:profile-1",
    nextProvider: "devin:profile-1",
    next: { model: "m1", effort: "", fast: false },
    owner,
    mintAllowed: true,
    edit,
    ...overrides,
  };
}

describe("applyUtilityPresetMutation", () => {
  it("reset writes a fresh unstamped default tuple and drops any record", () => {
    const previous = selectionWithBinding();
    const next = applyUtilityPresetMutation(
      mutationInput({ kind: "reset" }, { previous, next: { model: "", effort: "", fast: false } }),
    );
    expect(next).toEqual({ model: "", effort: "", fast: false });
    expect(Object.hasOwn(next, "selectionBinding")).toBe(false);
  });

  it("a same-provider same-UID raw pick drops the record without minting", () => {
    const previous = selectionWithBinding();
    const next = applyUtilityPresetMutation(
      mutationInput(
        { kind: "model" },
        { previous, next: { model: member, effort: "", fast: false } },
      ),
    );
    expect(next.model).toBe(member);
    expect(Object.hasOwn(next, "selectionBinding")).toBe(false);
  });

  it("an ordinary provider retarget (no family event) drops the record", () => {
    const previous = selectionWithBinding();
    const next = applyUtilityPresetMutation(
      mutationInput(
        { kind: "model" },
        { previous, nextProvider: "other-agent", next: { model: member, effort: "", fast: false } },
      ),
    );
    expect(Object.hasOwn(next, "selectionBinding")).toBe(false);
  });

  it("a deliberate family event establishes fresh target intent across a provider change", () => {
    const targetOwner: SelectionBindingOwner = {
      agentKind: "other-agent",
      presentationMode: "terminal",
    };
    for (const previous of [
      buildUnstampedSelection({ model: "solo", effort: "", fast: false }),
      selectionWithBinding(),
    ]) {
      const next = applyUtilityPresetMutation(
        mutationInput(
          { kind: "model", relation: terminalRelation },
          {
            previous,
            nextProvider: "other-agent",
            owner: targetOwner,
            next: { model: member, effort: "", fast: false },
          },
        ),
      );
      expect(next.selectionBinding?.owner).toEqual(targetOwner);
      expect(next.selectionBinding?.model).toBe(member);
      expect(next.selectionBinding?.inertValues).toEqual({ effort: "", fast: false });
    }
  });

  it("a cross-provider family event never mints when the owner presentation is unproven", () => {
    const next = applyUtilityPresetMutation(
      mutationInput(
        { kind: "model", relation: terminalRelation },
        {
          nextProvider: "other-agent",
          mintAllowed: false,
          next: { model: member, effort: "", fast: false },
        },
      ),
    );
    expect(Object.hasOwn(next, "selectionBinding")).toBe(false);
  });

  it("a resolved family member edit mints from the declared redundancy and the resulting carriers", () => {
    const previous = buildUnstampedSelection({ model: "m1", effort: "", fast: false });
    const next = applyUtilityPresetMutation(
      mutationInput(
        { kind: "model", relation: terminalRelation },
        { previous, next: { model: member, effort: "", fast: false } },
      ),
    );
    expect(next.selectionBinding).toBeDefined();
    expect(next.selectionBinding?.model).toBe(member);
    expect(next.selectionBinding?.owner).toEqual(owner);
    // Only present-and-declared values enter the record; thinking/context were
    // not written by the edit, so they are never seeded.
    expect(next.selectionBinding?.inertValues).toEqual({ effort: "", fast: false });
  });

  it("a resolved member edit never mints when the owner presentation is unproven", () => {
    const next = applyUtilityPresetMutation(
      mutationInput(
        { kind: "model", relation: terminalRelation },
        { mintAllowed: false, next: { model: member, effort: "", fast: false } },
      ),
    );
    expect(Object.hasOwn(next, "selectionBinding")).toBe(false);
  });

  it("a family-row no-op retains only the still-matching record and never mints", () => {
    const previous = selectionWithBinding();
    // A no-op leaves the selection untouched: the retained record must still
    // match the unchanged selection (model and every recorded axis).
    const retained = applyUtilityPresetMutation(
      mutationInput(
        { kind: "family-noop" },
        {
          previous,
          next: { model: member, effort: "", fast: false },
        },
      ),
    );
    expect(retained.selectionBinding).toEqual(previous.selectionBinding);

    const staleOwnerPrevious = selectionWithBinding({
      selectionBinding: {
        version: 1,
        kind: "family-member",
        owner: { agentKind: "someone-else", presentationMode: "terminal" },
        model: member,
        inertValues: { effort: "", fast: false },
      },
    });
    const dropped = applyUtilityPresetMutation(
      mutationInput({ kind: "family-noop" }, { previous: staleOwnerPrevious }),
    );
    expect(Object.hasOwn(dropped, "selectionBinding")).toBe(false);
  });

  it("an independent carrier edit revokes the touched axis even at the same value", () => {
    const previous = selectionWithBinding();
    const next = applyUtilityPresetMutation(
      mutationInput(
        { kind: "carrier", axes: ["effort"] },
        // Same value, still revoked.
        { previous, next: { model: member, effort: "", fast: false } },
      ),
    );
    expect(next.selectionBinding?.inertValues).toEqual({ fast: false });
  });

  it("revoking the last recorded axis drops the record while actual carriers stay", () => {
    const previous = selectionWithBinding({
      selectionBinding: {
        version: 1,
        kind: "family-member",
        owner,
        model: member,
        inertValues: { effort: "" },
      },
    });
    const next = applyUtilityPresetMutation(
      mutationInput({ kind: "carrier", axes: ["effort"] }, { previous }),
    );
    expect(Object.hasOwn(next, "selectionBinding")).toBe(false);
    expect(next.effort).toBe("");
  });

  it("an independent fast edit on an unstamped preset stays unstamped", () => {
    const next = applyUtilityPresetMutation(
      mutationInput(
        { kind: "carrier", axes: ["fast"] },
        { next: { model: "m1", effort: "", fast: true } },
      ),
    );
    expect(next).toEqual({ model: "m1", effort: "", fast: true });
    expect(Object.hasOwn(next, "selectionBinding")).toBe(false);
  });

  it("refuses a family edit whose next model is not a member of the carried relation", () => {
    expect(() =>
      applyUtilityPresetMutation(
        mutationInput(
          { kind: "model", relation: terminalRelation },
          { next: { model: "not-a-member", effort: "", fast: false } },
        ),
      ),
    ).toThrow(SelectionBindingRefusalError);
  });
});
