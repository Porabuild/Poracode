import type { AgentStatus, ProjectLocation, ThreadPresentationMode } from "@/shared/contracts";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import { resolveFastValue } from "@/renderer/components/thread/threadDraftViewHelpers";
import { readUtilitySelection } from "@/renderer/utils/utilitySelection";
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
  /**
   * The complete utility tuple this resolution actually read: the canonical
   * object verbatim when present, otherwise the unstamped tuple built from
   * the scalar siblings. The scalar fields above are the tuple's own launch
   * view (the ThreadConfig launch keeps its scalar carriers); the tuple is
   * the carrier of `thinking`/`contextSize` and of any recognized binding —
   * which never transfers onto the launched thread.
   */
  selection: ModelSelection;
  /** Original optional-field presence after native/WSL unset fallback. This
   * provenance selects legacy normalization; it is not a second tuple. */
  selectionSource: "canonical" | "legacy";
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
  /** Canonical complete selections — the sole tuple when present. Declared
   * undefined-valued so whole shared-settings states pass unconverted. */
  conflictResolverSelection?: ModelSelection | undefined;
  wslConflictResolverSelection?: ModelSelection | undefined;
};

/**
 * Whether the WSL variant is left at its default: the scalar preset is unset
 * AND no canonical WSL tuple was ever written. A present tuple is the
 * deliberate record even when the sibling scalars still hold the unset
 * shape.
 */
function isUnsetWslConflictResolver(settings: ConflictResolverSettingsSource): boolean {
  return (
    settings.wslConflictResolverProvider === "auto" &&
    !settings.wslConflictResolverModel.trim() &&
    settings.wslConflictResolverSelection === undefined
  );
}

/** Resolve which stored conflict-resolver settings apply to a project location. */
export function readConflictResolverSettingsForProject(
  locationKind: ProjectLocation["kind"],
  settings: ConflictResolverSettingsSource,
): ConflictResolverSettings {
  if (locationKind !== "wsl" || isUnsetWslConflictResolver(settings)) {
    const selection = readUtilitySelection(settings.conflictResolverSelection, {
      model: settings.conflictResolverModel,
      effort: settings.conflictResolverEffort,
      fast: settings.conflictResolverFast,
    });
    return {
      provider: settings.conflictResolverProvider,
      model: selection.model,
      // The scalar view is the launch view: an unclaimed axis resolves as the
      // empty scalar carrier, exactly as the legacy siblings did. The
      // complete tuple stays intact on `selection`.
      effort: selection.effort ?? "",
      fast: selection.fast ?? false,
      presentationMode: settings.conflictResolverPresentationMode,
      selection,
      selectionSource: settings.conflictResolverSelection !== undefined ? "canonical" : "legacy",
    };
  }

  const selection = readUtilitySelection(settings.wslConflictResolverSelection, {
    model: settings.wslConflictResolverModel,
    effort: settings.wslConflictResolverEffort,
    fast: settings.wslConflictResolverFast,
  });
  return {
    provider: settings.wslConflictResolverProvider,
    model: selection.model,
    effort: selection.effort ?? "",
    fast: selection.fast ?? false,
    presentationMode: settings.wslConflictResolverPresentationMode,
    selection,
    selectionSource: settings.wslConflictResolverSelection !== undefined ? "canonical" : "legacy",
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
  selection: ModelSelection,
): Omit<ModelSelection, "selectionBinding">;
export function resolveConflictResolverLaunchConfig(
  providerSetting: string,
  agent: AgentStatus | undefined,
  model: string,
  effort: string,
): { model: string; effort: string };
export function resolveConflictResolverLaunchConfig(
  providerSetting: string,
  agent: AgentStatus | undefined,
  modelOrSelection: string | ModelSelection,
  effort = "",
): Omit<ModelSelection, "selectionBinding"> {
  if (typeof modelOrSelection !== "string") {
    // Utility intent never transfers to the new thread, but every actual axis does.
    const { selectionBinding: _binding, ...selection } = modelOrSelection;
    return {
      ...selection,
      model:
        selection.model === ""
          ? resolveConflictResolverConfig(agent, "", "").model
          : selection.model,
    };
  }
  const resolved = resolveConflictResolverConfig(agent, modelOrSelection, effort);
  const explicitModel =
    providerSetting !== "auto" && providerSetting !== "disabled" && modelOrSelection.trim()
      ? modelOrSelection.trim()
      : undefined;
  return { model: explicitModel ?? resolved.model, effort: resolved.effort };
}

/** Project canonical controls intact; retain historical normalization only for legacy settings. */
export function resolveConflictResolverSettingsLaunchConfig(
  settings: ConflictResolverSettings,
  agent: AgentStatus,
): Omit<ModelSelection, "selectionBinding"> {
  if (settings.selectionSource === "canonical") {
    return resolveConflictResolverLaunchConfig(settings.provider, agent, settings.selection);
  }
  const { model, effort } = resolveConflictResolverLaunchConfig(
    settings.provider,
    agent,
    settings.model,
    settings.effort,
  );
  const fast = resolveFastValue(agent, model, settings.fast);
  return { model, ...(effort ? { effort } : {}), ...(fast ? { fast: true } : {}) };
}
