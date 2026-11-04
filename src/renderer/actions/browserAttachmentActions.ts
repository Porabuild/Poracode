import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { toLocalFileUrl } from "@/shared/promptContent";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import type { PendingPickerAttachment } from "@/renderer/state/browserPanelStore";
import { resolveHostFileAccess } from "@/renderer/state/hostFileAccess";

/**
 * Moves a captured picker image to where the owning host can read it. A host
 * that runs on this machine reads the captured path as is; another host gets
 * the bytes uploaded to its attachment directory.
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
