import type { AgentKind, AgentStatus } from "@/shared/contracts";
import { rankCrossagentModels } from "@/shared/crossagentRanking";
import type {
  CrossagentRankingPreferences,
  CrossagentRoutingProviderEntry,
  CrossagentRoutingSnapshotEntry,
} from "@/shared/crossagentRanking";
import type { AgentAdapter } from "@/supervisor/agents/base";
import type { CrossagentVisibilitySettings } from "./availability";
import { rankingCandidateOf, resolveSubagentExecution, type SpawnableAgent } from "./types";

/**
 * Settings-page view of Crossagents routing. Read-only projections of the same
 * roster and ranking the MCP tools use — no tool in the catalog reaches this.
 */

/**
 * Every provider eligible for Crossagents (installed, authenticated, spawnable,
 * not globally disabled), deliberately ignoring the Crossagents-only pause and
 * model filters. The settings filter UI needs paused/fully-filtered providers
 * to stay listed so the user can re-check them.
 */
export function listCrossagentEligibleProviders(
  adapters: Map<AgentKind, AgentAdapter>,
  statuses: readonly AgentStatus[],
  settings: CrossagentVisibilitySettings,
): CrossagentRoutingProviderEntry[] {
  const out: CrossagentRoutingProviderEntry[] = [];
  for (const status of statuses) {
    if (!status.installed || status.authState !== "authenticated") continue;
    if (settings.disabledAgents.includes(status.kind)) continue;
    const adapter = adapters.get(status.kind);
    if (!adapter) continue;
    const execution = resolveSubagentExecution(adapter);
    if (!execution) continue;
    out.push({ kind: status.kind, label: status.label, execution });
  }
  return out;
}

/**
 * Every visible (provider, model) pair in its real, globally interleaved rank.
 * The #1 entry always matches what an untagged spawn resolves to (see
 * `rankCrossagentModels`).
 */
export function crossagentRoutingSnapshot(
  agents: readonly SpawnableAgent[],
  preferences: CrossagentRankingPreferences,
): CrossagentRoutingSnapshotEntry[] {
  const agentsByProvider = new Map(agents.map((agent) => [agent.provider.value, agent]));
  return rankCrossagentModels(agents.map(rankingCandidateOf), preferences).map((entry) => {
    const agent = agentsByProvider.get(entry.provider)!;
    const model = agent.models.find((candidate) => candidate.value === entry.model);
    return {
      provider: entry.provider,
      label: agent.provider.label,
      execution: agent.execution,
      rank: entry.rank,
      source: entry.source,
      usageCount: entry.usageCount,
      model: {
        id: entry.model,
        label: model?.label ?? entry.model,
      },
      ...(entry.effort ? { reasoning: entry.effort } : {}),
      fast: entry.fast,
      learnedTags: entry.learnedTags,
    };
  });
}
