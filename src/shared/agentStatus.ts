import type { AgentStatus, ProjectLocation } from "./contracts";

export function getProjectAgentStatuses(
  location: ProjectLocation,
  windowsStatuses: AgentStatus[],
  wslStatuses: AgentStatus[],
  sshStatuses: AgentStatus[] = [],
): AgentStatus[] {
  if (location.kind === "ssh") {
    return sshStatuses.filter((status) => status.envHost === location.host);
  }

  if (location.kind !== "wsl") {
    return windowsStatuses;
  }

  const exactMatch = wslStatuses.filter((status) => status.envDistro === location.distro);
  if (exactMatch.length > 0) {
    return exactMatch;
  }

  return wslStatuses.filter((status) => status.envDistro === undefined);
}

/**
 * Build the Settings > Agents navigation list. Native installations take
 * precedence when a provider exists in both native and WSL; WSL-only providers
 * are appended afterward so they remain reachable in the sidebar.
 */
export function getSettingsInstalledAgents(
  windowsStatuses: readonly AgentStatus[],
  wslStatuses: readonly AgentStatus[],
): AgentStatus[] {
  const installedNative = windowsStatuses.filter((status) => status.installed);
  const merged = [...installedNative];
  const seenKinds = new Set(installedNative.map((status) => status.kind));

  for (const status of wslStatuses) {
    if (!status.installed || seenKinds.has(status.kind)) continue;
    seenKinds.add(status.kind);
    merged.push(status);
  }

  return merged;
}
