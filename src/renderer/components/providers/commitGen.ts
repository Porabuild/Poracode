import type {
  AgentStatus,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
  ProjectLocation,
} from "@/shared/contracts";
import { resolveFastValue } from "@/renderer/components/thread/threadDraftViewHelpers";
import { toErrorMessage } from "@/shared/errorMessage";
import { getCommitGenDefaults } from "./ProviderIcon";
import { getMiniModelId, getUtilityTaskCandidates, resolveUtilityTaskConfig } from "./utilityTask";

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
  // Commit-message generation is one-shot, so only offer providers that can run one.
  return getUtilityTaskCandidates(agentStatuses, provider, getCommitGenDefaults, {
    requireOneShot: true,
  });
}

interface GenerateCommitMessageWithFallbackInput {
  projectLocation: ProjectLocation;
  agentStatuses: readonly AgentStatus[];
  provider: string;
  model: string;
  effort: string;
  /** Opus-only fast mode; only forwarded when the resolved candidate model supports it. */
  fast?: boolean;
  /** English name of the language to write the commit message in. Omitted = English. */
  language?: string;
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
    const fast = resolveFastValue(candidate, resolvedCommitGen.model, input.fast);

    try {
      const result = await input.invoke({
        projectLocation: input.projectLocation,
        agentKind: candidate.kind,
        ...(resolvedCommitGen.model ? { model: resolvedCommitGen.model } : {}),
        ...(resolvedCommitGen.effort ? { effort: resolvedCommitGen.effort } : {}),
        ...(fast ? { fast: true } : {}),
        ...(input.language ? { language: input.language } : {}),
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
