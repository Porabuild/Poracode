import type { ModelSelection, SelectionBindingOwner } from "@/shared/selectionBinding.schemas.ts";
import { assertOneShotControlsMapped } from "../base";
import { resolveDevinOneShotModel } from "./launchContext";
import type { DevinModelFamily } from "./models";

/** Empty string carriers inherit; boolean pins require a known variant. */
export function assertDevinUnmappedOneShotControls(selection: ModelSelection): void {
  assertOneShotControlsMapped(selection, {
    effort: { inactive: [""] },
    contextSize: { inactive: [""] },
  });
}

/** Unknown/implicit ids cannot consume controls through the catalog resolver. */
export function resolveDevinUtilityModel(
  families: readonly DevinModelFamily[] | undefined,
  selection: ModelSelection,
  owner: SelectionBindingOwner,
): string {
  if (
    !selection.model ||
    (families?.length &&
      !families.some(
        (family) =>
          family.id === selection.model ||
          family.variants.some((variant) => variant.id === selection.model),
      ))
  ) {
    assertDevinUnmappedOneShotControls(selection);
  }
  return resolveDevinOneShotModel(families, selection, owner);
}
