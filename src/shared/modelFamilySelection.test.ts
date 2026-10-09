import { describe, expect, it } from "vitest";
import type { AgentCapability, ModelFamilySelection } from "./contracts";
import {
  applyModelSelectionEdit,
  modelFamilyDisplayConfig,
  modelFamilyEfforts,
  modelFamilyFastAvailable,
  modelFamilyForModel,
  modelFamilyPickerModels,
  modelFamilySelectorOptions,
  projectModelFamilies,
  resolveFamilyPresentationTransition,
} from "./modelFamilySelection";

/**
 * Neutral toy relations. Two independent selectors with holes, one family
 * binding both encoded controls to the member UID and one binding them to the
 * saved config — no provider payload appears anywhere in this suite.
 */

/** Members are (lead, mate, effort, fast) tuples; alpha/beta/high/fast is a hole. */
const duoMembers: ModelFamilySelection["members"] = [
  {
    model: "duo-alpha-beta",
    selections: { lead: "alpha", mate: "beta" },
    effort: "low",
    fast: false,
  },
  {
    model: "duo-alpha-beta-fast",
    selections: { lead: "alpha", mate: "beta" },
    effort: "low",
    fast: true,
  },
  {
    model: "duo-alpha-beta-hi",
    selections: { lead: "alpha", mate: "beta" },
    effort: "high",
    fast: false,
  },
  {
    model: "duo-bravo-beta",
    selections: { lead: "bravo", mate: "beta" },
    effort: "low",
    fast: false,
  },
  {
    model: "duo-bravo-delta",
    selections: { lead: "bravo", mate: "delta" },
    effort: "low",
    fast: false,
  },
];

const duoFamily: ModelFamilySelection = {
  model: "duo-alpha-beta",
  label: "Duo",
  selectors: [
    {
      id: "lead",
      labelKey: "modelSelection.lead",
      options: [
        { id: "alpha", label: "Alpha" },
        { id: "bravo", label: "Bravo" },
      ],
    },
    {
      id: "mate",
      labelKey: "modelSelection.sidekick",
      options: [
        { id: "beta", label: "Beta" },
        { id: "delta", label: "Delta" },
      ],
    },
  ],
  bindings: { effort: "model", fast: "model" },
  members: duoMembers,
};

/** Independent-carrier relation: members carry selector coordinates only. */
const pairFamily: ModelFamilySelection = {
  model: "pair-charlie-beta",
  label: "Pair",
  selectors: [
    {
      id: "lead",
      labelKey: "modelSelection.lead",
      options: [
        { id: "charlie", label: "Charlie" },
        { id: "echo", label: "Echo" },
      ],
    },
    {
      id: "mate",
      labelKey: "modelSelection.sidekick",
      options: [
        { id: "beta", label: "Beta" },
        { id: "delta", label: "Delta" },
      ],
    },
  ],
  bindings: { effort: "config", fast: "config" },
  members: [
    { model: "pair-charlie-beta", selections: { lead: "charlie", mate: "beta" }, effort: "high" },
    { model: "pair-charlie-delta", selections: { lead: "charlie", mate: "delta" } },
    { model: "pair-echo-beta", selections: { lead: "echo", mate: "beta" } },
    { model: "pair-echo-delta", selections: { lead: "echo", mate: "delta" } },
  ],
};

const duoIds = [
  "duo-alpha-beta",
  "duo-alpha-beta-fast",
  "duo-alpha-beta-hi",
  "duo-bravo-beta",
  "duo-bravo-delta",
];
const pairIds = ["pair-charlie-beta", "pair-charlie-delta", "pair-echo-beta", "pair-echo-delta"];

function capability(overrides?: Partial<AgentCapability>): AgentCapability {
  return {
    models: [
      { id: "solo", label: "Solo" },
      ...duoIds.map((id) => ({ id, label: id })),
      ...pairIds.map((id) => ({ id, label: id })),
    ],
    efforts: ["low", "high"],
    modelEfforts: { solo: ["low", "high"] },
    fastModels: ["solo"],
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
    modelFamilies: [duoFamily, pairFamily],
    ...overrides,
  };
}

describe("model family projection", () => {
  it("keeps one owner per member and leaves an overlapping family on the raw fallback", () => {
    const capabilities = capability({
      modelFamilies: [
        duoFamily,
        {
          ...pairFamily,
          members: pairFamily.members.map((member, index) =>
            index === 1 ? { ...member, model: "duo-alpha-beta" } : member,
          ),
        },
      ],
    });
    expect(projectModelFamilies(capabilities).map((family) => family.label)).toEqual(["Duo"]);
    expect(modelFamilyForModel(capabilities, "duo-alpha-beta")?.label).toBe("Duo");
    expect(modelFamilyForModel(capabilities, "pair-charlie-beta")).toBeUndefined();
    expect(modelFamilyPickerModels(capabilities).map((model) => model.id)).toContain(
      "pair-charlie-beta",
    );
  });

  it("passes valid descriptors through and keeps raw models untouched", () => {
    const capabilities = capability();
    const families = projectModelFamilies(capabilities);
    expect(families.map((family) => family.label)).toEqual(["Duo", "Pair"]);
    expect(families[0]!.members).toHaveLength(5);
    expect(families[1]!.members).toHaveLength(4);
    // The raw inventory stays the compatible selection authority.
    expect(capabilities.models.map((model) => model.id)).toContain("duo-alpha-beta-fast");
    expect(projectModelFamilies({ ...capability(), modelFamilies: undefined })).toEqual([]);
  });

  it("preserves a declared redundantValues verbatim and omits it when undeclared", () => {
    // The surface-scoped declaration is preserved by the neutral projector so
    // downstream mint/cold-policy consumers see exactly what the provider
    // declared; an undeclared relation projects no invented field.
    const declared = {
      effort: ["", "default"],
      fast: [false],
      thinking: [false],
      contextSize: ["", "default"],
    };
    const families = projectModelFamilies(
      capability({
        modelFamilies: [{ ...duoFamily, redundantValues: { ...declared } }, pairFamily],
      }),
    );
    expect(families.map((family) => family.label)).toEqual(["Duo", "Pair"]);
    expect(families[0]!.redundantValues).toEqual(declared);
    expect(Object.hasOwn(families[1]!, "redundantValues")).toBe(false);
    // The declaration survives the lookup paths too, since they share the
    // same projection.
    const capabilities = capability({
      modelFamilies: [{ ...duoFamily, redundantValues: { effort: ["low"] } }],
    });
    expect(modelFamilyForModel(capabilities, "duo-alpha-beta")?.redundantValues).toEqual({
      effort: ["low"],
    });
  });

  it("drops invalid descriptors instead of surfacing half a relation", () => {
    // Malformed wire data can bypass the compile-time narrowing, so invalid
    // shapes are injected through the same lens a schema cast would produce.
    const raw = (family: Record<string, unknown>): ModelFamilySelection =>
      family as unknown as ModelFamilySelection;
    const broken: Array<ModelFamilySelection> = [
      // duplicate tuple
      {
        ...duoFamily,
        members: [...duoMembers, { ...duoMembers[0]!, model: "duo-copy" }],
      },
      // duplicate member UID
      { ...duoFamily, members: [...duoMembers, { ...duoMembers[0]! }] },
      // model-bound effort missing on one member
      {
        ...duoFamily,
        members: duoMembers.map((member, index) =>
          index === 1 ? { ...member, effort: undefined } : member,
        ),
      },
      // unknown labelKey (invalid on the wire even though the type forbids it)
      raw({
        ...duoFamily,
        selectors: [
          { ...duoFamily.selectors[0]!, labelKey: "nope.missing" },
          duoFamily.selectors[1]!,
        ],
      }),
      // model-bound fast missing on one member
      {
        ...duoFamily,
        members: duoMembers.map((member, index) =>
          index === 1 ? { ...member, fast: undefined } : member,
        ),
      },
      // member misses a declared selector
      {
        ...duoFamily,
        members: [{ model: "duo-x", selections: { lead: "alpha" }, effort: "low", fast: false }],
      },
      // member carries an undeclared selector
      {
        ...duoFamily,
        members: [
          {
            model: "duo-x",
            selections: { lead: "alpha", mate: "beta", ghost: "zeta" },
            effort: "low",
            fast: false,
          },
        ],
      },
      // option value outside its selector
      {
        ...duoFamily,
        members: [
          {
            model: "duo-x",
            selections: { lead: "ghost", mate: "beta" },
            effort: "low",
            fast: false,
          },
        ],
      },
      // empty relation
      { ...duoFamily, members: [] },
      // no member in the accepted inventory
      {
        ...duoFamily,
        members: [
          {
            model: "elsewhere",
            selections: { lead: "alpha", mate: "beta" },
            effort: "low",
            fast: false,
          },
        ],
      },
    ];
    for (const family of broken) {
      expect(projectModelFamilies(capability({ modelFamilies: [family] }))).toEqual([]);
    }
  });

  it("intersects members with the raw accepted inventory and substitutes the default", () => {
    const reduced = capability({
      models: [{ id: "solo", label: "Solo" }, ...duoIds.slice(1).map((id) => ({ id, label: id }))],
    });
    const [duo] = projectModelFamilies(reduced);
    expect(duo!.members.map((member) => member.model)).toEqual([
      "duo-alpha-beta-fast",
      "duo-alpha-beta-hi",
      "duo-bravo-beta",
      "duo-bravo-delta",
    ]);
    // The declared default left the inventory: the projection substitutes a
    // real member without rewriting the input descriptor.
    expect(duo!.model).toBe("duo-alpha-beta-fast");
    expect(reduced.modelFamilies![0]!.model).toBe("duo-alpha-beta");
  });

  it("drops a later family whose representative collides with an earlier row", () => {
    const families = projectModelFamilies(
      capability({
        modelFamilies: [
          duoFamily,
          {
            ...pairFamily,
            model: "duo-alpha-beta",
            members: [duoMembers[0]!, ...pairFamily.members],
          },
        ],
      }),
    );
    expect(families.map((family) => family.label)).toEqual(["Duo"]);
  });

  it("rejects a descriptor default that is not one of its own members", () => {
    expect(
      projectModelFamilies(
        capability({ modelFamilies: [{ ...pairFamily, model: "duo-alpha-beta" }] }),
      ),
    ).toEqual([]);
  });

  it("drops coordinates a binding does not own", () => {
    const [duo, pair] = projectModelFamilies(capability());
    expect(duo!.members[0]).toEqual({
      model: "duo-alpha-beta",
      selections: { lead: "alpha", mate: "beta" },
      effort: "low",
      fast: false,
    });
    expect(pair!.members[0]).toEqual({
      model: "pair-charlie-beta",
      selections: { lead: "charlie", mate: "beta" },
    });
  });
});

describe("model family lookup", () => {
  it("resolves exact member UIDs only", () => {
    const capabilities = capability();
    expect(modelFamilyForModel(capabilities, "duo-alpha-beta-fast")?.label).toBe("Duo");
    expect(modelFamilyForModel(capabilities, "pair-echo-delta")?.label).toBe("Pair");
    expect(modelFamilyForModel(capabilities, "solo")).toBeUndefined();
    // A retired member no longer resolves even if a stale descriptor mentions it.
    expect(
      modelFamilyForModel(
        capability({ models: [{ id: "solo", label: "Solo" }] }),
        "duo-alpha-beta",
      ),
    ).toBeUndefined();
  });
});

describe("model family display config", () => {
  it("derives encoded axes from the member, ignoring inert stored seeds", () => {
    const capabilities = capability();
    expect(
      modelFamilyDisplayConfig(capabilities, { model: "duo-alpha-beta-fast", fast: false }),
    ).toEqual({ model: "duo-alpha-beta-fast", effort: "low", fast: true });
    expect(modelFamilyDisplayConfig(capabilities, { model: "duo-alpha-beta" })).toEqual({
      model: "duo-alpha-beta",
      effort: "low",
      fast: false,
    });
  });

  it("refuses to reinterpret meaningful stored overrides on model-bound axes", () => {
    const capabilities = capability();
    expect(
      modelFamilyDisplayConfig(capabilities, {
        model: "duo-alpha-beta",
        effort: "high",
        fast: false,
      }),
    ).toBeUndefined();
    expect(
      modelFamilyDisplayConfig(capabilities, { model: "duo-alpha-beta", fast: true }),
    ).toBeUndefined();
  });

  it("keeps independent carriers for config-bound families", () => {
    const capabilities = capability();
    expect(
      modelFamilyDisplayConfig(capabilities, {
        model: "pair-charlie-beta",
        effort: "low",
        fast: true,
      }),
    ).toEqual({ model: "pair-charlie-beta", effort: "low", fast: true });
    expect(modelFamilyDisplayConfig(capabilities, { model: "solo" })).toBeUndefined();
  });
});

describe("model family selector options", () => {
  it("filters options to coordinates reachable from the current member", () => {
    const capabilities = capability();
    expect(modelFamilySelectorOptions(capabilities, { model: "duo-alpha-beta" }, "lead")).toEqual([
      { id: "alpha", label: "Alpha" },
      { id: "bravo", label: "Bravo" },
    ]);
    // alpha/beta/low/fast=false has no delta sibling: Delta is not offered.
    expect(modelFamilySelectorOptions(capabilities, { model: "duo-alpha-beta" }, "mate")).toEqual([
      { id: "beta", label: "Beta" },
    ]);
  });

  it("offers the full independent grid for config-bound selectors", () => {
    const capabilities = capability();
    expect(
      modelFamilySelectorOptions(capabilities, { model: "pair-charlie-beta" }, "lead"),
    ).toEqual([
      { id: "charlie", label: "Charlie" },
      { id: "echo", label: "Echo" },
    ]);
    expect(
      modelFamilySelectorOptions(capabilities, { model: "pair-charlie-beta" }, "mate"),
    ).toEqual([
      { id: "beta", label: "Beta" },
      { id: "delta", label: "Delta" },
    ]);
  });

  it("returns no options without family context or an unknown selector", () => {
    const capabilities = capability();
    expect(modelFamilySelectorOptions(capabilities, { model: "solo" }, "lead")).toEqual([]);
    expect(modelFamilySelectorOptions(capabilities, { model: "duo-alpha-beta" }, "ghost")).toEqual(
      [],
    );
  });
});

describe("model family effort and fast availability", () => {
  it("derives the encoded ladder from reachable members", () => {
    const capabilities = capability();
    expect(modelFamilyEfforts(capabilities, { model: "duo-alpha-beta" })).toEqual(["low", "high"]);
    // Holding beta/fast=false, only low exists at this coordinate for delta... the
    // hole removes high from the alpha column; bravo keeps low reachable.
    expect(modelFamilyEfforts(capabilities, { model: "duo-alpha-beta-hi" })).toEqual([
      "low",
      "high",
    ]);
  });

  it("falls back to the ordinary ladder outside a model-bound family", () => {
    const capabilities = capability();
    expect(modelFamilyEfforts(capabilities, { model: "solo" })).toEqual(["low", "high"]);
    expect(modelFamilyEfforts(capabilities, { model: "pair-charlie-beta" })).toEqual([
      "low",
      "high",
    ]);
    expect(modelFamilyFastAvailable(capabilities, { model: "solo" })).toBe(true);
    expect(modelFamilyFastAvailable(capabilities, { model: "pair-charlie-beta" })).toBe(false);
  });

  it("gates Fast on an opposite-Fast sibling inside a model-bound family", () => {
    const capabilities = capability();
    expect(modelFamilyFastAvailable(capabilities, { model: "duo-alpha-beta" })).toBe(true);
    expect(modelFamilyFastAvailable(capabilities, { model: "duo-alpha-beta-hi" })).toBe(false);
    expect(modelFamilyFastAvailable(capabilities, { model: "duo-alpha-beta-fast" })).toBe(true);
  });
});

describe("apply model selection edit", () => {
  const capabilities = capability();

  it("resolves a selector edit into an atomic encoded patch", () => {
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        {
          kind: "selector",
          selectorId: "lead",
          value: "bravo",
        },
      ),
    ).toEqual({ model: "duo-bravo-beta", effort: "", fast: false });
  });

  it("returns null for selector edits without a complete tuple", () => {
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        {
          kind: "selector",
          selectorId: "mate",
          value: "delta",
        },
      ),
    ).toBeNull();
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        {
          kind: "selector",
          selectorId: "ghost",
          value: "zeta",
        },
      ),
    ).toBeNull();
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "solo" },
        {
          kind: "selector",
          selectorId: "lead",
          value: "bravo",
        },
      ),
    ).toBeNull();
  });

  it("resolves effort and fast edits along single axes only", () => {
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        { kind: "effort", value: "high" },
      ),
    ).toEqual({ model: "duo-alpha-beta-hi", effort: "", fast: false });
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        { kind: "effort", value: "max" },
      ),
    ).toBeNull();
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        { kind: "fast", value: true },
      ),
    ).toEqual({ model: "duo-alpha-beta-fast", effort: "", fast: false });
    // The hole: alpha/beta/high/fast has no member.
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta-hi" },
        { kind: "fast", value: true },
      ),
    ).toBeNull();
  });

  it("retains the current member when the projected family row is clicked inside the family", () => {
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta-fast" },
        {
          kind: "family",
          model: "duo-alpha-beta",
        },
      ),
    ).toEqual({});
    // A fresh family pick adopts the declared default member.
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "solo" },
        {
          kind: "family",
          model: "duo-alpha-beta",
        },
      ),
    ).toEqual({ model: "duo-alpha-beta", effort: "", fast: false });
    // A family pick of another representative adopts that family's default.
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        { kind: "family", model: "pair-charlie-beta" },
      ),
    ).toEqual({ model: "pair-charlie-beta" });
    // Only representatives carry the family intent.
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        { kind: "family", model: "duo-bravo-beta" },
      ),
    ).toBeNull();
  });

  it("selects the exact representative for an exact pick, never a family no-op", () => {
    // The favorite-of-representative case: High is selected and the exact
    // favorite of the Medium representative must restore that exact member.
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta-hi" },
        {
          kind: "model",
          model: "duo-alpha-beta",
        },
      ),
    ).toEqual({ model: "duo-alpha-beta", effort: "", fast: false });
    // Even when the exact pick names the member already selected, a
    // deliberate click is still an edit and rewrites the inert seeds.
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        { kind: "model", model: "duo-alpha-beta" },
      ),
    ).toEqual({ model: "duo-alpha-beta", effort: "", fast: false });
    // Config-bound families patch only the model, carriers untouched.
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "pair-charlie-delta", effort: "low", fast: true },
        { kind: "model", model: "pair-charlie-beta" },
      ),
    ).toEqual({ model: "pair-charlie-beta" });
  });

  it("adopts the declared default for a fresh family pick and exact members otherwise", () => {
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "solo" },
        { kind: "model", model: "duo-alpha-beta" },
      ),
    ).toEqual({
      model: "duo-alpha-beta",
      effort: "",
      fast: false,
    });
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        {
          kind: "model",
          model: "duo-bravo-delta",
        },
      ),
    ).toEqual({ model: "duo-bravo-delta", effort: "", fast: false });
  });

  it("uses ordinary patches outside families and rejects unknown models", () => {
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta" },
        { kind: "model", model: "solo" },
      ),
    ).toEqual({
      model: "solo",
    });
    expect(
      applyModelSelectionEdit(capabilities, { model: "solo" }, { kind: "model", model: "ghost" }),
    ).toBeNull();
    expect(
      applyModelSelectionEdit(capabilities, { model: "solo" }, { kind: "effort", value: "high" }),
    ).toEqual({
      effort: "high",
    });
    expect(
      applyModelSelectionEdit(capabilities, { model: "solo" }, { kind: "fast", value: true }),
    ).toEqual({
      fast: true,
    });
  });

  it("keeps independent carriers for config-bound family edits", () => {
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "pair-charlie-beta", effort: "low", fast: true },
        {
          kind: "selector",
          selectorId: "mate",
          value: "delta",
        },
      ),
    ).toEqual({ model: "pair-charlie-delta" });
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "pair-charlie-beta", effort: "low" },
        {
          kind: "effort",
          value: "high",
        },
      ),
    ).toEqual({ effort: "high" });
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "pair-charlie-beta" },
        { kind: "fast", value: true },
      ),
    ).toEqual({ fast: true });
    // An absent self-pair stays unavailable.
    expect(
      applyModelSelectionEdit(
        capability({
          modelFamilies: [{ ...pairFamily, members: pairFamily.members.slice(0, 3) }],
        }),
        { model: "pair-echo-delta" },
        { kind: "selector", selectorId: "lead", value: "charlie" },
      ),
    ).toBeNull();
  });

  it("does not bury meaningful thinking or context beneath an encoded patch", () => {
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta", contextSize: "default", thinking: false },
        { kind: "fast", value: true },
      ),
    ).toEqual({ model: "duo-alpha-beta-fast", effort: "", fast: false });
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta", thinking: true },
        {
          kind: "selector",
          selectorId: "lead",
          value: "bravo",
        },
      ),
    ).toBeNull();
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta", contextSize: "1m" },
        {
          kind: "effort",
          value: "high",
        },
      ),
    ).toBeNull();
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "duo-alpha-beta", thinking: true },
        {
          kind: "model",
          model: "duo-bravo-beta",
        },
      ),
    ).toBeNull();
    // Config-bound families patch only model, so their carriers never conflict.
    expect(
      applyModelSelectionEdit(
        capabilities,
        { model: "pair-charlie-beta", thinking: true },
        {
          kind: "selector",
          selectorId: "lead",
          value: "echo",
        },
      ),
    ).toEqual({ model: "pair-echo-beta" });
  });
});

describe("resolve family presentation transition", () => {
  // One relation compiled for two surfaces with opposite bindings: the encoded
  // surface stores Effort/Fast in the UID, the config surface keeps them as
  // independent carriers. (b, x, high+fast) is a hole, and the (b, x) target
  // pair accepts only the low effort and no Fast.
  const transitionSelectors: ModelFamilySelection["selectors"] = [
    {
      id: "lead",
      labelKey: "modelSelection.lead",
      options: [
        { id: "a", label: "Alpha" },
        { id: "b", label: "Beta" },
      ],
    },
    { id: "mate", labelKey: "modelSelection.sidekick", options: [{ id: "x", label: "X" }] },
  ];
  const encodedFamily: ModelFamilySelection = {
    model: "map-a-x",
    label: "Map",
    selectors: transitionSelectors,
    bindings: { effort: "model", fast: "model" },
    members: [
      { model: "map-a-x", selections: { lead: "a", mate: "x" }, effort: "low", fast: false },
      { model: "map-a-x-fast", selections: { lead: "a", mate: "x" }, effort: "low", fast: true },
      { model: "map-a-x-hi", selections: { lead: "a", mate: "x" }, effort: "high", fast: false },
      { model: "map-b-x", selections: { lead: "b", mate: "x" }, effort: "low", fast: false },
      { model: "map-b-x-fast", selections: { lead: "b", mate: "x" }, effort: "low", fast: true },
      { model: "map-b-x-hi", selections: { lead: "b", mate: "x" }, effort: "high", fast: false },
    ],
  };
  const configFamily: ModelFamilySelection = {
    model: "pair-a-x",
    label: "Pair",
    selectors: transitionSelectors,
    bindings: { effort: "config", fast: "config" },
    members: [
      { model: "pair-a-x", selections: { lead: "a", mate: "x" } },
      { model: "pair-b-x", selections: { lead: "b", mate: "x" } },
    ],
  };

  function surface(
    family: ModelFamilySelection | undefined,
    overrides?: Partial<AgentCapability>,
  ): AgentCapability {
    return {
      models: [
        { id: "solo", label: "Solo" },
        ...(family?.members.map((member) => ({ id: member.model, label: member.model })) ?? []),
      ],
      efforts: ["low", "high"],
      modelEfforts: {
        solo: ["low", "high"],
        "pair-a-x": ["low", "high"],
        "pair-b-x": ["low"],
      },
      modelDefaultEfforts: { "pair-a-x": "low" },
      fastModels: ["solo", "pair-a-x"],
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
      modelFamilies: family ? [family] : [],
      ...overrides,
    };
  }

  it("maps encoded coordinates onto an accepted pair with preserved carriers", () => {
    const encoded = surface(encodedFamily);
    const config = surface(configFamily);
    expect(
      resolveFamilyPresentationTransition(encoded, config, {
        model: "map-a-x-hi",
        effort: "",
        fast: false,
      }),
    ).toEqual({ model: "pair-a-x", effort: "high", fast: false });
    expect(
      resolveFamilyPresentationTransition(encoded, config, {
        model: "map-a-x-fast",
        effort: "",
        fast: false,
      }),
    ).toEqual({ model: "pair-a-x", effort: "low", fast: true });
  });

  it("rejects an encoded surface override and target holes instead of guessing", () => {
    const encoded = surface(encodedFamily);
    const config = surface(configFamily);
    // A meaningful stored override on a source-encoded axis is unprovable.
    expect(
      resolveFamilyPresentationTransition(encoded, config, {
        model: "map-a-x-hi",
        effort: "high",
        fast: false,
      }),
    ).toBeNull();
    // No accepted pair for (b, x) with a high effort the target cannot carry.
    expect(
      resolveFamilyPresentationTransition(encoded, config, {
        model: "map-b-x-hi",
        effort: "",
        fast: false,
      }),
    ).toBeNull();
    // The target pair exists but cannot carry Fast.
    expect(
      resolveFamilyPresentationTransition(encoded, config, {
        model: "map-b-x-fast",
        effort: "",
        fast: false,
      }),
    ).toBeNull();
    // The mapped tuple in the other direction resolves exactly when complete…
    expect(
      resolveFamilyPresentationTransition(config, encoded, {
        model: "pair-b-x",
        effort: "high",
        fast: false,
      }),
    ).toEqual({ model: "map-b-x-hi", effort: "", fast: false });
    // …and (b, x, high+fast) has no member, so the request fails outright.
    expect(
      resolveFamilyPresentationTransition(config, encoded, {
        model: "pair-b-x",
        effort: "high",
        fast: true,
      }),
    ).toBeNull();
  });

  it("maps independent carriers onto the encoded tuple and fills unset from defaults", () => {
    const encoded = surface(encodedFamily);
    const config = surface(configFamily);
    expect(
      resolveFamilyPresentationTransition(config, encoded, {
        model: "pair-a-x",
        effort: "low",
        fast: true,
      }),
    ).toEqual({ model: "map-a-x-fast", effort: "", fast: false });
    // An unset source effort fills from the source's declared default before
    // the tuple lookup; unset Fast means off.
    expect(
      resolveFamilyPresentationTransition(config, encoded, {
        model: "pair-a-x",
        effort: "",
        fast: false,
      }),
    ).toEqual({ model: "map-a-x", effort: "", fast: false });
    // Meaningful thinking cannot ride an encoded target relation.
    expect(
      resolveFamilyPresentationTransition(config, encoded, {
        model: "pair-a-x",
        effort: "low",
        fast: false,
        thinking: true,
      }),
    ).toBeNull();
  });

  it("stays out of the way when uninvolved and fails closed on unprovable targets", () => {
    const encoded = surface(encodedFamily);
    const config = surface(configFamily);
    // Neither surface claims the plain model: the ordinary path applies.
    expect(
      resolveFamilyPresentationTransition(config, encoded, { model: "solo", effort: "low" }),
    ).toBeUndefined();
    // A relation member with no target relation cannot be proven.
    expect(
      resolveFamilyPresentationTransition(encoded, surface(undefined), {
        model: "map-a-x",
        effort: "",
        fast: false,
      }),
    ).toBeNull();
    // A target relation with different selector ids is a different relation.
    const renamed = surface({
      ...configFamily,
      selectors: transitionSelectors.map((selector) => ({
        ...selector,
        id: selector.id === "lead" ? "front" : selector.id,
      })),
    });
    expect(
      resolveFamilyPresentationTransition(encoded, renamed, {
        model: "map-a-x",
        effort: "",
        fast: false,
      }),
    ).toBeNull();
    // A UID claimed by the target relation while absent from the source has
    // no provable carrier meaning either.
    expect(
      resolveFamilyPresentationTransition(encoded, config, {
        model: "pair-a-x",
        effort: "low",
        fast: false,
      }),
    ).toBeNull();
  });
});

describe("model family picker models", () => {
  it("collapses represented members into one family row at the representative position", () => {
    const rows = modelFamilyPickerModels(capability());
    expect(rows.map((row) => row.id)).toEqual(["solo", "duo-alpha-beta", "pair-charlie-beta"]);
    expect(rows[1]!.label).toBe("Duo");
    expect(rows[2]!.label).toBe("Pair");
  });

  it("keeps every unrepresented raw choice", () => {
    const families = capability({
      models: [
        { id: "solo", label: "Solo" },
        ...duoIds.slice(0, 2).map((id) => ({ id, label: id })),
        { id: "other", label: "Other" },
      ],
      modelFamilies: [duoFamily],
    });
    const rows = modelFamilyPickerModels(families);
    expect(rows.map((row) => row.id)).toEqual(["solo", "duo-alpha-beta", "other"]);
    expect(rows[1]!.label).toBe("Duo");
  });

  it("returns the raw list unchanged without valid families", () => {
    const capabilities = capability({ modelFamilies: [] });
    expect(modelFamilyPickerModels(capabilities)).toEqual(capabilities.models);
    expect(modelFamilyPickerModels(capabilities)).toBe(capabilities.models);
  });
});
