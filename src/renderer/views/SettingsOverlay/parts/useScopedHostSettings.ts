import { toast } from "@heroui/react";
import type { RemoteSettingsPatch } from "@/shared/remote";
import { friendlyError } from "@/shared/messages";
import { editPairedHostSettings, usePairedHostSettings } from "@/renderer/state/pairedHostSettings";

export interface SettingsHostTarget {
  connectionKey?: string;
  unavailable?: boolean;
}

export function useScopedHostSettings({ connectionKey, unavailable }: SettingsHostTarget) {
  const entry = usePairedHostSettings(connectionKey);
  return {
    remote: Boolean(connectionKey || unavailable),
    settings: entry?.settings,
    error: entry?.error,
    update(patch: RemoteSettingsPatch) {
      if (connectionKey)
        void editPairedHostSettings(connectionKey, () => patch).catch((error: unknown) =>
          toast.danger(friendlyError(error)),
        );
    },
  };
}
