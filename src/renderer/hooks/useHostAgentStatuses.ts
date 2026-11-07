import { useShallow } from "zustand/shallow";
import type { AgentStatus, ProjectLocation } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import {
  isDetectingAgentsForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

/**
 * Agent install/auth statuses of one host, whichever host that is.
 *
 * The desktop's own (managed) host publishes its statuses into
 * `useAgentStatusesStore`; a paired host's statuses live on its connection's
 * runtime row. Both carry the same two pools (native, WSL), so every reader
 * resolves the host once through the `connectionKey` (the paired connection
 * key, `undefined` for the managed host) and reads the pools through here
 * instead of re-implementing the store split and the WSL/native scoping.
 */
export interface HostAgentStatusPools {
  readonly windows: AgentStatus[];
  readonly wsl: AgentStatus[];
}

const EMPTY_STATUSES: AgentStatus[] = [];
const EMPTY_POOLS: HostAgentStatusPools = { windows: EMPTY_STATUSES, wsl: EMPTY_STATUSES };

/**
 * The statuses a project at `location` can launch on its host: the pool of
 * the location's environment (the matching WSL distro's inventory for a WSL
 * project), optionally narrowed to installed agents. No location, no statuses.
 */
export function selectLocationAgentStatuses(
  pools: HostAgentStatusPools,
  location: ProjectLocation | undefined,
  installedOnly = false,
): AgentStatus[] {
  if (!location) return EMPTY_STATUSES;
  const statuses = getProjectAgentStatuses(location, pools.windows, pools.wsl);
  return installedOnly ? statuses.filter((status) => status.installed) : statuses;
}

/** A host's status pools read once, outside React (the hook below follows changes). */
export function readHostAgentStatusPools(connectionKey: string | undefined): HostAgentStatusPools {
  if (connectionKey === undefined) {
    const { agentStatuses, wslAgentStatuses } = useAgentStatusesStore.getState();
    return { windows: agentStatuses, wsl: wslAgentStatuses };
  }
  const statuses = useRemoteServersStore.getState().runtime[connectionKey]?.agentStatuses;
  return statuses ? { windows: statuses.windows, wsl: statuses.wsl } : EMPTY_POOLS;
}

/** Both status pools of a host (native and WSL), stable until a pool changes. */
export function useHostAgentStatusPools(connectionKey: string | undefined): HostAgentStatusPools {
  const managed = useAgentStatusesStore(
    useShallow((state) =>
      connectionKey === undefined
        ? { windows: state.agentStatuses, wsl: state.wslAgentStatuses }
        : EMPTY_POOLS,
    ),
  );
  const paired = useRemoteServersStore(
    useShallow((state) => {
      if (connectionKey === undefined) return EMPTY_POOLS;
      const statuses = state.runtime[connectionKey]?.agentStatuses;
      return statuses ? { windows: statuses.windows, wsl: statuses.wsl } : EMPTY_POOLS;
    }),
  );
  return connectionKey === undefined ? managed : paired;
}

/** A host's agent statuses scoped to a project's location (see `selectLocationAgentStatuses`). */
export function useHostAgentStatuses(
  connectionKey: string | undefined,
  location: ProjectLocation | undefined,
  options: { readonly installedOnly?: boolean } = {},
): AgentStatus[] {
  const installedOnly = options.installedOnly === true;
  const managed = useAgentStatusesStore(
    useShallow((state) =>
      connectionKey === undefined
        ? selectLocationAgentStatuses(
            { windows: state.agentStatuses, wsl: state.wslAgentStatuses },
            location,
            installedOnly,
          )
        : EMPTY_STATUSES,
    ),
  );
  const paired = useRemoteServersStore(
    useShallow((state) => {
      if (connectionKey === undefined) return EMPTY_STATUSES;
      const statuses = state.runtime[connectionKey]?.agentStatuses;
      return statuses
        ? selectLocationAgentStatuses(
            { windows: statuses.windows, wsl: statuses.wsl },
            location,
            installedOnly,
          )
        : EMPTY_STATUSES;
    }),
  );
  return connectionKey === undefined ? managed : paired;
}

/**
 * Whether the host's statuses for `location` are still being collected: the
 * managed host until its scan for that environment reports, a paired host
 * while its connection is establishing.
 */
export function useHostAgentsDetecting(
  connectionKey: string | undefined,
  location: ProjectLocation | undefined,
): boolean {
  const managed = useAgentStatusesStore((state) =>
    connectionKey === undefined && location ? isDetectingAgentsForLocation(state, location) : false,
  );
  const paired = useRemoteServersStore((state) =>
    connectionKey === undefined ? false : state.runtime[connectionKey]?.status === "connecting",
  );
  return connectionKey === undefined ? managed : paired;
}
