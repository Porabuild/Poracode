import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";

const mocks = vi.hoisted(() => ({
  appState: {
    projects: [] as Project[],
    threads: [] as Thread[],
  },
  createWorktree:
    vi.fn<
      (project: Project, input: unknown) => Promise<{ path: string; changesTransferred?: boolean }>
    >(),
  primeWorktreeGitState: vi.fn<() => Promise<void>>(),
  refreshGitProject: vi.fn<() => Promise<void>>(),
  reopenStoredThread: vi.fn<(threadId: string) => void>(),
  setThreadWorktree:
    vi.fn<
      (
        threadId: string,
        path: string,
        branch: string,
        options?: { isNewWorktree?: boolean },
      ) => Promise<void>
    >(),
  runWorktreeSetupScript: vi.fn<() => Promise<void>>(),
  unloadStoredThread: vi.fn<(threadId: string) => Promise<void>>(),
  performWorktreeRemoval: vi.fn<() => Promise<boolean>>(),
  notifyUncertain: vi.fn<() => void>(),
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
  setThreadWorktree: mocks.setThreadWorktree,
  unloadStoredThread: mocks.unloadStoredThread,
}));
vi.mock("./worktreeLaunchActions", () => ({
  createWorktree: mocks.createWorktree,
  primeWorktreeGitState: mocks.primeWorktreeGitState,
  runWorktreeSetupScript: mocks.runWorktreeSetupScript,
}));
vi.mock("./worktreeActions", () => ({
  performWorktreeRemoval: mocks.performWorktreeRemoval,
}));
vi.mock("./threadCommandOutcomeActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./threadCommandOutcomeActions")>()),
  notifyThreadCommandOutcomeUncertain: mocks.notifyUncertain,
}));

import { moveThreadToWorktree } from "./moveThreadToWorktreeActions";

const project = {
  id: "project-1",
  name: "Project",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-08-04T00:00:00.000Z",
} satisfies Project;

const remoteProject = {
  ...project,
  id: "remote:d1:project:project-1",
  remoteServerId: "d1",
  remoteId: "project-1",
  location: { kind: "posix" as const, path: "/repo", remoteServerId: "d1" },
} satisfies Project;

function thread(status: Thread["status"], overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: project.id,
    status,
    ...overrides,
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
    mocks.setThreadWorktree.mockResolvedValue(undefined);
    mocks.performWorktreeRemoval.mockResolvedValue(true);
  });

  afterEach(() => vi.useRealTimers());

  it("keeps an active thread open and relaunches it in the new worktree", async () => {
    mocks.appState.threads = [thread("idle")];

    await moveThreadToWorktree("thread-1", false);

    expect(mocks.unloadStoredThread).toHaveBeenCalledWith("thread-1");
    expect(mocks.setThreadWorktree).toHaveBeenCalledWith(
      "thread-1",
      "C:\\worktrees\\test",
      "poracode/test-branch",
      {},
    );
    expect(mocks.reopenStoredThread).toHaveBeenCalledWith("thread-1");
    expect(mocks.primeWorktreeGitState).toHaveBeenCalled();
  });

  it("does not launch a thread that was already inactive", async () => {
    mocks.appState.threads = [thread("inactive")];

    await moveThreadToWorktree("thread-1", false);

    expect(mocks.unloadStoredThread).not.toHaveBeenCalled();
    expect(mocks.reopenStoredThread).not.toHaveBeenCalled();
    expect(mocks.setThreadWorktree).toHaveBeenCalledWith(
      "thread-1",
      "C:\\worktrees\\test",
      "poracode/test-branch",
      {},
    );
  });

  it("uses the same setThreadWorktree path for remote threads (host routes)", async () => {
    mocks.appState.projects = [remoteProject];
    mocks.appState.threads = [
      thread("idle", {
        id: "remote:d1:thread:remote-thread",
        projectId: remoteProject.id,
        remoteServerId: "d1",
        remoteId: "remote-thread",
      }),
    ];
    mocks.createWorktree.mockResolvedValue({ path: "/repo/.poracode/worktrees/feature" });

    await moveThreadToWorktree("remote:d1:thread:remote-thread", true);

    expect(mocks.setThreadWorktree).toHaveBeenCalledWith(
      "remote:d1:thread:remote-thread",
      "/repo/.poracode/worktrees/feature",
      "poracode/test-branch",
      { isNewWorktree: true },
    );
    expect(mocks.reopenStoredThread).toHaveBeenCalledWith("remote:d1:thread:remote-thread");
    // The client primes its cache; host set-worktree owns setup.
    expect(mocks.primeWorktreeGitState).toHaveBeenCalledWith(
      remoteProject,
      "/repo/.poracode/worktrees/feature",
    );
    expect(mocks.runWorktreeSetupScript).not.toHaveBeenCalled();
  });

  it("checks out a clean worktree while the live runtime is stopping", async () => {
    vi.useFakeTimers();
    mocks.appState.threads = [thread("idle")];
    mocks.unloadStoredThread.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
    );
    mocks.createWorktree.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ path: "C:\\worktree" }), 100)),
    );

    const move = moveThreadToWorktree("thread-1", false);
    expect(mocks.unloadStoredThread).toHaveBeenCalledOnce();
    expect(mocks.createWorktree).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.setThreadWorktree).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await move;
    expect(mocks.setThreadWorktree).toHaveBeenCalledOnce();
    expect(mocks.reopenStoredThread).toHaveBeenCalledOnce();
  });

  it("waits for the runtime to stop before transferring source changes", async () => {
    mocks.appState.threads = [thread("working")];
    const unload = Promise.withResolvers<void>();
    mocks.unloadStoredThread.mockReturnValue(unload.promise);

    const move = moveThreadToWorktree("thread-1", true);
    expect(mocks.createWorktree).not.toHaveBeenCalled();
    unload.resolve();
    await move;
    expect(mocks.createWorktree).toHaveBeenCalledWith(
      project,
      expect.objectContaining({
        transferUncommitted: true,
        keepChangesInSource: false,
      }),
    );
  });

  it("uses the new-thread setup path once and does not wait for setup to finish", async () => {
    const scriptedProject = { ...project, scripts: { actions: [], setupScript: "pnpm install" } };
    mocks.appState.projects = [scriptedProject];
    mocks.appState.threads = [thread("idle")];
    // A long install must not delay completing the move or starting the agent.
    mocks.runWorktreeSetupScript.mockReturnValue(new Promise(() => {}));

    await moveThreadToWorktree("thread-1", true);

    expect(mocks.setThreadWorktree).toHaveBeenCalledWith(
      "thread-1",
      "C:\\worktrees\\test",
      "poracode/test-branch",
      {},
    );
    expect(mocks.runWorktreeSetupScript).toHaveBeenCalledExactlyOnceWith(
      scriptedProject,
      "C:\\worktrees\\test",
      "pnpm install",
    );
    expect(mocks.reopenStoredThread).toHaveBeenCalledOnce();
  });

  it("reopens the source thread if creating its worktree fails after stopping", async () => {
    mocks.appState.threads = [thread("idle")];
    mocks.createWorktree.mockRejectedValue(new Error("checkout failed"));

    await moveThreadToWorktree("thread-1", false);

    expect(mocks.setThreadWorktree).not.toHaveBeenCalled();
    expect(mocks.reopenStoredThread).toHaveBeenCalledExactlyOnceWith("thread-1");
    expect(mocks.toast.danger).toHaveBeenCalledWith("checkout failed");
  });

  it("preserves a newly created worktree if stopping the source runtime fails", async () => {
    mocks.appState.threads = [thread("idle")];
    mocks.unloadStoredThread.mockRejectedValue(new Error("close failed"));

    await moveThreadToWorktree("thread-1", false);

    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
    expect(mocks.setThreadWorktree).not.toHaveBeenCalled();
    expect(mocks.reopenStoredThread).not.toHaveBeenCalled();
    expect(mocks.toast.danger).toHaveBeenCalledWith("close failed");
  });

  it("preserves a worktree adopted by another thread while the source is stopping", async () => {
    mocks.appState.threads = [thread("idle")];
    const shutdown = Promise.withResolvers<void>();
    mocks.unloadStoredThread.mockReturnValue(shutdown.promise);

    const move = moveThreadToWorktree("thread-1", false);
    await Promise.resolve();
    mocks.appState.threads.push(
      thread("working", { id: "another-thread", worktreePath: "C:\\worktrees\\test" }),
    );
    shutdown.reject(new Error("close failed"));
    await move;

    expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
    expect(mocks.appState.threads[1]).toMatchObject({
      id: "another-thread",
      status: "working",
      worktreePath: "C:\\worktrees\\test",
    });
    expect(mocks.setThreadWorktree).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "preserves a worktree without resuming from stale metadata when assignment is uncertain (withChanges=%s)",
    async (withChanges) => {
      mocks.appState.threads = [thread("idle")];
      mocks.setThreadWorktree.mockRejectedValue(
        new RemoteClientError("response lost", 0, "timeout", { requestPhase: "dispatched" }),
      );

      await moveThreadToWorktree("thread-1", withChanges);

      expect(mocks.reopenStoredThread).not.toHaveBeenCalled();
      expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
      expect(mocks.runWorktreeSetupScript).not.toHaveBeenCalled();
      expect(mocks.notifyUncertain).toHaveBeenCalledOnce();
      expect(mocks.toast.danger).not.toHaveBeenCalled();
    },
  );

  it("resumes after a definite metadata assignment refusal", async () => {
    mocks.appState.threads = [thread("idle")];
    mocks.setThreadWorktree.mockRejectedValue(new RemoteClientError("refused", 403, "forbidden"));

    await moveThreadToWorktree("thread-1", false);

    expect(mocks.reopenStoredThread).toHaveBeenCalledExactlyOnceWith("thread-1");
    expect(mocks.notifyUncertain).not.toHaveBeenCalled();
    expect(mocks.toast.danger).toHaveBeenCalledWith("refused");
  });

  it("ignores a repeated move while checkout is pending", async () => {
    mocks.appState.threads = [thread("inactive")];
    const creation = Promise.withResolvers<{ path: string }>();
    mocks.createWorktree.mockReturnValue(creation.promise);

    const first = moveThreadToWorktree("thread-1", false);
    await moveThreadToWorktree("thread-1", false);
    expect(mocks.createWorktree).toHaveBeenCalledOnce();
    creation.resolve({ path: "C:\\worktree" });
    await first;
  });

  it.each([false, true])(
    "does not revive a deleted thread or discard transferred changes (withChanges=%s)",
    async (withChanges) => {
      mocks.appState.threads = [thread("inactive")];
      const creation = Promise.withResolvers<{ path: string }>();
      mocks.createWorktree.mockReturnValue(creation.promise);
      const move = moveThreadToWorktree("thread-1", withChanges);
      mocks.appState.threads = [];
      creation.resolve({ path: "C:\\worktree" });
      await move;

      expect(mocks.setThreadWorktree).not.toHaveBeenCalled();
      expect(mocks.reopenStoredThread).not.toHaveBeenCalled();
      expect(mocks.runWorktreeSetupScript).not.toHaveBeenCalled();
      expect(mocks.performWorktreeRemoval).not.toHaveBeenCalled();
    },
  );
});
