import { describe, expect, it } from "vitest";
import type { ProviderModelItem } from "@/renderer/components/common/ProviderModelMenu";
import { collectHeaderModelGroups, headerGroupState } from "./modelVisibilityGroups";

const providerHeader: ProviderModelItem = {
  type: "header-provider",
  id: "provider:agent",
  providerKind: "agent",
  providerKey: "agent",
  hiddenModelsKey: "agent",
  label: "Agent",
};

const subHeader: ProviderModelItem = {
  type: "header-sub",
  id: "sub:agent:fusion",
  providerKind: "agent",
  providerKey: "agent",
  hiddenModelsKey: "agent",
  subId: "fusion",
  label: "Fusion",
};

function modelRow(modelId: string, familyModelIds?: readonly string[]): ProviderModelItem {
  return {
    type: "model",
    id: `model:agent:${modelId}`,
    providerKind: "agent",
    providerKey: "agent",
    hiddenModelsKey: "agent",
    providerLabel: "Agent",
    modelId,
    ...(familyModelIds ? { familyModelIds } : {}),
    label: modelId,
    isFavorite: false,
  };
}

describe("collectHeaderModelGroups", () => {
  it("carries every exact member id on a projected family row entry", () => {
    const groups = collectHeaderModelGroups([
      providerHeader,
      subHeader,
      modelRow("pair-a-x", ["pair-a-x", "pair-a-x-fast", "pair-a-y"]),
      modelRow("solo"),
    ]);
    const fusion = groups.get("sub:agent:fusion");
    // Rows under a sub header attach to it until the next header, per the
    // existing grouping semantics.
    expect(fusion).toEqual([
      { hiddenModelsKey: "agent", modelIds: ["pair-a-x", "pair-a-x-fast", "pair-a-y"] },
      { hiddenModelsKey: "agent", modelIds: ["solo"] },
    ]);
    const provider = groups.get("provider:agent");
    expect(provider).toEqual([
      { hiddenModelsKey: "agent", modelIds: ["pair-a-x", "pair-a-x-fast", "pair-a-y"] },
      { hiddenModelsKey: "agent", modelIds: ["solo"] },
    ]);
  });
});

describe("headerGroupState", () => {
  const isHidden = (hidden: ReadonlySet<string>) => (_key: string, modelId: string) =>
    hidden.has(modelId);

  it("treats a family entry as visible while any member stays visible", () => {
    const entries = [{ hiddenModelsKey: "agent", modelIds: ["a", "b", "c"] }];
    expect(headerGroupState(entries, isHidden(new Set()))).toBe("all");
    expect(headerGroupState(entries, isHidden(new Set(["a", "b"])))).toBe("all");
    expect(headerGroupState(entries, isHidden(new Set(["a", "b", "c"])))).toBe("none");
  });

  it("keeps mixed states across ordinary and family entries", () => {
    const entries = [
      { hiddenModelsKey: "agent", modelIds: ["a", "b"] },
      { hiddenModelsKey: "agent", modelIds: ["solo"] },
    ];
    expect(headerGroupState(entries, isHidden(new Set(["a", "b"])))).toBe("some");
    expect(headerGroupState(entries, isHidden(new Set(["a", "b", "solo"])))).toBe("none");
    expect(headerGroupState(entries, isHidden(new Set(["solo"])))).toBe("some");
  });
});
