import type {
  AgentStatus,
  GenerateTitlePayload,
  GenerateTitleResult,
  ProjectLocation,
} from "@/shared/contracts";
import { resolveFastValue } from "@/renderer/components/thread/threadDraftViewHelpers";
import { getTitleGenDefaults } from "./ProviderIcon";
import { getMiniModelId, getUtilityTaskCandidates, resolveUtilityTaskConfig } from "./utilityTask";

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
  return resolveUtilityTaskConfig(agent, model, effort, getTitleGenDefaults, {
    // Fall back to any "mini" variant — title gen is a lightweight task.
    fallbackModelIds: (candidate, defaults) => [defaults?.model, getMiniModelId(candidate)],
    // Prefer lowest effort for title gen — it's a lightweight task.
    fallbackEfforts: (_candidate, defaults, availableEfforts) => [
      defaults?.effort,
      "low",
      availableEfforts[0],
    ],
  });
}

export function getTitleGenCandidates(
  agentStatuses: readonly AgentStatus[],
  provider: string,
): AgentStatus[] {
  // Title generation is one-shot, so only offer providers that can run one.
  return getUtilityTaskCandidates(agentStatuses, provider, getTitleGenDefaults, {
    requireOneShot: true,
  });
}

export async function generateTitleWithFallback(input: {
  projectLocation: ProjectLocation;
  agentStatuses: readonly AgentStatus[];
  provider: string;
  model: string;
  effort: string;
  /** Opus-only fast mode; only forwarded when the resolved candidate model supports it. */
  fast?: boolean;
  prompt: string;
  /** English name of the language to write the title in. Omitted = match the user's message. */
  language?: string;
  invoke: (payload: GenerateTitlePayload) => Promise<GenerateTitleResult>;
}): Promise<string> {
  const candidates = getTitleGenCandidates(input.agentStatuses, input.provider);
  if (candidates.length === 0) {
    throw new Error("No agent available to generate title");
  }

  const failures: string[] = [];

  for (const candidate of candidates) {
    const resolved = resolveTitleGenConfig(candidate, input.model, input.effort);
    const fast = resolveFastValue(candidate, resolved.model, input.fast);

    try {
      const result = await input.invoke({
        projectLocation: input.projectLocation,
        agentKind: candidate.kind,
        prompt: input.prompt,
        ...(resolved.model ? { model: resolved.model } : {}),
        ...(resolved.effort ? { effort: resolved.effort } : {}),
        ...(fast ? { fast: true } : {}),
        ...(input.language ? { language: input.language } : {}),
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
