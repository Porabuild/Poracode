import {
  incrementCrossagentSelectionUsage,
  removeCrossagentRoutingOverride,
  upsertCrossagentRoutingOverride,
} from "@/shared/crossagentRanking";
import type { SupervisorClient } from "@/main/supervisor/SupervisorClient";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SharedSettings } from "@/shared/settings";
import { reportSettingsError } from "./BackendSettingsNotifications";

export interface BackendRoutingSettingsOptions {
  getSharedSettings(): SharedSettings;
  writeSharedSettings(settings: SharedSettings): void;
  supervisor: Pick<SupervisorClient, "call">;
  reportError?(error: unknown): void;
}

/** Routing durability is host work, including when no Electron process exists. */
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
  let errorMessage: string | undefined;
  try {
    const current = options.getSharedSettings();
    const next =
      event.type === "crossagent-selection-used"
        ? {
            ...current,
            crossagentSelectionUsage: incrementCrossagentSelectionUsage(
              current.crossagentSelectionUsage,
              event.selections,
            ),
          }
        : {
            ...current,
            crossagentRoutingOverrides:
              event.change.action === "set"
                ? upsertCrossagentRoutingOverride(
                    current.crossagentRoutingOverrides,
                    event.change.override,
                  )
                : removeCrossagentRoutingOverride(
                    current.crossagentRoutingOverrides,
                    event.change.tags,
                  ),
          };
    options.writeSharedSettings(next);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to save the routing preference";
    report(error);
  }
  if (event.type === "crossagent-routing-override-changed") {
    void options.supervisor
      .call("confirmCrossagentRoutingOverride", {
        requestId: event.requestId,
        ok: errorMessage === undefined,
        ...(errorMessage === undefined ? {} : { error: errorMessage }),
      })
      .catch(report);
  }
  return true;
}
