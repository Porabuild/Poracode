import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { toLocalFileUrl } from "@/shared/promptContent";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import type { PendingPickerAttachment } from "@/renderer/state/browserPanelStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

export async function materializePickerAttachment(
  threadId: string,
  attachment: PendingPickerAttachment,
): Promise<PendingPickerAttachment> {
  const app = useAppStore.getState();
  const projectOwner = isDraftPaneId(threadId)
    ? remoteOwner(app.projects.find((candidate) => candidate.id === parseDraftProjectId(threadId)))
    : undefined;
  const threadOwner = isDraftPaneId(threadId)
    ? undefined
    : remoteOwner(app.threads.find((candidate) => candidate.id === threadId));
  const owner = projectOwner ?? threadOwner;
  if (!owner) return attachment;

  const data = new Uint8Array(
    await readBridge().readLocalImageFile({ url: toLocalFileUrl(attachment.attachmentPath) }),
  );
  const attachmentPath = projectOwner
    ? await useRemoteServersStore.getState().saveClipboardImage(owner.desktopId, {
        threadId: `draft-${owner.remoteId}`,
        data,
        extension: "png",
      })
    : await readBridge().saveClipboardImage({ threadId, data, extension: "png" });
  return { ...attachment, attachmentPath };
}
