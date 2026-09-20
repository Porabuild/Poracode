import { describe, expect, it } from "vitest";
import { classifyThreadNotification, shouldPublishThreadNotification } from "./threadNotification";

describe("classifyThreadNotification", () => {
  it("classifies completion, attention, and error without treating attention-only as a notify", () => {
    expect(classifyThreadNotification("working", "finished", "none")).toBe("done");
    expect(classifyThreadNotification("working", "idle", "none")).toBe("done");
    expect(classifyThreadNotification("working", "needs_approval", "needs_approval")).toBe(
      "needsAttention",
    );
    expect(classifyThreadNotification("working", "error", "error")).toBe("error");
    expect(classifyThreadNotification("idle", "idle", "needs_reply")).toBeNull();
  });
});

describe("shouldPublishThreadNotification", () => {
  const allowed = {
    notificationsEnabled: true,
    notificationStatuses: { done: true, needsAttention: true, error: true },
    notifyL2Cli: true,
  };

  it("applies host settings and ignores user-forced turn closes", () => {
    expect(shouldPublishThreadNotification({ ...allowed, category: "done" })).toBe(true);
    expect(
      shouldPublishThreadNotification({
        ...allowed,
        category: "done",
        forceCloseActiveTurn: true,
      }),
    ).toBe(false);
    expect(
      shouldPublishThreadNotification({
        ...allowed,
        category: "done",
        notificationsEnabled: false,
      }),
    ).toBe(false);
    expect(
      shouldPublishThreadNotification({
        ...allowed,
        category: "done",
        notificationStatuses: { done: false, needsAttention: true, error: true },
      }),
    ).toBe(false);
    expect(
      shouldPublishThreadNotification({
        ...allowed,
        category: "done",
        notifyL2Cli: false,
        threadStatusSource: "terminal_parse",
      }),
    ).toBe(false);
  });
});
