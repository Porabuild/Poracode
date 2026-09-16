import {
  incrementCrossagentSelectionUsage,
  removeCrossagentRoutingOverride,
  upsertCrossagentRoutingOverride,
} from "@/shared/crossagentRanking";
import type { SupervisorClient } from "@/main/supervisor/SupervisorClient";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SharedSettings } from "@/shared/settings";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";
import { reportSettingsError } from "./BackendSettingsNotifications";

export interface BackendRoutingSettingsOptions {
  /** Subject-scoped CAS edit through the composition's settings authority.
   * `compute` re-derives the field value from the freshest committed state, so
   * a concurrent commit rebases the event instead of clobbering it. */
  editSettingsField<F extends keyof SharedSettings>(
    field: F,
    compute: (current: SharedSettings) => SharedSettings[F] | undefined,
  ): Promise<SettingsMutationResult>;
  supervisor: Pick<SupervisorClient, "call">;
  reportError?(error: unknown): void;
}

/** Routing durability is host work, including when no Electron process exists.
 * Learned-usage records are owner-managed settings subjects: they commit as
 * single-field compare-and-swap edits instead of whole-file rewrites. */
export function observeRoutingSettingsEvent(
  options: BackendRoutingSettingsOptions,
  event: SupervisorEvent,
): boolean {
  if (
    event.type !== "crossagent-selection-used" &&
    event.type !== "crossagent-routing-override-changed"
  )
    return false;
  const report = (error: unknown): void => reportSettingsError(error, options.reportError);
  const commit: Promise<SettingsMutationResult> =
    event.type === "crossagent-selection-used"
      ? options.editSettingsField("crossagentSelectionUsage", (current) =>
          incrementCrossagentSelectionUsage(current.crossagentSelectionUsage, event.selections),
        )
      : options.editSettingsField("crossagentRoutingOverrides", (current) =>
          event.change.action === "set"
            ? upsertCrossagentRoutingOverride(
                current.crossagentRoutingOverrides,
                event.change.override,
              )
            : removeCrossagentRoutingOverride(
                current.crossagentRoutingOverrides,
                event.change.tags,
              ),
        );
  void commit.then(
    (result) => {
      const errorMessage =
        result.status === "committed"
          ? undefined
          : result.status === "conflict"
            ? `Routing preference conflicted with a concurrent edit (${result.reason}).`
            : `Routing preference was refused by the settings authority (${result.reason}).`;
      if (event.type === "crossagent-routing-override-changed") {
        void options.supervisor
          .call("confirmCrossagentRoutingOverride", {
            requestId: event.requestId,
            ok: errorMessage === undefined,
            ...(errorMessage === undefined ? {} : { error: errorMessage }),
          })
          .catch(report);
        return;
      }
      if (errorMessage !== undefined) report(new Error(errorMessage));
    },
    (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : "Unable to save the routing preference";
      report(error);
      if (event.type === "crossagent-routing-override-changed") {
        void options.supervisor
          .call("confirmCrossagentRoutingOverride", {
            requestId: event.requestId,
            ok: false,
            error: errorMessage,
          })
          .catch(report);
      }
    },
  );
  return true;
}
