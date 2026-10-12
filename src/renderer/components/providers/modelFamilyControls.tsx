import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { resolveModelSelectionEdit } from "@/renderer/components/thread/buildModelPickerControls";
import { formatEffortLabel } from "@/renderer/components/thread/threadDraftViewHelpers";
import type { ComposerControlsInput } from "./providerComposer";
import { msg as sharedMessage } from "@/shared/messages";
import {
  modelFamilyDisplayConfig,
  modelFamilyEfforts,
  projectModelFamilies,
  modelFamilySelectorOptions,
} from "@/shared/modelFamilySelection";
import { familyMenuColumn, type ModelFamilyControlPresentation } from "./modelFamilyControlOptions";

/**
 * One paired control, opted into by the provider leaf, only while an accepted
 * family member is selected. Descriptor order owns the column order. Native
 * option parsing is supplied by the leaf; shared code never parses vendor IDs.
 */
export function modelFamilySelectorControls(
  input: ComposerControlsInput,
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
  const display = modelFamilyDisplayConfig(capabilities, config);
  const shownEffort = display?.effort ?? config.effort;
  const edit = (change: Parameters<typeof resolveModelSelectionEdit>[2]) => {
    if (input.isDisabled) return;
    const patch = resolveModelSelectionEdit(capabilities, config, change);
    // The origin rides the forwarded patch so the composition point can tell a
    // relation-resolved member edit from an independent config-bound carrier
    // touch; an empty retain-no-op is not discarded before event reduction.
    if (patch) input.onConfigChange(patch, { kind: "family-resolved" });
  };
  return [
    {
      kind: "effort-context",
      efforts: modelFamilyEfforts(capabilities, config).map((id) => ({
        id,
        label: formatEffortLabel(id),
      })),
      ...(shownEffort !== undefined ? { effortValue: shownEffort } : {}),
      onEffortChange: (value) => edit({ kind: "effort", value }),
      contextSizes: [],
      familySelection: {
        columns: family.selectors.map((selector) =>
          familyMenuColumn({
            id: selector.id,
            label: presentation.selectorLabel?.(selector.id) ?? sharedMessage(selector.labelKey),
            options: modelFamilySelectorOptions(capabilities, config, selector.id),
            value: member.selections[selector.id] ?? "",
            ...(presentation.option ? { decode: presentation.option } : {}),
            onChange: (value) => edit({ kind: "selector", selectorId: selector.id, value }),
          }),
        ),
        effortScope:
          family.bindings.effort === "model"
            ? "primary"
            : (presentation.configEffortScope ?? "primary"),
      },
      isDisabled: input.isDisabled,
      hideLabelOnWrap: true,
      tier: 4,
    },
  ];
}
