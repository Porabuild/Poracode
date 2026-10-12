import type {
  AgentStatus,
  GenerateCommitMessagePayload,
  GenerateCommitMessageResult,
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

const commitGenRegistry = createUtilityTaskRegistry();
export const registerCommitGenDefaults = commitGenRegistry.register;
export const getCommitGenDefaults = commitGenRegistry.get;
export const getCommitGenDefaultsHint = commitGenRegistry.getHint;

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

  const legacy = {
    model: input.model ?? "",
    effort: input.effort ?? "",
    fast: input.fast ?? false,
  };

  const failures: string[] = [];

  for (const candidate of candidates) {
    const selection = resolveUtilitySelection(input.selection, legacy, (scalars) => {
      const resolved = resolveCommitGenConfig(candidate, scalars.model, scalars.effort);
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
        selection,
        ...(input.language ? { language: input.language } : {}),
      });
      return {
        message: result.message,
        provider: candidate.kind,
        model: selection.model || "default",
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
