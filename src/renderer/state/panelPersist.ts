/**
 * Cross-launch slice for `poracode-panel`.
 *
 * v1: one-time lock-default. Releases through 1.8.x persisted
 * `rightPanelFollowsThread: false` as the implicit default. The first launch
 * on v1 flips those profiles to locked so Changes / files / terminal follow
 * the focused thread. After that write, an explicit unlock is kept.
 */
export const PANEL_PERSIST_KEY = "poracode-panel";
export const PANEL_PERSIST_VERSION = 1;

export type PersistedPanelSlice = {
  version?: number;
  gitReviewContext?: { projectId: string; worktreePath?: string } | null;
  browserOverlayDrawerWidth?: number;
  rightPanelFollowsThread?: boolean;
  threadToolRailOffset?: number;
  threadSortMode?: string;
  threadListLayout?: string;
};

export function resolveRightPanelFollowsThread(
  persisted: Pick<PersistedPanelSlice, "version" | "rightPanelFollowsThread"> | null,
): boolean {
  if (persisted != null && (persisted.version ?? 0) >= PANEL_PERSIST_VERSION) {
    return persisted.rightPanelFollowsThread ?? true;
  }
  return true;
}

/**
 * Force the lock-default onto disk once so a later unlock is distinguishable
 * from the pre-v1 implicit `false`. No-ops when the slice is already v1.
 */
export function commitPanelPersistMigration(persisted: PersistedPanelSlice | null): {
  followsThread: boolean;
} {
  const followsThread = resolveRightPanelFollowsThread(persisted);
  if (persisted == null) return { followsThread };
  if (
    persisted.version === PANEL_PERSIST_VERSION &&
    persisted.rightPanelFollowsThread === followsThread
  ) {
    return { followsThread };
  }
  try {
    localStorage.setItem(
      PANEL_PERSIST_KEY,
      JSON.stringify({
        ...persisted,
        version: PANEL_PERSIST_VERSION,
        rightPanelFollowsThread: followsThread,
      }),
    );
  } catch {
    // Persistence is best-effort; keep the in-memory migrated value.
  }
  return { followsThread };
}
