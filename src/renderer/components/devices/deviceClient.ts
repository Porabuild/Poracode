import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import {
  readManagedLoopbackProcedureHost,
  readRegisteredRemoteProcedureHost,
} from "@/renderer/remoteProcedureRouter";
import type { RemoteDesktopClient } from "@/shared/remote/client";

export function withThreadDeviceClient<T>(
  threadId: string,
  invoke: (client: RemoteDesktopClient, hostThreadId: string) => Promise<T>,
): Promise<T> {
  const remote = readRegisteredRemoteProcedureHost();
  const owner = remote?.resolveThreadOwner(threadId);
  if (remote && owner)
    return remote.withClient(owner.desktopId, (client) => invoke(client, owner.remoteId));
  const managed = readManagedLoopbackProcedureHost();
  if (managed?.isCurrent())
    return managed.host.withClient(managed.desktopId, (client) => invoke(client, threadId));
  return Promise.reject(new Error(i18n._(msg`The device host is unavailable.`)));
}
