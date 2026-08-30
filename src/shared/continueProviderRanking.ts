import type { AgentStatus, ThreadPresentationMode } from "./contracts";
import { capabilitiesForPresentation, modelSelectionFor } from "./agentSelection";
import {
  rankCrossagentCandidates,
  type CrossagentRankingCandidate,
  type CrossagentRankingPreferences,
  type RankedCrossagentCandidate,
} from "./crossagentRanking";

function supportedPresentationModes(agent: AgentStatus): ThreadPresentationMode[] {
  return agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
}

export function supportsPresentation(agent: AgentStatus, mode: ThreadPresentationMode): boolean {
  return supportedPresentationModes(agent).includes(mode);
}

/**
 * Unlike the 2-argument `resolveInitialPresentationMode` in
 * `threadDraftViewHelpers.ts` (draft view, "gui" fallback, no source), this
 * handoff variant carries the source thread's mode over when the target
 * supports it and falls back to "terminal".
 */
export function resolveInitialPresentationMode(
  agent: AgentStatus | undefined,
  lastByAgent: Record<string, ThreadPresentationMode>,
  sourceMode: ThreadPresentationMode,
): ThreadPresentationMode {
  if (!agent) return "terminal";
  const supported = supportedPresentationModes(agent);
  const last = lastByAgent[agent.kind];
  if (last && supported.includes(last)) return last;
  if (supported.includes(sourceMode)) return sourceMode;
  if (supported.includes("gui")) return "gui";
  return supported[0] ?? agent.capabilities.presentationMode ?? "terminal";
}

/**
 * A switch can continue the same thread in place only when both ends are chat
 * (GUI): a terminal target has nowhere to host the existing chat, and a
 * terminal source's history is PTY scrollback rather than persisted rows. Any
 * other combination opens a replacement thread instead. Shared by the dialog's
 * caption and the launch path so the caption shown and the path taken cannot
 * disagree.
 */
export function continuesInPlace(
  sourceMode: ThreadPresentationMode,
  targetMode: ThreadPresentationMode,
): boolean {
  return sourceMode === "gui" && targetMode === "gui";
}

/**
 * Adapt an installed agent to the ranking layer's candidate shape. Mirrors the
 * supervisor's `rankingCandidateOf`, but reads from an `AgentStatus` because
 * the renderer has no spawnable-agent roster.
 */
export function continueRankingCandidate(
  agent: AgentStatus,
  presentationMode: ThreadPresentationMode,
): CrossagentRankingCandidate {
  const capabilities = capabilitiesForPresentation(agent.capabilities, presentationMode);
  return {
    provider: agent.kind,
    defaultModel: capabilities.models[0]?.id ?? "",
    models: capabilities.models.map((model) => {
      const selection = modelSelectionFor(capabilities, model.id);
      return {
        id: model.id,
        efforts: selection.reasoning.values,
        ...(selection.reasoning.default ? { defaultEffort: selection.reasoning.default } : {}),
        fastAvailable: selection.fast.available,
      };
    }),
  };
}

/**
 * Rank the providers a thread can be continued in by how much the user actually
 * uses them, so the handoff dialog proposes a real provider and model instead of
 * whichever agent happens to sit first in the installed registry. Each candidate
 * is measured against the presentation mode it would actually open in.
 */
export function rankContinueProviders(
  agents: readonly AgentStatus[],
  lastPresentationModeByAgent: Record<string, ThreadPresentationMode>,
  sourcePresentationMode: ThreadPresentationMode,
  preferences: CrossagentRankingPreferences,
): RankedCrossagentCandidate[] {
  const candidates = agents.map((agent) =>
    continueRankingCandidate(
      agent,
      resolveInitialPresentationMode(agent, lastPresentationModeByAgent, sourcePresentationMode),
    ),
  );
  return rankCrossagentCandidates(candidates, preferences);
}
