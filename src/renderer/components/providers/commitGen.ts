import type { AgentStatus } from "../../../shared/contracts";
import { getCommitGenDefaults } from "./ProviderIcon";

function resolveCommitGenModel(agent: AgentStatus): string {
  const defaults = getCommitGenDefaults(agent.kind);
  if (defaults?.model && agent.capabilities.models.includes(defaults.model)) {
    return defaults.model;
  }
  return agent.capabilities.models[0] ?? "";
}

function resolveCommitGenEfforts(agent: AgentStatus, model: string): string[] {
  const modelEfforts = agent.capabilities.modelEfforts[model];
  if (modelEfforts && modelEfforts.length > 0) {
    return modelEfforts;
  }
  return agent.capabilities.efforts;
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

  const nextModel = agent.capabilities.models.includes(model) ? model : resolveCommitGenModel(agent);
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
  const fallbackEffort = [defaults?.effort, agent.capabilities.defaultEffort, availableEfforts[0]].find(
    (candidate) => Boolean(candidate) && availableEfforts.includes(candidate!),
  );

  return {
    model: nextModel,
    effort: fallbackEffort ?? "",
    availableEfforts,
  };
}
