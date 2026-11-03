import { useEffect } from "react";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

export function useAgentSlashCommandCatalog(
  remoteServerId: string | undefined,
  agentKind: string | undefined,
  enabled = true,
): void {
  const online = useRemoteServersStore((state) =>
    remoteServerId ? state.runtime[remoteServerId]?.status === "online" : false,
  );
  const missing = useRemoteServersStore((state) => {
    const statuses = remoteServerId ? state.runtime[remoteServerId]?.agentStatuses : undefined;
    const agent =
      statuses?.windows.find((entry) => entry.kind === agentKind) ??
      statuses?.wsl.find((entry) => entry.kind === agentKind);
    return agent?.capabilities.slashCommands === undefined;
  });
  useEffect(() => {
    if (!enabled || !remoteServerId || !agentKind || !online || !missing) return;
    void useRemoteServersStore
      .getState()
      .loadAgentSlashCommands(remoteServerId, agentKind)
      .catch(() => {});
  }, [remoteServerId, agentKind, enabled, online, missing]);
}
