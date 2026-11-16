import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { entityHost } from "@/renderer/state/entityHost";
import type { RemoteDesktopClient } from "@/shared/remote/client";

export function withThreadDeviceClient<T>(
  threadId: string,
  invoke: (client: RemoteDesktopClient, hostThreadId: string) => Promise<T>,
): Promise<T> {
  const host = entityHost(useAppStore.getState().threads.find((thread) => thread.id === threadId));
  if (!host) return Promise.reject(new Error(i18n._(msg`The device host is unavailable.`)));
  return host.withClient((client) => invoke(client, host.hostId));
}
