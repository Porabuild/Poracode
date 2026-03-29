import type { AgentStatus, ProjectLocation } from "./contracts";

export function getProjectAgentStatuses(
  location: ProjectLocation,
  windowsStatuses: AgentStatus[],
  wslStatuses: AgentStatus[],
): AgentStatus[] {
  if (location.kind !== "wsl") {
    return windowsStatuses;
  }

  const exactMatch = wslStatuses.filter((status) => status.envDistro === location.distro);
  if (exactMatch.length > 0) {
    return exactMatch;
  }

  return wslStatuses.filter((status) => status.envDistro === undefined);
}
