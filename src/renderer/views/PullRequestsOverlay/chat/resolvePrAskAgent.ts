import type {
  AgentStatus,
  ProjectDraftConfig,
  ProviderDraftConfig,
  ThreadConfig,
} from "@/shared/contracts";
import { authStateForPresentation } from "@/shared/agentSelection";
import type { ProviderModelPreference } from "@/shared/settings";
import {
  agentWithCapabilities,
  launchSelectionFields,
  resolvePreferredAgentKind,
  resolveProviderDraftConfig,
  resolveSavedProviderDraftConfig,
} from "@/renderer/components/thread/threadDraftViewHelpers";

export interface PrAskAgentSelection {
  agentKind: string;
  config: ThreadConfig;
}

export interface PrAskAgentInput {
  agents: readonly AgentStatus[];
  disabledAgents: readonly string[];
  lastDraftConfig: ProjectDraftConfig | undefined;
  providerConfigs: Record<string, ProviderDraftConfig>;
  providerModelPreferences: Record<string, Record<string, ProviderModelPreference>>;
}

/**
 * The agent (model and effort only) a pull-request chat starts with: the one the project's new-thread
 * draft would pick, restricted to agents that can run a GUI thread right now.
 * Returns `undefined` when none can, which is what makes the chat unavailable.
 */
export function resolvePrAskAgent(input: PrAskAgentInput): PrAskAgentSelection | undefined {
  const candidates = input.agents.filter((agent) => {
    if (!agent.installed || input.disabledAgents.includes(agent.kind)) return false;
    const modes = agent.capabilities.presentationModes ?? [agent.capabilities.presentationMode];
    return (
      modes.includes("gui") &&
      authStateForPresentation(agent, "gui") !== "missing" &&
      agentWithCapabilities(agent, "gui").capabilities.models.length > 0
    );
  });
  const kind = resolvePreferredAgentKind(candidates, input.lastDraftConfig);
  const selected = candidates.find((agent) => agent.kind === kind);
  if (!selected) return undefined;
  const agent = agentWithCapabilities(selected, "gui");
  const saved = resolveSavedProviderDraftConfig(
    agent.kind,
    input.lastDraftConfig,
    input.providerConfigs,
    input.providerModelPreferences,
    agent.capabilities,
  );
  const draft = resolveProviderDraftConfig(agent, saved);
  if (!draft.model) return undefined;
  return {
    agentKind: agent.kind,
    config: {
      ...launchSelectionFields(draft, agent.capabilities),
      // Mode, approval and sandbox settings are NOT inherited from the project's last
      // draft: the chat reads untrusted pull-request text, so it starts with the
      // provider's own defaults instead of whatever elevated settings the last thread used.
    },
  };
}
