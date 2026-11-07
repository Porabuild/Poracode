/** Client-owned bytes and submission snapshots; never authority for host state. */
export { CLIENT_DRAFT_DATABASE } from "./clientDraftDb";
export * from "./clientDraftAssets";
export * from "./clientDraftSubmissions";
import { resetClientDraftWindowForTest } from "./clientDraftWindows";
import { closeDraftDatabaseForTest } from "./clientDraftDb";
import { resetClientDraftAssetsForTest } from "./clientDraftAssets";
import { resetClientDraftSubmissionSignalsForTest } from "./clientDraftSubmissions";

export async function closeClientDraftDatabaseForTest() {
  await closeDraftDatabaseForTest();
  await resetClientDraftWindowForTest();
  resetClientDraftAssetsForTest();
  resetClientDraftSubmissionSignalsForTest();
}
