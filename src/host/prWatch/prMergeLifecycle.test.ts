import { describe, expect, it, vi } from "vitest";
import type {
  GitStatusResult,
  PrData,
  PrWatch,
  Project,
  RemoteThreadCommand,
  Thread,
} from "@/shared/contracts";
import {
  emptyGitStateSnapshot,
  gitTargetKey,
  pullRequestKey,
  type GitStateSnapshot,
} from "@/shared/gitState";
import { PrMergeLifecycleService } from "./prMergeLifecycle";

const HOST_ID = "host-1";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Repo",
    location: { kind: "posix", path: "/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    projectId: "p1",
    title: "PR thread",
    agentKind: "codex",
    presentationMode: "gui",
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    config: { model: "test-model" },
    worktreePath: "/repo-wt",
    worktreeBranch: "feat/x",
    prNumber: 42,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePr(overrides: Partial<PrData> = {}): PrData {
  return {
    number: 42,
    title: "Feature PR",
    url: "https://github.com/acme/repo/pull/42",
    state: "open",
    isDraft: false,
    baseBranch: "main",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeWatch(overrides: Partial<PrWatch> = {}): PrWatch {
  return {
    projectId: "p1",
    prNumber: 42,
    headBranch: "feat/x",
    worktreePath: "/repo-wt",
    watchEnabled: false,
    autoMerge: true,
    lastCommentCursor: null,
    lastReviewCommentCursor: null,
    lastReviewCursor: null,
    lastCheckKey: null,
    activeThreadId: null,
    lastError: null,
    blockedReason: null,
    ...overrides,
  };
}

function makeCleanBaseStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    isRepo: true,
    branch: "main",
    tracking: "origin/main",
    hasRemote: true,
    remoteInfo: null,
    ahead: 0,
    behind: 1,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
    ...overrides,
  };
}

function createHarness(initialThreads: Thread[] = [makeThread()], autoMarkDoneOnPrMerge = true) {
  const projects = new Map<string, Project>([["p1", makeProject()]]);
  const threads = new Map<string, Thread>(initialThreads.map((t) => [t.id, t]));
  let snapshot: GitStateSnapshot = emptyGitStateSnapshot();
  const settings = { autoMarkDoneOnPrMerge };
  const getGitStatus = vi
    .fn<() => Promise<GitStatusResult>>()
    .mockResolvedValue(makeCleanBaseStatus());
  const gitPull = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const refreshProjectAfterSync = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const closeThreadConfirmed = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const markThreadDoneInDb = vi.fn<(threadId: string, doneAt: string) => boolean>(
    (threadId, doneAt) => {
      const existing = threads.get(threadId);
      if (!existing || existing.done) return false;
      threads.set(threadId, { ...existing, done: true, doneAt, starred: false });
      return true;
    },
  );
  const publishThreadsChanged = vi.fn<(ids: readonly string[]) => void>();
  const sendThreadCommand = vi.fn<(command: RemoteThreadCommand) => boolean>(() => true);
  const isExperimentThread = vi.fn<(threadId: string) => boolean>(() => false);

  const service = new PrMergeLifecycleService({
    hostId: HOST_ID,
    getProject: (id) => projects.get(id) ?? null,
    getThread: (id) => threads.get(id) ?? null,
    getThreads: () => [...threads.values()],
    getGitSnapshot: () => snapshot,
    getSharedSettings: () => settings,
    getGitStatus,
    gitPull,
    refreshProjectAfterSync,
    isExperimentThread,
    closeThreadConfirmed,
    markThreadDoneInDb,
    publishThreadsChanged,
    sendThreadCommand,
    now: () => "2026-02-01T00:00:00.000Z",
  });

  return {
    service,
    projects,
    threads,
    settings,
    setSnapshot: (next: GitStateSnapshot) => {
      snapshot = next;
    },
    getGitStatus,
    gitPull,
    refreshProjectAfterSync,
    closeThreadConfirmed,
    markThreadDoneInDb,
    publishThreadsChanged,
    sendThreadCommand,
    isExperimentThread,
  };
}

describe("PrMergeLifecycleService", () => {
  it("closes the session, marks thread done in DB, broadcasts, mirrors set-done, and fast-forward pulls base on PR Watch merge", async () => {
    const h = createHarness();
    const watch = makeWatch();
    const mergedPr = makePr({ state: "merged" });

    h.service.handlePrObserved(watch, mergedPr);
    h.service.handlePrMerged(watch);

    await vi.waitFor(() => {
      expect(h.markThreadDoneInDb).toHaveBeenCalledExactlyOnceWith(
        "t1",
        "2026-02-01T00:00:00.000Z",
      );
      expect(h.refreshProjectAfterSync).toHaveBeenCalledExactlyOnceWith("p1");
    });
    expect(h.closeThreadConfirmed).toHaveBeenCalledExactlyOnceWith("t1");
    expect(h.publishThreadsChanged).toHaveBeenCalledExactlyOnceWith(["t1"]);
    expect(h.sendThreadCommand).toHaveBeenCalledExactlyOnceWith({
      kind: "set-done",
      threadId: "t1",
      done: true,
    });
    expect(h.gitPull).toHaveBeenCalledExactlyOnceWith({
      projectLocation: { kind: "posix", path: "/repo" },
      remote: "origin",
    });
    await h.service.dispose();
  });

  it("defers mid-turn threads on PR merge and settles them when the turn finishes", async () => {
    const h = createHarness([makeThread({ status: "working" })]);

    h.service.handlePrMerged(makeWatch());
    expect(h.closeThreadConfirmed).not.toHaveBeenCalled();
    expect(h.markThreadDoneInDb).not.toHaveBeenCalled();

    // Still active: remains deferred.
    h.service.observeSupervisorEvent({
      type: "thread-state",
      threadId: "t1",
      status: "needs_approval",
      attention: "needs_approval",
      canResumeWithConfig: false,
    });
    expect(h.markThreadDoneInDb).not.toHaveBeenCalled();

    // Turn finishes -> settles even if DB row still hasn't updated its status column.
    h.service.observeSupervisorEvent({
      type: "thread-state",
      threadId: "t1",
      status: "finished",
      attention: "none",
      canResumeWithConfig: false,
    });

    await vi.waitFor(() => {
      expect(h.markThreadDoneInDb).toHaveBeenCalledExactlyOnceWith(
        "t1",
        "2026-02-01T00:00:00.000Z",
      );
    });
    expect(h.closeThreadConfirmed).toHaveBeenCalledExactlyOnceWith("t1");
    expect(h.publishThreadsChanged).toHaveBeenCalledExactlyOnceWith(["t1"]);
    await h.service.dispose();
  });

  it("only auto-marks done on observed non-merged to merged GitStateService transitions", async () => {
    const h = createHarness();
    const prKey = pullRequestKey({ hostId: HOST_ID, projectId: "p1", prNumber: 42 });
    const targetKey = gitTargetKey({ hostId: HOST_ID, projectId: "p1", worktreePath: "/repo-wt" });
    h.setSnapshot({
      ...emptyGitStateSnapshot(),
      targets: {
        [targetKey]: {
          ref: { hostId: HOST_ID, projectId: "p1", worktreePath: "/repo-wt" },
          pullRequestKey: prKey,
          refreshedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    // First observation already merged -> ignored (does not undo manual un-done).
    const alreadyMergedKey = pullRequestKey({ hostId: HOST_ID, projectId: "p1", prNumber: 99 });
    h.service.handleGitPatch({
      revision: 1,
      pullRequests: {
        [alreadyMergedKey]: {
          ref: { hostId: HOST_ID, projectId: "p1", prNumber: 99 },
          data: makePr({ number: 99, state: "merged" }),
          freshness: { core: "2026-01-01T00:00:00.000Z" },
        },
      },
    });
    expect(h.markThreadDoneInDb).not.toHaveBeenCalled();
    expect(h.gitPull).not.toHaveBeenCalled();

    // Observed open -> merged transition settles matching worktree thread & pulls base.
    h.service.handleGitPatch({
      revision: 2,
      pullRequests: {
        [prKey]: {
          ref: { hostId: HOST_ID, projectId: "p1", prNumber: 42 },
          data: makePr({ state: "open" }),
          freshness: { core: "2026-01-01T00:00:00.000Z" },
        },
      },
    });
    h.service.handleGitPatch({
      revision: 3,
      pullRequests: {
        [prKey]: {
          ref: { hostId: HOST_ID, projectId: "p1", prNumber: 42 },
          data: makePr({ state: "merged" }),
          freshness: { core: "2026-01-01T00:01:00.000Z" },
        },
      },
    });

    await vi.waitFor(() => {
      expect(h.markThreadDoneInDb).toHaveBeenCalledExactlyOnceWith(
        "t1",
        "2026-02-01T00:00:00.000Z",
      );
      expect(h.gitPull).toHaveBeenCalledOnce();
    });
    await h.service.dispose();
  });

  it("skips experiment-owned threads and skips base pull when checkout is dirty or on another branch", async () => {
    const h = createHarness();
    h.isExperimentThread.mockReturnValue(true);
    h.getGitStatus.mockResolvedValue(makeCleanBaseStatus({ branch: "feature-other" }));

    h.service.handlePrObserved(makeWatch(), makePr({ state: "merged" }));
    h.service.handlePrMerged(makeWatch());
    await vi.waitFor(() => expect(h.getGitStatus).toHaveBeenCalledOnce());
    await h.service.dispose();

    expect(h.markThreadDoneInDb).not.toHaveBeenCalled();
    expect(h.gitPull).not.toHaveBeenCalled();
  });

  it("clears deferred threads if autoMarkDoneOnPrMerge is disabled before the turn finishes", async () => {
    const h = createHarness([makeThread({ status: "working" })]);
    h.service.handlePrMerged(makeWatch());
    h.settings.autoMarkDoneOnPrMerge = false;

    h.service.observeSupervisorEvent({
      type: "thread-state",
      threadId: "t1",
      status: "finished",
      attention: "none",
      canResumeWithConfig: false,
    });
    await h.service.dispose();

    expect(h.markThreadDoneInDb).not.toHaveBeenCalled();
  });
});
