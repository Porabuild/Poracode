import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, PrData, Thread } from "@/shared/contracts";
import {
  emptyGitStateSnapshot,
  gitProjectKey,
  gitTargetKey,
  pullRequestBranchKey,
  pullRequestKey,
  type GitStateSnapshot,
} from "@/shared/gitState";
import type { RemoteGitSummaries } from "@/shared/remote";
import { buildRemoteGitSummaries, HostGitSummariesController } from "./gitSummariesProjection";

function makeStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    isRepo: true,
    branch: "main",
    tracking: "origin/main",
    hasRemote: true,
    remoteInfo: null,
    ahead: 1,
    behind: 2,
    staged: [],
    unstaged: [],
    totalInsertions: 10,
    totalDeletions: 4,
    ...overrides,
  };
}

function makePr(overrides: Partial<PrData> = {}): PrData {
  return {
    number: 42,
    title: "Add host git summaries",
    url: "https://github.com/acme/repo/pull/42",
    state: "open",
    isDraft: false,
    baseBranch: "main",
    checksStatus: "passing",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t-1",
    projectId: "p-1",
    title: "Thread 1",
    agentKind: "codex",
    presentationMode: "gui",
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    config: { model: "test-model" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRemoteGitSummaries", () => {
  it("projects project-checkout and worktree threads from GitStateSnapshot and skips archived threads", () => {
    const hostId = "host-1";
    const projectStatus = makeStatus({ branch: "main", ahead: 0, behind: 1 });
    const wtStatus = makeStatus({
      branch: "feat/summaries",
      totalInsertions: 33,
      totalDeletions: 7,
      ahead: 2,
      behind: 0,
    });
    const pr = makePr();
    const prKey = pullRequestKey({ hostId, projectId: "p-1", prNumber: 42 });
    const snapshot: GitStateSnapshot = {
      ...emptyGitStateSnapshot(),
      projects: {
        [gitProjectKey({ hostId, projectId: "p-1" })]: {
          ref: { hostId, projectId: "p-1" },
          status: projectStatus,
          refreshedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      targets: {
        [gitTargetKey({ hostId, projectId: "p-1", worktreePath: "/repo-wt" })]: {
          ref: { hostId, projectId: "p-1", worktreePath: "/repo-wt" },
          status: wtStatus,
          pullRequestKey: prKey,
          refreshedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      pullRequests: {
        [prKey]: {
          ref: { hostId, projectId: "p-1", prNumber: 42 },
          data: pr,
          freshness: { core: "2026-01-01T00:00:00.000Z" },
        },
      },
    };

    const threads: Thread[] = [
      makeThread({ id: "t-main", projectId: "p-1" }),
      makeThread({ id: "t-wt", projectId: "p-1", worktreePath: "/repo-wt" }),
      makeThread({ id: "t-archived", projectId: "p-1", archived: true }),
      makeThread({ id: "t-unknown", projectId: "p-missing" }),
    ];

    expect(buildRemoteGitSummaries(hostId, snapshot, threads)).toEqual({
      "t-main": {
        isRepo: true,
        branch: "main",
        totalInsertions: 10,
        totalDeletions: 4,
        ahead: 0,
        behind: 1,
        pr: null,
      },
      "t-wt": {
        isRepo: true,
        branch: "feat/summaries",
        totalInsertions: 33,
        totalDeletions: 7,
        ahead: 2,
        behind: 0,
        pr: {
          number: 42,
          state: "open",
          title: "Add host git summaries",
          url: "https://github.com/acme/repo/pull/42",
          isDraft: false,
          checksStatus: "passing",
        },
      },
    });
  });

  it("falls back to pullRequestKeyByBranch when target.pullRequestKey is omitted", () => {
    const hostId = "host-1";
    const pr = makePr({ number: 99, state: "merged" });
    const prKey = pullRequestKey({ hostId, projectId: "p-1", prNumber: 99 });
    const snapshot: GitStateSnapshot = {
      ...emptyGitStateSnapshot(),
      projects: {
        [gitProjectKey({ hostId, projectId: "p-1" })]: {
          ref: { hostId, projectId: "p-1" },
          status: makeStatus({ branch: "feat/branch-alias" }),
          refreshedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      pullRequests: {
        [prKey]: {
          ref: { hostId, projectId: "p-1", prNumber: 99 },
          data: pr,
          freshness: { core: "2026-01-01T00:00:00.000Z" },
        },
      },
      pullRequestKeyByBranch: {
        [pullRequestBranchKey({ hostId, projectId: "p-1" }, "feat/branch-alias")]: prKey,
      },
    };

    const result = buildRemoteGitSummaries(hostId, snapshot, [makeThread({ id: "t-1" })]);
    expect(result["t-1"]?.pr).toMatchObject({ number: 99, state: "merged" });
  });
});

describe("HostGitSummariesController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces and deduplicates host git state broadcasts, and gives host entries precedence over supplemental summaries", () => {
    const hostId = "host-1";
    let snapshot: GitStateSnapshot = emptyGitStateSnapshot();
    let threads: Thread[] = [
      makeThread({ id: "t-1", projectId: "p-1" }),
      makeThread({ id: "t-2", projectId: "p-2" }),
    ];
    const published: RemoteGitSummaries[] = [];
    const controller = new HostGitSummariesController({
      hostId,
      getSnapshot: () => snapshot,
      getThreads: () => threads,
      onPublish: (summaries) => published.push(summaries),
      debounceMs: 250,
    });

    // Supplemental renderer push covers both threads before GitStateService refreshes.
    controller.setSupplementalSummaries({
      "t-1": {
        isRepo: true,
        branch: "old-branch",
        totalInsertions: 1,
        totalDeletions: 0,
        ahead: 0,
        behind: 0,
        pr: null,
      },
      "t-2": {
        isRepo: true,
        branch: "other-branch",
        totalInsertions: 5,
        totalDeletions: 2,
        ahead: 1,
        behind: 0,
        pr: null,
      },
      "t-deleted": {
        isRepo: true,
        branch: "stale",
        totalInsertions: 0,
        totalDeletions: 0,
        ahead: 0,
        behind: 0,
        pr: null,
      },
    });

    expect(published).toHaveLength(1);
    expect(Object.keys(published[0]!).sort()).toEqual(["t-1", "t-2"]);
    expect(published[0]!["t-1"]?.branch).toBe("old-branch");

    // Host GitStateService updates p-1 -> overrides t-1 while keeping supplemental t-2.
    snapshot = {
      ...snapshot,
      targets: {
        [gitTargetKey({ hostId, projectId: "p-1" })]: {
          ref: { hostId, projectId: "p-1" },
          status: makeStatus({ branch: "fresh-host-branch", ahead: 3 }),
          refreshedAt: "2026-01-01T00:01:00.000Z",
        },
      },
    };
    controller.notifyChanged();
    controller.notifyChanged();
    expect(published).toHaveLength(1);

    vi.advanceTimersByTime(250);
    expect(published).toHaveLength(2);
    expect(published[1]!["t-1"]?.branch).toBe("fresh-host-branch");
    expect(published[1]!["t-1"]?.ahead).toBe(3);
    expect(published[1]!["t-2"]?.branch).toBe("other-branch");

    // Repeating notifyChanged with no diff does not emit a duplicate broadcast.
    controller.notifyChanged();
    vi.advanceTimersByTime(250);
    expect(published).toHaveLength(2);

    // Archiving t-2 prunes it from the projection.
    threads = [threads[0]!, { ...threads[1]!, archived: true }];
    controller.notifyChanged();
    vi.advanceTimersByTime(250);
    expect(published).toHaveLength(3);
    expect(Object.keys(published[2]!)).toEqual(["t-1"]);

    controller.dispose();
  });
});
