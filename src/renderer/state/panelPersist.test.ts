import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  commitPanelPersistMigration,
  PANEL_PERSIST_KEY,
  PANEL_PERSIST_VERSION,
  resolveRightPanelFollowsThread,
} from "./panelPersist";

describe("resolveRightPanelFollowsThread", () => {
  it("defaults a clean profile to locked", () => {
    expect(resolveRightPanelFollowsThread(null)).toBe(true);
  });

  it("flips an unversioned 1.8.x unlocked slice to locked", () => {
    expect(resolveRightPanelFollowsThread({ rightPanelFollowsThread: false })).toBe(true);
  });

  it("keeps a v1 unlock after the one-time flip", () => {
    expect(
      resolveRightPanelFollowsThread({
        version: PANEL_PERSIST_VERSION,
        rightPanelFollowsThread: false,
      }),
    ).toBe(false);
  });

  it("keeps a v1 locked preference", () => {
    expect(
      resolveRightPanelFollowsThread({
        version: PANEL_PERSIST_VERSION,
        rightPanelFollowsThread: true,
      }),
    ).toBe(true);
  });
});

describe("commitPanelPersistMigration", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("rewrites the released unlocked slice to locked v1 once", () => {
    const released = {
      gitReviewContext: { projectId: "proj-a" },
      browserOverlayDrawerWidth: 640,
      rightPanelFollowsThread: false,
      threadSortMode: "updated",
      threadListLayout: "flat",
    };

    expect(commitPanelPersistMigration(released).followsThread).toBe(true);
    const migrated = JSON.parse(localStorage.getItem(PANEL_PERSIST_KEY) ?? "null");
    expect(migrated).toEqual({
      ...released,
      version: PANEL_PERSIST_VERSION,
      rightPanelFollowsThread: true,
    });

    expect(commitPanelPersistMigration(migrated).followsThread).toBe(true);
    expect(JSON.parse(localStorage.getItem(PANEL_PERSIST_KEY) ?? "null")).toEqual(migrated);
  });

  it("does not rewrite a current v1 slice", () => {
    const current = {
      version: PANEL_PERSIST_VERSION,
      rightPanelFollowsThread: false,
    };
    localStorage.setItem(PANEL_PERSIST_KEY, JSON.stringify({ stale: true }));

    expect(commitPanelPersistMigration(current)).toEqual({ followsThread: false });
    expect(JSON.parse(localStorage.getItem(PANEL_PERSIST_KEY) ?? "null")).toEqual({ stale: true });
  });
});
