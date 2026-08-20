import type { AgentStatus, ProjectLocation, ThreadPresentationMode } from "@/shared/contracts";
import {
  createUtilityTaskRegistry,
  getUtilityTaskCandidates,
  resolveUtilityTaskConfig,
  type UtilityTaskCandidateAgent,
  type UtilityTaskConfigAgent,
} from "./utilityTask";

const conflictResolverRegistry = createUtilityTaskRegistry();
export const registerConflictResolverDefaults = conflictResolverRegistry.register;
export const getConflictResolverDefaults = conflictResolverRegistry.get;
export const getConflictResolverDefaultsHint = conflictResolverRegistry.getHint;

export function getConflictResolverCandidates<T extends UtilityTaskCandidateAgent>(
  agentStatuses: readonly T[],
  provider: string,
): T[] {
  return getUtilityTaskCandidates(agentStatuses, provider, getConflictResolverDefaults);
}

export function resolveConflictResolverConfig(
  agent: UtilityTaskConfigAgent | undefined,
  model: string,
  effort: string,
): { model: string; effort: string; availableEfforts: string[] } {
  return resolveUtilityTaskConfig(agent, model, effort, getConflictResolverDefaults);
}

export interface ConflictResolverSettings {
  provider: string;
  model: string;
  effort: string;
  fast: boolean;
  presentationMode: ThreadPresentationMode;
}

/** The shared-settings fields conflict-resolver resolution actually reads. */
export type ConflictResolverSettingsSource = {
  conflictResolverProvider: string;
  conflictResolverModel: string;
  conflictResolverEffort: string;
  conflictResolverFast: boolean;
  conflictResolverPresentationMode: ThreadPresentationMode;
  wslConflictResolverProvider: string;
  wslConflictResolverModel: string;
  wslConflictResolverEffort: string;
  wslConflictResolverFast: boolean;
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
      fast: settings.conflictResolverFast,
      presentationMode: settings.conflictResolverPresentationMode,
    };
  }

  if (isUnsetWslConflictResolver(settings)) {
    return {
      provider: settings.conflictResolverProvider,
      model: settings.conflictResolverModel,
      effort: settings.conflictResolverEffort,
      fast: settings.conflictResolverFast,
      presentationMode: settings.conflictResolverPresentationMode,
    };
  }

  return {
    provider: settings.wslConflictResolverProvider,
    model: settings.wslConflictResolverModel,
    effort: settings.wslConflictResolverEffort,
    fast: settings.wslConflictResolverFast,
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
