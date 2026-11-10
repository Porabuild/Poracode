import {
  acceptStagedClientSubmissions,
  listAcceptedClientSubmissions,
  listClientSubmissions,
  scanClientDraftAssetBacklog,
} from "./clientDraftDatabase";
import {
  acceptClientSubmissionById,
  matchesSubmissionRecoveryContent,
  retireFailedDraftSubmission,
} from "@/renderer/actions/clientDraftSubmission";
import { useAppStore } from "@/renderer/state/appStore";
import { composerDraftStorage } from "../composerDraftStorage";

/** Finish known local receipts before an editor can restore already-sent text. */
export async function initializeClientDraftRecovery(): Promise<void> {
  try {
    const storage = composerDraftStorage();
    // Loading has already adopted exact-base close journals into the store.
    await storage?.flushRequired();
    await storage?.recoverJournals();
    const projectDrafts = storage ? storage.load("project") : {};
    const threadDrafts = storage ? storage.load("thread") : {};
    if (storage)
      useAppStore.setState({
        draftContents: projectDrafts,
        threadDraftContents: threadDrafts,
      });
    await acceptStagedClientSubmissions();
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
    const remaining = await listClientSubmissions();
    for (const record of remaining) {
      if (record.state === "accepted") continue;
      let scopePair: [string, string] | undefined;
      try {
        const parsedScope: unknown = JSON.parse(record.scope);
        if (
          Array.isArray(parsedScope) &&
          parsedScope.length === 2 &&
          typeof parsedScope[0] === "string" &&
          typeof parsedScope[1] === "string"
        ) {
          scopePair = [parsedScope[0], parsedScope[1]];
        }
      } catch {
        continue;
      }
      if (!scopePair) continue;
      const [kind, ownerId] = scopePair;
      // Project draft composers never clear before host acceptance; any
      // earlier non-accepted launch/experiment outbox record is redundant with
      // the live project draft in storage and would only block a retry.
      if (kind === "project" && record.target !== "local-checkpoint") {
        await retireFailedDraftSubmission(record.id);
        continue;
      }
      if (record.state !== "failed" && record.state !== "prepared") continue;
      const current = kind === "project" ? projectDrafts[ownerId] : threadDrafts[ownerId];
      if (matchesSubmissionRecoveryContent(record, current)) {
        await retireFailedDraftSubmission(record.id);
      }
    }
    void scanClientDraftAssetBacklog().catch(() => undefined);
  } catch (error) {
    // Startup remains usable in storage-degraded mode. Send still requires a
    // durable snapshot and never consumes this window's unsaved editor.
    console.error("[poracode] draft recovery could not initialize", error);
    window.dispatchEvent(new Event("poracode:composer-draft-save-failed"));
  }
}
