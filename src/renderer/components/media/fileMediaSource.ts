import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ProjectLocation } from "@/shared/contracts";
import type { MediaSource } from "@/shared/remote/media";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { getManagedParentAuthorityState } from "@/renderer/state/remoteServers/managedLoopbackOwner";
import { getRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import { ownMediaImageReads } from "./ownedMediaImageReads";

export interface EditorMediaSource extends MediaSource {
  release(): Promise<void>;
  readImageBytes(): Promise<Uint8Array<ArrayBuffer>>;
}

export async function createEditorMediaSource(
  location: ProjectLocation,
  path: string,
  signal: AbortSignal,
): Promise<EditorMediaSource> {
  const { remoteServerId, ...projectLocation } = location;
  const file = {
    access:
      path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/u.test(path)
        ? ("external" as const)
        : ("project" as const),
    projectLocation,
    path,
  };
  const create = async (client: RemoteDesktopClient): Promise<EditorMediaSource> => {
    const source = await client.createMediaSource(file, signal);
    return {
      ...source,
      ...ownMediaImageReads(
        (readSignal) => client.fetchMediaImageBytes(source, readSignal),
        () => client.releaseMediaSource(source.ticket),
      ),
    };
  };
  if (remoteServerId) return useRemoteServersStore.getState().withClient(remoteServerId, create);
  const managed = getManagedParentAuthorityState();
  const client =
    getRemoteBridgeClient() ?? (managed.status === "ready" ? managed.authority.client : null);
  if (!client) throw new Error(i18n._(msg`Remote server not found.`));
  return create(client);
}
