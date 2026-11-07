import type { ProviderModelCrewSection } from "@/renderer/components/common/ProviderModelMenu/ProviderModelMenu";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type { CrewRosterModel } from "./crewComposerModel";

/** Fast lives per crew member once a roster is active; the toolbar toggle would target the lead only. */
function isFastToggle(
  control: ComposerControl,
): control is Extract<ComposerControl, { kind: "toggle" }> {
  return control.kind === "toggle" && control.label === "Fast";
}

export function applyCrewComposerControls(
  controls: readonly ComposerControl[],
  options: {
    crewSection: ProviderModelCrewSection;
    roster?: CrewRosterModel;
    openSignal?: number;
  },
): ComposerControl[] {
  // The producer's Fast descriptor already knows family availability and emits
  // the canonical resolved edit. Capture the exact object before the toolbar
  // toggle is filtered out so the lead row and shortcut can dispatch it.
  const leadFastControl = options.roster ? controls.find(isFastToggle) : undefined;
  const withCrewSection = controls
    .filter((control) => options.roster === undefined || !isFastToggle(control))
    .map((control) =>
      control.kind === "provider-model"
        ? { ...control, crewSection: options.crewSection }
        : control,
    );
  if (!options.roster) return withCrewSection;

  const crewControl: ComposerControl = {
    kind: "crew",
    model: leadFastControl ? { ...options.roster, leadFastControl } : options.roster,
    isDisabled: options.roster.isDisabled,
    ...(options.openSignal !== undefined ? { openSignal: options.openSignal } : {}),
    hideLabelOnWrap: true,
    tier: 4,
  };
  const effortIndex = withCrewSection.findIndex((control) => control.kind === "effort-context");
  if (effortIndex >= 0) {
    return withCrewSection.flatMap((control, index) =>
      index === effortIndex ? [crewControl] : control.kind === "effort-context" ? [] : [control],
    );
  }
  const providerIndex = withCrewSection.findIndex((control) => control.kind === "provider-model");
  if (providerIndex < 0) return [...withCrewSection, crewControl];
  return [
    ...withCrewSection.slice(0, providerIndex + 1),
    crewControl,
    ...withCrewSection.slice(providerIndex + 1),
  ];
}
