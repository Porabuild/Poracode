import type { LabeledOption } from "@/shared/contracts";

export interface FamilyMenuSelect {
  options: readonly LabeledOption[];
  value: string;
  onChange: (value: string) => void;
}

export interface FamilyMenuColumn {
  id: string;
  label: string;
  models: FamilyMenuSelect;
  /** Native component effort encoded by the selector's exact option IDs. */
  effort?: FamilyMenuSelect;
}

/** Renderer-only presentation; all callbacks resolve through the accepted relation. */
export interface ModelFamilyMenuSelection {
  columns: readonly FamilyMenuColumn[];
  /** Whether the ordinary effort carrier controls the first component or the entire pair. */
  effortScope: "primary" | "shared";
  // Fast is intentionally absent: it stays on the ordinary composer toggle,
  // whose family-aware resolver owns the pair's speed edit.
}

export function modelFamilyMenuSummary(selection: ModelFamilyMenuSelection): string {
  return selection.columns
    .map(
      (column) =>
        column.models.options.find((option) => option.id === column.models.value)?.label ??
        column.models.value,
    )
    .join(" + ");
}
