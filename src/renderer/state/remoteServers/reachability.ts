import { useShallow } from "zustand/shallow";
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

/**
 * Selector-side counterpart of `isRemoteProjectUnreachable`: a predicate that
 * keeps local projects and projects on a paired server this client can reach.
 * Pickers and fan-out lists use it to leave offline machines out instead of
 * offering rows whose every action fails; the sidebar keeps showing them,
 * dimmed, so the user can see which machine is down.
 */
export function useReachableProjectFilter(): (project: Pick<Project, "remoteServerId">) => boolean {
  const reachableServerIds = useRemoteServersStore(
    useShallow((state) =>
      Object.keys(state.runtime).filter(
        (id) =>
          !isRemoteProjectStatusUnreachable({ remoteServerId: id }, state.runtime[id]?.status),
      ),
    ),
  );
  return (project) =>
    !project.remoteServerId || reachableServerIds.includes(project.remoteServerId);
}
