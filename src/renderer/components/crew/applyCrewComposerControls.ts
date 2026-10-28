import type { ProviderModelCrewSection } from "@/renderer/components/common/ProviderModelMenu/ProviderModelMenu";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type { CrewRosterModel } from "./crewComposerModel";

export function applyCrewComposerControls(
  controls: readonly ComposerControl[],
  options: {
    crewSection: ProviderModelCrewSection;
    roster?: CrewRosterModel;
    openSignal?: number;
  },
): ComposerControl[] {
  const withCrewSection = controls.map((control) =>
    control.kind === "provider-model" ? { ...control, crewSection: options.crewSection } : control,
  );
  if (!options.roster) return withCrewSection;

  const crewControl: ComposerControl = {
    kind: "crew",
    model: options.roster,
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
