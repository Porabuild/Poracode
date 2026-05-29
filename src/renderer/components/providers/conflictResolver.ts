import type { AgentStatus, ProjectLocation, ThreadPresentationMode } from "@/shared/contracts";
import { getConflictResolverDefaults, resolveConflictResolverConfig } from "./ProviderIcon";
import { getUtilityTaskCandidates } from "./utilityTask";

export { getConflictResolverCandidates, resolveConflictResolverConfig } from "./ProviderIcon";

export interface ConflictResolverSettings {
  provider: string;
  model: string;
  effort: string;
  presentationMode: ThreadPresentationMode;
}

type ConflictResolverSettingsSource = {
  conflictResolverProvider: string;
  conflictResolverModel: string;
  conflictResolverEffort: string;
  conflictResolverPresentationMode: ThreadPresentationMode;
  wslConflictResolverProvider: string;
  wslConflictResolverModel: string;
  wslConflictResolverEffort: string;
  wslConflictResolverPresentationMode: ThreadPresentationMode;
};

function isUnsetWslConflictResolver(settings: ConflictResolverSettingsSource): boolean {
  return (
    settings.wslConflictResolverProvider === "auto" && !settings.wslConflictResolverModel.trim()
  );
}

/** Resolve which stored conflict-resolver settings apply to a project location. */
export function readConflictResolverSettingsForProject(
  locationKind: ProjectLocation["kind"],
  settings: ConflictResolverSettingsSource,
): ConflictResolverSettings {
  if (locationKind !== "wsl") {
    return {
      provider: settings.conflictResolverProvider,
      model: settings.conflictResolverModel,
      effort: settings.conflictResolverEffort,
      presentationMode: settings.conflictResolverPresentationMode,
    };
  }

  if (isUnsetWslConflictResolver(settings)) {
    return {
      provider: settings.conflictResolverProvider,
      model: settings.conflictResolverModel,
      effort: settings.conflictResolverEffort,
      presentationMode: settings.conflictResolverPresentationMode,
    };
  }

  return {
    provider: settings.wslConflictResolverProvider,
    model: settings.wslConflictResolverModel,
    effort: settings.wslConflictResolverEffort,
    presentationMode: settings.wslConflictResolverPresentationMode,
  };
}

/**
 * Resolve the model/effort to launch with. In Custom mode the user's saved
 * model id is authoritative — don't downgrade to Auto when the live capability
 * probe is missing a model the settings UI already accepted.
 */
export function resolveConflictResolverLaunchConfig(
  providerSetting: string,
  agent: AgentStatus | undefined,
  model: string,
  effort: string,
): { model: string; effort: string } {
  const resolved = resolveConflictResolverConfig(agent, model, effort);
  const explicitModel =
    providerSetting !== "auto" && providerSetting !== "disabled" && model.trim()
      ? model.trim()
      : undefined;
  return {
    model: explicitModel ?? resolved.model,
    effort: resolved.effort,
  };
}

export function getConflictResolverCandidatesForLaunch(
  agentStatuses: readonly AgentStatus[],
  providerSetting: string,
): AgentStatus[] {
  return getUtilityTaskCandidates(agentStatuses, providerSetting, getConflictResolverDefaults);
}
