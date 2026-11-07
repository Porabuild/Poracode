import { listAcceptedClientSubmissions, scanClientDraftAssetBacklog } from "./clientDraftDatabase";
import { acceptClientSubmissionById } from "@/renderer/actions/clientDraftSubmission";
import { useAppStore } from "@/renderer/state/appStore";
import { composerDraftStorage } from "../composerDraftStorage";

/** Finish known local receipts before an editor can restore already-sent text. */
export async function initializeClientDraftRecovery(): Promise<void> {
  try {
    const storage = composerDraftStorage();
    // Loading has already adopted exact-base close journals into the store.
    await storage?.flushRequired();
    await storage?.recoverJournals();
    if (storage)
      useAppStore.setState({
        draftContents: storage.load("project"),
        threadDraftContents: storage.load("thread"),
      });
    const records = await listAcceptedClientSubmissions();
    for (const record of records) {
      if (record.state !== "accepted") continue;
      await acceptClientSubmissionById(record.id, () => {
        const [kind, ownerId] = JSON.parse(record.scope) as [string, string];
        const store = useAppStore.getState();
        if (kind === "project") store.clearDraftContent(ownerId);
        else if (kind === "thread") store.clearThreadDraftContent(ownerId);
      });
    }
    void scanClientDraftAssetBacklog().catch(() => undefined);
  } catch (error) {
    // Startup remains usable in storage-degraded mode. Send still requires a
    // durable snapshot and never consumes this window's unsaved editor.
    console.error("[poracode] draft recovery could not initialize", error);
    window.dispatchEvent(new Event("poracode:composer-draft-save-failed"));
  }
}
