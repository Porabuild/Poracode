import type { SaveClipboardImage } from "@/renderer/components/composer/useAttachments";
import { entityHost } from "./entityHost";
import { useRemoteServersStore } from "./remoteServersStore";

/**
 * How a composer hands this machine's files to the host that owns a thread or
 * draft project.
 *
 * A host that runs on this machine reads this machine's paths directly, so the
 * native file dialog and the local clipboard save are already right and every
 * field is absent. A host on another machine cannot read those paths: picked
 * files and pasted images are uploaded into its own attachment directory, and
 * revealing one of its project paths in this machine's file manager is
 * meaningless. That single difference is `EntityHost.runsOnThisMachine`; both
 * kinds of host resolve through this one function.
 */
export interface HostFileAccess {
  /** Picks files and returns paths the host can read. */
  readonly pickFiles?: () => Promise<string[] | null>;
  /** Stores a pasted or captured image where the host can read it. */
  readonly saveClipboardImage?: SaveClipboardImage;
  /** False when "reveal in file manager" would open the wrong machine. */
  readonly canShowProjectEntryInExplorer?: false;
}

const NATIVE_FILE_ACCESS: HostFileAccess = {};

/**
 * `scope` names what the attachments belong to: an existing thread, or the
 * draft of a project that has no thread yet (the host keeps those under the
 * project's draft directory).
 */
export function resolveHostFileAccess(
  entity: Parameters<typeof entityHost>[0],
  scope: "thread" | "draft",
): HostFileAccess {
  const host = entityHost(entity);
  if (!host || host.runsOnThisMachine || host.connectionKey === undefined) {
    return NATIVE_FILE_ACCESS;
  }
  const connectionKey = host.connectionKey;
  const attachmentThreadId = scope === "draft" ? `draft-${host.hostId}` : host.hostId;
  return {
    pickFiles: () =>
      useRemoteServersStore.getState().pickAndUploadFiles(connectionKey, attachmentThreadId),
    saveClipboardImage: (input) =>
      useRemoteServersStore
        .getState()
        .saveClipboardImage(connectionKey, { ...input, threadId: attachmentThreadId }),
    canShowProjectEntryInExplorer: false,
  };
}
