import { describe, expect, it } from "vitest";
import { capabilitiesForPresentation } from "@/shared/agentSelection";
import {
  applyModelSelectionEdit,
  modelFamilyDisplayConfig,
  modelFamilyEfforts,
  modelFamilyFastAvailable,
  modelFamilyPickerModels,
  modelFamilySelectorOptions,
  projectModelFamilies,
} from "@/shared/modelFamilySelection";
import { capabilitiesForSessionConfig } from "@/shared/sessionConfigCapabilities";
import type { AgentCapability, ModelFamilySelection } from "@/shared/contracts";
import catalogFixture from "./fixtures/contracts/model-catalog-families.json";
import guiAcceptedFixture from "./fixtures/contracts/gui-accepted-models.json";
import { composeDevinDetectedCapabilities, devinDefaultCapabilities } from "./detection";
import { withDevinPresentationCapabilities } from "./presentationCapabilities";
import {
  DEVIN_FAMILY_LEAD_LABEL_KEY,
  DEVIN_FAMILY_LEAD_SELECTOR_ID,
  DEVIN_FAMILY_SIDEKICK_LABEL_KEY,
  DEVIN_FAMILY_SIDEKICK_SELECTOR_ID,
  devinGuiFamilySelections,
  devinTerminalFamilySelections,
} from "./modelFamilySelections";
import {
  devinModelCapabilities,
  parseDevinModelCatalog,
  resolveDevinAcpLaunchModel,
  resolveDevinModel,
  type DevinModelFamily,
} from "./models";

/**
 * Pinned sanitized native fixtures (Devin CLI 3000.11.3 checkpoints):
 * `model-catalog-families.json` is the full 54-family / 841-variant CLI
 * catalog (ids and labels only), `gui-accepted-models.json` the 123 raw ACP
 * accepted choices (62 Fusion pairs + 61 others). The exhaustive gates below
 * run against the real shape, not reduced samples.
 */
const families: DevinModelFamily[] = parseDevinModelCatalog(JSON.stringify(catalogFixture));
const acceptedModels: Array<{ id: string; label: string }> = guiAcceptedFixture.models;

const terminalSelections = devinTerminalFamilySelections(families);
const guiSelections = devinGuiFamilySelections(acceptedModels, families);

const fusionFamily = families.find((family) => family.label === "Fusion")!;
const fusionDefault = fusionFamily.variants[0]!.id;

/** Provider-side tuple key over the descriptor's encoded coordinates. */
function tupleOf(member: ModelFamilySelection["members"][number]): string {
  return [member.selections.lead, member.selections.sidekick, member.effort, member.fast].join("|");
}

describe("Devin Terminal family relation (exhaustive catalog)", () => {
  it("leaves pairs with ambiguous member labels reachable as exact raw choices", () => {
    const ambiguousFamily = families.find((family) => family.label === "Claude Fable 5.1")!;
    const conflictingVocabulary: DevinModelFamily = {
      ...ambiguousFamily,
      id: "conflicting-vocabulary",
      label: "Conflicting vocabulary",
      variants: ambiguousFamily.variants.map((variant) => ({
        ...variant,
        id: `conflicting-${variant.id}`,
      })),
    };
    const expanded = [...families, conflictingVocabulary];
    const relations = devinTerminalFamilySelections(expanded);
    expect(relations).toHaveLength(1);
    expect(
      relations[0]!.members.some((member) => member.selections.lead === ambiguousFamily.id),
    ).toBe(false);
    const capabilities = {
      ...devinDefaultCapabilities,
      ...devinModelCapabilities(expanded),
      modelFamilies: relations,
    };
    expect(modelFamilyPickerModels(capabilities).map((model) => model.id)).toContain(fusionDefault);
    expect(resolveDevinModel({ model: fusionDefault, effort: "", fast: false }, expanded)).toBe(
      fusionDefault,
    );
    const gui = devinGuiFamilySelections(acceptedModels, expanded);
    expect(gui[0]!.members.some((member) => member.model === fusionDefault)).toBe(false);
    expect(acceptedModels.some((model) => model.id === fusionDefault)).toBe(true);
  });

  it("compiles one Fusion descriptor with every catalog pair as a member", () => {
    expect(families).toHaveLength(54);
    expect(families.reduce((n, family) => n + family.variants.length, 0)).toBe(841);
    expect(terminalSelections).toHaveLength(1);
    const fusion = terminalSelections[0]!;
    expect(fusion.label).toBe("Fusion");
    expect(fusion.members).toHaveLength(575);
    expect(fusion.model).toBe(fusionDefault);
    expect(fusion.bindings).toEqual({ effort: "model", fast: "model" });
    for (const member of fusion.members) {
      expect(member.model).toMatch(/^fusion-/);
      expect(member.selections[DEVIN_FAMILY_LEAD_SELECTOR_ID]).toBeTruthy();
      expect(member.selections[DEVIN_FAMILY_SIDEKICK_SELECTOR_ID]).toBeTruthy();
      expect(member.effort).toBeTruthy();
      expect(typeof member.fast).toBe("boolean");
    }
    // Selector labels are app-owned shared keys; option labels are native text.
    expect(fusion.selectors.map((selector) => selector.labelKey)).toEqual([
      DEVIN_FAMILY_LEAD_LABEL_KEY,
      DEVIN_FAMILY_SIDEKICK_LABEL_KEY,
    ]);
  });

  it("round-trips every tuple to its exact original UID (injective, never reconstructed)", () => {
    const fusion = terminalSelections[0]!;
    const byTuple = new Map(fusion.members.map((member) => [tupleOf(member), member.model]));
    // Injective: 575 members, 575 distinct tuples.
    expect(byTuple.size).toBe(575);
    for (const member of fusion.members) {
      expect(byTuple.get(tupleOf(member))).toBe(member.model);
    }
  });

  it("declares the full coordinate axes with native labels", () => {
    const [lead, sidekick] = terminalSelections[0]!.selectors;
    expect(lead!.options).toHaveLength(8);
    expect(sidekick!.options).toHaveLength(8);
    // SWE-2 Medium and SWE-2 High are DISTINCT sidekick options.
    const sidekickLabels = sidekick!.options.map((option) => option.label);
    expect(sidekickLabels).toContain("SWE-2 Medium");
    expect(sidekickLabels).toContain("SWE-2 High");
    expect(new Set(sidekick!.options.map((option) => option.id)).size).toBe(8);
    const efforts = new Set(terminalSelections[0]!.members.map((member) => member.effort));
    expect([...efforts].sort()).toEqual(["high", "low", "max", "medium", "xhigh"]);
    const fastStates = new Set(terminalSelections[0]!.members.map((member) => member.fast));
    expect(fastStates).toEqual(new Set([true, false]));
  });

  it("leaves exactly 65 declared-grid holes and 45 members without an opposite-Fast sibling", () => {
    const fusion = terminalSelections[0]!;
    const byTuple = new Set(fusion.members.map(tupleOf));
    const leads = fusion.selectors[0]!.options.map((option) => option.id);
    const sidekicks = fusion.selectors[1]!.options.map((option) => option.id);
    const efforts = [...new Set(fusion.members.map((member) => member.effort!))];
    let holes = 0;
    for (const lead of leads)
      for (const sidekick of sidekicks)
        for (const effort of efforts)
          for (const fast of [true, false])
            if (!byTuple.has([lead, sidekick, effort, fast].join("|"))) holes++;
    expect(holes).toBe(65);
    const noFastSibling = fusion.members.filter(
      (member) =>
        !byTuple.has(
          [member.selections.lead, member.selections.sidekick, member.effort, !member.fast].join(
            "|",
          ),
        ),
    );
    expect(noFastSibling).toHaveLength(45);
  });

  it("keeps all 575 members reachable from the default through single-axis transitions", () => {
    const fusion = terminalSelections[0]!;
    const byTuple = new Set(fusion.members.map(tupleOf));
    const byTupleMember = new Map(fusion.members.map((member) => [tupleOf(member), member]));
    const defaultMember = fusion.members.find((candidate) => candidate.model === fusion.model)!;
    const seen = new Set([tupleOf(defaultMember)]);
    const queue = [defaultMember];
    while (queue.length > 0) {
      const member = queue.shift()!;
      const neighbors: string[] = [];
      for (const option of fusion.selectors[0]!.options)
        neighbors.push(
          [option.id, member.selections.sidekick, member.effort, member.fast].join("|"),
        );
      for (const option of fusion.selectors[1]!.options)
        neighbors.push([member.selections.lead, option.id, member.effort, member.fast].join("|"));
      for (const effort of ["low", "medium", "high", "xhigh", "max"])
        neighbors.push(
          [member.selections.lead, member.selections.sidekick, effort, member.fast].join("|"),
        );
      neighbors.push(
        [member.selections.lead, member.selections.sidekick, member.effort, !member.fast].join("|"),
      );
      for (const neighbor of neighbors)
        if (byTuple.has(neighbor) && !seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(byTupleMember.get(neighbor)!);
        }
    }
    expect(seen.size).toBe(575);
  });

  it("resolves the canonical Terminal edit patch to the exact UID for every member", () => {
    const fusion = terminalSelections[0]!;
    for (const member of fusion.members) {
      // The shared helper's atomic patch for a model-bound family.
      expect(
        resolveDevinModel(
          { model: member.model, effort: "", fast: false, thinking: false, contextSize: "" },
          families,
        ),
      ).toBe(member.model);
    }
  });

  it("keeps meaningful legacy Terminal overrides rejected and GUI carriers independent", () => {
    const fusion = terminalSelections[0]!;
    const plain = fusion.members.find((member) => !member.fast)!;
    const fast = fusion.members.find((member) => member.fast)!;
    expect(() => resolveDevinModel({ model: plain.model, effort: "high" }, families)).toThrow(
      "Unsupported model configuration",
    );
    expect(() => resolveDevinModel({ model: plain.model, fast: true }, families)).toThrow(
      "Unsupported model configuration",
    );
    expect(() => resolveDevinModel({ model: fast.model, fast: false }, families)).not.toThrow();
    // A GUI pair with independent effort/Fast carriers launches the exact pair.
    expect(
      resolveDevinAcpLaunchModel(families, { model: fast.model, effort: "low", fast: true }),
    ).toBe(fast.model);
    expect(
      resolveDevinAcpLaunchModel(families, { model: plain.model, effort: "max", fast: false }),
    ).toBe(plain.model);
  });

  it("keeps SWE-1.6 Fast a product name, never a parsed Fast toggle", () => {
    const sweFast = families
      .find((family) => family.label === "SWE-1.6 Fast")!
      .variants.find((variant) => variant.id === "swe-1-6-fast")!;
    expect(sweFast.fast).toBe(false);
    expect(sweFast.composite).toBeUndefined();
    // Its product name resolves as a sidekick half with NO Fast contribution.
    const catalog = parseDevinModelCatalog(
      JSON.stringify({
        families: [
          ...catalogFixture.families.filter((family) => family.family_label !== "Fusion"),
          {
            family_label: "Fusion",
            slug: "fusion",
            variants: [
              {
                model_uid: "fusion-claude-fable-5-1-medium-sidekick-swe-1-6-fast",
                label: "Fusion (Claude Fable 5.1 Medium + SWE-1.6 Fast)",
              },
              // An effort-less lead carries no complete coordinate: the member
              // stays undecoded (raw fallback), not a fabricated effort.
              {
                model_uid: "fusion-swe-1-6-fast-lead-sidekick-swe-2-medium",
                label: "Fusion (SWE-1.6 Fast + SWE-2 Medium)",
              },
            ],
          },
        ],
      }),
    );
    const selection = devinTerminalFamilySelections(catalog)[0]!;
    const member = selection.members.find(
      (candidate) => candidate.model === "fusion-claude-fable-5-1-medium-sidekick-swe-1-6-fast",
    )!;
    expect(member.selections.sidekick).toBe("swe-1-6-fast");
    expect(member.fast).toBe(false);
    expect(member.effort).toBe("medium");
    expect(
      selection.members.some(
        (candidate) => candidate.model === "fusion-swe-1-6-fast-lead-sidekick-swe-2-medium",
      ),
    ).toBe(false);
  });

  it("drops the whole descriptor when two variants decode to the same tuple", () => {
    const catalog = parseDevinModelCatalog(
      JSON.stringify({
        families: [
          {
            family_label: "SWE-2",
            slug: "swe-2",
            variants: [{ model_uid: "swe-2-medium", label: "SWE-2 Medium" }],
          },
          {
            family_label: "Fusion",
            slug: "fusion",
            variants: [
              { model_uid: "fusion-a", label: "Fusion (SWE-2 Medium + SWE-2 Medium)" },
              // A second UID claiming the same pair is a producer bug.
              { model_uid: "fusion-b", label: "Fusion (SWE-2 Medium + SWE-2 Medium)" },
            ],
          },
        ],
      }),
    );
    expect(devinTerminalFamilySelections(catalog)).toEqual([]);
  });
});

describe("Devin Terminal capability projection", () => {
  const caps = devinModelCapabilities(families);

  it("keeps the raw compatible inventory (628 rows) untouched", () => {
    expect(caps.models).toHaveLength(628); // 53 regular family rows + 575 pairs
    expect(caps.models[0]!.id).toBe(families[0]!.id);
  });

  it("removes the wrong legacy Fusion Fast declaration and keeps regular Fast support", () => {
    expect(caps.fastModels).not.toContain(fusionDefault);
    // A regular family whose variants include Fast models keeps its entry.
    const opusFamily = families.find((family) => family.label === "Claude Opus 5.5")!;
    expect(caps.fastModels).toContain(opusFamily.id);
    // SWE-1.6 Fast has no Fast CONTROL (the name IS the product).
    expect(caps.fastModels).not.toContain("swe-1-6-fast");
  });
});

describe("Devin GUI family relation (accepted inventory)", () => {
  it("compiles exactly the 62 accepted pairs with independent native controls", () => {
    expect(guiSelections).toHaveLength(1);
    const fusion = guiSelections[0]!;
    expect(fusion.label).toBe("Fusion");
    expect(fusion.members).toHaveLength(62);
    expect(fusion.bindings).toEqual({ effort: "config", fast: "config" });
    const acceptedIds = new Set(acceptedModels.map((model) => model.id));
    const pairs = new Set<string>();
    for (const member of fusion.members) {
      expect(acceptedIds.has(member.model)).toBe(true);
      expect(member.effort).toBeUndefined();
      expect(member.fast).toBeUndefined();
      pairs.add(`${member.selections.lead}|${member.selections.sidekick}`);
    }
    expect(pairs.size).toBe(62);
    // The default follows the live accepted menu (its first pair row).
    expect(fusion.model).toBe("fusion-claude-fable-5-1-medium-sidekick-swe-2-medium");
  });

  it("never manufactures the two absent self-pairs", () => {
    const fusion = guiSelections[0]!;
    const pairs = new Set(
      fusion.members.map((member) => `${member.selections.lead}|${member.selections.sidekick}`),
    );
    expect(pairs.has("claude-sonnet-5-5-medium|claude-sonnet-5-5-medium")).toBe(false);
    expect(pairs.has("gpt-5-6-sol-none|gpt-5-6-sol-high")).toBe(false);
  });

  it("keeps the 61 other accepted choices out of the relation", () => {
    const fusion = guiSelections[0]!;
    const memberIds = new Set(fusion.members.map((member) => member.model));
    const fusionIds = new Set(
      acceptedModels.filter((model) => model.label.includes("Fusion")).map((model) => model.id),
    );
    expect(memberIds).toEqual(fusionIds);
    expect(fusionIds.size).toBe(62);
  });

  it("narrows with a reduced live menu and never widens the accepted set", () => {
    const reduced = acceptedModels.filter(
      (model) => !model.label.includes("Claude Haiku 5.5 Medium"),
    );
    const selection = devinGuiFamilySelections(reduced, families)[0]!;
    expect(selection.members).toHaveLength(62 - 8);
    // The removed sidekick choice disappears from the options entirely.
    const sidekick = selection.selectors.find(
      (selector) => selector.id === DEVIN_FAMILY_SIDEKICK_SELECTOR_ID,
    )!;
    expect(sidekick.options.map((option) => option.label)).not.toContain("Claude Haiku 5.5 Medium");
    for (const member of selection.members) {
      expect(reduced.some((model) => model.id === member.model)).toBe(true);
    }
  });

  it("decodes a future pair from its label and leaves unreadable rows raw", () => {
    // A pair the catalog does not know yet, accepted by the live session.
    // SWE-2 Max is a real catalog member no accepted pair uses today.
    const future = [
      ...acceptedModels,
      {
        id: "fusion-future-lead-sidekick-swe-2-max",
        label: "Fusion (Claude Fable 5.1 Low + SWE-2 Max)",
      },
      { id: "fusion-garbage", label: "Fusion (Mystery Lead + ??? Sidekick)" },
    ];
    const selection = devinGuiFamilySelections(future, families)[0]!;
    const member = selection.members.find(
      (candidate) => candidate.model === "fusion-future-lead-sidekick-swe-2-max",
    );
    expect(member).toMatchObject({
      selections: expect.objectContaining({ sidekick: "swe-2-max" }),
    });
    // Unreadable rows stay out (raw fallback) without dropping the descriptor.
    expect(selection.members.some((candidate) => candidate.model === "fusion-garbage")).toBe(false);
    expect(selection.members).toHaveLength(63);
  });

  it("returns no relation without a catalog, without a composite family, or on contradiction", () => {
    expect(devinGuiFamilySelections(acceptedModels, [])).toEqual([]);
    const noFusion: DevinModelFamily[] = parseDevinModelCatalog(
      JSON.stringify({
        families: catalogFixture.families.filter((family) => family.family_label !== "Fusion"),
      }),
    );
    expect(devinGuiFamilySelections(acceptedModels, noFusion)).toEqual([]);
    // Two accepted rows decoding to the SAME pair contradict the inventory.
    const contradictory = [
      { id: "fusion-a", label: "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)" },
      { id: "fusion-b", label: "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)" },
      ...acceptedModels.filter((model) => !model.label.includes("Fusion")),
    ];
    expect(devinGuiFamilySelections(contradictory, families)).toEqual([]);
    expect(devinTerminalFamilySelections([])).toEqual([]);
  });
});

describe("shared projection over the compiled relation", () => {
  const terminalCapabilities = {
    ...devinModelCapabilities(families),
    modelFamilies: terminalSelections,
  } as AgentCapability;
  // The folded GUI surface: the shared projection/edit helpers read the ROOT
  // relation, so this simulates `capabilitiesForPresentation(capabilities,
  // "gui")` where the override's own declared relation has replaced the root.
  const guiCapabilities = {
    models: acceptedModels,
    efforts: ["medium", "high", "max"],
    modelEfforts: {},
    modelFamilies: guiSelections,
  } as unknown as AgentCapability;

  it("collapses the 628-row terminal list to 54 family rows with one Fusion entry", () => {
    const rows = modelFamilyPickerModels(terminalCapabilities);
    expect(rows).toHaveLength(54);
    const fusionRow = rows.find((row) => row.label === "Fusion");
    expect(fusionRow?.id).toBe(fusionDefault);
    // No member row leaks into the visible list; other families stay exact.
    const fusion = terminalSelections[0]!;
    for (const member of fusion.members) {
      if (member.model === fusionDefault) continue;
      expect(rows.some((row) => row.id === member.model)).toBe(false);
    }
    expect(projectModelFamilies(terminalCapabilities)).toHaveLength(1);
  });

  it("resolves selector, effort and fast edits to atomic exact patches — holes stay null", () => {
    const fusion = terminalSelections[0]!;
    const member = fusion.members.find((candidate) => candidate.model !== fusion.model)!;
    const config = { model: member.model, effort: "", fast: false };
    // Same lead+sidekick+fast, different effort that EXISTS: atomic patch.
    const siblingEffort = fusion.members.find(
      (candidate) =>
        candidate.model !== member.model &&
        candidate.selections.lead === member.selections.lead &&
        candidate.selections.sidekick === member.selections.sidekick &&
        candidate.fast === member.fast,
    )!;
    expect(
      applyModelSelectionEdit(terminalCapabilities, config, {
        kind: "effort",
        value: siblingEffort.effort!,
      }),
    ).toEqual({ model: siblingEffort.model, effort: "", fast: false });
    // A hole stays a hole: a member without an opposite-Fast sibling (45 exist)
    // rejects a Fast edit instead of synthesizing a sibling.
    const noSibling = fusion.members.find(
      (candidate) =>
        !fusion.members.some(
          (other) =>
            other.selections.lead === candidate.selections.lead &&
            other.selections.sidekick === candidate.selections.sidekick &&
            other.effort === candidate.effort &&
            other.fast !== candidate.fast,
        ),
    );
    expect(noSibling).toBeDefined();
    expect(
      applyModelSelectionEdit(
        terminalCapabilities,
        { model: noSibling!.model, effort: "", fast: false },
        { kind: "fast", value: !noSibling!.fast },
      ),
    ).toBeNull();
    // A lead selector edit keeps the other axes and lands on the exact member.
    const leadEditable = fusion.members.find((candidate) =>
      fusion.members.some(
        (target) =>
          target.selections.lead !== candidate.selections.lead &&
          target.selections.sidekick === candidate.selections.sidekick &&
          target.effort === candidate.effort &&
          target.fast === candidate.fast,
      ),
    );
    expect(leadEditable).toBeDefined();
    const leadTarget = fusion.members.find(
      (target) =>
        target.selections.lead !== leadEditable!.selections.lead &&
        target.selections.sidekick === leadEditable!.selections.sidekick &&
        target.effort === leadEditable!.effort &&
        target.fast === leadEditable!.fast,
    )!;
    const otherLead = fusion.selectors[0]!.options.find(
      (option) =>
        option.id !== leadEditable!.selections.lead && option.id === leadTarget.selections.lead,
    )!;
    expect(
      applyModelSelectionEdit(
        terminalCapabilities,
        { model: leadEditable!.model, effort: "", fast: false },
        {
          kind: "selector",
          selectorId: DEVIN_FAMILY_LEAD_SELECTOR_ID,
          value: otherLead.id,
        },
      ),
    ).toEqual({ model: leadTarget.model, effort: "", fast: false });
    // Unreachable options are filtered, not offered as holes: some member's
    // cell reaches only a subset of the leads.
    const restricted = fusion.members.find(
      (candidate) =>
        fusion.selectors[0]!.options.filter((option) =>
          fusion.members.some(
            (target) =>
              target.selections.lead === option.id &&
              target.selections.sidekick === candidate.selections.sidekick &&
              target.effort === candidate.effort &&
              target.fast === candidate.fast,
          ),
        ).length < fusion.selectors[0]!.options.length,
    );
    expect(restricted).toBeDefined();
    const reachable = modelFamilySelectorOptions(
      terminalCapabilities,
      { model: restricted!.model, effort: "", fast: false },
      DEVIN_FAMILY_LEAD_SELECTOR_ID,
    );
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.length).toBeLessThan(fusion.selectors[0]!.options.length);
  });

  it("disables Fast where no opposite-Fast sibling exists and offers it where one does", () => {
    const fusion = terminalSelections[0]!;
    const hasSibling = (candidate: ModelFamilySelection["members"][number]): boolean =>
      fusion.members.some(
        (other) =>
          other.selections.lead === candidate.selections.lead &&
          other.selections.sidekick === candidate.selections.sidekick &&
          other.effort === candidate.effort &&
          other.fast !== candidate.fast,
      );
    const noSibling = fusion.members.find((candidate) => !hasSibling(candidate));
    expect(noSibling).toBeDefined(); // 45 such members on the captured catalog
    expect(
      modelFamilyFastAvailable(terminalCapabilities, {
        model: noSibling!.model,
        effort: "",
        fast: false,
      }),
    ).toBe(false);
    const withSibling = fusion.members.find(hasSibling)!;
    expect(
      modelFamilyFastAvailable(terminalCapabilities, {
        model: withSibling.model,
        effort: "",
        fast: false,
      }),
    ).toBe(true);
  });

  it("derives the displayed view from the UID and keeps meaningful overrides on the raw path", () => {
    const fusion = terminalSelections[0]!;
    const member = fusion.members[0]!;
    // Inert stored seeds display the UID-derived coordinates — never written back.
    expect(
      modelFamilyDisplayConfig(terminalCapabilities, {
        model: member.model,
        effort: "",
        fast: false,
      }),
    ).toEqual({ model: member.model, effort: member.effort, fast: member.fast });
    // A meaningful stored effort is NOT reinterpreted as a tuple request.
    expect(
      modelFamilyDisplayConfig(terminalCapabilities, { model: member.model, effort: "high" }),
    ).toBeUndefined();
  });

  it("projects the GUI relation over the accepted menu without widening it", () => {
    const projected = projectModelFamilies(guiCapabilities);
    expect(projected).toHaveLength(1);
    expect(projected[0]!.members).toHaveLength(62);
    // Picker: 62 visible rows (61 others + one Fusion family row).
    const rows = modelFamilyPickerModels(guiCapabilities);
    expect(rows).toHaveLength(62);
    expect(rows.some((row) => row.label === "Fusion")).toBe(true);
    // GUI Fast stays on the independent native select, not the relation.
    expect(
      modelFamilyFastAvailable(guiCapabilities, {
        model: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
      }),
    ).toBe(false);
    // A selector edit patches ONLY the model — independent carriers untouched.
    const fusion = projected[0]!;
    const editable = fusion.members.find((candidate) =>
      fusion.members.some(
        (target) =>
          target.selections.lead === candidate.selections.lead &&
          target.selections.sidekick !== candidate.selections.sidekick,
      ),
    );
    expect(editable).toBeDefined();
    const target = fusion.members.find(
      (candidate) =>
        candidate.selections.lead === editable!.selections.lead &&
        candidate.selections.sidekick !== editable!.selections.sidekick,
    )!;
    const otherSidekick = fusion.selectors[1]!.options.find(
      (option) => option.id === target.selections.sidekick,
    )!;
    expect(
      applyModelSelectionEdit(
        guiCapabilities,
        { model: editable!.model },
        {
          kind: "selector",
          selectorId: DEVIN_FAMILY_SIDEKICK_SELECTOR_ID,
          value: otherSidekick.id,
        },
      ),
    ).toEqual({ model: target.model });
  });
});

describe("detection composition attaches per-surface relations", () => {
  // The live negotiated shape: 123 accepted choices (62 pairs + 61 others),
  // the global thought-level ladder, no per-pair effort entries.
  const probe = {
    models: acceptedModels,
    efforts: ["medium", "high", "max"],
    defaultEffort: "high",
    modelEfforts: {} as Record<string, string[]>,
    fastModels: [] as string[],
    thinkingModels: [] as string[],
    contextSizes: [{ id: "default", label: "Default" }],
    modelContextSizes: {} as Record<string, string[]>,
  };
  const composed = composeDevinDetectedCapabilities(probe, families);

  it("attaches the 575-member Terminal relation to the base capability", () => {
    const base = composed.modelFamilies!;
    expect(base).toHaveLength(1);
    expect(base[0]!.members).toHaveLength(575);
    expect(base[0]!.bindings).toEqual({ effort: "model", fast: "model" });
    // The raw compatible inventory stays the selection authority.
    expect(composed.models).toHaveLength(628);
  });

  it("attaches the 62-member accepted relation to the GUI override, never the CLI one", () => {
    const gui = composed.presentationCapabilities?.gui;
    expect(gui).toBeDefined();
    const overrideFamilies = (gui as { modelFamilies?: ModelFamilySelection[] }).modelFamilies!;
    expect(overrideFamilies).toHaveLength(1);
    expect(overrideFamilies[0]!.members).toHaveLength(62);
    expect(overrideFamilies[0]!.bindings).toEqual({ effort: "config", fast: "config" });
    const capabilities = withDevinPresentationCapabilities(composed as AgentCapability);
    // Folding each surface keeps the relation surface-scoped: the shared fold
    // strips the root, so GUI sees only its accepted 62-member relation while
    // Terminal keeps the full catalog table.
    const guiFold = { ...capabilities, ...capabilities.presentationCapabilities!.gui };
    expect((guiFold.modelFamilies ?? [])[0]!.members).toHaveLength(62);
    expect(capabilities.modelFamilies![0]!.members).toHaveLength(575);
  });

  it("keeps the catalog-fallback GUI off the model-bound Terminal relation and shields unlabeled overrides", () => {
    // No negotiated menu: the GUI falls back to the catalog's ordinary raw
    // models and native controls. The base relation is model-bound
    // (Terminal), so a probe enrichment gap must not install it here —
    // before live narrowing it would offer CLI-only pairs, and after
    // narrowing the surviving model-bound bindings would hide the native
    // Effort/Fast controls.
    const catalogOnly = composeDevinDetectedCapabilities(undefined, families);
    expect(catalogOnly.modelFamilies![0]!.members).toHaveLength(575);
    expect(catalogOnly.presentationCapabilities).toBeUndefined();
    const folded = withDevinPresentationCapabilities(catalogOnly as AgentCapability);
    const gui = capabilitiesForPresentation(folded, "gui");
    expect(gui.modelFamilies).toBeUndefined();
    expect(projectModelFamilies(gui)).toEqual([]);
    // Terminal keeps the full relation and its raw inventory untouched.
    const terminal = capabilitiesForPresentation(folded, "terminal");
    expect(terminal.modelFamilies![0]!.members).toHaveLength(575);
    expect(terminal.models).toHaveLength(628);
    // A hand-built override that does not declare the relation is shielded:
    // the CLI-wide table is never inherited.
    const unlabeled = withDevinPresentationCapabilities({
      ...devinDefaultCapabilities,
      models: acceptedModels,
      modelFamilies: catalogOnly.modelFamilies,
      presentationCapabilities: { gui: { models: acceptedModels, efforts: [] } },
    } as never);
    expect(unlabeled.presentationCapabilities?.gui?.modelFamilies).toEqual([]);
    // No relation at the root: nothing is invented (the static baseline
    // override exists without the field, so the shield keeps it empty).
    const bare = withDevinPresentationCapabilities(devinDefaultCapabilities);
    expect(bare.modelFamilies).toBeUndefined();
    expect(bare.presentationCapabilities?.gui?.modelFamilies).toEqual([]);
  });

  it("recovers the native Effort/Fast controls when the live inventory arrives after a probe gap", () => {
    const catalogOnly = composeDevinDetectedCapabilities(undefined, families);
    const folded = withDevinPresentationCapabilities(catalogOnly as AgentCapability);
    const gui = capabilitiesForPresentation(folded, "gui");
    const current = "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium";
    // The live session inventory narrows the model menu to the accepted
    // choices and carries the native five-level ladder and Fast select.
    const live = capabilitiesForSessionConfig(gui, [
      {
        type: "select",
        id: "model",
        role: "model",
        currentValue: current,
        values: acceptedModels.map((model) => ({ value: model.id, name: model.label })),
        groups: [],
      },
      {
        type: "select",
        id: "thought_level",
        role: "effort",
        name: "Thinking",
        currentValue: "high",
        values: ["low", "medium", "high", "xhigh", "max"].map((value) => ({ value })),
        groups: [],
      },
      {
        type: "select",
        id: "speed",
        role: "fast",
        name: "Speed",
        currentValue: "standard",
        values: [
          { value: "standard", name: "Standard" },
          { value: "fast", name: "Fast" },
        ],
        groups: [],
      },
    ]);
    // The narrowed live inventory never resurrects a family UI from the
    // fallback — no CLI-only relation, no family row at all.
    expect(live.modelFamilies).toBeUndefined();
    expect(projectModelFamilies(live)).toEqual([]);
    expect(modelFamilyPickerModels(live)).toHaveLength(acceptedModels.length);
    // The native ordinary controls survive the enrichment gap unchanged.
    expect(modelFamilyEfforts(live, { model: current })).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(modelFamilyFastAvailable(live, { model: current })).toBe(true);
  });
});

it("declares cold inert seeds only on the Terminal family relations", () => {
  expect(terminalSelections.length).toBeGreaterThan(0);
  for (const relation of terminalSelections)
    expect(relation.redundantValues).toEqual({
      effort: ["", "default"],
      fast: [false],
      thinking: [false],
      contextSize: ["", "default"],
    });
  expect(guiSelections.length).toBeGreaterThan(0);
  for (const relation of guiSelections) expect(relation).not.toHaveProperty("redundantValues");
});
