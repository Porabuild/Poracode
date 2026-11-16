import { useEffect } from "react";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

/**
 * Lazily loads one agent's slash-command catalog for a paired host.
 *
 * Kept paired-only on purpose; this is a payload difference, not routing. A
 * paired host's agent-statuses HTTP payload omits the (large) per-agent command
 * catalogs, so the composer fetches them on demand into that connection's
 * runtime state. The managed host's statuses are read in full through the local
 * agent-statuses store and already carry `slashCommands`, so there is nothing to
 * load: the hook is a no-op without a paired `remoteServerId`.
 */
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
