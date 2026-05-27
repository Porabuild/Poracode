import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitStatusResult,
  PrData,
  PrDetails,
  Project,
  ProjectLocation,
  Thread,
} from "@/shared/contracts";
import { useAppStore } from "./appStore";
import { useGitStore } from "./gitStore";
import { buildBranchPrKey } from "./gitSelectors";
import {
  PR_PENDING_REFRESH_INTERVAL_MS,
  PR_POST_PUSH_STATUS_POLL_MS,
  stopPendingPrRefresh,
  startPostPushPrStatusRefresh,
  syncPendingPrRefreshProjects,
} from "./gitRefresh";

const ghGetPrForBranchMock =
  vi.fn<
    (payload: { projectLocation: ProjectLocation; branch: string }) => Promise<PrData | null>
  >();
const ghGetPrDetailsMock =
  vi.fn<
    (payload: {
      projectLocation: ProjectLocation;
      prNumber: number;
    }) => Promise<{ details: PrDetails }>
  >();

const location: ProjectLocation = { kind: "posix", path: "/repo" };

const project: Project = {
  id: "p1",
  name: "Repo",
  location,
  createdAt: "2026-04-04T00:00:00.000Z",
};

const status: GitStatusResult = {
  isRepo: true,
  branch: "feature/pr-checks",
  tracking: "origin/feature/pr-checks",
  hasRemote: true,
  remoteInfo: {
    url: "https://github.com/owner/repo",
    platform: "github",
    owner: "owner",
    repo: "repo",
  },
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
};

const basePr: PrData = {
  number: 42,
  state: "open",
  title: "Improve PR checks",
  url: "https://github.com/owner/repo/pull/42",
  baseBranch: "main",
  isDraft: false,
  checksStatus: "PENDING",
  updatedAt: "2026-04-04T00:00:00.000Z",
};

const baseDetails: PrDetails = {
  number: 42,
  title: "Improve PR checks",
  body: "",
  baseBranch: "main",
  headBranch: "feature/pr-checks",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  mergedAt: null,
  mergedBy: null,
  closedAt: null,
  commits: [],
  comments: [],
  reviews: [],
  checks: [{ name: "CI", state: "PENDING", conclusion: "" }],
};

const worktreeThread: Thread = {
  id: "t1",
  projectId: "p1",
  title: "Worktree thread",
  agentKind: "codex",
  config: { model: "gpt-5" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  worktreePath: "/repo-wt",
  worktreeBranch: "feature/wt",
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-04-04T00:00:00.000Z",
  updatedAt: "2026-04-04T00:00:00.000Z",
};

describe("pending PR refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ghGetPrForBranchMock.mockReset();
    ghGetPrDetailsMock.mockReset();
    Object.defineProperty(window, "lightcode", {
      configurable: true,
      value: {
        platform: "darwin",
        ghGetPrForBranch: ghGetPrForBranchMock,
        ghGetPrDetails: ghGetPrDetailsMock,
      },
    });
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: {},
      prData: {},
      worktreeSourceInfo: {},
      prDetails: {},
      prFiles: {},
      prDiffs: {},
    });
    useAppStore.setState({ projects: [project], threads: [] });
  });

  afterEach(() => {
    stopPendingPrRefresh();
    vi.useRealTimers();
  });

  it("refetches pending PR status until it leaves pending", async () => {
    const prKey = buildBranchPrKey("p1");
    useGitStore.getState().setStatus("p1", status);
    useGitStore.getState().setPrData(prKey, basePr);
    useGitStore.getState().setPrDetails("p1#42", baseDetails);
    ghGetPrForBranchMock
      .mockResolvedValueOnce({
        ...basePr,
        checksStatus: "PENDING",
        updatedAt: "2026-04-04T00:00:30.000Z",
      })
      .mockResolvedValueOnce({
        ...basePr,
        checksStatus: "SUCCESS",
        updatedAt: "2026-04-04T00:01:00.000Z",
      });
    ghGetPrDetailsMock.mockResolvedValueOnce({ details: baseDetails }).mockResolvedValueOnce({
      details: {
        ...baseDetails,
        checks: [{ name: "CI", state: "COMPLETED", conclusion: "SUCCESS" }],
      },
    });

    syncPendingPrRefreshProjects([{ id: "p1", location }]);

    expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
      projectLocation: location,
      branch: "feature/pr-checks",
    });
    expect(ghGetPrDetailsMock).toHaveBeenCalledWith({ projectLocation: location, prNumber: 42 });

    ghGetPrForBranchMock.mockClear();
    ghGetPrDetailsMock.mockClear();

    await vi.advanceTimersByTimeAsync(PR_PENDING_REFRESH_INTERVAL_MS);

    expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
      projectLocation: location,
      branch: "feature/pr-checks",
    });
    expect(ghGetPrDetailsMock).toHaveBeenCalledWith({ projectLocation: location, prNumber: 42 });
    expect(useGitStore.getState().prData[prKey]?.checksStatus).toBe("SUCCESS");
    expect(useGitStore.getState().prDetails["p1#42"]?.checks[0]?.conclusion).toBe("SUCCESS");

    ghGetPrForBranchMock.mockClear();
    ghGetPrDetailsMock.mockClear();
    await vi.advanceTimersByTimeAsync(PR_PENDING_REFRESH_INTERVAL_MS);

    expect(ghGetPrForBranchMock).not.toHaveBeenCalled();
    expect(ghGetPrDetailsMock).not.toHaveBeenCalled();
  });

  it("stops polling when the worktree thread is removed", async () => {
    useAppStore.setState({ threads: [worktreeThread] });
    useGitStore.getState().setPrData("/repo-wt", basePr);
    ghGetPrForBranchMock.mockResolvedValue({ ...basePr, checksStatus: "PENDING" });
    ghGetPrDetailsMock.mockResolvedValue({ details: baseDetails });

    syncPendingPrRefreshProjects([{ id: "p1", location }]);

    expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
      projectLocation: location,
      branch: "feature/wt",
    });

    ghGetPrForBranchMock.mockClear();
    useAppStore.setState({ threads: [] });
    syncPendingPrRefreshProjects([{ id: "p1", location }]);
    await vi.advanceTimersByTimeAsync(PR_PENDING_REFRESH_INTERVAL_MS);

    expect(ghGetPrForBranchMock).not.toHaveBeenCalled();
  });

  it("does not poll orphaned pending PR details", async () => {
    useGitStore.getState().setPrDetails("p1#42", baseDetails);

    syncPendingPrRefreshProjects([{ id: "p1", location }]);

    expect(ghGetPrForBranchMock).not.toHaveBeenCalled();
    expect(ghGetPrDetailsMock).not.toHaveBeenCalled();
  });

  it("checks pushed open PR for pending status during the post-push grace period", async () => {
    const prKey = buildBranchPrKey("p1");
    useGitStore.getState().setStatus("p1", status);
    useGitStore.getState().setPrData(prKey, { ...basePr, checksStatus: "SUCCESS" });
    ghGetPrForBranchMock
      .mockResolvedValueOnce({
        ...basePr,
        checksStatus: "SUCCESS",
        updatedAt: "2026-04-04T00:00:30.000Z",
      })
      .mockResolvedValueOnce({
        ...basePr,
        checksStatus: "PENDING",
        updatedAt: "2026-04-04T00:01:00.000Z",
      });

    startPostPushPrStatusRefresh({
      projectId: "p1",
      projectLocation: location,
      prKey,
      branch: "feature/pr-checks",
    });

    expect(ghGetPrForBranchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PR_POST_PUSH_STATUS_POLL_MS);

    expect(ghGetPrForBranchMock).toHaveBeenCalledTimes(1);
    expect(useGitStore.getState().prData[prKey]?.checksStatus).toBe("SUCCESS");

    await vi.advanceTimersByTimeAsync(PR_POST_PUSH_STATUS_POLL_MS);

    expect(ghGetPrForBranchMock).toHaveBeenCalledTimes(2);
    expect(useGitStore.getState().prData[prKey]?.checksStatus).toBe("PENDING");

    await vi.advanceTimersByTimeAsync(PR_POST_PUSH_STATUS_POLL_MS);

    expect(ghGetPrForBranchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps checking pushed green or red PRs for 15 seconds before stopping", async () => {
    const prKey = buildBranchPrKey("p1");
    useGitStore.getState().setStatus("p1", status);
    useGitStore.getState().setPrData(prKey, { ...basePr, checksStatus: "FAILURE" });
    ghGetPrForBranchMock
      .mockResolvedValueOnce({
        ...basePr,
        checksStatus: "FAILURE",
        updatedAt: "2026-04-04T00:00:30.000Z",
      })
      .mockResolvedValueOnce({
        ...basePr,
        checksStatus: "SUCCESS",
        updatedAt: "2026-04-04T00:01:00.000Z",
      })
      .mockResolvedValueOnce({
        ...basePr,
        checksStatus: "SUCCESS",
        updatedAt: "2026-04-04T00:01:30.000Z",
      });

    startPostPushPrStatusRefresh({
      projectId: "p1",
      projectLocation: location,
      prKey,
      branch: "feature/pr-checks",
    });

    await vi.advanceTimersByTimeAsync(PR_POST_PUSH_STATUS_POLL_MS * 3);

    expect(ghGetPrForBranchMock).toHaveBeenCalledTimes(3);
    expect(useGitStore.getState().prData[prKey]?.checksStatus).toBe("SUCCESS");

    await vi.advanceTimersByTimeAsync(PR_POST_PUSH_STATUS_POLL_MS);

    expect(ghGetPrForBranchMock).toHaveBeenCalledTimes(3);
  });
});
