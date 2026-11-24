import { useEffect } from "react";
import { msg } from "@lingui/core/macro";
import { create } from "zustand";
import type { AgentInstanceConfig } from "@/shared/contracts";
import type {
  RemoteAgentProfilesCommand,
  RemoteAgentProfilesCommandResult,
} from "@/shared/remote/contract/routeSchemas";
import { i18n } from "@/renderer/i18n/i18n";
import { currentRemoteServerGeneration } from "./remoteServers/eventSocketRegistry";
import { remoteConnectionKey } from "./remoteServers/types";
import { useRemoteServersStore } from "./remoteServersStore";

type Entry = {
  generation: number;
  profiles?: Record<string, AgentInstanceConfig>;
  error?: unknown;
};

const useProfiles = create<Record<string, Entry>>(() => ({}));
const pendingReads = new Map<string, Promise<void>>();
const pendingWrites = new Map<string, Promise<void>>();

function online(key: string, generation: number) {
  const state = useRemoteServersStore.getState();
  return (
    generation === currentRemoteServerGeneration(key) &&
    state.runtime[key]?.status === "online" &&
    state.servers.some((server) => remoteConnectionKey(server) === key)
  );
}

function publish(key: string, entry: Entry) {
  if (online(key, entry.generation)) useProfiles.setState({ [key]: entry });
}

export function refreshPairedHostProfiles(key: string, generation: number): void {
  const pendingKey = JSON.stringify([key, generation]);
  if (!online(key, generation) || pendingReads.has(pendingKey)) return;
  const existingWrite = pendingWrites.get(key);
  const request = (existingWrite ?? Promise.resolve())
    .then(() =>
      useRemoteServersStore.getState().withClient(key, (client) => client.agentProfiles()),
    )
    .then(
      (profiles) => publish(key, { generation, profiles }),
      (error: unknown) => {
        // A transient read failure must not erase the last known-good list.
        const previous = useProfiles.getState()[key]?.profiles;
        publish(key, { generation, error, ...(previous ? { profiles: previous } : {}) });
      },
    )
    .finally(() => {
      pendingReads.delete(pendingKey);
    });
  pendingReads.set(pendingKey, request);
}

/** Re-read a paired host's profiles now (Refresh), outside the mount effect. */
export function refreshPairedHostProfilesNow(key: string): void {
  refreshPairedHostProfiles(key, currentRemoteServerGeneration(key));
}

export function usePairedHostProfiles(key: string | undefined): Entry | undefined {
  const generation = key ? currentRemoteServerGeneration(key) : 0;
  const status = useRemoteServersStore((s) => (key ? s.runtime[key]?.status : undefined));
  const entry = useProfiles((s) => (key ? s[key] : undefined));
  useEffect(() => {
    if (key && status === "online") refreshPairedHostProfiles(key, generation);
  }, [key, generation, status]);
  return status === "online" && entry?.generation === generation ? entry : undefined;
}

export function commandPairedHostProfiles(
  key: string,
  command: RemoteAgentProfilesCommand,
): Promise<RemoteAgentProfilesCommandResult> {
  const generation = currentRemoteServerGeneration(key);
  const queued = Promise.all([
    pendingWrites.get(key),
    pendingReads.get(JSON.stringify([key, generation])),
  ]);
  const assertCurrent = () => {
    if (!online(key, generation)) throw new Error(i18n._(msg`Connection failed.`));
  };
  const next = queued.then(async () => {
    assertCurrent();
    return useRemoteServersStore.getState().withClient(key, async (client) => {
      assertCurrent();
      const result = await client.commandAgentProfiles(command);
      publish(key, { generation, profiles: result.profiles });
      return result;
    });
  });
  const settled = next
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      if (pendingWrites.get(key) === settled) pendingWrites.delete(key);
    });
  pendingWrites.set(key, settled);
  return next;
}
