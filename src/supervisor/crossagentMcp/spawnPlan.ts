import type { AgentCapability, AgentKind, ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { capabilitiesForPresentation, validateAgentModelSelection } from "@/shared/agentSelection";
import type { CrossagentExecution } from "@/shared/crossagentRanking";
import { formatReasoningLabel } from "@/shared/modelLabels";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { SubagentSpawnError } from "./errors";
import { buildUnrestrictedChildConfig, resolveSubagentExecution } from "./types";
import type { SpawnAgentRequest, SpawnAgentSelection } from "./types";

export interface ResolvedSpawnAttempt {
  adapter: AgentAdapter;
  config: ThreadConfig;
  provider: string;
  model: string;
  label: string;
  /**
   * Lane resolved once at plan time. Re-deriving it per attempt could flip the
   * lane between validation and execution when an adapter's preference depends
   * on detection state (e.g. Antigravity's CLI-gated one-shot lane), picking a
   * different process than the validated model was chosen for.
   */
  execution: CrossagentExecution;
}

export interface PreparedSubagentRun {
  prompt: string;
  projectLocation: ProjectLocation;
  background: boolean;
  retryMode: "startup" | "any-failure";
  attempts: ResolvedSpawnAttempt[];
}

interface SpawnPlanDeps {
  adapters: Map<AgentKind, AgentAdapter>;
  /** `null` means user-disabled; `undefined` means no cached status is available. */
  getStatusCapabilities?: (kind: AgentKind) => AgentCapability | null | undefined;
}

/**
 * Validate and resolve a complete primary + fallback chain before any child is
 * started. Batch spawns use this to stay atomic when one task has a bad model.
 */
export function prepareSubagentRun(
  deps: SpawnPlanDeps,
  parent: { projectLocation: ProjectLocation; config: ThreadConfig },
  request: SpawnAgentRequest,
): PreparedSubagentRun {
  const prompt = request.prompt?.trim();
  if (!prompt) throw new SubagentSpawnError("prompt is required");

  const selections: SpawnAgentSelection[] = [request, ...(request.fallbacks ?? [])];
  const runName = request.name?.trim();
  const attempts = selections.map((selection) =>
    resolveAttempt(deps, parent.config, selection, runName),
  );

  return {
    prompt,
    projectLocation: parent.projectLocation,
    background: request.background === true,
    retryMode: request.retryMode ?? "startup",
    attempts,
  };
}

function resolveAttempt(
  deps: SpawnPlanDeps,
  parentConfig: ThreadConfig,
  selection: SpawnAgentSelection,
  runName: string | undefined,
): ResolvedSpawnAttempt {
  const adapter = deps.adapters.get(selection.agent as AgentKind);
  if (!adapter) throw new SubagentSpawnError(`Unknown provider: ${selection.agent}`);

  const execution = resolveSubagentExecution(adapter);
  if (!execution) {
    throw new SubagentSpawnError(`Provider ${selection.agent} cannot be spawned as a subagent`);
  }

  const configuredCapabilities = deps.getStatusCapabilities?.(adapter.kind);
  if (configuredCapabilities === null) {
    throw new SubagentSpawnError(`Provider ${selection.agent} is disabled in settings`);
  }
  const baseCapabilities = configuredCapabilities ?? adapter.capabilities;
  const capabilities =
    execution === "structured"
      ? capabilitiesForPresentation(baseCapabilities, "gui")
      : baseCapabilities;
  const model = selection.model ?? capabilities.models[0]?.id;
  if (!model) {
    throw new SubagentSpawnError(`Provider ${selection.agent} has no available models`);
  }

  const selectionError = validateAgentModelSelection(capabilities, {
    model,
    ...(selection.effort ? { reasoning: selection.effort } : {}),
    ...(selection.fast === true ? { fast: true } : {}),
  });
  if (selectionError) throw new SubagentSpawnError(selectionError);

  const modelLabel =
    capabilities.models.find((candidate) => candidate.id === model)?.label ?? model;
  const subProviderLabel = capabilities.subProviders?.find((candidate) => {
    const mappedId = capabilities.modelSubProvider?.[model];
    return (
      candidate.id === mappedId ||
      model.startsWith(`${candidate.id}/`) ||
      model.startsWith(`${candidate.id}:`)
    );
  })?.label;
  const selectionLabel = [
    adapter.label,
    ...(subProviderLabel && subProviderLabel.toLowerCase() !== adapter.label.toLowerCase()
      ? [subProviderLabel]
      : []),
    modelLabel,
    ...(selection.effort ? [formatReasoningLabel(selection.effort)] : []),
    ...(selection.fast === true ? ["Fast"] : []),
  ].join(" · ");

  return {
    adapter,
    provider: selection.agent,
    model,
    execution,
    label: runName ? `${runName} — ${selectionLabel}` : selectionLabel,
    config: buildUnrestrictedChildConfig(
      {
        model,
        ...(selection.effort ? { effort: selection.effort } : {}),
        ...(selection.fast === true ? { fast: true } : {}),
      },
      capabilities,
      parentConfig,
    ),
  };
}
