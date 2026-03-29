import type {
  AgentStatus,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
  ProjectLocation,
} from "../../../shared/contracts";
import { getCommitGenDefaults } from "./ProviderIcon";

function resolveCommitGenModel(agent: AgentStatus): string {
  const defaults = getCommitGenDefaults(agent.kind);
  if (defaults?.model && agent.capabilities.models.some((m) => m.id === defaults.model)) {
    return defaults.model;
  }
  return agent.capabilities.models[0]?.id ?? "";
}

function resolveCommitGenEfforts(agent: AgentStatus, model: string): string[] {
  const modelEfforts = agent.capabilities.modelEfforts[model];
  if (modelEfforts && modelEfforts.length > 0) {
    return modelEfforts;
  }
  return agent.capabilities.efforts;
}

function isCommitGenCandidate(agent: AgentStatus): boolean {
  return agent.installed && agent.authState === "authenticated";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveCommitGenConfig(
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
    : resolveCommitGenModel(agent);
  const availableEfforts = resolveCommitGenEfforts(agent, nextModel);
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

  const defaults = getCommitGenDefaults(agent.kind);
  const fallbackEffort = [
    defaults?.effort,
    agent.capabilities.defaultEffort,
    availableEfforts[0],
  ].find((candidate) => Boolean(candidate) && availableEfforts.includes(candidate!));

  return {
    model: nextModel,
    effort: fallbackEffort ?? "",
    availableEfforts,
  };
}

export function getCommitGenCandidates(
  agentStatuses: readonly AgentStatus[],
  provider: string,
): AgentStatus[] {
  const available = agentStatuses.filter(isCommitGenCandidate);
  if (provider === "auto") {
    return available;
  }
  return available.filter((agent) => agent.kind === provider);
}

export async function generateCommitMessageWithFallback(input: {
  projectLocation: ProjectLocation;
  agentStatuses: readonly AgentStatus[];
  provider: string;
  model: string;
  effort: string;
  invoke: (payload: GenerateCommitMessagePayload) => Promise<GenerateCommitMessageResult>;
}): Promise<string> {
  const candidates = getCommitGenCandidates(input.agentStatuses, input.provider);
  if (candidates.length === 0) {
    throw new Error("No agent available to generate commit message");
  }

  const failures: string[] = [];

  for (const candidate of candidates) {
    const resolvedCommitGen = resolveCommitGenConfig(candidate, input.model, input.effort);

    try {
      const result = await input.invoke({
        projectLocation: input.projectLocation,
        agentKind: candidate.kind,
        ...(resolvedCommitGen.model ? { model: resolvedCommitGen.model } : {}),
        ...(resolvedCommitGen.effort ? { effort: resolvedCommitGen.effort } : {}),
      });
      return result.message;
    } catch (error) {
      const message = toErrorMessage(error);
      if (input.provider !== "auto") {
        throw error instanceof Error ? error : new Error(message);
      }
      failures.push(`${candidate.label}: ${message}`);
    }
  }

  throw new Error(`Auto commit generation failed. ${failures.join(" | ")}`);
}
