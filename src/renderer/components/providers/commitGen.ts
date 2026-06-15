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

interface GenerateCommitMessageWithFallbackInput {
  projectLocation: ProjectLocation;
  agentStatuses: readonly AgentStatus[];
  provider: string;
  model: string;
  effort: string;
  invoke: (payload: GenerateCommitMessagePayload) => Promise<GenerateCommitMessageResult>;
}

export interface GeneratedCommitMessageWithProvider {
  message: string;
  provider: string;
  model: string;
}

export async function generateCommitMessageWithFallbackDetails(
  input: GenerateCommitMessageWithFallbackInput,
): Promise<GeneratedCommitMessageWithProvider> {
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
      return {
        message: result.message,
        provider: candidate.kind,
        model: resolvedCommitGen.model || "default",
      };
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

export async function generateCommitMessageWithFallback(
  input: GenerateCommitMessageWithFallbackInput,
): Promise<string> {
  return (await generateCommitMessageWithFallbackDetails(input)).message;
}
