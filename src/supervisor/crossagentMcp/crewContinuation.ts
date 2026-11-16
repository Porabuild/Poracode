import { SubagentCapabilityChangeError, SubagentSpawnError } from "./errors";
import type { PreparedSubagentRun, ResolvedSpawnAttempt } from "./spawnPlan";
import type { CrewRoleOptionSnapshot, SpawnAgentRequest } from "./types";

export const FRESH_HELPER_GUIDANCE =
  "Use spawn_agent with the current role, fresh_session=true and a self-contained task brief; the fresh helper uses the role's currently available model, settings and context. This worker's conversation was not changed.";

export interface CrewContinuationSelection {
  /** Selection fields for the winning configured option's next turn. */
  request: SpawnAgentRequest;
  /** Raw configured context of the winning option, or undefined for none. */
  configuredContextSize?: string;
}

/**
 * The single crew-continuation compatibility path. Returns undefined for
 * internal callers/manually constructed plans without an immutable configured
 * snapshot so the caller keeps the previous safe comparison. Throws when the
 * configured role primary changed or the winning option is no longer part of
 * the role.
 */
export function resolveCrewContinuationSelection(
  plan: PreparedSubagentRun,
  attemptIndex: number,
  attempt: ResolvedSpawnAttempt,
  selectionUpdate: SpawnAgentRequest,
): CrewContinuationSelection | undefined {
  const originalRole = plan.crewRole;
  const currentRole = selectionUpdate.crewRole;
  if (!originalRole?.selection || !currentRole?.selection) return undefined;
  const originalOptionIndices = originalRole.optionIndices;
  if (!originalOptionIndices) return undefined;
  const originalWinningIndex = originalOptionIndices[attemptIndex];
  if (originalWinningIndex === undefined) return undefined;

  const originalPrimary = originalRole.selection;
  const currentPrimary = currentRole.selection;
  const originalOptions = [originalPrimary, ...(originalRole.fallbacks ?? [])];
  const currentOptions = [currentPrimary, ...(currentRole.fallbacks ?? [])];
  const originalWinning = originalOptions[originalWinningIndex];
  if (!originalWinning) return undefined;

  if (!sameConfiguredIdentity(originalPrimary, currentPrimary)) {
    throw new SubagentSpawnError(
      `Crew role ${currentRole.id} changed provider, model or context length ` +
        `(original ${formatCrewSelection(originalPrimary, originalPrimary.contextSize)}; current ${formatCrewSelection(currentPrimary, currentPrimary.contextSize)}; ` +
        `active worker ${formatCrewSelection(originalWinning, originalWinning.contextSize)}). ${FRESH_HELPER_GUIDANCE}`,
    );
  }

  const originalMatches = originalOptions.filter((option) =>
    sameConfiguredIdentity(option, originalWinning),
  );
  const winningOrdinal = originalMatches.findIndex((option) => option === originalWinning);
  const currentMatches = currentOptions.filter((option) =>
    sameConfiguredIdentity(option, originalWinning),
  );
  if (currentMatches.length !== originalMatches.length) {
    throw new SubagentSpawnError(
      `Crew role ${currentRole.id} duplicate/equivalent configured option count for ` +
        `${formatCrewSelection(originalWinning, originalWinning.contextSize)} changed ` +
        `(original ${originalMatches.length}, current ${currentMatches.length}); ` +
        `automatic remapping/continuation is refused. ${FRESH_HELPER_GUIDANCE}`,
    );
  }
  const activeOption = currentMatches[winningOrdinal]!;

  const currentWinningIndex = currentOptions.indexOf(activeOption);
  return {
    request: {
      agent: attempt.provider,
      model: attempt.model,
      ...(activeOption.effort !== undefined ? { effort: activeOption.effort } : {}),
      ...(activeOption.fast !== undefined ? { fast: activeOption.fast } : {}),
      ...(activeOption.contextSize !== undefined ? { contextSize: activeOption.contextSize } : {}),
      // Refresh instructions and labels from the current role while retaining
      // the winning option's occurrence and identity.
      crewRole: { ...currentRole, optionIndices: [currentWinningIndex] },
      prompt: selectionUpdate.prompt,
    },
    ...(activeOption.contextSize !== undefined
      ? { configuredContextSize: activeOption.contextSize }
      : {}),
  };
}

/**
 * A configured identity comparison intentionally ignores effort and Fast:
 * changing only those updates the same member's next turn. It uses provider,
 * model and the raw configured context, never the capability-filtered effective
 * config.
 */
function sameConfiguredIdentity(
  left: CrewRoleOptionSnapshot,
  right: CrewRoleOptionSnapshot,
): boolean {
  return (
    left.provider === right.provider &&
    left.model === right.model &&
    (left.contextSize || undefined) === (right.contextSize || undefined)
  );
}

export function formatCrewSelection(
  selection: Pick<CrewRoleOptionSnapshot, "provider" | "model">,
  contextSize?: string,
): string {
  return `${selection.provider}/${selection.model}${contextSize ? `/${contextSize}` : ""}`;
}

/**
 * Refuse a new provider turn when the provider no longer advertises the
 * context the existing session was opened with. A missing original effective
 * context is preserved by the caller; this check only protects explicit ones.
 */
export function assertCrewContinuationContext(
  roleId: string,
  attempt: ResolvedSpawnAttempt,
  next: ResolvedSpawnAttempt,
  configuredContextSize: string | undefined,
): void {
  const originalEffective = attempt.config.contextSize;
  if (originalEffective === undefined || next.config.contextSize === originalEffective) return;
  throw new SubagentCapabilityChangeError(
    `Crew role ${roleId} cannot continue ${attempt.provider}/${attempt.model}: ` +
      `requested context length ${configuredContextSize ?? "default"} is no longer available ` +
      `(original effective context ${originalEffective}; current effective context ${
        next.config.contextSize ?? "default"
      }). Retry after provider capabilities recover. ` +
      FRESH_HELPER_GUIDANCE,
  );
}
