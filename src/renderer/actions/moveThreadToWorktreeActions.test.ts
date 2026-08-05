import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  appState: {
    projects: [] as Project[],
    threads: [] as Thread[],
    setThreadWorktree: vi.fn<(threadId: string, path: string, branch: string) => void>(),
  },
  createWorktree:
    vi.fn<
      (project: Project, input: unknown) => Promise<{ path: string; changesTransferred?: boolean }>
    >(),
  primeWorktreeGitState: vi.fn<() => Promise<void>>(),
  refreshGitProject: vi.fn<() => Promise<void>>(),
  reopenStoredThread: vi.fn<(threadId: string) => void>(),
  runWorktreeSetupScript: vi.fn<() => Promise<void>>(),
  unloadStoredThread: vi.fn<(threadId: string) => Promise<void>>(),
  toast: {
    danger: vi.fn<(message: string) => void>(),
    info: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
  },
}));

vi.mock("@heroui/react", () => ({ toast: mocks.toast }));
vi.mock("@/shared/worktreeBranch", () => ({
  generateWorktreeBranch: () => "poracode/test-branch",
}));
vi.mock("@/renderer/i18n/i18n", () => ({ i18n: { _: () => "message" } }));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: { getState: () => mocks.appState },
}));
vi.mock("@/renderer/state/gitRefresh", () => ({
  refreshGitProject: mocks.refreshGitProject,
}));
vi.mock("@/renderer/state/gitStore", () => ({
  useGitStore: { getState: () => ({ statuses: { "project-1": { branch: "main" } } }) },
}));
vi.mock("./threadActions", () => ({
  reopenStoredThread: mocks.reopenStoredThread,
  unloadStoredThread: mocks.unloadStoredThread,
}));
vi.mock("./worktreeLaunchActions", () => ({
  createWorktree: mocks.createWorktree,
  primeWorktreeGitState: mocks.primeWorktreeGitState,
  runWorktreeSetupScript: mocks.runWorktreeSetupScript,
}));

import { moveThreadToWorktree } from "./moveThreadToWorktreeActions";

const project = {
  id: "project-1",
  name: "Project",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-08-04T00:00:00.000Z",
} satisfies Project;

function thread(status: Thread["status"]): Thread {
  return {
    id: "thread-1",
    projectId: project.id,
    status,
  } as Thread;
}

describe("moveThreadToWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appState.projects = [project];
    mocks.createWorktree.mockResolvedValue({ path: "C:\\worktrees\\test" });
    mocks.primeWorktreeGitState.mockResolvedValue(undefined);
    mocks.refreshGitProject.mockResolvedValue(undefined);
    mocks.runWorktreeSetupScript.mockResolvedValue(undefined);
    mocks.unloadStoredThread.mockResolvedValue(undefined);
  });

  it("keeps an active thread open and relaunches it in the new worktree", async () => {
    mocks.appState.threads = [thread("idle")];

    await moveThreadToWorktree("thread-1", false);

    expect(mocks.unloadStoredThread).toHaveBeenCalledWith("thread-1");
    expect(mocks.appState.setThreadWorktree).toHaveBeenCalledWith(
      "thread-1",
      "C:\\worktrees\\test",
      "poracode/test-branch",
    );
    expect(mocks.reopenStoredThread).toHaveBeenCalledWith("thread-1");
  });

  it("does not launch a thread that was already inactive", async () => {
    mocks.appState.threads = [thread("inactive")];

    await moveThreadToWorktree("thread-1", false);

    expect(mocks.unloadStoredThread).not.toHaveBeenCalled();
    expect(mocks.reopenStoredThread).not.toHaveBeenCalled();
  });
});
