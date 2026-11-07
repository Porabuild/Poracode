import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { toLocalFileUrl } from "@/shared/promptContent";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import type { PendingPickerAttachment } from "@/renderer/state/browserPanelStore";
import { resolveHostFileAccess } from "@/renderer/state/hostFileAccess";

/**
 * Imports a captured image on the client when its target host is elsewhere.
 * Device-local captures keep their readable path; Send materializes client
 * assets on the captured destination, independently of later selection.
 */
export async function materializePickerAttachment(
  threadId: string,
  attachment: PendingPickerAttachment,
): Promise<PendingPickerAttachment> {
  const app = useAppStore.getState();
  const isDraft = isDraftPaneId(threadId);
  const owner = isDraft
    ? app.projects.find((candidate) => candidate.id === parseDraftProjectId(threadId))
    : app.threads.find((candidate) => candidate.id === threadId);
  const { saveClipboardImage } = resolveHostFileAccess(owner, isDraft ? "draft" : "thread");
  if (!saveClipboardImage) return attachment;

  const data = new Uint8Array(
    await readBridge().readLocalImageFile({ url: toLocalFileUrl(attachment.attachmentPath) }),
  );
  const attachmentPath = await saveClipboardImage({ threadId, data, extension: "png" });
  return { ...attachment, attachmentPath };
}
