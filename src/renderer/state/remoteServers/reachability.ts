import type { Project } from "@/shared/contracts";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerStatus } from "./types";

export function isRemoteProjectStatusUnreachable(
  project: Pick<Project, "remoteServerId">,
  status: RemoteServerStatus | undefined,
): boolean {
  return !!project.remoteServerId && status !== "online" && status !== "error";
}

/**
 * True when a project lives on a paired server this client can't reach right
 * now — a server with no runtime entry yet counts as unreachable. An error
 * status records a non-transport failure while the server remains reachable.
 * Local projects are always reachable.
 *
 * Every action on a mirrored project — git, run scripts, launching a thread,
 * deleting it on the host — goes over that connection, so callers use this to
 * lock those affordances instead of failing at the network call.
 */
export function isRemoteProjectUnreachable(project: Pick<Project, "remoteServerId">): boolean {
  const { remoteServerId } = project;
  if (!remoteServerId) return false;
  return isRemoteProjectStatusUnreachable(
    project,
    useRemoteServersStore.getState().runtime[remoteServerId]?.status,
  );
}
