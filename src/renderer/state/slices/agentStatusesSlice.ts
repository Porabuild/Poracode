import type { StateCreator } from "zustand";
import {
  areAgentPresentationRuntimeFieldsEqual,
  areAgentProviderMetadataEqual,
  type AgentStatus,
} from "@/shared/contracts";

export interface AgentStatusesSlice {
  agentStatuses: AgentStatus[];
  wslAgentStatuses: AgentStatus[];
  setAgentStatuses: (statuses: AgentStatus[]) => void;
  setWslAgentStatuses: (statuses: AgentStatus[]) => void;
}

function statusesEqual(a: AgentStatus[], b: AgentStatus[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (x, i) =>
      x.kind === b[i]!.kind &&
      x.installed === b[i]!.installed &&
      x.icon === b[i]!.icon &&
      x.version === b[i]!.version &&
      x.authState === b[i]!.authState &&
      areAgentPresentationRuntimeFieldsEqual(x, b[i]!) &&
      x.loginCommand === b[i]!.loginCommand &&
      areAgentProviderMetadataEqual(x.providerMetadata, b[i]!.providerMetadata),
  );
}

export const createAgentStatusesSlice: StateCreator<AgentStatusesSlice> = (set) => ({
  agentStatuses: [],
  wslAgentStatuses: [],
  setAgentStatuses: (incoming) =>
    set((prev) =>
      statusesEqual(prev.agentStatuses, incoming) ? prev : { agentStatuses: incoming },
    ),
  setWslAgentStatuses: (incoming) =>
    set((prev) =>
      statusesEqual(prev.wslAgentStatuses, incoming) ? prev : { wslAgentStatuses: incoming },
    ),
});
