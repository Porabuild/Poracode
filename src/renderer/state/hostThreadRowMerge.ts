import type { Thread } from "@/shared/contracts";
import type { AppView } from "@/shared/contracts/appView";
import { useAppStore } from "./appStore";
import { carryActiveTurnTiming } from "./activeTurnTiming";
import { carryPendingRootLaunchRuntime } from "./hostLaunchRuntime";
import { carryPendingThreadInput } from "./pendingThreadInput";
import { preservePendingThreadConfig, type PendingThreadConfig } from "./pendingThreadConfig";
import { removePaneFromView } from "./slices/helpers";
import { carryVolatileSessionConfigOptions } from "./volatileSessionConfigOptions";

/**
 * Merges a thread row a host's catalog served over the resident row of the
 * same thread, whichever host owns it. A catalog page is host-durable state
 * and may be older than what this client already applied from the live
 * stream or from its own intents, so the resident row's newer client state is
 * carried over instead of erased:
 *
 * - a prompt this client just sent, or a launch it still owns (a saved draft
 *   has no host runtime yet);
 * - an active turn's start time, so the timer never jumps back;
 * - the volatile session-config inventory the page omits (same owner and
 *   session only);
 * - a config change the user made that the host has not acknowledged.
 *
 * Returns `incoming` itself when nothing is carried, so an unchanged row keeps
 * its identity.
 */
export function mergeHostThreadRow(
  resident: Thread | undefined,
  incoming: Thread,
  pendingConfig: PendingThreadConfig | undefined,
): Thread {
  if (!resident) return incoming;
  const withInput =
    resident.presentationMode === "gui"
      ? carryPendingThreadInput(resident, incoming)
      : carryPendingRootLaunchRuntime(resident, incoming);
  return preservePendingThreadConfig(
    carryVolatileSessionConfigOptions(resident, carryActiveTurnTiming(resident, withInput)),
    pendingConfig,
  );
}

/**
 * Client projection effect for a host-archived thread: drop its visible pane
 * (the documented auto-archive behavior), never a durable write. Host
 * housekeeping archives rows without a forwarded user command.
 */
export function closePanesForHostArchivedRows(threadIds: ReadonlySet<string>): void {
  if (threadIds.size === 0) return;
  useAppStore.setState((state) => {
    if (state.view.kind !== "thread") return state;
    let nextView: AppView = state.view;
    for (const threadId of threadIds) {
      if (nextView.kind === "thread" && nextView.panes.includes(threadId)) {
        nextView = removePaneFromView(nextView, threadId);
      }
    }
    return nextView === state.view ? state : { view: nextView };
  });
}
