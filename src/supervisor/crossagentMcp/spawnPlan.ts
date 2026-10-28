import type { AgentCapability, AgentKind, ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { capabilitiesForPresentation, validateAgentModelSelection } from "@/shared/agentSelection";
import type { CrossagentExecution } from "@/shared/crossagentRanking";
import { formatReasoningLabel } from "@/shared/modelLabels";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { SubagentSpawnError } from "./errors";
import { buildUnrestrictedChildConfig, resolveSubagentExecution } from "./types";
import type { ModelTier, SpawnAgentRequest, SpawnAgentSelection } from "./types";
import { classifyModelTier } from "./modelTier";
import { compactResultPrompt } from "./compactResult";
import { snapshotDispatchTrace, type DispatchTraceSnapshot } from "./dispatchTrace";

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
  /** Whether this presentation can reopen its provider session after disposal. */
  supportsResume?: boolean;
}

export interface PreparedSubagentRun {
  dispatchTrace?: DispatchTraceSnapshot;
  prompt: string;
  crewRole?: NonNullable<SpawnAgentRequest["crewRole"]>;
  resultMode?: "compact";
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

const WORKER_INSTRUCTIONS =
  "You are a delegated worker. Complete only the assigned scope and report evidence to the coordinator. " +
  "The coordinator owns scheduling and integration. Do not spawn nested agents or delegate through any tool " +
  "unless this assignment explicitly permits it, even if a loaded workflow normally recommends delegation. " +
  "Make routine decisions within the brief yourself. If a missing decision or ownership conflict blocks progress, " +
  "return the specific blocker rather than expanding scope. Follow the assignment's verification and reporting requirements.";

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
  const attempts = selections.map((selection, index) => {
    try {
      return resolveAttempt(deps, parent.config, selection, runName);
    } catch (err) {
      if (index === 0) throw err;
      const role = `fallbacks[${index - 1}]`;
      const message = err instanceof SubagentSpawnError ? err.message : String(err);
      throw new SubagentSpawnError(`${role}: ${message}`);
    }
  });

  const workerPrompt = request.crewRole
    ? `${WORKER_INSTRUCTIONS}\n\n${crewRolePreamble(request.crewRole, classifyModelTier(request.model ?? "", ""))}\n\n${prompt}`
    : `${WORKER_INSTRUCTIONS}\n\n${prompt}`;
  return {
    dispatchTrace: snapshotDispatchTrace(request, attempts, request.retryMode ?? "startup"),
    prompt: request.resultMode === "compact" ? compactResultPrompt(workerPrompt) : workerPrompt,
    ...(request.crewRole ? { crewRole: request.crewRole } : {}),
    ...(request.resultMode ? { resultMode: request.resultMode } : {}),
    projectLocation: parent.projectLocation,
    background: request.background === true,
    retryMode: request.retryMode ?? "startup",
    attempts,
  };
}

function crewRolePreamble(
  role: NonNullable<SpawnAgentRequest["crewRole"]>,
  tier: ModelTier,
): string {
  const brief = role.brief?.trim().replace(/\s+/g, " ");
  const normalizedBrief = brief && !/[.!?]$/.test(brief) ? `${brief}.` : brief;
  return (
    `Crew role: ${role.label}.` +
    (normalizedBrief ? ` ${normalizedBrief}` : "") +
    (role.noEdits
      ? " This role is told not to edit files: do not create, modify or delete files; report what you find instead."
      : "") +
    " Do this work yourself: do not start subagents, including your own built-in subagent or task tools, and do not hand it to other agents." +
    // Pushback helps when the helper is as strong as the lead; a smaller
    // model second-guessing the plan costs more than it catches.
    (tier === "max-capability"
      ? " If the task looks wrong or incomplete, say so and suggest a fix before implementing."
      : " Follow the task as written; if it cannot work, stop and report why instead of changing the plan.") +
    " Finish with a short report for the lead (under 15 lines): what you changed (files), the checks you ran with pass/fail, and anything left open. Do not paste full logs or whole files; the lead reads the diff itself."
  );
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
    supportsResume: execution === "structured" && capabilities.supportsResume === true,
    label: runName ? `${runName} — ${selectionLabel}` : selectionLabel,
    config: buildUnrestrictedChildConfig(
      {
        model,
        ...(selection.effort ? { effort: selection.effort } : {}),
        ...(typeof selection.fast === "boolean" ? { fast: selection.fast } : {}),
      },
      capabilities,
      parentConfig,
    ),
  };
}
