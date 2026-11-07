import type { AgentInstanceConfig } from "./contracts/agentInstance";
import type { SharedSettings } from "./settings";

export const AGENT_INSTANCE_REMOVAL_FIELDS = [
  "agentInstances",
  "providerConfigs",
  "providerModelPreferences",
  "hiddenModels",
  "agentSettings",
  "lastPresentationModeByAgent",
  "disabledAgents",
  "favoriteModels",
  "recentModels",
  "providerOrder",
] as const satisfies readonly (keyof SharedSettings)[];

export function removeAgentInstanceSettings(
  current: SharedSettings,
  instance: AgentInstanceConfig,
): Pick<SharedSettings, (typeof AGENT_INSTANCE_REMOVAL_FIELDS)[number]> {
  const agentInstances = { ...current.agentInstances };
  delete agentInstances[instance.id];
  const prefix = `${instance.driver}:${instance.id}`;
  const removeProfileKey = <T>(values: Record<string, T>) =>
    Object.fromEntries(Object.entries(values).filter(([key]) => key !== prefix));
  return {
    agentInstances,
    providerConfigs: removeProfileKey(current.providerConfigs),
    providerModelPreferences: removeProfileKey(current.providerModelPreferences),
    hiddenModels: removeProfileKey(current.hiddenModels),
    agentSettings: removeProfileKey(current.agentSettings),
    lastPresentationModeByAgent: removeProfileKey(current.lastPresentationModeByAgent),
    disabledAgents: current.disabledAgents.filter((kind) => kind !== prefix),
    favoriteModels: current.favoriteModels.filter((entry) => entry.agentKind !== prefix),
    recentModels: current.recentModels.filter((entry) => entry.agentKind !== prefix),
    providerOrder: current.providerOrder.filter((kind) => kind !== prefix),
  };
}
