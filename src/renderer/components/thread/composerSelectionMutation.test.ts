// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentCapability, ModelFamilySelection, ThreadConfig } from "@/shared/contracts";
import type { SelectionBinding, SelectionBindingOwner } from "@/shared/selectionBinding.schemas";
import { applyComposerSelectionMutation } from "./composerSelectionMutation";

// Neutral encoded relation: the surface declares the inert seeds its edits
// write (`effort: ""`, `fast: false`) as redundant, so a deliberate member
// edit records exactly those carriers.
const encodedRelation: ModelFamilySelection = {
  model: "pair-alpha-x",
  label: "Pair",
  selectors: [
    {
      id: "lead",
      labelKey: "modelSelection.lead",
      options: [
        { id: "alpha", label: "Alpha" },
        { id: "beta", label: "Beta" },
      ],
    },
    {
      id: "sidekick",
      labelKey: "modelSelection.sidekick",
      options: [
        { id: "x", label: "X" },
        { id: "y", label: "Y" },
      ],
    },
  ],
  bindings: { effort: "model", fast: "model" },
  redundantValues: { effort: [""], fast: [false] },
  members: [
    {
      model: "pair-alpha-x",
      selections: { lead: "alpha", sidekick: "x" },
      effort: "low",
      fast: false,
    },
    {
      model: "pair-alpha-y",
      selections: { lead: "alpha", sidekick: "y" },
      effort: "high",
      fast: true,
    },
    {
      model: "pair-beta-x",
      selections: { lead: "beta", sidekick: "x" },
      effort: "low",
      fast: false,
    },
  ],
};

const encodedCapabilities = {
  models: [
    { id: "solo", label: "Solo" },
    { id: "pair-alpha-x", label: "Pair (Alpha + X)" },
    { id: "pair-alpha-y", label: "Pair (Alpha + Y)" },
    { id: "pair-beta-x", label: "Pair (Beta + X)" },
  ],
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
  modelFamilies: [encodedRelation],
} as unknown as AgentCapability;

// Config-bound variant: every axis is an independent carrier, and the surface
// declares the meaningful carriers a deliberate edit may write as redundant.
const configBoundRelation: ModelFamilySelection = {
  ...encodedRelation,
  bindings: { effort: "config", fast: "config" },
  redundantValues: { effort: ["high"], fast: [true] },
  members: encodedRelation.members.map(({ model, selections }) => ({ model, selections })),
};

const configBoundCapabilities = {
  ...encodedCapabilities,
  efforts: ["low", "high"],
  modelEfforts: {
    solo: ["low", "high"],
    "pair-alpha-x": ["low", "high"],
    "pair-alpha-y": ["low", "high"],
  },
  modelFamilies: [configBoundRelation],
} as unknown as AgentCapability;

const owner: SelectionBindingOwner = { agentKind: "agent", presentationMode: "gui" };

const storedConfig = {
  model: "pair-alpha-x",
  effort: "",
  fast: false,
  mode: "agent",
  approvalPolicy: "default",
  sandboxMode: "workspace-read",
} as ThreadConfig;

const record = (overrides?: {
  owner?: SelectionBindingOwner;
  model?: string;
  inertValues?: SelectionBinding["inertValues"];
}): SelectionBinding => ({
  version: 1,
  kind: "family-member",
  owner: overrides?.owner ?? owner,
  model: overrides?.model ?? "pair-alpha-x",
  inertValues: overrides?.inertValues ?? { effort: "", fast: false },
});

const mutate = (input: {
  previous: ThreadConfig;
  effective?: ThreadConfig;
  patch: Partial<ThreadConfig>;
  origin: { kind: "family-resolved" } | { kind: "raw-pick" } | undefined;
  capabilities?: AgentCapability;
  owner?: SelectionBindingOwner;
}): ThreadConfig =>
  applyComposerSelectionMutation({
    previous: input.previous,
    effective: input.effective ?? input.previous,
    patch: input.patch,
    origin: input.origin,
    capabilities: input.capabilities ?? encodedCapabilities,
    owner: input.owner ?? owner,
  });

describe("applyComposerSelectionMutation", () => {
  it("mints a fresh record for a resolved member edit, replacing any old one", () => {
    const stale = record({ owner: { agentKind: "agent", presentationMode: "terminal" } });
    const result = mutate({
      previous: { ...storedConfig, selectionBinding: stale },
      patch: { model: "pair-alpha-y", effort: "", fast: false },
      origin: { kind: "family-resolved" },
    });
    expect(result.model).toBe("pair-alpha-y");
    expect(result.selectionBinding).toEqual({
      version: 1,
      kind: "family-member",
      owner,
      model: "pair-alpha-y",
      inertValues: { effort: "", fast: false },
    });
  });

  it("preserves unrelated config fields and own-empty/false controls through the edit", () => {
    const result = mutate({
      previous: storedConfig,
      patch: { model: "pair-alpha-y", effort: "", fast: false },
      origin: { kind: "family-resolved" },
    });
    expect(result.effort).toBe("");
    expect(result.fast).toBe(false);
    expect(result.mode).toBe("agent");
    expect(result.approvalPolicy).toBe("default");
    expect(result.sandboxMode).toBe("workspace-read");
  });

  it("carries untouched live-overlay controls into the candidate", () => {
    const previous: ThreadConfig = { model: "pair-alpha-x", effort: "", fast: false };
    const result = mutate({
      previous,
      effective: { ...previous, contextSize: "256k" },
      patch: { model: "pair-alpha-y", effort: "", fast: false },
      origin: { kind: "family-resolved" },
    });
    expect(result.contextSize).toBe("256k");
  });

  it("routes a family-resolved patch of a non-member model as an exact pick", () => {
    const result = mutate({
      previous: { ...storedConfig, selectionBinding: record() },
      patch: { model: "solo", effort: "", contextSize: "", fast: false, thinking: false },
      origin: { kind: "family-resolved" },
    });
    expect(result.model).toBe("solo");
    expect(result.selectionBinding).toBeUndefined();
  });

  it("never mints for a generic model patch without family origin", () => {
    const result = mutate({
      previous: { ...storedConfig, selectionBinding: record() },
      patch: { model: "pair-alpha-y" },
      origin: undefined,
    });
    expect(result.model).toBe("pair-alpha-y");
    expect(result.selectionBinding).toBeUndefined();
  });

  it("drops the record for a raw same-UID same-value pick", () => {
    const previous: ThreadConfig = {
      model: "solo",
      fast: true,
      mode: "agent",
      selectionBinding: record({ model: "solo", inertValues: { fast: true } }),
    };
    const result = mutate({
      previous,
      patch: { model: "solo", effort: "", contextSize: "", fast: true, thinking: false },
      origin: { kind: "raw-pick" },
    });
    expect(result.model).toBe("solo");
    expect(result.fast).toBe(true);
    expect(result.selectionBinding).toBeUndefined();
  });

  it("revokes only the touched carrier axis on a same-value independent edit", () => {
    const previous: ThreadConfig = {
      model: "pair-alpha-x",
      effort: "high",
      fast: true,
      selectionBinding: record({ inertValues: { effort: "high", fast: true } }),
    };
    const result = mutate({
      previous,
      patch: { effort: "high" },
      origin: undefined,
      capabilities: configBoundCapabilities,
    });
    expect(result.effort).toBe("high");
    expect(result.selectionBinding).toEqual({ ...record(), inertValues: { fast: true } });
  });

  it("drops the record when a carrier reduction empties it", () => {
    const previous: ThreadConfig = {
      model: "pair-alpha-x",
      effort: "high",
      fast: true,
      selectionBinding: record({ inertValues: { effort: "high" } }),
    };
    const result = mutate({
      previous,
      patch: { effort: "high" },
      origin: undefined,
      capabilities: configBoundCapabilities,
    });
    expect(result.selectionBinding).toBeUndefined();
  });

  it("retains a still-matching record across an unrelated edit without minting", () => {
    const previous: ThreadConfig = { ...storedConfig, selectionBinding: record() };
    const result = mutate({
      previous,
      patch: { mode: "plan" },
      origin: undefined,
    });
    expect(result.selectionBinding).toEqual(record());
  });

  it("persists the drop of a stale record through an empty unrelated patch", () => {
    const stale = record({ owner: { agentKind: "agent", presentationMode: "terminal" } });
    const result = mutate({
      previous: { ...storedConfig, selectionBinding: stale },
      patch: {},
      origin: undefined,
    });
    expect(result.mode).toBe("agent");
    expect(result.selectionBinding).toBeUndefined();
  });

  it("mints with the actual instance id and drops a record owned by another one", () => {
    const instanceOwner: SelectionBindingOwner = {
      agentKind: "agent",
      presentationMode: "gui",
      agentInstanceId: "inst-7",
    };
    const minted = mutate({
      previous: storedConfig,
      patch: { model: "pair-alpha-y", effort: "", fast: false },
      origin: { kind: "family-resolved" },
      owner: instanceOwner,
    });
    expect(minted.selectionBinding?.owner).toEqual(instanceOwner);
    const dropped = mutate({
      previous: {
        ...storedConfig,
        selectionBinding: record({ owner: instanceOwner }),
      },
      patch: { effort: "" },
      origin: undefined,
    });
    expect(dropped.selectionBinding).toBeUndefined();
  });
});
