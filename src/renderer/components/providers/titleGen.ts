import type {
  AgentStatus,
  GenerateTitlePayload,
  GenerateTitleResult,
  ProjectLocation,
} from "../../../shared/contracts";
import { getTitleGenDefaults } from "./ProviderIcon";

function resolveTitleGenModel(agent: AgentStatus): string {
  const defaults = getTitleGenDefaults(agent.kind);
  if (defaults?.model && agent.capabilities.models.some((m) => m.id === defaults.model)) {
    return defaults.model;
  }
  return agent.capabilities.models[0]?.id ?? "";
}

function resolveTitleGenEfforts(agent: AgentStatus, model: string): string[] {
  const modelEfforts = agent.capabilities.modelEfforts[model];
  if (modelEfforts && modelEfforts.length > 0) {
    return modelEfforts;
  }
  return agent.capabilities.efforts;
}

function isTitleGenCandidate(agent: AgentStatus): boolean {
  return agent.installed && agent.authState !== "missing";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveTitleGenConfig(
  agent: AgentStatus | undefined,
  model: string,
  effort: string,
): {
  model: string;
  effort: string;
  availableEfforts: string[];
} {
  if (!agent) {
    return {
      model: "",
      effort: "",
      availableEfforts: [],
    };
  }

  const nextModel = agent.capabilities.models.some((m) => m.id === model)
    ? model
    : resolveTitleGenModel(agent);
  const availableEfforts = resolveTitleGenEfforts(agent, nextModel);
  if (availableEfforts.length === 0) {
    return {
      model: nextModel,
      effort: "",
      availableEfforts,
    };
  }

  if (availableEfforts.includes(effort)) {
    return {
      model: nextModel,
      effort,
      availableEfforts,
    };
  }

  const defaults = getTitleGenDefaults(agent.kind);
  // Prefer lowest effort for title gen — it's a lightweight task
  const fallbackEffort = [defaults?.effort, "low", availableEfforts[0]].find(
    (candidate) => Boolean(candidate) && availableEfforts.includes(candidate!),
  );

  return {
    model: nextModel,
    effort: fallbackEffort ?? "",
    availableEfforts,
  };
}

export function getTitleGenCandidates(
  agentStatuses: readonly AgentStatus[],
  provider: string,
): AgentStatus[] {
  const available = agentStatuses.filter(isTitleGenCandidate);
  if (provider === "auto") {
    return available;
  }
  return available.filter((agent) => agent.kind === provider);
}

export async function generateTitleWithFallback(input: {
  projectLocation: ProjectLocation;
  agentStatuses: readonly AgentStatus[];
  provider: string;
  model: string;
  effort: string;
  prompt: string;
  invoke: (payload: GenerateTitlePayload) => Promise<GenerateTitleResult>;
}): Promise<string> {
  const candidates = getTitleGenCandidates(input.agentStatuses, input.provider);
  if (candidates.length === 0) {
    throw new Error("No agent available to generate title");
  }

  const failures: string[] = [];

  for (const candidate of candidates) {
    const resolved = resolveTitleGenConfig(candidate, input.model, input.effort);

    try {
      const result = await input.invoke({
        projectLocation: input.projectLocation,
        agentKind: candidate.kind,
        prompt: input.prompt,
        ...(resolved.model ? { model: resolved.model } : {}),
        ...(resolved.effort ? { effort: resolved.effort } : {}),
      });
      return result.title;
    } catch (error) {
      const message = toErrorMessage(error);
      if (input.provider !== "auto") {
        throw error instanceof Error ? error : new Error(message);
      }
      failures.push(`${candidate.label}: ${message}`);
    }
  }

  throw new Error(`Auto title generation failed. ${failures.join(" | ")}`);
}
