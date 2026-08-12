import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@poracode/activity-bridge", () => ({
  ActivityBridge: {
    startActivity: vi.fn<() => Promise<{ activityId: string | null }>>(async () => ({
      activityId: "activity-1",
    })),
    endActivity: vi.fn<() => Promise<void>>(async () => {}),
  },
}));

import { ActivityBridge } from "@poracode/activity-bridge";
import {
  __resetLiveActivityStateForTests,
  buildContentState,
  configureLiveActivities,
  notifyLiveActivityThreadState,
} from "./liveActivityController";

const startActivity = vi.mocked(ActivityBridge.startActivity);
const endActivity = vi.mocked(ActivityBridge.endActivity);

function active(threadId: string, title = threadId, project = "proj") {
  return notifyLiveActivityThreadState({ threadId, status: "working", title, project });
}
function finished(threadId: string) {
  return notifyLiveActivityThreadState({
    threadId,
    status: "finished",
    title: threadId,
    project: "proj",
  });
}

describe("liveActivityController", () => {
  beforeEach(() => {
    __resetLiveActivityStateForTests();
    startActivity.mockClear();
    endActivity.mockClear();
    startActivity.mockResolvedValue({ activityId: "activity-1" });
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is inert until a desktop context is configured", async () => {
    await active("t1");
    expect(startActivity).not.toHaveBeenCalled();
  });

  it("starts the activity on the first active thread and not again on the second", async () => {
    configureLiveActivities({ desktopId: "d1", desktopName: "Studio" });

    await active("t1");
    expect(startActivity).toHaveBeenCalledTimes(1);
    expect(startActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: { desktopId: "d1", desktopName: "Studio" },
        contentState: expect.objectContaining({ runningCount: 1 }),
      }),
    );

    vi.setSystemTime(2_000);
    await active("t2");
    // No local update method exists — the second active thread must not restart.
    expect(startActivity).toHaveBeenCalledTimes(1);
    expect(endActivity).not.toHaveBeenCalled();
    expect(buildContentState().runningCount).toBe(2);
  });

  it("ends the activity only when the last active thread finishes", async () => {
    configureLiveActivities({ desktopId: "d1", desktopName: "Studio" });
    await active("t1");
    vi.setSystemTime(2_000);
    await active("t2");

    await finished("t1");
    expect(endActivity).not.toHaveBeenCalled();
    expect(buildContentState().runningCount).toBe(1);

    await finished("t2");
    expect(endActivity).toHaveBeenCalledTimes(1);
    expect(buildContentState().runningCount).toBe(0);
  });

  it("caps rows at 3 most-recently-active while counting all running threads", async () => {
    configureLiveActivities({ desktopId: "d1", desktopName: "Studio" });
    await active("t1");
    vi.setSystemTime(2_000);
    await active("t2");
    vi.setSystemTime(3_000);
    await active("t3");
    vi.setSystemTime(4_000);
    await active("t4");

    const content = buildContentState();
    expect(content.runningCount).toBe(4);
    expect(content.threads).toHaveLength(3);
    // Most-recently-active first (t1 is the oldest and gets dropped).
    expect(content.threads.map((row) => row.threadId)).toEqual(["t4", "t3", "t2"]);
  });

  it("tracks startedAt from the first active transition, not later ticks", async () => {
    configureLiveActivities({ desktopId: "d1", desktopName: "Studio" });
    await active("t1");
    vi.setSystemTime(5_000);
    await notifyLiveActivityThreadState({
      threadId: "t1",
      status: "needs_approval",
      title: "t1",
      project: "proj",
    });
    expect(buildContentState().threads[0]?.startedAt).toBe(1_000);
  });

  it("ignores a non-active status for an untracked thread", async () => {
    configureLiveActivities({ desktopId: "d1", desktopName: "Studio" });
    await finished("ghost");
    expect(startActivity).not.toHaveBeenCalled();
    expect(endActivity).not.toHaveBeenCalled();
  });

  it("ends the running activity when the desktop is switched", async () => {
    configureLiveActivities({ desktopId: "d1", desktopName: "Studio" });
    await active("t1");
    configureLiveActivities({ desktopId: "d2", desktopName: "Laptop" });
    await Promise.resolve();
    expect(endActivity).toHaveBeenCalledTimes(1);
    expect(buildContentState().runningCount).toBe(0);
  });
});
