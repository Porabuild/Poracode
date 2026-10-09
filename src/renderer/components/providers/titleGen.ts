import type {
  AgentStatus,
  GenerateTitlePayload,
  GenerateTitleResult,
  ProjectLocation,
} from "@/shared/contracts";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import { resolveFastValue } from "@/renderer/components/thread/threadDraftViewHelpers";
import { toErrorMessage } from "@/shared/errorMessage";
import { resolveUtilitySelection } from "@/renderer/utils/utilitySelection";
import {
  createUtilityTaskRegistry,
  getMiniModelId,
  getUtilityTaskCandidates,
  resolveUtilityTaskConfig,
} from "./utilityTask";

const titleGenRegistry = createUtilityTaskRegistry();
export const registerTitleGenDefaults = titleGenRegistry.register;
export const getTitleGenDefaults = titleGenRegistry.get;
export const getTitleGenDefaultsHint = titleGenRegistry.getHint;

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

export interface GenerateTitleWithFallbackInput {
  projectLocation: ProjectLocation;
  agentStatuses: readonly AgentStatus[];
  provider: string;
  /**
   * Legacy scalar preset, kept for callers that still read the scalar
   * siblings. Superseded by `selection` when it is present.
   */
  model?: string;
  effort?: string;
  /** Opus-only fast mode; only forwarded when the resolved candidate model supports it. */
  fast?: boolean;
  /**
   * Canonical complete utility selection — the sole tuple when present.
   * Absent, the scalars above convert to an unstamped tuple at this
   * boundary. Empty effort and false Fast survive transport exactly, and a
   * recognized binding travels with its own selection only.
   */
  selection?: ModelSelection;
  prompt: string;
  /** English name of the language to write the title in. Omitted = match the user's message. */
  language?: string;
  invoke: (payload: GenerateTitlePayload) => Promise<GenerateTitleResult>;
}

export async function generateTitleWithFallback(
  input: GenerateTitleWithFallbackInput,
): Promise<string> {
  const candidates = getTitleGenCandidates(input.agentStatuses, input.provider);
  if (candidates.length === 0) {
    throw new Error("No agent available to generate title");
  }

  const legacy = {
    model: input.model ?? "",
    effort: input.effort ?? "",
    fast: input.fast ?? false,
  };

  const failures: string[] = [];

  for (const candidate of candidates) {
    const selection = resolveUtilitySelection(input.selection, legacy, (scalars) => {
      const resolved = resolveTitleGenConfig(candidate, scalars.model, scalars.effort);
      return {
        model: resolved.model,
        effort: resolved.effort,
        fast: resolveFastValue(candidate, resolved.model, scalars.fast),
      };
    });

    try {
      const result = await input.invoke({
        projectLocation: input.projectLocation,
        agentKind: candidate.kind,
        prompt: input.prompt,
        selection,
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
