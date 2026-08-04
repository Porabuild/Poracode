import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGitStore } from "@/renderer/state/gitStore";
import { useGitReadModelStore } from "@/renderer/state/gitReadModelStore";
import type { GitStatusResult, PrData, PrDetails, Project, Thread } from "@/shared/contracts";
import { emptyGitStateSnapshot } from "@/shared/gitState";
import type { RemoteThreadGitSummary } from "@/shared/remote";
import { useGitSummariesStore } from "./gitSummaries";
import { useGitSummaryHydration } from "./useGitSummaryHydration";

const bridge = vi.hoisted(() => ({
  getGitStatus: vi.fn<(payload: unknown) => Promise<GitStatusResult>>(),
  ghGetPrForBranch: vi.fn<(payload: unknown) => Promise<PrData | null>>(),
  ghGetPrDetails: vi.fn<(payload: unknown) => Promise<{ details: PrDetails }>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

function makeProject(): Project {
  return {
    id: "project-1",
    name: "poracode",
    location: { kind: "posix", path: "/repo/poracode" },
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Hi",
    agentKind: "claude",
    config: {},
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

function makeStatus(branch: string): GitStatusResult {
  return {
    isRepo: true,
    branch,
    tracking: `origin/${branch}`,
    hasRemote: true,
    remoteInfo: null,
    ahead: 1,
    behind: 2,
    staged: [],
    unstaged: [],
    totalInsertions: 3,
    totalDeletions: 4,
  };
}

function makeSummary(branch: string): RemoteThreadGitSummary {
  return {
    isRepo: true,
    branch,
    totalInsertions: 0,
    totalDeletions: 0,
    ahead: 0,
    behind: 0,
    pr: null,
  };
}

function makePr(overrides: Partial<PrData> = {}): PrData {
  return {
    number: 42,
    state: "open",
    title: "Fix mobile PR status",
    url: "https://github.test/repo/pull/42",
    baseBranch: "main",
    isDraft: false,
    checksStatus: "SUCCESS",
    updatedAt: "2026-07-23T12:00:00.000Z",
    ...overrides,
  };
}

function makeDetails(checkConclusion: string): PrDetails {
  return {
    number: 42,
    title: "Fix mobile PR status",
    body: "",
    baseBranch: "main",
    headBranch: "feature/mobile",
    additions: 10,
    deletions: 2,
    changedFiles: 3,
    commits: [],
    comments: [],
    reviews: [],
    checks: [
      {
        name: "build",
        state: checkConclusion === "SUCCESS" ? "COMPLETED" : "IN_PROGRESS",
        conclusion: checkConclusion,
      },
    ],
  };
}

describe("useGitSummaryHydration", () => {
  beforeEach(() => {
    bridge.getGitStatus.mockReset();
    bridge.ghGetPrForBranch.mockReset();
    bridge.ghGetPrForBranch.mockResolvedValue(null);
    bridge.ghGetPrDetails.mockReset();
    bridge.ghGetPrDetails.mockRejectedValue(new Error("details unavailable"));
    useGitSummariesStore.getState().reset();
    useGitReadModelStore.getState().reset();
    useGitStore.setState({ statuses: {}, worktreeStatuses: {}, prData: {}, prDetails: {} });
  });

  it("hydrates a missing thread git summary from the remote bridge", async () => {
    const project = makeProject();
    const thread = makeThread();
    bridge.getGitStatus.mockResolvedValue(makeStatus("feature/mobile"));

    renderHook(() => useGitSummaryHydration(thread, project));

    await waitFor(() => {
      expect(useGitSummariesStore.getState().byThread[thread.id]?.branch).toBe("feature/mobile");
    });
    expect(bridge.getGitStatus).toHaveBeenCalledWith({ projectLocation: project.location });
    expect(useGitStore.getState().statuses[project.id]?.branch).toBe("feature/mobile");
  });

  it("does not run legacy status hydration when the host read model is available", async () => {
    const project = makeProject();
    const thread = makeThread();
    useGitReadModelStore.getState().replaceSnapshot(emptyGitStateSnapshot());

    renderHook(() => useGitSummaryHydration(thread, project));

    await act(async () => {
      await Promise.resolve();
    });
    expect(bridge.getGitStatus).not.toHaveBeenCalled();
  });

  it("keeps local fallbacks when desktop summaries omit the thread", () => {
    useGitSummariesStore.getState().setThread("thread-1", makeSummary("local"));

    useGitSummariesStore.getState().setAll({});

    expect(useGitSummariesStore.getState().byThread["thread-1"]?.branch).toBe("local");
  });

  it("prefers desktop summaries over local fallbacks when both exist", () => {
    useGitSummariesStore.getState().setThread("thread-1", makeSummary("local"));

    useGitSummariesStore.getState().setAll({ "thread-1": makeSummary("desktop") });

    expect(useGitSummariesStore.getState().byThread["thread-1"]?.branch).toBe("desktop");
  });

  it("preserves unchanged remote summary identities", () => {
    useGitSummariesStore.getState().setAll({ "thread-1": makeSummary("desktop") });
    const before = useGitSummariesStore.getState();

    useGitSummariesStore.getState().setAll({ "thread-1": makeSummary("desktop") });
    const after = useGitSummariesStore.getState();

    expect(after).toBe(before);
    expect(after.remoteByThread).toBe(before.remoteByThread);
    expect(after.byThread).toBe(before.byThread);
    expect(after.byThread["thread-1"]).toBe(before.byThread["thread-1"]);
  });

  it("refreshes a streamed worktree PR into the full git cache and its mobile badge", async () => {
    const project = makeProject();
    const worktreePath = "/repo/.poracode/worktrees/mobile";
    const thread = makeThread({
      worktreePath,
      worktreeBranch: "feature/mobile",
      prNumber: 42,
    });
    const staleSummary: RemoteThreadGitSummary = {
      ...makeSummary("feature/mobile"),
      pr: {
        number: 42,
        state: "open",
        title: "Old title",
        url: "https://github.test/repo/pull/42",
        isDraft: false,
        checksStatus: "FAILURE",
      },
    };
    const latestPr = makePr();
    bridge.ghGetPrForBranch.mockResolvedValue(latestPr);
    useGitSummariesStore.getState().setAll({ [thread.id]: staleSummary });

    renderHook(() => useGitSummaryHydration(thread, project));

    await waitFor(() => {
      expect(useGitStore.getState().prData[worktreePath]).toEqual(latestPr);
    });
    expect(bridge.ghGetPrForBranch).toHaveBeenCalledWith({
      projectLocation: project.location,
      branch: "feature/mobile",
    });
    expect(useGitStore.getState().ghAvailable[project.id]).toBe(true);
    expect(useGitSummariesStore.getState().byThread[thread.id]?.pr).toMatchObject({
      number: 42,
      title: "Fix mobile PR status",
      checksStatus: "SUCCESS",
    });
  });

  it("does not duplicate PR hydration when the host read model is available", async () => {
    const project = makeProject();
    const worktreePath = "/repo/.poracode/worktrees/mobile";
    const thread = makeThread({
      worktreePath,
      worktreeBranch: "feature/mobile",
      prNumber: 42,
    });
    useGitSummariesStore.getState().setAll({
      [thread.id]: {
        ...makeSummary("feature/mobile"),
        pr: {
          number: 42,
          state: "open",
          title: "Host-owned PR",
          url: "https://github.test/repo/pull/42",
          isDraft: false,
          checksStatus: "PENDING",
        },
      },
    });
    useGitReadModelStore.getState().replaceSnapshot(emptyGitStateSnapshot());

    renderHook(() => useGitSummaryHydration(thread, project));

    await act(async () => {
      await Promise.resolve();
    });
    expect(bridge.ghGetPrForBranch).not.toHaveBeenCalled();
    expect(bridge.ghGetPrDetails).not.toHaveBeenCalled();
  });

  it("refreshes the full PR cache when a streamed same-branch PR changes", async () => {
    const project = makeProject();
    const worktreePath = "/repo/.poracode/worktrees/mobile";
    const thread = makeThread({
      worktreePath,
      worktreeBranch: "feature/mobile",
      prNumber: 42,
    });
    const pendingPr = makePr({
      title: "Pending checks",
      checksStatus: "PENDING",
      updatedAt: "2026-07-23T12:00:00.000Z",
    });
    const completedPr = makePr({
      title: "Checks completed",
      checksStatus: "SUCCESS",
      updatedAt: "2026-07-23T12:01:00.000Z",
    });
    const pendingSummary: RemoteThreadGitSummary = {
      ...makeSummary("feature/mobile"),
      pr: {
        number: pendingPr.number,
        state: pendingPr.state,
        title: pendingPr.title,
        url: pendingPr.url,
        isDraft: pendingPr.isDraft,
        checksStatus: pendingPr.checksStatus,
      },
    };
    const completedSummary: RemoteThreadGitSummary = {
      ...pendingSummary,
      pr: {
        number: completedPr.number,
        state: completedPr.state,
        title: completedPr.title,
        url: completedPr.url,
        isDraft: completedPr.isDraft,
        checksStatus: completedPr.checksStatus,
      },
    };
    bridge.ghGetPrForBranch.mockResolvedValueOnce(pendingPr).mockResolvedValueOnce(completedPr);
    bridge.ghGetPrDetails
      .mockResolvedValueOnce({ details: makeDetails("") })
      .mockResolvedValueOnce({ details: makeDetails("SUCCESS") });
    useGitSummariesStore.getState().setAll({ [thread.id]: pendingSummary });

    renderHook(() => useGitSummaryHydration(thread, project));

    await waitFor(() => {
      expect(useGitStore.getState().prData[worktreePath]).toEqual(pendingPr);
    });

    act(() => {
      useGitSummariesStore.getState().setAll({ [thread.id]: completedSummary });
    });

    await waitFor(() => {
      expect(useGitStore.getState().prData[worktreePath]).toEqual(completedPr);
      expect(useGitStore.getState().prDetails["project-1#42"]?.checks[0]?.conclusion).toBe(
        "SUCCESS",
      );
    });
    expect(bridge.ghGetPrForBranch).toHaveBeenCalledTimes(2);
    expect(bridge.ghGetPrDetails).toHaveBeenCalledTimes(2);
  });
});
