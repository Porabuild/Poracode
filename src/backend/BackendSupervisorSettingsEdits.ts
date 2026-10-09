import type { SupervisorClient } from "@/host/supervisor/SupervisorClient";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SettingsOwnerEdit } from "@/shared/settingsTransactions";
import { reportSettingsError } from "./BackendSettingsNotifications";

export interface BackendSupervisorSettingsEditsOptions {
  commitOwnerSettingsEdits(edits: readonly SettingsOwnerEdit[]): Promise<void>;
  supervisor: Pick<SupervisorClient, "call">;
  reportError?(error: unknown): void;
}

/** The settings owner's half of the supervisor `settings-edits-requested`
 * round trip: commit through the authority, then confirm either outcome. */
export function observeSupervisorSettingsEditsEvent(
  options: BackendSupervisorSettingsEditsOptions,
  event: SupervisorEvent,
): boolean {
  if (event.type !== "settings-edits-requested") return false;
  const report = (error: unknown): void => reportSettingsError(error, options.reportError);
  const confirm = (ok: boolean, error?: string): void => {
    void options.supervisor
      .call(
        "confirmSupervisorSettingsEdits",
        { requestId: event.requestId, ok, ...(error === undefined ? {} : { error }) },
        // A confirmation is for the supervisor that asked; never start a new one.
        { startIfNeeded: false },
      )
      .catch(report);
  };
  options.commitOwnerSettingsEdits(event.edits).then(
    () => confirm(true),
    (error: unknown) => {
      report(error);
      confirm(false, error instanceof Error ? error.message : "Unable to save settings");
    },
  );
  return true;
}
