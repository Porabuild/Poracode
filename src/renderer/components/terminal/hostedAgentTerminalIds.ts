import { isDraftPaneId } from "@/shared/paneId";
import type { AppView, Thread } from "@/shared/contracts";

export interface HiddenHostedAgentTerminalState {
  keepAlivePaneIds: readonly string[];
  view: AppView;
  threads: readonly Pick<Thread, "id" | "archived" | "done" | "presentationMode">[];
}

/**
 * Terminal threads that should stay mounted off the visible pane tree
 * (Emdash/Orca: hide, don't dispose). Visible panes keep their in-place
 * surface; this list is only the ones the pane tree is about to drop.
 */
export function selectHiddenHostedAgentTerminalIds(
  state: HiddenHostedAgentTerminalState,
): string[] {
  const visible = new Set(state.view.kind === "thread" ? state.view.panes : []);
  return state.keepAlivePaneIds.filter((id) => {
    if (visible.has(id) || isDraftPaneId(id)) return false;
    const thread = state.threads.find((candidate) => candidate.id === id);
    return (
      thread !== undefined && !thread.archived && !thread.done && thread.presentationMode !== "gui"
    );
  });
}
