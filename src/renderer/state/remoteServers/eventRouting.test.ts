import { describe, expect, it } from "vitest";
import { filterRemoteThreadEvents } from "./eventRouting";

describe("filterRemoteThreadEvents", () => {
  it("accepts an indexed matcher without requiring a copied Set", () => {
    const matcher = { has: (threadId: string) => threadId === "keep" };

    expect(
      filterRemoteThreadEvents(
        { type: "thread-state", threadId: "keep", state: "running" },
        matcher,
      ),
    ).toEqual({ type: "thread-state", threadId: "keep", state: "running" });
    expect(
      filterRemoteThreadEvents(
        { type: "thread-state", threadId: "drop", state: "running" },
        matcher,
      ),
    ).toBeNull();
  });

  it("passes out-of-band forge activity through untouched", () => {
    const matcher = { has: () => false };
    const activity = {
      type: "remote-forge-activity",
      projectId: "p",
      threadId: "t",
      action: "create",
    };

    expect(filterRemoteThreadEvents(activity, matcher)).toBe(activity);
    expect(filterRemoteThreadEvents({ type: "unknown-event" }, matcher)).toBeNull();
  });

  it("passes out-of-band remote-user-notification events through untouched", () => {
    const matcher = { has: () => false };
    const notification = {
      type: "remote-user-notification",
      threadId: "t",
      category: "done",
      projectName: "Repo",
      threadTitle: "Thread",
      status: "finished",
    };

    expect(filterRemoteThreadEvents(notification, matcher)).toBe(notification);
  });
});
