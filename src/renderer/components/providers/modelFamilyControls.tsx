import { SlidersHorizontal } from "lucide-react";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { resolveModelSelectionEdit } from "@/renderer/components/thread/buildModelPickerControls";
import type { ComposerControlsInput } from "./providerComposer";
import { msg as sharedMessage } from "@/shared/messages";
import { projectModelFamilies, modelFamilySelectorOptions } from "@/shared/modelFamilySelection";
import {
  familySelectorMenuOptions,
  type ModelFamilyControlPresentation,
} from "./modelFamilyControlOptions";

/**
 * One selector control per family selector, opted into by the provider leaf,
 * only while an accepted family member is selected. Descriptor order owns the
 * control order. Native option parsing is supplied by the leaf; shared code
 * never parses vendor IDs. The ordinary Reasoning/context control stays with
 * the common picker controls — these menus only edit selector coordinates.
 */
export function modelFamilySelectorControls(
  input: ComposerControlsInput,
  agentKind: string,
  presentation: ModelFamilyControlPresentation = {},
): ComposerControl[] {
  const { capabilities, config } = input;
  const acceptedFamilies = projectModelFamilies(capabilities).filter(
    (family) => family.selectors.length === 2 && presentation.accepts?.(family) !== false,
  );
  const family = acceptedFamilies.find((candidate) =>
    candidate.members.some((member) => member.model === config.model),
  );
  if (!family) return [];
  const member = family.members.find((candidate) => candidate.model === config.model);
  if (!member) return [];
  const edit = (change: Parameters<typeof resolveModelSelectionEdit>[2]) => {
    if (input.isDisabled) return;
    const patch = resolveModelSelectionEdit(capabilities, config, change);
    // The origin rides the forwarded patch so the composition point can tell a
    // relation-resolved member edit from an independent config-bound carrier
    // touch; an empty retain-no-op is not discarded before event reduction.
    if (patch) input.onConfigChange(patch, { kind: "family-resolved" });
  };
  return family.selectors.map((selector) => ({
    kind: "family-selector",
    agentKind,
    id: selector.id,
    label: presentation.selectorLabel?.(selector.id) ?? sharedMessage(selector.labelKey),
    icon: presentation.selectorIcon?.(selector.id) ?? (
      <SlidersHorizontal className="size-4 shrink-0" />
    ),
    options: familySelectorMenuOptions({
      selectorId: selector.id,
      options: modelFamilySelectorOptions(capabilities, config, selector.id),
      ...(presentation.option ? { decode: presentation.option } : {}),
    }),
    value: member.selections[selector.id] ?? "",
    onChange: (value) => edit({ kind: "selector", selectorId: selector.id, value }),
    isDisabled: input.isDisabled,
    hideLabelOnWrap: true,
    tier: 4,
  }));
}
