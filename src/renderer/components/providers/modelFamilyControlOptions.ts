import type { ReactNode } from "react";
import type {
  LabeledOption,
  ModelFamilySelection,
  ModelFamilySelectorOption,
} from "@/shared/contracts";
import type { ModelFamilySelectorOption as SelectorMenuOption } from "../common/ProviderModelMenu/ModelFamilySelectorMenu";
import { formatEffortLabel } from "../common/effortLabel";

/** A provider decodes its native option vocabulary, never its opaque pair UID. */
export interface ModelFamilyOptionPresentation {
  model: LabeledOption;
  effort?: string;
}

/** Renderer-only presentation hook: no persisted or wire contract extension. */
export interface ModelFamilyControlPresentation {
  accepts?: (family: ModelFamilySelection) => boolean;
  selectorLabel?: (selectorId: string) => string | undefined;
  selectorIcon?: (selectorId: string) => ReactNode | undefined;
  option?: (
    selectorId: string,
    option: ModelFamilySelectorOption,
  ) => ModelFamilyOptionPresentation | undefined;
}

/**
 * Selector menu options for presentation: each row keeps the exact native
 * option id (the only value the relation resolver accepts) and shows the
 * provider-decoded model label with the decoded effort as a hint. A lossy
 * interpretation must never hide a real native choice — when decoded
 * [model, effort] coordinates collide, every row falls back to its exact
 * native label with no hint.
 */
export function familySelectorMenuOptions(input: {
  selectorId: string;
  options: readonly ModelFamilySelectorOption[];
  decode?: ModelFamilyControlPresentation["option"];
}): SelectorMenuOption[] {
  const entries = input.options.map((option) => ({
    option,
    presentation: (input.decode?.(input.selectorId, option) ?? {
      model: option,
    }) as ModelFamilyOptionPresentation,
  }));
  const coordinates = entries.map(({ presentation }) =>
    JSON.stringify([presentation.model.id, presentation.effort]),
  );
  const ambiguous = new Set(coordinates).size !== entries.length;
  return entries.map(({ option, presentation }) => {
    if (ambiguous) return { id: option.id, label: option.label };
    return presentation.effort === undefined
      ? { id: option.id, label: presentation.model.label }
      : {
          id: option.id,
          label: presentation.model.label,
          hint: formatEffortLabel(presentation.effort),
        };
  });
}
