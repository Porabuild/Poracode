import { describe, expect, it } from "vitest";
import { selectionBindingValuesSchema } from "@/shared/selectionBinding.schemas";
import type { ModelSelection, SelectionBindingOwner } from "@/shared/selectionBinding.schemas";
import {
  DevinCatalogUnavailableError,
  resolveDevinLaunchModel,
  resolveDevinOneShotModel,
} from "./launchContext";
import { resolveDevinUtilityModel } from "./oneShotSelection";
import { devinColdSelectionView } from "./terminalSelectionPolicy";
import type { DevinModelFamily } from "./models";

const owner: SelectionBindingOwner = { agentKind: "devin:profile-a", presentationMode: "terminal" };
function stamped(
  values: ModelSelection = {
    model: "opaque-member",
    effort: "",
    fast: false,
    thinking: false,
    contextSize: "default",
  },
): ModelSelection {
  const { model, ...controls } = values;
  const inertValues = selectionBindingValuesSchema.parse(controls);
  return {
    ...values,
    selectionBinding: {
      version: 1,
      kind: "family-member",
      model,
      owner: { ...owner },
      inertValues,
    },
  };
}
const consumers = [
  ["launch", resolveDevinLaunchModel],
  ["print", resolveDevinOneShotModel],
  ["utility", resolveDevinUtilityModel],
] as const;

describe("Devin Terminal selection evidence", () => {
  it.each(consumers)("%s preserves the exact cold UID and canonical controls", (_lane, resolve) => {
    const selection = stamped();
    const before = structuredClone(selection);
    expect(resolve(undefined, selection, owner)).toBe(selection.model);
    expect(selection).toEqual(before);
    expect(devinColdSelectionView(selection, owner)).toEqual({
      model: selection.model,
      selectionBinding: selection.selectionBinding,
    });
  });

  it.each(consumers)("%s checks every unrecorded actual carrier", (_lane, resolve) => {
    const selection = stamped({ model: "opaque-member", effort: "" });
    for (const carrier of [
      { fast: false },
      { thinking: false },
      { contextSize: "default" },
      { effort: "high" },
    ])
      expect(() => resolve(undefined, { ...selection, ...carrier }, owner)).toThrow(
        DevinCatalogUnavailableError,
      );
  });

  it.each([
    { agentKind: "devin", presentationMode: "terminal" },
    { agentKind: "devin:profile-b", presentationMode: "terminal" },
    { agentKind: owner.agentKind, presentationMode: "gui" },
    { ...owner, agentInstanceId: "route-a" },
  ] as SelectionBindingOwner[])(
    "refuses a different independently supplied owner %j",
    (actualOwner) => {
      expect(() => resolveDevinLaunchModel(undefined, stamped(), actualOwner)).toThrow(
        DevinCatalogUnavailableError,
      );
    },
  );

  it("does not infer a missing route ID from recorded ownership", () => {
    const selection = stamped();
    selection.selectionBinding!.owner.agentInstanceId = "route-a";
    expect(() => resolveDevinLaunchModel(undefined, selection, owner)).toThrow(
      DevinCatalogUnavailableError,
    );
    expect(
      resolveDevinLaunchModel(undefined, selection, { ...owner, agentInstanceId: "route-a" }),
    ).toBe(selection.model);
  });

  it.each([{ fast: true }, { thinking: true }, { effort: "high" }, { contextSize: "1m" }])(
    "refuses recorded values outside the Terminal declaration %j",
    (carrier) => {
      const selection = stamped({ model: "opaque-member", ...carrier });
      expect(devinColdSelectionView(selection, owner)).toBe(selection);
      expect(() => resolveDevinLaunchModel(undefined, selection, owner)).toThrow(
        DevinCatalogUnavailableError,
      );
    },
  );

  it("retains ordinary cold refusal when a binding is absent or malformed", () => {
    const selection = stamped();
    const unknownBindings: unknown[] = [
      undefined,
      null,
      {},
      { ...selection.selectionBinding, version: 2 },
      { ...selection.selectionBinding, extra: true },
    ];
    for (const binding of unknownBindings) {
      const candidate = { ...selection, selectionBinding: binding } as ModelSelection;
      expect(() => resolveDevinLaunchModel(undefined, candidate, owner)).toThrow(
        DevinCatalogUnavailableError,
      );
    }
  });

  it("invalidates the entire exemption on a missing or changed recorded carrier", () => {
    const original = stamped();
    const changed = { ...original, effort: "high" };
    const missing = { ...original };
    delete missing.contextSize;
    for (const selection of [changed, missing]) {
      expect(devinColdSelectionView(selection, owner)).toBe(selection);
      expect(() => resolveDevinLaunchModel(undefined, selection, owner)).toThrow(
        DevinCatalogUnavailableError,
      );
    }
  });

  it.each(consumers)(
    "%s resolves a warm catalog against all original controls",
    (_lane, resolve) => {
      const families: DevinModelFamily[] = [
        {
          id: "regular",
          label: "Regular",
          variants: [
            { id: "plain", effort: "medium", fast: false, thinking: false, context: "default" },
            { id: "priority", effort: "medium", fast: true, thinking: false, context: "default" },
          ],
        },
      ];
      const selection = stamped({ model: "priority", fast: false });
      expect(resolve(families, selection, owner)).toBe("plain");
      expect(selection.fast).toBe(false);
    },
  );
});
