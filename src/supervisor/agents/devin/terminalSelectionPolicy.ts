import type { ModelFamilySelection } from "@/shared/contracts";
import { selectionBindingMatches } from "@/shared/selectionBinding";
import type {
  ModelSelection,
  SelectionAxis,
  SelectionBindingOwner,
} from "@/shared/selectionBinding.schemas";

/** Only Terminal family members encode these otherwise inert control seeds. */
export const DEVIN_TERMINAL_REDUNDANT_VALUES: NonNullable<ModelFamilySelection["redundantValues"]> =
  {
    effort: ["", "default"],
    fast: [false],
    thinking: [false],
    contextSize: ["", "default"],
  };

/**
 * Temporary cold-resolution view only. Matching evidence removes its own
 * allowed entries; every unrecorded actual control still requires resolution.
 * The canonical selection and binding remain unchanged.
 */
export function devinColdSelectionView(
  selection: ModelSelection,
  owner: SelectionBindingOwner,
): ModelSelection {
  const binding = selection.selectionBinding;
  if (
    owner.presentationMode !== "terminal" ||
    !binding ||
    !selectionBindingMatches(binding, { owner, selection })
  )
    return selection;
  const axes = Object.keys(binding.inertValues) as SelectionAxis[];
  if (
    !axes.every((axis) =>
      DEVIN_TERMINAL_REDUNDANT_VALUES[axis]?.some((value) => value === binding.inertValues[axis]),
    )
  )
    return selection;
  const residual = { ...selection };
  for (const axis of axes) delete residual[axis];
  return residual;
}
