import { toast } from "@heroui/react";
import type { RemoteSettings, RemoteSettingsPatch } from "@/shared/remote";
import { friendlyError } from "@/shared/messages";
import { editPairedHostSettings, usePairedHostSettings } from "@/renderer/state/pairedHostSettings";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

export interface SettingsHostTarget {
  connectionKey?: string;
  unavailable?: boolean;
}

export function useScopedHostSettings({ connectionKey, unavailable }: SettingsHostTarget) {
  const entry = usePairedHostSettings(connectionKey);
  const status = useRemoteServersStore((state) =>
    connectionKey ? state.runtime[connectionKey]?.status : undefined,
  );
  const canWrite = useRemoteServersStore((state) => {
    if (!connectionKey) return true;
    const server = state.servers.find(
      (candidate) => remoteConnectionKey(candidate) === connectionKey,
    );
    return server?.scopes.includes("session:operate") ?? false;
  });
  return {
    remote: Boolean(connectionKey || unavailable),
    canWrite,
    loading:
      Boolean(connectionKey) &&
      (status === "online" || status === "connecting") &&
      entry === undefined,
    settings: entry?.settings,
    error: entry?.error,
    update(
      patch: RemoteSettingsPatch | ((current: RemoteSettings) => RemoteSettingsPatch | undefined),
    ) {
      if (connectionKey)
        void editPairedHostSettings(
          connectionKey,
          typeof patch === "function" ? patch : () => patch,
        ).catch((error: unknown) => toast.danger(friendlyError(error)));
    },
  };
}
