import type {
  LabeledOption,
  ModelFamilySelection,
  ModelFamilySelectorOption,
} from "@/shared/contracts";
import type { FamilyMenuColumn } from "../common/ProviderModelMenu/ModelConfigurationPanel.types";
import { formatEffortLabel } from "../thread/threadDraftViewHelpers";

/** A provider decodes its native option vocabulary, never its opaque pair UID. */
export interface ModelFamilyOptionPresentation {
  model: LabeledOption;
  effort?: string;
}

/** Renderer-only presentation hook: no persisted or wire contract extension. */
export interface ModelFamilyControlPresentation {
  accepts?: (family: ModelFamilySelection) => boolean;
  selectorLabel?: (selectorId: string) => string | undefined;
  option?: (
    selectorId: string,
    option: ModelFamilySelectorOption,
  ) => ModelFamilyOptionPresentation | undefined;
  /** Config-bound effort may apply to the pair; model-bound effort belongs to the first component. */
  configEffortScope?: "primary" | "shared";
}

/**
 * Group reachable exact selector options for presentation. Effort edits hold the
 * component model; model edits retain effort when available, otherwise select
 * the first real option offered for that model. Every callback still carries
 * an existing selector option ID into the relation resolver.
 */
export function familyMenuColumn(input: {
  id: string;
  label: string;
  options: readonly ModelFamilySelectorOption[];
  value: string;
  decode?: ModelFamilyControlPresentation["option"];
  onChange: (value: string) => void;
}): FamilyMenuColumn {
  let entries = input.options.map(
    (
      option,
    ): { option: ModelFamilySelectorOption; presentation: ModelFamilyOptionPresentation } => ({
      option,
      presentation: input.decode?.(input.id, option) ?? { model: option },
    }),
  );
  // A lossy interpretation must never hide a real native choice. Unknown or
  // ambiguous vocabularies stay on the unsplit exact-option presentation.
  const coordinates = entries.map(({ presentation }) =>
    JSON.stringify([presentation.model.id, presentation.effort]),
  );
  if (new Set(coordinates).size !== entries.length) {
    entries = input.options.map((option) => ({ option, presentation: { model: option } }));
  }
  const current = entries.find((entry) => entry.option.id === input.value);
  const models = new Map<string, LabeledOption>();
  for (const { presentation } of entries) models.set(presentation.model.id, presentation.model);
  const currentModel = current?.presentation.model.id ?? input.value;
  const currentEffort = current?.presentation.effort;
  const effortEntries = entries.filter(
    (entry) =>
      entry.presentation.model.id === currentModel && entry.presentation.effort !== undefined,
  );
  const efforts = new Map(effortEntries.map((entry) => [entry.presentation.effort!, entry]));
  return {
    id: input.id,
    label: input.label,
    models: {
      options: [...models.values()],
      value: currentModel,
      onChange: (value) => {
        const choices = entries.filter((entry) => entry.presentation.model.id === value);
        const target =
          choices.find((entry) => entry.presentation.effort === currentEffort) ?? choices[0];
        if (target) input.onChange(target.option.id);
      },
    },
    ...(currentEffort !== undefined && efforts.size > 0
      ? {
          effort: {
            options: [...efforts.keys()].map((id) => ({ id, label: formatEffortLabel(id) })),
            value: currentEffort,
            onChange: (value: string) => {
              const target = efforts.get(value);
              if (target) input.onChange(target.option.id);
            },
          },
        }
      : {}),
  };
}
