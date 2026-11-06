import type { ThreadCrewBinding, CrewMemberSelection, CrewRole } from "@/shared/crew";
import { crewRoleMatches } from "@/shared/crew";
import type { CrewRoleOptionSnapshot, SpawnAgentRequest, SpawnableAgent } from "./types";

export interface ResolvedCrewRoleSpawn {
  args: Record<string, unknown>;
  crewRole: NonNullable<SpawnAgentRequest["crewRole"]>;
}

export function crewListDescription(
  crew: ThreadCrewBinding,
  agents: readonly SpawnableAgent[],
  runningRuns: readonly { role?: string; status: string }[],
): Record<string, unknown> {
  const roles = crew.roles.map((role) => ({
    role: role.id,
    label: role.label,
    ...(role.brief !== undefined ? { brief: role.brief } : {}),
    provider: role.selection.agentKind,
    model: role.selection.model,
    ...(role.selection.effort ? { reasoning: role.selection.effort } : {}),
    fast: role.selection.fast === true,
    ...(role.selection.contextSize ? { context_size: role.selection.contextSize } : {}),
    parallel: role.parallel ?? 1,
    running: runningRuns.filter((run) => run.role === role.id && run.status === "running").length,
    available: selectionsForRole(role).some(
      (selection) => selectionUnavailableReason(selection, agents) === undefined,
    ),
    ...(role.noEdits === true ? { no_edits: true } : {}),
  }));
  const instructions =
    crew.policy === "crew-only"
      ? "Spawn work with role=<id>; the role sets provider, model, reasoning and Fast. Crew only: spawns without a role are refused."
      : "Spawn work with role=<id>; the role sets provider, model, reasoning and Fast. Crew first: if no role fits or a role is unavailable, you may spawn one of agents without a role.";
  return {
    crew: {
      ...(crew.name !== undefined ? { name: crew.name } : {}),
      policy: crew.policy,
      instructions,
      roles,
    },
  };
}

export function resolveCrewRoleSpawn(
  args: Record<string, unknown>,
  crew: ThreadCrewBinding | undefined,
  agents: readonly SpawnableAgent[],
): ResolvedCrewRoleSpawn | undefined {
  if (args.role === undefined) {
    if (crew?.policy === "crew-only") {
      throw new Error(
        `This thread's crew is Crew only: spawn with role=<id> (${crew.roles.map((role) => role.id).join(", ")}).`,
      );
    }
    return undefined;
  }
  if (typeof args.role !== "string" || args.role.length === 0) {
    throw new Error("role must be a non-empty crew role id");
  }
  if (!crew) throw new Error("This thread has no crew; omit role.");
  const roleValue = args.role;
  const role = crew.roles.find((candidate) => crewRoleMatches(candidate, roleValue));
  if (!role) {
    throw new Error(
      `Unknown crew role: ${args.role}. Roles: ${crew.roles.map((candidate) => candidate.id).join(", ")}.`,
    );
  }
  if (selectionDiffers(args, role.selection)) {
    throw new Error(
      `role=${role.id} sets provider, model, reasoning, Fast and context length; omit them.`,
    );
  }
  if (args.fallbacks !== undefined) {
    throw new Error(`role=${role.id} uses the role's own fallbacks; omit fallbacks.`);
  }

  const configuredOptions = selectionsForRole(role);
  const spawnable: Array<{ selection: CrewMemberSelection; index: number }> = [];
  for (const [index, selection] of configuredOptions.entries()) {
    if (selectionUnavailableReason(selection, agents) === undefined) {
      spawnable.push({ selection, index });
    }
  }
  const [primaryEntry, ...fallbackEntries] = spawnable;
  if (!primaryEntry) {
    const crewFirstSuffix =
      crew.policy === "crew-first" ? " Crew first: you may spawn without a role." : "";
    throw new Error(
      `Role ${role.label} has no available agent right now (${role.selection.agentKind}/${role.selection.model} and its fallbacks are unavailable).${crewFirstSuffix}${unavailableRoleDetails(role, agents)}`,
    );
  }
  const primary = primaryEntry.selection;
  const fallbacks = fallbackEntries.map((entry) => entry.selection);

  const requestArgs = { ...args };
  delete requestArgs.role;
  delete requestArgs.fallbacks;
  const resolvedArgs: Record<string, unknown> = {
    ...requestArgs,
    provider: primary.agentKind,
    model: primary.model,
    ...(primary.effort !== undefined ? { reasoning: primary.effort } : {}),
    ...(primary.fast !== undefined ? { fast: primary.fast } : {}),
    ...(primary.contextSize ? { context_size: primary.contextSize } : {}),
    ...(fallbacks.length > 0
      ? {
          fallbacks: fallbacks.map((selection) => ({
            provider: selection.agentKind,
            model: selection.model,
            ...(selection.effort !== undefined ? { reasoning: selection.effort } : {}),
            ...(selection.fast !== undefined ? { fast: selection.fast } : {}),
            ...(selection.contextSize ? { context_size: selection.contextSize } : {}),
          })),
        }
      : {}),
  };
  return {
    args: resolvedArgs,
    crewRole: {
      id: role.id,
      label: role.label,
      ...(role.brief !== undefined ? { brief: role.brief } : {}),
      ...(role.noEdits === true ? { noEdits: true } : {}),
      parallel: role.parallel ?? 1,
      // Captured before availability filtering so later capability changes
      // cannot masquerade as configured role edits.
      selection: snapshotCrewOption(role.selection),
      ...(role.fallbacks !== undefined
        ? { fallbacks: role.fallbacks.map(snapshotCrewOption) }
        : {}),
      // Keeps duplicate configured options mapped to the attempt that used
      // them even when an earlier option was unavailable at spawn.
      optionIndices: [primaryEntry.index, ...fallbackEntries.map((entry) => entry.index)],
    },
  };
}

function snapshotCrewOption(selection: CrewMemberSelection): CrewRoleOptionSnapshot {
  return {
    provider: selection.agentKind,
    model: selection.model,
    ...(selection.contextSize !== undefined ? { contextSize: selection.contextSize } : {}),
    ...(selection.effort !== undefined ? { effort: selection.effort } : {}),
    ...(selection.fast !== undefined ? { fast: selection.fast } : {}),
  };
}

function selectionsForRole(role: CrewRole): CrewMemberSelection[] {
  return [role.selection, ...(role.fallbacks ?? [])];
}

function selectionUnavailableReason(
  selection: CrewMemberSelection,
  agents: readonly SpawnableAgent[],
): string | undefined {
  const agent = agents.find((candidate) => candidate.provider.value === selection.agentKind);
  if (!agent) return "provider unavailable";
  const model = agent.models.find((candidate) => candidate.value === selection.model);
  if (!model) return "model unavailable";
  if (selection.effort !== undefined && !model.reasoning.values.includes(selection.effort)) {
    const supported = boundedReasoningValues(model.reasoning.values);
    return supported
      ? `reasoning "${selection.effort}" is not supported (supported: ${supported})`
      : `reasoning "${selection.effort}" is not supported (no reasoning controls)`;
  }
  if (selection.fast === true && model.fast?.available !== true) {
    return "Fast unavailable";
  }
  return undefined;
}

function unavailableRoleDetails(role: CrewRole, agents: readonly SpawnableAgent[]): string {
  const failures: string[] = [];
  for (const selection of selectionsForRole(role)) {
    const reason = selectionUnavailableReason(selection, agents);
    if (reason !== undefined) {
      failures.push(`${selection.agentKind}/${selection.model}: ${reason}`);
    }
  }
  return failures.length > 0 ? ` Options: ${failures.join("; ")}.` : "";
}

function boundedReasoningValues(values: readonly string[]): string {
  if (values.length === 0) return "";
  const shown = values.slice(0, 4).join(", ");
  return values.length > 4 ? `${shown}, +${values.length - 4} more` : shown;
}

function selectionDiffers(args: Record<string, unknown>, selection: CrewMemberSelection): boolean {
  return (
    (args.provider !== undefined && args.provider !== selection.agentKind) ||
    (args.model !== undefined && args.model !== selection.model) ||
    (args.reasoning !== undefined && args.reasoning !== selection.effort) ||
    (args.fast !== undefined && args.fast !== (selection.fast === true)) ||
    (args.context_size !== undefined && args.context_size !== selection.contextSize)
  );
}
