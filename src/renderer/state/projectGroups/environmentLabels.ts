import type { Project } from "@/shared/contracts";
import { agentEnvForLocation } from "@/shared/machines";
import { desktopTitle } from "@/shared/remote/desktopLabel";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { localEnvLabel, machineLabel } from "@/renderer/utils/machineLabels";

/**
 * Name of the environment a project row lives on: "Local", a WSL distro, or
 * the paired machine (plus its distro). One convention with the machine labels
 * used across Settings. `serverName` is the paired machine's display name,
 * when its pairing record is known.
 */
export function projectEnvironmentLabel(project: Project, serverName: string | undefined): string {
  const env = agentEnvForLocation(project.location);
  const desktopId = project.remoteServerId ?? project.location.remoteServerId;
  if (!desktopId) return localEnvLabel(env);
  return machineLabel(
    { host: "remote", desktopId, env },
    { remoteName: () => serverName ?? desktopId },
  );
}

/**
 * Non-reactive environment label for one-off reads (menu labels, action
 * notices) that must not subscribe per row.
 */
export function readProjectEnvironmentLabel(project: Project): string {
  const desktopId = project.remoteServerId ?? project.location.remoteServerId;
  const server = desktopId
    ? useRemoteServersStore
        .getState()
        .servers.find((record) => remoteConnectionKey(record) === desktopId)
    : undefined;
  return projectEnvironmentLabel(project, server ? desktopTitle(server.label) : undefined);
}
