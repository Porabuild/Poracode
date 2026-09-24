import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  appState: {
    projects: [] as Project[],
    threads: [] as Thread[],
    moveThreadToProject: vi.fn<(threadId: string, projectId: string) => void>(),
  },
  unloadStoredThread: vi.fn<(threadId: string) => Promise<void>>(),
  toast: {
    danger: vi.fn<(message: string) => void>(),
    info: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@heroui/react", () => ({ toast: mocks.toast }));
vi.mock("@/renderer/i18n/i18n", () => ({ i18n: { _: () => "message" } }));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: { getState: () => mocks.appState },
}));
vi.mock("./threadActions", () => ({
  unloadStoredThread: mocks.unloadStoredThread,
}));

import { moveThreadToProject } from "./moveThreadToProjectActions";

const projectA = {
  id: "project-a",
  name: "Project A",
  location: { kind: "windows", path: "C:\\repo-a" },
  createdAt: "2026-08-04T00:00:00.000Z",
} satisfies Project;

const projectB = {
  id: "project-b",
  name: "Project B",
  location: { kind: "windows", path: "C:\\repo-b" },
  createdAt: "2026-08-04T00:00:00.000Z",
} satisfies Project;

function thread(status: Thread["status"], overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: projectA.id,
    status,
    ...overrides,
  } as Thread;
}

describe("moveThreadToProject action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appState.projects = [projectA, projectB];
    mocks.unloadStoredThread.mockResolvedValue(undefined);
  });

  it("refuses a launching thread with a toast", async () => {
    mocks.appState.threads = [thread("launching")];

    await moveThreadToProject("thread-1", projectB.id);

    expect(mocks.toast.info).toHaveBeenCalledTimes(1);
    expect(mocks.unloadStoredThread).not.toHaveBeenCalled();
    expect(mocks.appState.moveThreadToProject).not.toHaveBeenCalled();
  });

  it("unloads a live thread before moving it", async () => {
    mocks.appState.threads = [thread("idle")];

    await moveThreadToProject("thread-1", projectB.id);

    expect(mocks.unloadStoredThread).toHaveBeenCalledWith("thread-1");
    expect(mocks.appState.moveThreadToProject).toHaveBeenCalledWith("thread-1", projectB.id);
  });

  it("does not unload an already-inactive thread", async () => {
    mocks.appState.threads = [thread("inactive")];

    await moveThreadToProject("thread-1", projectB.id);

    expect(mocks.unloadStoredThread).not.toHaveBeenCalled();
    expect(mocks.appState.moveThreadToProject).toHaveBeenCalledWith("thread-1", projectB.id);
  });

  it("tells the user a live thread was stopped by the move", async () => {
    mocks.appState.threads = [thread("idle")];

    await moveThreadToProject("thread-1", projectB.id);

    expect(mocks.toast.info).toHaveBeenCalledTimes(1);
  });

  it("does not toast when the thread was already inactive", async () => {
    mocks.appState.threads = [thread("inactive")];

    await moveThreadToProject("thread-1", projectB.id);

    expect(mocks.toast.info).not.toHaveBeenCalled();
  });

  it("refuses a remote-owned thread with a toast", async () => {
    mocks.appState.threads = [
      thread("idle", { remoteServerId: "d1", remoteId: "remote-thread-1" }),
    ];

    await moveThreadToProject("thread-1", projectB.id);

    expect(mocks.toast.danger).toHaveBeenCalledTimes(1);
    expect(mocks.unloadStoredThread).not.toHaveBeenCalled();
    expect(mocks.appState.moveThreadToProject).not.toHaveBeenCalled();
  });

  it("is a no-op when moving to the thread's current project", async () => {
    mocks.appState.threads = [thread("idle")];

    await moveThreadToProject("thread-1", projectA.id);

    expect(mocks.unloadStoredThread).not.toHaveBeenCalled();
    expect(mocks.appState.moveThreadToProject).not.toHaveBeenCalled();
    expect(mocks.toast.info).not.toHaveBeenCalled();
    expect(mocks.toast.danger).not.toHaveBeenCalled();
  });

  it("is a no-op when the target project does not exist", async () => {
    mocks.appState.threads = [thread("idle")];

    await moveThreadToProject("thread-1", "missing-project");

    expect(mocks.unloadStoredThread).not.toHaveBeenCalled();
    expect(mocks.appState.moveThreadToProject).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown thread", async () => {
    mocks.appState.threads = [];

    await moveThreadToProject("missing-thread", projectB.id);

    expect(mocks.unloadStoredThread).not.toHaveBeenCalled();
    expect(mocks.appState.moveThreadToProject).not.toHaveBeenCalled();
  });
});
