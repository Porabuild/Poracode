import { useWorkspaceStore } from "@/renderer/state/workspaceStore";

/**
 * Long enough to cover the render commit that follows a workspace switch, short
 * enough that a deliberate Done expand right after still animates.
 */
const SETTLE_MS = 250;

let settlesAt = 0;

useWorkspaceStore.subscribe((state, previous) => {
  if (state.activeWorkspaceId !== previous.activeWorkspaceId) {
    settlesAt = performance.now() + SETTLE_MS;
  }
});

/**
 * True while the sidebar is swapping to another workspace's threads. The Done
 * section's open/close reveals describe the user's own actions; a wholesale
 * list swap is not one, so those animations must stay off while it settles.
 */
export function isWorkspaceSwitchSettling(): boolean {
  return performance.now() < settlesAt;
}
