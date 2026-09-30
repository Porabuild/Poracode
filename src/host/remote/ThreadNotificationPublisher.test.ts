import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { ThreadNotificationPublisher } from "./ThreadNotificationPublisher";

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Ship it",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ThreadNotificationPublisher", () => {
  it("publishes a host-owned notification after a real status transition", () => {
    const publish = vi.fn<(notification: { category: string; threadId: string }) => void>();
    const publisher = new ThreadNotificationPublisher({
      getThread: () => thread({ status: "finished" }),
      getProjectName: () => "Repo",
      getSettings: () => ({
        notificationsEnabled: true,
        notificationStatuses: { done: true, needsAttention: true, error: true },
        notifyL2Cli: true,
      }),
      publish,
    });

    publisher.handleSupervisorEvent({
      type: "thread-state",
      threadId: "thread-1",
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    expect(publish).not.toHaveBeenCalled();

    publisher.handleSupervisorEvent({
      type: "thread-state",
      threadId: "thread-1",
      status: "finished",
      attention: "none",
      canResumeWithConfig: false,
    });

    expect(publish).toHaveBeenCalledExactlyOnceWith({
      threadId: "thread-1",
      category: "done",
      projectName: "Repo",
      threadTitle: "Ship it",
      status: "finished",
    });
  });

  it("does not publish when host settings disable the category", () => {
    const publish = vi.fn<(notification: { category: string }) => void>();
    const publisher = new ThreadNotificationPublisher({
      getThread: () => thread(),
      getProjectName: () => "Repo",
      getSettings: () => ({
        notificationsEnabled: true,
        notificationStatuses: { done: false, needsAttention: true, error: true },
        notifyL2Cli: true,
      }),
      publish,
    });

    publisher.handleSupervisorEvent({
      type: "thread-state",
      threadId: "thread-1",
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    publisher.handleSupervisorEvent({
      type: "thread-state",
      threadId: "thread-1",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });

    expect(publish).not.toHaveBeenCalled();
  });
});
