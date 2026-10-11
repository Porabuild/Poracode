import { describe, expect, it } from "vitest";
import { z } from "zod";
import guiIndependent from "./fixtures/selection-binding-v1/config-gui-independent.json";
import legacy from "./fixtures/selection-binding-v1/config-legacy-unstamped.json";
import partial from "./fixtures/selection-binding-v1/config-partial-unrepresented.json";
import stamped from "./fixtures/selection-binding-v1/config-terminal-stamped.json";
import stampedInstance from "./fixtures/selection-binding-v1/config-terminal-stamped-instance.json";
import staleAxis from "./fixtures/selection-binding-v1/config-stale-recorded-axis.json";
import staleModel from "./fixtures/selection-binding-v1/config-stale-model.json";
import staleOwner from "./fixtures/selection-binding-v1/config-stale-owner.json";
import futureVersion from "./fixtures/selection-binding-v1/config-future-version.json";
import malformed from "./fixtures/selection-binding-v1/binding-malformed-cases.json";
import relationGui from "./fixtures/selection-binding-v1/relation-gui.json";
import relationHole from "./fixtures/selection-binding-v1/relation-encoded-hole.json";
import relationTerminal from "./fixtures/selection-binding-v1/relation-terminal.json";
import {
  applyThreadConfigMutation,
  SelectionBindingRefusalError,
  selectionBindingMatches,
  type SelectionMutationEvent,
} from "./selectionBinding";
import { modelFamilySelectionSchema, type ModelFamilySelection } from "./contracts/agent";
import {
  modelSelectionSchema,
  selectionBindingSchema,
  type ModelSelection,
  type SelectionAxis,
  type SelectionBinding,
  type SelectionBindingOwner,
} from "./selectionBinding.schemas";

const terminalRelation = modelFamilySelectionSchema.parse(relationTerminal.relation);
const guiRelation = modelFamilySelectionSchema.parse(relationGui.relation);
const holeRelation = modelFamilySelectionSchema.parse(relationHole.relation);

const ownerTerminal: SelectionBindingOwner = {
  agentKind: "sample-agent",
  presentationMode: "terminal",
};
const ownerTerminalInstance: SelectionBindingOwner = {
  agentKind: "sample-agent",
  agentInstanceId: "instance-1",
  presentationMode: "terminal",
};
const ownerGui: SelectionBindingOwner = { agentKind: "sample-agent", presentationMode: "gui" };

interface BindingConfigFixture {
  config: ModelSelection & Record<string, unknown>;
  owner: SelectionBindingOwner;
  expect: { bindingRecognized: boolean; matches: boolean };
}

/**
 * Fixture JSON decodes `version` as `number`; the recognized v1 record narrows
 * it to the literal. One cast per fixture keeps the decoded data honest at the
 * boundary while the tests use the canonical types.
 */
function fixtureConfig(fixture: {
  config: unknown;
  owner: {
    agentKind: string;
    agentInstanceId?: string;
    presentationMode: string;
  };
  expect: { bindingRecognized: boolean; matches: boolean };
}): BindingConfigFixture {
  return fixture as unknown as BindingConfigFixture;
}

const stampedF = fixtureConfig(stamped);
const stampedInstanceF = fixtureConfig(stampedInstance);
const partialF = fixtureConfig(partial);
const staleModelF = fixtureConfig(staleModel);
const staleOwnerF = fixtureConfig(staleOwner);
const staleAxisF = fixtureConfig(staleAxis);
const legacyF = fixtureConfig(legacy);
const guiIndependentF = fixtureConfig(guiIndependent);
const futureVersionF = fixtureConfig(futureVersion);

const allFixtures: readonly (readonly [string, BindingConfigFixture])[] = [
  ["config-terminal-stamped", stampedF],
  ["config-terminal-stamped-instance", stampedInstanceF],
  ["config-partial-unrepresented", partialF],
  ["config-stale-model", staleModelF],
  ["config-stale-owner", staleOwnerF],
  ["config-stale-recorded-axis", staleAxisF],
  ["config-legacy-unstamped", legacyF],
  ["config-gui-independent", guiIndependentF],
  ["config-future-version", futureVersionF],
];

/** Copy a config without its stamp, as the mutation caller must build `next`. */
function withoutBinding<T>(config: T): T {
  const copy = { ...config } as T & { selectionBinding?: unknown };
  delete copy.selectionBinding;
  return copy;
}

/** The complete stamped Terminal tuple, including the unrelated `mode` property. */
function terminalTuple(): {
  model: string;
  effort: string;
  contextSize: string;
  fast: boolean;
  thinking: boolean;
  mode: string;
} {
  return {
    model: "lead-a+sidekick-b",
    effort: "",
    contextSize: "default",
    fast: false,
    thinking: false,
    mode: "agent",
  };
}

function refusalReason(run: () => unknown): SelectionBindingRefusalError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SelectionBindingRefusalError);
  return caught as SelectionBindingRefusalError;
}

/** Narrow structural view of emitted JSON Schema for portability assertions. */
interface JsonSchemaNode {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  anyOf?: JsonSchemaNode[];
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  additionalProperties?: boolean;
  minLength?: number;
}

function asJsonSchema(schema: z.ZodType): JsonSchemaNode {
  return z.toJSONSchema(schema) as unknown as JsonSchemaNode;
}

function isLiteralOne(node: JsonSchemaNode): boolean {
  return (
    node.const === 1 || (Array.isArray(node.enum) && node.enum.length === 1 && node.enum[0] === 1)
  );
}

describe("selection binding schemas (strict portable v1)", () => {
  it("recognizes the multi-axis record and retains ALL recorded fields", () => {
    const parsed = selectionBindingSchema.parse(stampedF.config.selectionBinding);
    expect(Object.keys(parsed.inertValues).sort()).toEqual([
      "contextSize",
      "effort",
      "fast",
      "thinking",
    ]);
    expect(parsed.inertValues).toEqual({
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
    });
    expect(parsed.owner).toEqual({ agentKind: "sample-agent", presentationMode: "terminal" });
  });

  it("treats false and empty-string as real recorded values", () => {
    for (const valid of malformed.valid) {
      expect(selectionBindingSchema.safeParse(valid.binding).success).toBe(true);
    }
  });

  it("rejects every malformed/unknown-key/future case without stripping it into a record", () => {
    for (const scenario of malformed.cases) {
      expect(selectionBindingSchema.safeParse(scenario.binding).success).toBe(false);
    }
  });

  it("rejects null and non-object bindings", () => {
    expect(selectionBindingSchema.safeParse(null).success).toBe(false);
    expect(selectionBindingSchema.safeParse("v1").success).toBe(false);
    expect(selectionBindingSchema.safeParse(42).success).toBe(false);
  });

  it("keeps the canonical selection strict while allowing the implicit empty model", () => {
    const unstamped = modelSelectionSchema.parse({ model: "", effort: "", fast: false });
    expect(unstamped.selectionBinding).toBeUndefined();
    expect(modelSelectionSchema.safeParse({ model: "m", unrelated: true }).success).toBe(false);
    expect(modelSelectionSchema.safeParse({ model: "m", temperature: 1 }).success).toBe(false);
  });

  it("emits portable JSON Schema: closed objects, literal version, nonempty anyOf map, no refine/catch artifacts", () => {
    const json = asJsonSchema(selectionBindingSchema);
    expect(json.type).toBe("object");
    expect(json.additionalProperties).toBe(false);
    expect([...(json.required ?? [])].sort()).toEqual(
      ["inertValues", "kind", "model", "owner", "version"].sort(),
    );
    expect(isLiteralOne(json.properties?.version ?? {})).toBe(true);
    const owner = json.properties?.owner ?? {};
    expect(owner.additionalProperties).toBe(false);
    expect(owner.required).toEqual(["agentKind", "presentationMode"]);
    expect(owner.properties?.agentInstanceId).toBeDefined();
    expect(owner.properties?.agentKind?.minLength).toBe(1);
    const inert = json.properties?.inertValues ?? {};
    expect(inert.anyOf).toHaveLength(4);
    const axes = ["effort", "fast", "thinking", "contextSize"];
    for (const [index, branch] of (inert.anyOf ?? []).entries()) {
      expect(branch.additionalProperties).toBe(false);
      expect(branch.required).toEqual([axes[index]]);
    }
    expect(JSON.stringify(json).includes("zod")).toBe(false);
    // The canonical selection must be inspectable the same way (no unsafe transforms).
    const selectionJson = asJsonSchema(modelSelectionSchema);
    expect(selectionJson.properties?.model).toBeDefined();
    expect(selectionJson.required).toEqual(["model"]);
  });
});

describe("selectionBindingMatches", () => {
  it("fixture matrix: recognized records match exactly their recorded owner/selection", () => {
    for (const [name, fixture] of allFixtures) {
      const recognized = selectionBindingSchema.safeParse(fixture.config.selectionBinding).success;
      if (recognized !== fixture.expect.bindingRecognized) {
        throw new Error(
          `${name}: bindingRecognized expected ${fixture.expect.bindingRecognized}, got ${recognized}`,
        );
      }
      const matched = selectionBindingMatches(fixture.config.selectionBinding, {
        owner: fixture.owner,
        selection: fixture.config,
      });
      if (matched !== fixture.expect.matches) {
        throw new Error(`${name}: matches expected ${fixture.expect.matches}, got ${matched}`);
      }
    }
    expect(allFixtures).toHaveLength(9);
  });

  it("instance-scoped records match only the owner carrying the same instance id", () => {
    const binding = stampedInstanceF.config.selectionBinding;
    const selection = stampedInstanceF.config;
    expect(selectionBindingMatches(binding, { owner: ownerTerminalInstance, selection })).toBe(
      true,
    );
    expect(selectionBindingMatches(binding, { owner: ownerTerminal, selection })).toBe(false);
    expect(
      selectionBindingMatches(binding, {
        owner: {
          agentKind: "sample-agent",
          agentInstanceId: "instance-2",
          presentationMode: "terminal",
        },
        selection,
      }),
    ).toBe(false);
    expect(
      selectionBindingMatches(binding, {
        owner: {
          agentKind: "sample-agent",
          agentInstanceId: "instance-1",
          presentationMode: "gui",
        },
        selection,
      }),
    ).toBe(false);
  });

  it("accepts unknown input via strict parse only", () => {
    const selection = stampedF.config;
    for (const scenario of malformed.cases) {
      expect(selectionBindingMatches(scenario.binding, { owner: ownerTerminal, selection })).toBe(
        false,
      );
    }
  });

  it("an own undefined actual value is not an exact recorded value", () => {
    const effortOnly = malformed.valid[1]?.binding;
    const selection: ModelSelection = { model: "lead-a+sidekick-b" };
    const withExplicitUndefined = { ...selection, effort: undefined };
    expect(
      selectionBindingMatches(effortOnly, {
        owner: ownerTerminal,
        selection: withExplicitUndefined,
      }),
    ).toBe(false);
  });

  it("unrecorded actual controls stay outside the claim", () => {
    const binding = partialF.config.selectionBinding;
    expect(
      selectionBindingMatches(binding, { owner: ownerTerminal, selection: partialF.config }),
    ).toBe(true);
  });
});

describe("applyThreadConfigMutation — family-member-edit", () => {
  it("mints the full declared intersection and replaces any old record", () => {
    const result = applyThreadConfigMutation({
      previous: stampedInstanceF.config,
      owner: ownerTerminal,
      next: withoutBinding(terminalTuple()),
      event: { type: "family-member-edit", relation: terminalRelation },
    });
    expect(result.selectionBinding).toEqual({
      version: 1,
      kind: "family-member",
      owner: ownerTerminal,
      model: "lead-a+sidekick-b",
      inertValues: { effort: "", fast: false, thinking: false, contextSize: "default" },
    });
    expect(
      result.selectionBinding?.inertValues !==
        stampedInstanceF.config.selectionBinding?.inertValues,
    ).toBe(true);
  });

  it("mints only values actually present and declared — no defaults are seeded", () => {
    const previous: ModelSelection = { model: "raw-model-x", effort: "high", fast: true };
    const result = applyThreadConfigMutation({
      previous,
      owner: ownerTerminal,
      next: { model: "lead-a+sidekick-b", effort: "", fast: false },
      event: { type: "family-member-edit", relation: terminalRelation },
    });
    expect(result.selectionBinding?.inertValues).toEqual({ effort: "", fast: false });
  });

  it("does not record meaningful or undeclared values", () => {
    const previous: ModelSelection = {
      model: "raw-model-x",
      effort: "high",
      fast: true,
      contextSize: "unlimited",
    };
    const result = applyThreadConfigMutation({
      previous,
      owner: ownerTerminal,
      next: { model: "lead-a+sidekick-b", effort: "high", fast: true, contextSize: "unlimited" },
      event: { type: "family-member-edit", relation: terminalRelation },
    });
    expect(result.selectionBinding).toBeUndefined();
  });

  it("a GUI relation declaring no redundancy mints nothing and keeps the config", () => {
    const result = applyThreadConfigMutation({
      previous: guiIndependentF.config,
      owner: ownerGui,
      next: withoutBinding(guiIndependentF.config),
      event: { type: "family-member-edit", relation: guiRelation },
    });
    expect(result.selectionBinding).toBeUndefined();
    expect(result.effort).toBe("medium");
    expect(result.fast).toBe(false);
    expect(result.mode).toBe("agent");
  });

  it("refuses an encoded tuple hole without guessing a member", () => {
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: { model: relationHole.expect.holeModel, effort: "", fast: false },
        event: { type: "family-member-edit", relation: holeRelation },
      }),
    );
    expect(error.reason).toBe("unresolved-member");
  });

  it("refuses a model that is not an actual relation member, including the implicit empty model", () => {
    for (const model of ["raw-model-x", ""]) {
      const error = refusalReason(() =>
        applyThreadConfigMutation({
          previous: legacyF.config,
          owner: ownerTerminal,
          next: { model, effort: "", fast: false },
          event: { type: "family-member-edit", relation: terminalRelation },
        }),
      );
      expect(error.reason).toBe("unresolved-member");
    }
  });

  it("refuses a relation failing strict declaration validation", () => {
    const broken = {
      ...relationTerminal.relation,
      bindings: { effort: "sometimes", fast: "model" },
    } as unknown as ModelFamilySelection;
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: { model: "lead-a+sidekick-b", effort: "", fast: false },
        event: { type: "family-member-edit", relation: broken },
      }),
    );
    expect(error.reason).toBe("unresolved-relation");
  });
});

describe("applyThreadConfigMutation — exact-model-edit and owner-retarget", () => {
  it("drops the entire record on a raw pick, including the same UID", () => {
    const result = applyThreadConfigMutation({
      previous: stampedF.config,
      owner: ownerTerminal,
      next: withoutBinding(stampedF.config),
      event: { type: "exact-model-edit" },
    });
    expect(result.selectionBinding).toBeUndefined();
    expect(result.model).toBe(stampedF.config.model);
  });

  it("drops the entire record on an owner retarget", () => {
    const result = applyThreadConfigMutation({
      previous: stampedInstanceF.config,
      owner: ownerGui,
      next: withoutBinding(stampedInstanceF.config),
      event: { type: "owner-retarget" },
    });
    expect(result.selectionBinding).toBeUndefined();
  });

  it("ignores a stamp injected into next", () => {
    const injectedBinding = futureVersionF.config.selectionBinding;
    const injected = {
      ...withoutBinding(terminalTuple()),
      selectionBinding: injectedBinding,
    } as Omit<typeof stampedF.config, "selectionBinding">;
    expect(injected.selectionBinding).toBeDefined();
    for (const event of [
      { type: "exact-model-edit" },
      { type: "owner-retarget" },
      { type: "unrelated-edit" },
    ] as const) {
      const result = applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: injected,
        event,
      });
      if (result.selectionBinding !== undefined) {
        throw new Error(`${event.type}: injected stamp was not discarded`);
      }
    }
  });
});

describe("applyThreadConfigMutation — independent-carrier-edit and native-ack", () => {
  it("revokes a same-value axis and applies the actual edit normally", () => {
    const result = applyThreadConfigMutation({
      previous: stampedF.config,
      owner: ownerTerminal,
      next: withoutBinding(stampedF.config), // fast stays false: unchanged in value
      event: { type: "independent-carrier-edit", axes: ["fast"] },
    });
    expect(result.selectionBinding?.inertValues).toEqual({
      effort: "",
      thinking: false,
      contextSize: "default",
    });
    expect(result.fast).toBe(false);
  });

  it("drops the record when the reduction empties it", () => {
    const result = applyThreadConfigMutation({
      previous: partialF.config,
      owner: ownerTerminal,
      next: withoutBinding(partialF.config),
      event: { type: "native-ack", axes: ["effort"] },
    });
    expect(result.selectionBinding).toBeUndefined();
    // Unrepresented actual controls are never erased by the mutation.
    expect(result.contextSize).toBe("high");
    expect(result.fast).toBe(false);
  });

  it("native-ack never mints and an unstamped row stays unstamped", () => {
    const result = applyThreadConfigMutation({
      previous: legacyF.config,
      owner: ownerTerminal,
      next: withoutBinding(legacyF.config),
      event: { type: "native-ack", axes: ["fast", "thinking"] },
    });
    expect(result.selectionBinding).toBeUndefined();
  });

  it("a native ack accompanying a changed model drops the entire record", () => {
    const next = { ...withoutBinding(stampedF.config), model: "raw-model-x" };
    const result = applyThreadConfigMutation({
      previous: stampedF.config,
      owner: ownerTerminal,
      next,
      event: { type: "native-ack", axes: ["fast"] },
    });
    expect(result.selectionBinding).toBeUndefined();
    expect(result.model).toBe("raw-model-x");
  });

  it("a record already stale against the previous selection is dropped, not repaired", () => {
    const result = applyThreadConfigMutation({
      previous: staleAxisF.config,
      owner: ownerTerminal,
      next: withoutBinding(staleAxisF.config),
      event: { type: "independent-carrier-edit", axes: ["effort"] },
    });
    expect(result.selectionBinding).toBeUndefined();
    // The actual carrier keeps its current value — no rewrite to the recorded one.
    expect(result.effort).toBe("");
  });

  it("an acknowledged axis that was never recorded leaves the record intact", () => {
    const result = applyThreadConfigMutation({
      previous: partialF.config,
      owner: ownerTerminal,
      next: withoutBinding(partialF.config),
      event: { type: "native-ack", axes: ["thinking"] },
    });
    expect(result.selectionBinding?.inertValues).toEqual({ effort: "default" });
  });
});

describe("applyThreadConfigMutation — unrelated-edit retention", () => {
  it("retains still-matching intent intact across an unrelated edit (same-owner fork included)", () => {
    const next = { ...withoutBinding(stampedF.config), mode: "review" };
    const result = applyThreadConfigMutation({
      previous: stampedF.config,
      owner: ownerTerminal,
      next,
      event: { type: "unrelated-edit" },
    });
    expect(result.selectionBinding).toEqual(stampedF.config.selectionBinding);
    expect(result.selectionBinding !== stampedF.config.selectionBinding).toBe(true);
    expect(result.mode).toBe("review");
  });

  it("drops the record when the resulting config no longer matches it", () => {
    const next = { ...withoutBinding(stampedF.config), model: "raw-model-x" };
    const result = applyThreadConfigMutation({
      previous: stampedF.config,
      owner: ownerTerminal,
      next,
      event: { type: "unrelated-edit" },
    });
    expect(result.selectionBinding).toBeUndefined();
  });

  it("drops the record when the supplied owner differs", () => {
    const result = applyThreadConfigMutation({
      previous: stampedF.config,
      owner: ownerGui,
      next: withoutBinding(stampedF.config),
      event: { type: "unrelated-edit" },
    });
    expect(result.selectionBinding).toBeUndefined();
  });

  it("never upgrades an unstamped row", () => {
    const result = applyThreadConfigMutation({
      previous: legacyF.config,
      owner: ownerTerminal,
      next: withoutBinding(legacyF.config),
      event: { type: "unrelated-edit" },
    });
    expect(result.selectionBinding).toBeUndefined();
  });
});

describe("applyThreadConfigMutation — purity", () => {
  const events: SelectionMutationEvent[] = [
    { type: "family-member-edit", relation: terminalRelation },
    { type: "exact-model-edit" },
    { type: "independent-carrier-edit", axes: ["fast"] },
    { type: "native-ack", axes: ["effort", "contextSize"] },
    { type: "unrelated-edit" },
    { type: "owner-retarget" },
  ];

  it("never mutates its input values", () => {
    for (const event of events) {
      const previous = structuredClone(stampedInstanceF.config);
      const next = structuredClone(withoutBinding(stampedInstanceF.config));
      const previousSnapshot = structuredClone(previous);
      const nextSnapshot = structuredClone(next);
      applyThreadConfigMutation({
        previous,
        next,
        owner: ownerTerminalInstance,
        event,
      });
      expect(previous).toEqual(previousSnapshot);
      expect(next).toEqual(nextSnapshot);
    }
  });

  it("returns a fresh config object that never aliases the previous record", () => {
    const previous = structuredClone(stampedF.config);
    const result = applyThreadConfigMutation({
      previous,
      owner: ownerTerminal,
      next: structuredClone(withoutBinding(stampedF.config)),
      event: { type: "unrelated-edit" },
    });
    expect(result).not.toBe(previous);
    expect(result.selectionBinding).not.toBe(previous.selectionBinding);
    expect(result.selectionBinding?.owner).not.toBe(previous.selectionBinding?.owner);
    expect(result.selectionBinding?.inertValues).not.toBe(previous.selectionBinding?.inertValues);
  });
});

/**
 * Correction red proofs: exact own present defined values everywhere.
 *
 * JSON can never carry an own `undefined` property and never serializes a
 * prototype carrier, so only an OWN, DEFINED value is an actually-present
 * recorded/actual value. An own `undefined` entry is not an exact recorded
 * value; an inherited property is not present at all. These must not match
 * or mint, and the portable wire schema stays as-is (the refusal is the
 * in-process guard's job — see the frozen contract §1/§5).
 */
describe("selectionBindingMatches — exact own present defined (correction)", () => {
  /** A selection whose carriers exist only on the prototype — JSON drops them. */
  function inheritedCarrierSelection(model: string): ModelSelection {
    const selection = Object.create({
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
    }) as ModelSelection;
    selection.model = model; // the only own carrier-bearing property
    return selection;
  }

  it("an inherited actual carrier is not an exact present value", () => {
    const binding = stampedF.config.selectionBinding;
    const inherited = inheritedCarrierSelection("lead-a+sidekick-b");
    expect(inherited.effort).toBe(""); // readable through the prototype…
    expect(Object.hasOwn(inherited, "effort")).toBe(false); // …but not own
    expect(selectionBindingMatches(binding, { owner: ownerTerminal, selection: inherited })).toBe(
      false,
    );
  });

  it("a record with an own undefined recorded axis is unproven even with another valid axis", () => {
    const ownUndefinedRecord: SelectionBinding = {
      version: 1,
      kind: "family-member",
      owner: ownerTerminal,
      model: "lead-a+sidekick-b",
      inertValues: { effort: undefined, fast: false },
    };
    // The portable wire schema still admits the shape (an own undefined can
    // never arrive over JSON); the in-process guard refuses it as evidence.
    expect(selectionBindingSchema.safeParse(ownUndefinedRecord).success).toBe(true);
    expect(
      selectionBindingMatches(ownUndefinedRecord, {
        owner: ownerTerminal,
        selection: stampedF.config,
      }),
    ).toBe(false);
  });

  it("distinguishes an absent optional owner id from an own undefined one", () => {
    const selection = stampedF.config;
    const ownUndefinedId: SelectionBinding = {
      version: 1,
      kind: "family-member",
      owner: { ...ownerTerminal, agentInstanceId: undefined },
      model: "lead-a+sidekick-b",
      inertValues: { effort: "", fast: false, thinking: false, contextSize: "default" },
    };
    // A record carrying an own undefined id is malformed evidence → unproven.
    expect(selectionBindingMatches(ownUndefinedId, { owner: ownerTerminal, selection })).toBe(
      false,
    );
    // A record claiming no id matches an actual owner whose own undefined id
    // normalizes to absent at the in-process boundary.
    const actualOwnUndefinedId: SelectionBindingOwner = {
      agentKind: "sample-agent",
      agentInstanceId: undefined,
      presentationMode: "terminal",
    };
    expect(
      selectionBindingMatches(stampedF.config.selectionBinding, {
        owner: actualOwnUndefinedId,
        selection,
      }),
    ).toBe(true);
  });

  it("retention drops a record that is unproven against the previous selection", () => {
    const previous: ModelSelection = {
      ...stampedF.config,
      selectionBinding: {
        version: 1,
        kind: "family-member",
        owner: { ...ownerTerminal, agentInstanceId: undefined },
        model: "lead-a+sidekick-b",
        inertValues: { effort: "", fast: false, thinking: false, contextSize: "default" },
      },
    };
    const result = applyThreadConfigMutation({
      previous,
      owner: ownerTerminal,
      next: withoutBinding(previous),
      event: { type: "unrelated-edit" },
    });
    expect(result.selectionBinding).toBeUndefined();
  });
});

/**
 * Correction red proofs: raw ownership of every present key.
 *
 * A prototype carrier is invisible to JSON.stringify, but installed Zod
 * materializes inherited properties as own output properties — so raw
 * ownership must be proven on the input BEFORE any parse. Fixtures are plain
 * JSON and cannot express these shapes: every raw object below is built with
 * Object.create AFTER fixture parsing and must be refused, while fully own
 * records, own false/empty carriers, unchanged inputs, and valid mints keep
 * working.
 */
describe("selection binding raw own-key presence (correction)", () => {
  const stampedBinding = stampedF.config.selectionBinding as SelectionBinding;
  const stampedInert = stampedBinding.inertValues as Record<string, string | boolean>;
  const AXES: readonly SelectionAxis[] = ["effort", "fast", "thinking", "contextSize"];
  const NEXT_AXIS: Record<SelectionAxis, SelectionAxis> = {
    effort: "fast",
    fast: "thinking",
    thinking: "contextSize",
    contextSize: "effort",
  };

  interface RawBindingShape {
    inertValues: Record<string, unknown>;
    [key: string]: unknown;
  }

  /** `inherited` sits only on the prototype; `own` is the own enumerable surface. */
  function rawSplit(
    own: Record<string, unknown>,
    inherited: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.assign(Object.create(inherited), own);
  }

  /** A copy of `source` whose `key` is readable only through a prototype. */
  function withoutOwnKey(source: Record<string, unknown>, key: string): Record<string, unknown> {
    const own = { ...source };
    delete own[key];
    return rawSplit(own, { [key]: source[key] });
  }

  function inheritedTopKey(key: string): Record<string, unknown> {
    return withoutOwnKey(stampedBinding as unknown as Record<string, unknown>, key);
  }

  function inheritedOwnerKey(key: string): Record<string, unknown> {
    const owner = withoutOwnKey(stampedBinding.owner as Record<string, unknown>, key);
    return { ...(stampedBinding as unknown as Record<string, unknown>), owner };
  }

  function inheritedAxis(
    axis: SelectionAxis,
    besideOwn: SelectionAxis | undefined,
  ): RawBindingShape {
    const base = stampedBinding as unknown as Record<string, unknown>;
    const own: Record<string, unknown> = besideOwn ? { [besideOwn]: stampedInert[besideOwn] } : {};
    return {
      version: base.version,
      kind: base.kind,
      owner: { ...stampedBinding.owner },
      model: base.model,
      inertValues: rawSplit(own, { [axis]: stampedInert[axis] }),
    };
  }

  function matchesInherited(raw: unknown): boolean {
    return selectionBindingMatches(raw, { owner: ownerTerminal, selection: stampedF.config });
  }

  it("an inherited version key cannot become recorded evidence", () => {
    const raw = inheritedTopKey("version");
    expect(Object.keys(raw)).not.toContain("version");
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited kind key cannot become recorded evidence", () => {
    const raw = inheritedTopKey("kind");
    expect(Object.keys(raw)).not.toContain("kind");
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited owner key cannot become recorded evidence", () => {
    const raw = inheritedTopKey("owner");
    expect(Object.keys(raw)).not.toContain("owner");
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited model key cannot become recorded evidence", () => {
    const raw = inheritedTopKey("model");
    expect(Object.keys(raw)).not.toContain("model");
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited inertValues key cannot become recorded evidence", () => {
    const raw = inheritedTopKey("inertValues");
    expect(Object.keys(raw)).not.toContain("inertValues");
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited agentKind owner key cannot become recorded evidence", () => {
    const raw = inheritedOwnerKey("agentKind");
    expect(Object.keys(raw.owner as Record<string, unknown>)).not.toContain("agentKind");
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited presentationMode owner key cannot become recorded evidence", () => {
    const raw = inheritedOwnerKey("presentationMode");
    expect(Object.keys(raw.owner as Record<string, unknown>)).not.toContain("presentationMode");
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited recorded owner id is refused, not normalized to absence", () => {
    const recorded = stampedInstanceF.config.selectionBinding as SelectionBinding;
    const owner = rawSplit(
      { agentKind: recorded.owner.agentKind, presentationMode: recorded.owner.presentationMode },
      { agentInstanceId: "instance-1" },
    );
    const raw = { ...recorded, owner };
    expect(Object.keys(owner)).toEqual(["agentKind", "presentationMode"]);
    expect(JSON.stringify(raw)).not.toContain("instance-1");
    expect(
      selectionBindingMatches(raw, {
        owner: ownerTerminalInstance,
        selection: stampedInstanceF.config,
      }),
    ).toBe(false);
  });

  it("an inherited effort axis cannot be claimed", () => {
    const raw = inheritedAxis("effort", undefined);
    expect(Object.keys(raw.inertValues)).toEqual([]);
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited fast axis cannot be claimed", () => {
    const raw = inheritedAxis("fast", undefined);
    expect(Object.keys(raw.inertValues)).toEqual([]);
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited thinking axis cannot be claimed", () => {
    const raw = inheritedAxis("thinking", undefined);
    expect(Object.keys(raw.inertValues)).toEqual([]);
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited contextSize axis cannot be claimed", () => {
    const raw = inheritedAxis("contextSize", undefined);
    expect(Object.keys(raw.inertValues)).toEqual([]);
    expect(matchesInherited(raw)).toBe(false);
  });

  it("an inherited axis is refused even beside a valid own axis", () => {
    for (const axis of AXES) {
      const other = NEXT_AXIS[axis];
      const raw = inheritedAxis(axis, other);
      expect(Object.keys(raw.inertValues)).toEqual([other]);
      expect(matchesInherited(raw)).toBe(false);
      // Control: the same record claiming only the valid own axis is recognized.
      expect(matchesInherited({ ...raw, inertValues: { [other]: stampedInert[other] } })).toBe(
        true,
      );
    }
  });

  it("an inherited enclosing stamp is not upgraded by a retention event", () => {
    // A JSON-shaped previous selection (own carriers) whose stamp property
    // itself sits only on the prototype — the raw JSON is unstamped.
    const previous = Object.create({
      selectionBinding: stampedF.config.selectionBinding,
    }) as ModelSelection;
    const tuple = terminalTuple();
    previous.model = tuple.model;
    previous.effort = tuple.effort;
    previous.fast = tuple.fast;
    previous.thinking = tuple.thinking;
    previous.contextSize = tuple.contextSize;
    const next = { ...withoutBinding(stampedF.config), mode: "review" };
    const result = applyThreadConfigMutation({
      previous,
      owner: ownerTerminal,
      next,
      event: { type: "unrelated-edit" },
    });
    expect(result.selectionBinding).toBeUndefined();
    expect(Object.keys(previous).sort()).toEqual([
      "contextSize",
      "effort",
      "fast",
      "model",
      "thinking",
    ]);
    expect(result.model).toBe(stampedF.config.model);
    expect(result.effort).toBe(stampedF.config.effort);
  });

  it("an inherited actual model never matches", () => {
    const selection = Object.create({ model: stampedBinding.model }) as ModelSelection;
    selection.effort = "";
    selection.fast = false;
    selection.thinking = false;
    selection.contextSize = "default";
    expect(Object.hasOwn(selection, "model")).toBe(false);
    expect(selectionBindingMatches(stampedBinding, { owner: ownerTerminal, selection })).toBe(
      false,
    );
    // The unchanged own false/empty carriers survive the refused match.
    expect(selection.effort).toBe("");
    expect(selection.fast).toBe(false);
    expect(selection.thinking).toBe(false);
    expect(selection.contextSize).toBe("default");
  });

  it("an inherited actual owner field never matches", () => {
    const owner = Object.create({ agentKind: "sample-agent" }) as SelectionBindingOwner;
    owner.presentationMode = "terminal";
    expect(Object.keys(owner)).toEqual(["presentationMode"]);
    expect(selectionBindingMatches(stampedBinding, { owner, selection: stampedF.config })).toBe(
      false,
    );
  });

  it("an inherited actual owner id cannot mint a record that ignores it", () => {
    const owner = Object.create({ agentInstanceId: "instance-1" }) as SelectionBindingOwner;
    owner.agentKind = "sample-agent";
    owner.presentationMode = "terminal";
    const next = { model: "lead-a+sidekick-b", effort: "", fast: false };
    const nextSnapshot = { ...next };
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner,
        next,
        event: { type: "family-member-edit", relation: terminalRelation },
      }),
    );
    expect(error.reason).toBe("invalid-owner");
    expect(next).toEqual(nextSnapshot);
    // Consistency: matching refuses the same inherited-id owner minting refuses.
    expect(selectionBindingMatches(stampedBinding, { owner, selection: stampedF.config })).toBe(
      false,
    );
  });

  it("an own non-enumerable known field cannot become recorded evidence", () => {
    const raw = rawSplit({ ...stampedBinding } as unknown as Record<string, unknown>, {});
    delete raw.model;
    Object.defineProperty(raw, "model", {
      value: stampedBinding.model,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    expect(Object.keys(raw)).not.toContain("model");
    expect(raw.model).toBe(stampedBinding.model);
    expect(matchesInherited(raw)).toBe(false);
  });

  it("unchanged controls: fully own raw records still match, inputs untouched", () => {
    const raw = rawSplit({ ...stampedBinding } as unknown as Record<string, unknown>, {});
    const ownerSnapshot = structuredClone(ownerTerminal);
    const selectionSnapshot = structuredClone(stampedF.config);
    expect(matchesInherited(raw)).toBe(true);
    // Own false/empty carriers keep their exact recorded semantics.
    expect(matchesInherited({ ...raw, inertValues: { effort: "", fast: false } })).toBe(true);
    expect(ownerTerminal).toEqual(ownerSnapshot);
    expect(stampedF.config).toEqual(selectionSnapshot);
  });

  it("a valid mint immediately matches its own unchanged actual owner", () => {
    const result = applyThreadConfigMutation({
      previous: legacyF.config,
      owner: ownerTerminal,
      next: {
        model: "lead-a+sidekick-b",
        effort: "",
        fast: false,
        thinking: false,
        contextSize: "default",
      },
      event: { type: "family-member-edit", relation: terminalRelation },
    });
    expect(result.selectionBinding).toBeDefined();
    expect(
      selectionBindingMatches(result.selectionBinding, { owner: ownerTerminal, selection: result }),
    ).toBe(true);
  });
});

/** Mutable raw view of the Terminal relation fixture for intrinsic-defect variants. */
interface MutableRelation {
  model: string;
  label: string;
  selectors: Array<{
    id: string;
    labelKey: string;
    options: Array<{ id: string; label: string }>;
  }>;
  bindings: { effort: string; fast: string };
  redundantValues?: Record<string, unknown[]>;
  members: Array<{
    model: string;
    selections: Record<string, string>;
    effort?: string;
    fast?: boolean;
  }>;
}

function variantRelation(mutate: (raw: MutableRelation) => void): ModelFamilySelection {
  const raw = structuredClone(relationTerminal.relation) as unknown as MutableRelation;
  mutate(raw);
  return modelFamilySelectionSchema.parse(raw);
}

/**
 * Correction red proofs: intrinsic relation validation reuses the existing
 * shared family algorithm. The plain declaration schema alone does not
 * validate relation injectivity, model-bound coordinates, selector coverage,
 * or the default member — every variant below parses cleanly and must still
 * be refused before any mint, without forking the family logic.
 */
describe("applyThreadConfigMutation — validated relation reuse (correction)", () => {
  it("refuses a duplicate encoded tuple the plain schema alone admits", () => {
    const relation = variantRelation((raw) => {
      raw.members[1]!.selections = { "sample.axis.a": "opt-a1", "sample.axis.b": "opt-b1" };
      raw.members[1]!.effort = "high";
      raw.members[1]!.fast = false;
    });
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: { model: "lead-a2+sidekick-b2", effort: "high", fast: false },
        event: { type: "family-member-edit", relation },
      }),
    );
    expect(error.reason).toBe("unresolved-relation");
  });

  it("refuses a model-bound member missing its encoded effort", () => {
    const relation = variantRelation((raw) => {
      delete raw.members[1]!.effort;
    });
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: { model: "lead-a2+sidekick-b2", effort: "high", fast: false },
        event: { type: "family-member-edit", relation },
      }),
    );
    expect(error.reason).toBe("unresolved-relation");
  });

  it("refuses a member whose selector coverage names an unknown option", () => {
    const relation = variantRelation((raw) => {
      raw.members[1]!.selections = { "sample.axis.a": "opt-zz", "sample.axis.b": "opt-b2" };
    });
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: { model: "lead-a2+sidekick-b2", effort: "max", fast: true },
        event: { type: "family-member-edit", relation },
      }),
    );
    expect(error.reason).toBe("unresolved-relation");
  });

  it("refuses a member that does not cover every declared selector", () => {
    const relation = variantRelation((raw) => {
      raw.members[1]!.selections = { "sample.axis.a": "opt-a2" };
    });
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: { model: "lead-a2+sidekick-b2", effort: "max", fast: true },
        event: { type: "family-member-edit", relation },
      }),
    );
    expect(error.reason).toBe("unresolved-relation");
  });

  it("refuses a relation whose default UID is not one of its members", () => {
    const relation = variantRelation((raw) => {
      raw.model = "absent-default-uid";
    });
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: { model: "lead-a+sidekick-b", effort: "", fast: false },
        event: { type: "family-member-edit", relation },
      }),
    );
    expect(error.reason).toBe("unresolved-relation");
  });

  it("refuses a selector label key outside the shared message catalog", () => {
    const relation = variantRelation((raw) => {
      raw.selectors[0]!.labelKey = "not.a.message.key";
    });
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: { model: "lead-a+sidekick-b", effort: "", fast: false },
        event: { type: "family-member-edit", relation },
      }),
    );
    expect(error.reason).toBe("unresolved-relation");
  });

  it("a valid relation with a tuple hole still mints real members; only the missing target refuses", () => {
    const minted = applyThreadConfigMutation({
      previous: legacyF.config,
      owner: ownerTerminal,
      next: {
        model: "lead-a+sidekick-b2",
        effort: "",
        fast: false,
        thinking: false,
        contextSize: "default",
      },
      event: { type: "family-member-edit", relation: holeRelation },
    });
    expect(minted.selectionBinding?.model).toBe("lead-a+sidekick-b2");
    expect(minted.selectionBinding?.inertValues).toEqual({
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
    });
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: { model: relationHole.expect.holeModel, effort: "", fast: false },
        event: { type: "family-member-edit", relation: holeRelation },
      }),
    );
    expect(error.reason).toBe("unresolved-member");
  });

  it("typed refusals leave every input unchanged", () => {
    const previous = structuredClone(legacyF.config);
    const relation = variantRelation((raw) => {
      raw.members[1]!.selections = { "sample.axis.a": "opt-a1", "sample.axis.b": "opt-b1" };
      raw.members[1]!.effort = "high";
      raw.members[1]!.fast = false;
    });
    const relationSnapshot = structuredClone(relation);
    const next = { model: "lead-a2+sidekick-b2", effort: "high", fast: false };
    const nextSnapshot = structuredClone(next);
    expect(() =>
      applyThreadConfigMutation({
        previous,
        owner: ownerTerminal,
        next,
        event: { type: "family-member-edit", relation },
      }),
    ).toThrow(SelectionBindingRefusalError);
    expect(previous).toEqual(structuredClone(legacyF.config));
    expect(next).toEqual(nextSnapshot);
    expect(relation).toEqual(relationSnapshot);
  });
});

/**
 * Correction red proofs: minting reads only actual own defined values.
 */
describe("applyThreadConfigMutation — mint reads only own present values (correction)", () => {
  it("mints only own present values — an inherited carrier is absent, not seedable", () => {
    const next = Object.create({
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
    }) as Omit<ModelSelection, "selectionBinding">;
    next.model = "lead-a+sidekick-b";
    const result = applyThreadConfigMutation({
      previous: { model: "raw-model-x" },
      owner: ownerTerminal,
      next,
      event: { type: "family-member-edit", relation: terminalRelation },
    });
    // No own present declared value → no stamp; the inherited prototype
    // carriers are absent from the JSON this config will serialize.
    expect(result.selectionBinding).toBeUndefined();
    expect(result.model).toBe("lead-a+sidekick-b");
    expect(Object.hasOwn(result, "effort")).toBe(false);
  });

  it("refuses when the target model is not an own property of the resulting config", () => {
    const inherited = Object.create({
      model: "lead-a+sidekick-b",
      effort: "",
      fast: false,
    }) as Omit<ModelSelection, "selectionBinding">;
    const error = refusalReason(() =>
      applyThreadConfigMutation({
        previous: legacyF.config,
        owner: ownerTerminal,
        next: inherited,
        event: { type: "family-member-edit", relation: terminalRelation },
      }),
    );
    expect(error.reason).toBe("unresolved-member");
  });

  it("normalizes the minted owner: an own undefined optional id is omitted", () => {
    const ownerWithOwnUndefinedId: SelectionBindingOwner = {
      agentKind: "sample-agent",
      agentInstanceId: undefined,
      presentationMode: "terminal",
    };
    const result = applyThreadConfigMutation({
      previous: legacyF.config,
      owner: ownerWithOwnUndefinedId,
      next: { model: "lead-a+sidekick-b", effort: "", fast: false },
      event: { type: "family-member-edit", relation: terminalRelation },
    });
    const minted = result.selectionBinding;
    expect(minted).toBeDefined();
    expect(Object.hasOwn(minted?.owner ?? {}, "agentInstanceId")).toBe(false);
    expect(selectionBindingMatches(minted, { owner: ownerTerminal, selection: result })).toBe(true);
  });
});
