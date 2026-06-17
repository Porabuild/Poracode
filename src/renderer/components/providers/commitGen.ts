import type {
  AgentStatus,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
  ProjectLocation,
} from "@/shared/contracts";
import { getCommitGenDefaults } from "./ProviderIcon";
import { getMiniModelId, getUtilityTaskCandidates, resolveUtilityTaskConfig } from "./utilityTask";

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
  return resolveUtilityTaskConfig(agent, model, effort, getCommitGenDefaults, {
    // Fall back to any "mini" variant — commit gen is a lightweight task.
    fallbackModelIds: (candidate, defaults) => [defaults?.model, getMiniModelId(candidate)],
  });
}

export function getCommitGenCandidates(
  agentStatuses: readonly AgentStatus[],
  provider: string,
): AgentStatus[] {
  return getUtilityTaskCandidates(agentStatuses, provider, getCommitGenDefaults);
}

export async function generateCommitMessageWithFallback(input: {
  projectLocation: ProjectLocation;
  agentStatuses: readonly AgentStatus[];
  provider: string;
  model: string;
  effort: string;
  /** English name of the language to write the commit message in. Omitted = English. */
  language?: string;
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
        ...(input.language ? { language: input.language } : {}),
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
