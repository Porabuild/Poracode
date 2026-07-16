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
import { useExperimentStore } from "./experimentStore";
import { buildBranchPrKey } from "./gitSelectors";
import { usePanelStore } from "./panelStore";
import { useSidebarUiStore } from "./sidebarUiStore";
import {
  cleanupGitRefreshProjects,
  getProjectActiveWorktreePaths,
  getWatcherRefreshMode,
  PR_PENDING_REFRESH_INTERVAL_MS,
  PR_POST_PUSH_STATUS_POLL_MS,
  refreshGitProject,
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
const wslLocation: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
};

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

const hiddenWorktreeThread: Thread = {
  ...worktreeThread,
  id: "t-hidden",
  title: "Hidden worktree thread",
  worktreePath: "/repo-hidden",
  worktreeBranch: "feature/hidden",
  createdAt: "2026-04-03T00:00:00.000Z",
  updatedAt: "2026-04-03T00:00:00.000Z",
};

describe("pending PR refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ghGetPrForBranchMock.mockReset();
    ghGetPrDetailsMock.mockReset();
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        dbSetState: vi
          .fn<(key: string, value: string) => Promise<void>>()
          .mockResolvedValue(undefined),
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
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      filesPanelContext: null,
      rightPanelTab: "git",
      threadSortMode: "updated",
    });
    useSidebarUiStore.setState({
      collapsedProjects: {},
      collapsedWorktrees: {},
      threadListLimits: {},
    });
    useAppStore.setState({ projects: [project], threads: [], view: { kind: "home" } });
    useExperimentStore.setState({ experiments: {} });
  });

  afterEach(() => {
    stopPendingPrRefresh();
    vi.useRealTimers();
  });

  it("keeps running experiment worktrees active when the project and group are collapsed", () => {
    useSidebarUiStore.setState({ collapsedProjects: { [project.id]: true } });
    useAppStore.setState({
      threads: [
        {
          ...worktreeThread,
          id: "candidate-1",
          worktreePath: "/repo/experiment-one",
          worktreeBranch: "poracode/one",
        },
        {
          ...worktreeThread,
          id: "candidate-2",
          worktreePath: "/repo/experiment-two",
          worktreeBranch: "poracode/two",
        },
      ],
    });
    useExperimentStore.getState().addExperiment({
      id: "experiment-1",
      projectId: project.id,
      title: "Experiment",
      prompt: "Implement it",
      baseBranch: "main",
      baseCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidates: [
        {
          threadId: "candidate-1",
          agentKind: "codex",
          worktreePath: "/repo/experiment-one",
          worktreeBranch: "poracode/one",
          worktreeOwnerToken: "experiment-1:candidate-1",
          worktreeState: "owned",
        },
        {
          threadId: "candidate-2",
          agentKind: "codex",
          worktreePath: "/repo/experiment-two",
          worktreeBranch: "poracode/two",
          worktreeOwnerToken: "experiment-1:candidate-2",
          worktreeState: "owned",
        },
      ],
      status: "running",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
    });

    expect(getProjectActiveWorktreePaths(project.id)).toEqual([
      "/repo/experiment-one",
      "/repo/experiment-two",
    ]);
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

  it("polls when the PR summary is stale failed but loaded check details are pending", async () => {
    const prKey = buildBranchPrKey("p1");
    useGitStore.getState().setStatus("p1", status);
    useGitStore.getState().setPrData(prKey, { ...basePr, checksStatus: "FAILURE" });
    useGitStore.getState().setPrDetails("p1#42", baseDetails);
    ghGetPrForBranchMock.mockResolvedValue({ ...basePr, checksStatus: "PENDING" });
    ghGetPrDetailsMock.mockResolvedValue({ details: baseDetails });

    syncPendingPrRefreshProjects([{ id: "p1", location }]);

    expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
      projectLocation: location,
      branch: "feature/pr-checks",
    });
    expect(ghGetPrDetailsMock).toHaveBeenCalledWith({ projectLocation: location, prNumber: 42 });
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

  it("does not poll pending PR checks for worktree threads hidden behind See more", async () => {
    useSidebarUiStore.setState({ threadListLimits: { p1: 1 } });
    useAppStore.setState({ threads: [worktreeThread, hiddenWorktreeThread] });
    useGitStore.getState().setPrData("/repo-wt", basePr);
    useGitStore.getState().setPrData("/repo-hidden", { ...basePr, number: 43 });
    ghGetPrForBranchMock.mockResolvedValue({ ...basePr, checksStatus: "PENDING" });
    ghGetPrDetailsMock.mockResolvedValue({ details: baseDetails });

    syncPendingPrRefreshProjects([{ id: "p1", location }]);

    expect(ghGetPrForBranchMock).toHaveBeenCalledTimes(1);
    expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
      projectLocation: location,
      branch: "feature/wt",
    });
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

describe("watcher git status refresh", () => {
  beforeEach(() => {
    cleanupGitRefreshProjects(new Set());
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
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      filesPanelContext: null,
      rightPanelTab: "git",
      threadSortMode: "updated",
    });
    useSidebarUiStore.setState({
      collapsedProjects: {},
      collapsedWorktrees: {},
      threadListLimits: {},
    });
    useAppStore.setState({ projects: [project], threads: [], view: { kind: "home" } });
  });

  afterEach(() => {
    cleanupGitRefreshProjects(new Set());
  });

  it("refreshes thread worktree statuses before the full worktree cache catches up", async () => {
    const getGitStatus = vi.fn<() => Promise<GitStatusResult>>().mockResolvedValue(status);
    const worktreeStatus: GitStatusResult = {
      ...status,
      branch: "feature/wt",
      unstaged: [
        {
          path: "src/changed.ts",
          status: "M",
          staged: false,
          insertions: 3,
          deletions: 1,
        },
      ],
      totalInsertions: 3,
      totalDeletions: 1,
    };
    const gitWorktreeStatusBatch = vi
      .fn<
        (payload: {
          projectLocation: ProjectLocation;
          worktreePaths: string[];
        }) => Promise<{ statuses: Record<string, GitStatusResult> }>
      >()
      .mockResolvedValue({ statuses: { "/repo-wt": worktreeStatus } });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        getGitStatus,
        gitWorktreeStatusBatch,
      },
    });
    useGitStore.getState().setWorktrees("p1", [
      {
        path: "/repo",
        branch: "main",
        commit: "abc123",
        isMain: true,
      },
      {
        path: "/repo-old",
        branch: "feature/old",
        commit: "abc123",
        isMain: false,
      },
    ]);
    useSidebarUiStore.setState({ threadListLimits: { p1: 1 } });
    useAppStore.setState({ threads: [worktreeThread, hiddenWorktreeThread] });

    await refreshGitProject(project, "watcher", "status");

    expect(gitWorktreeStatusBatch).toHaveBeenCalledWith({
      projectLocation: location,
      worktreePaths: ["/repo-wt"],
      detail: "full",
    });
    expect(useGitStore.getState().worktreeStatuses["/repo-wt"]).toEqual(worktreeStatus);
  });

  it("escalates a summary poll to a full refresh when a file was staged externally", async () => {
    // Previously the file was unstaged/modified with real counts...
    const previousWorktreeStatus: GitStatusResult = {
      ...status,
      branch: "feature/wt",
      unstaged: [
        { path: "src/changed.ts", status: "M", staged: false, insertions: 5, deletions: 1 },
      ],
      totalInsertions: 5,
      totalDeletions: 1,
    };
    // A summary poll now reports it staged (an external `git add`) with 0/0 —
    // no backfill key matches, so the counts can't be recovered from cache.
    const summaryWorktreeStatus: GitStatusResult = {
      ...status,
      detail: "summary",
      branch: "feature/wt",
      staged: [{ path: "src/changed.ts", status: "M", staged: true, insertions: 0, deletions: 0 }],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };
    // The follow-up full refresh recovers the real cumulative counts.
    const fullWorktreeStatus: GitStatusResult = {
      ...status,
      branch: "feature/wt",
      staged: [{ path: "src/changed.ts", status: "M", staged: true, insertions: 5, deletions: 1 }],
      unstaged: [],
      totalInsertions: 5,
      totalDeletions: 1,
    };
    const getGitStatus = vi.fn<() => Promise<GitStatusResult>>().mockResolvedValue(status);
    const gitWorktreeStatusBatch = vi
      .fn<
        (payload: {
          projectLocation: ProjectLocation;
          worktreePaths: string[];
          detail?: "summary" | "full";
        }) => Promise<{ statuses: Record<string, GitStatusResult> }>
      >()
      .mockImplementation(async ({ detail }) => ({
        statuses: {
          "/repo-wt": detail === "full" ? fullWorktreeStatus : summaryWorktreeStatus,
        },
      }));
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: { platform: "darwin", getGitStatus, gitWorktreeStatusBatch },
    });
    useGitStore.getState().setWorktreeStatus("/repo-wt", previousWorktreeStatus);
    useAppStore.setState({ threads: [worktreeThread] });

    await refreshGitProject(project, "poll", "status");
    // The escalation fires fire-and-forget after the poll resolves — flush it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(gitWorktreeStatusBatch).toHaveBeenCalledWith({
      projectLocation: location,
      worktreePaths: ["/repo-wt"],
      detail: "summary",
    });
    expect(gitWorktreeStatusBatch).toHaveBeenCalledWith({
      projectLocation: location,
      worktreePaths: ["/repo-wt"],
      detail: "full",
    });
    expect(useGitStore.getState().worktreeStatuses["/repo-wt"]).toEqual(fullWorktreeStatus);
  });

  it("retries summary-to-full escalation after a transient full refresh failure", async () => {
    const previousWorktreeStatus: GitStatusResult = {
      ...status,
      branch: "feature/wt",
      unstaged: [
        { path: "src/changed.ts", status: "M", staged: false, insertions: 5, deletions: 1 },
      ],
      totalInsertions: 5,
      totalDeletions: 1,
    };
    const summaryWorktreeStatus: GitStatusResult = {
      ...status,
      detail: "summary",
      branch: "feature/wt",
      staged: [{ path: "src/changed.ts", status: "M", staged: true, insertions: 0, deletions: 0 }],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };
    const fullWorktreeStatus: GitStatusResult = {
      ...status,
      branch: "feature/wt",
      staged: [{ path: "src/changed.ts", status: "M", staged: true, insertions: 5, deletions: 1 }],
      unstaged: [],
      totalInsertions: 5,
      totalDeletions: 1,
    };
    const getGitStatus = vi.fn<() => Promise<GitStatusResult>>().mockResolvedValue(status);
    let fullAttempts = 0;
    const gitWorktreeStatusBatch = vi
      .fn<
        (payload: {
          projectLocation: ProjectLocation;
          worktreePaths: string[];
          detail?: "summary" | "full";
        }) => Promise<{ statuses: Record<string, GitStatusResult> }>
      >()
      .mockImplementation(async ({ detail }) => {
        if (detail === "full") {
          fullAttempts += 1;
          if (fullAttempts === 1) throw new Error("bridge unavailable");
          return { statuses: { "/repo-wt": fullWorktreeStatus } };
        }
        return { statuses: { "/repo-wt": summaryWorktreeStatus } };
      });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: { platform: "darwin", getGitStatus, gitWorktreeStatusBatch },
    });
    useGitStore.getState().setWorktreeStatus("/repo-wt", previousWorktreeStatus);
    useAppStore.setState({ threads: [worktreeThread] });

    await refreshGitProject(project, "poll", "status");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useGitStore.getState().worktreeStatuses["/repo-wt"]).toEqual(summaryWorktreeStatus);

    await refreshGitProject(project, "poll", "status");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fullAttempts).toBe(2);
    expect(useGitStore.getState().worktreeStatuses["/repo-wt"]).toEqual(fullWorktreeStatus);
  });

  it("preserves cached worktree diff stats during fetch refreshes", async () => {
    const cachedWorktreeStatus: GitStatusResult = {
      ...status,
      branch: "feature/wt",
      unstaged: [
        {
          path: "src/existing-change.ts",
          status: "M",
          staged: false,
          insertions: 3,
          deletions: 1,
        },
      ],
      totalInsertions: 3,
      totalDeletions: 1,
    };
    const gitWatchWorktrees = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const gitWorktreeStatusBatch = vi
      .fn<
        (payload: {
          projectLocation: ProjectLocation;
          worktreePaths: string[];
          detail?: "summary" | "full";
        }) => Promise<{ statuses: Record<string, GitStatusResult> }>
      >()
      .mockResolvedValue({ statuses: {} });
    const gitProjectSnapshot = vi
      .fn<
        () => Promise<{
          status: GitStatusResult;
          branches: { current: string; branches: unknown[] };
          worktrees: { path: string; branch: string; commit: string; isMain: boolean }[];
          ghAvailable: boolean;
        }>
      >()
      .mockResolvedValue({
        status,
        branches: { current: "feature/pr-checks", branches: [] },
        worktrees: [{ path: "/repo", branch: "feature/pr-checks", commit: "abc123", isMain: true }],
        ghAvailable: false,
      });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        gitProjectSnapshot,
        gitWatchWorktrees,
        gitWorktreeStatusBatch,
      },
    });
    useGitStore.getState().setWorktreeStatus("/repo-wt", cachedWorktreeStatus);
    useAppStore.setState({ threads: [worktreeThread] });

    await refreshGitProject(project, "fetch", "full");

    expect(gitProjectSnapshot).toHaveBeenCalledWith({
      projectLocation: location,
      includeGhCheck: true,
    });
    expect(gitWorktreeStatusBatch).not.toHaveBeenCalled();
    expect(useGitStore.getState().worktreeStatuses["/repo-wt"]).toEqual(cachedWorktreeStatus);
  });

  it("refreshes WSL worktree diff stats during fetch refreshes", async () => {
    const worktreeStatus: GitStatusResult = {
      ...status,
      branch: "feature/wt",
      unstaged: [
        {
          path: "src/changed.ts",
          status: "M",
          staged: false,
          insertions: 3,
          deletions: 1,
        },
      ],
      totalInsertions: 3,
      totalDeletions: 1,
    };
    const gitWatchWorktrees = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const gitWorktreeStatusBatch = vi
      .fn<
        (payload: {
          projectLocation: ProjectLocation;
          worktreePaths: string[];
          detail?: "summary" | "full";
        }) => Promise<{ statuses: Record<string, GitStatusResult> }>
      >()
      .mockResolvedValue({ statuses: { "/repo-wt": worktreeStatus } });
    const gitProjectSnapshot = vi
      .fn<
        () => Promise<{
          status: GitStatusResult;
          branches: { current: string; branches: unknown[] };
          worktrees: { path: string; branch: string; commit: string; isMain: boolean }[];
          ghAvailable: boolean;
        }>
      >()
      .mockResolvedValue({
        status,
        branches: { current: "feature/pr-checks", branches: [] },
        worktrees: [{ path: "/repo", branch: "feature/pr-checks", commit: "abc123", isMain: true }],
        ghAvailable: false,
      });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        gitProjectSnapshot,
        gitWatchWorktrees,
        gitWorktreeStatusBatch,
      },
    });
    useGitStore.getState().setWorktreeStatus("/repo-wt", { ...status });
    useAppStore.setState({ threads: [worktreeThread] });

    await refreshGitProject({ ...project, location: wslLocation }, "fetch", "full");

    expect(gitWorktreeStatusBatch).toHaveBeenCalledWith({
      projectLocation: wslLocation,
      worktreePaths: ["/repo-wt"],
      detail: "full",
    });
    expect(useGitStore.getState().worktreeStatuses["/repo-wt"]).toEqual(worktreeStatus);
  });

  it("uses full worktree status for WSL poll refreshes", async () => {
    const getGitStatus = vi.fn<() => Promise<GitStatusResult>>().mockResolvedValue(status);
    const worktreeStatus: GitStatusResult = {
      ...status,
      branch: "feature/wt",
      unstaged: [
        {
          path: "src/changed.ts",
          status: "M",
          staged: false,
          insertions: 2,
          deletions: 1,
        },
      ],
      totalInsertions: 2,
      totalDeletions: 1,
    };
    const gitWorktreeStatusBatch = vi
      .fn<
        (payload: {
          projectLocation: ProjectLocation;
          worktreePaths: string[];
          detail?: "summary" | "full";
        }) => Promise<{ statuses: Record<string, GitStatusResult> }>
      >()
      .mockResolvedValue({ statuses: { "/repo-wt": worktreeStatus } });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        getGitStatus,
        gitWorktreeStatusBatch,
      },
    });
    useAppStore.setState({ threads: [worktreeThread] });

    await refreshGitProject({ ...project, location: wslLocation }, "poll", "status");

    expect(gitWorktreeStatusBatch).toHaveBeenCalledWith({
      projectLocation: wslLocation,
      worktreePaths: ["/repo-wt"],
      detail: "full",
    });
    expect(useGitStore.getState().worktreeStatuses["/repo-wt"]).toEqual(worktreeStatus);
  });

  it("promotes watcher refresh to a full snapshot after a project becomes a Git repo", async () => {
    const nonRepoStatus: GitStatusResult = {
      isRepo: false,
      branch: "",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };
    const gitProjectSnapshot = vi
      .fn<
        () => Promise<{
          status: GitStatusResult;
          branches: { current: string; branches: [] };
          worktrees: { path: string; branch: string; commit: string; isMain: boolean }[];
          ghAvailable: boolean;
        }>
      >()
      .mockResolvedValue({
        status,
        branches: { current: "feature/pr-checks", branches: [] },
        worktrees: [{ path: "/repo", branch: "feature/pr-checks", commit: "abc123", isMain: true }],
        ghAvailable: false,
      });
    const getGitStatus = vi.fn<() => Promise<GitStatusResult>>().mockResolvedValue(status);
    const gitWatchWorktrees = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        getGitStatus,
        gitProjectSnapshot,
        gitWatchWorktrees,
      },
    });
    useGitStore.getState().setStatus("p1", nonRepoStatus);

    await refreshGitProject(project, "watcher", getWatcherRefreshMode("p1"));

    expect(getGitStatus).not.toHaveBeenCalled();
    expect(gitProjectSnapshot).toHaveBeenCalledWith({
      projectLocation: location,
      includeGhCheck: true,
    });
    expect(useGitStore.getState().statuses.p1).toEqual(status);
    expect(useGitStore.getState().branches.p1).toEqual({
      current: "feature/pr-checks",
      branches: [],
    });
    expect(useGitStore.getState().worktrees.p1).toEqual([
      { path: "/repo", branch: "feature/pr-checks", commit: "abc123", isMain: true },
    ]);
  });

  it("keeps thread worktrees watched when a stale full refresh has not listed them yet", async () => {
    const worktreeStatus: GitStatusResult = {
      ...status,
      branch: "feature/wt",
      unstaged: [
        {
          path: "src/changed.ts",
          status: "M",
          staged: false,
          insertions: 3,
          deletions: 1,
        },
      ],
      totalInsertions: 3,
      totalDeletions: 1,
    };
    const gitWatchWorktrees = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const gitWorktreeStatusBatch = vi
      .fn<
        (payload: {
          projectLocation: ProjectLocation;
          worktreePaths: string[];
        }) => Promise<{ statuses: Record<string, GitStatusResult> }>
      >()
      .mockResolvedValue({ statuses: { "/repo-wt": worktreeStatus } });
    const gitProjectSnapshot = vi
      .fn<
        () => Promise<{
          status: GitStatusResult;
          branches: { current: string; branches: unknown[] };
          worktrees: { path: string; branch: string; commit: string; isMain: boolean }[];
          ghAvailable: boolean;
        }>
      >()
      .mockResolvedValue({
        status,
        branches: { current: "main", branches: [] },
        worktrees: [
          { path: "/repo", branch: "main", commit: "abc123", isMain: true },
          { path: "/repo-old", branch: "feature/old", commit: "abc123", isMain: false },
        ],
        ghAvailable: false,
      });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        gitProjectSnapshot,
        gitWatchWorktrees,
        gitWorktreeStatusBatch,
      },
    });
    useSidebarUiStore.setState({ threadListLimits: { p1: 1 } });
    useAppStore.setState({ threads: [worktreeThread, hiddenWorktreeThread] });

    await refreshGitProject(project, "initial", "full");

    expect(gitWatchWorktrees).toHaveBeenCalledWith({
      projectId: "p1",
      worktreePaths: ["/repo-wt"],
    });
    expect(gitWorktreeStatusBatch).toHaveBeenCalledWith({
      projectLocation: location,
      worktreePaths: ["/repo-wt"],
      detail: "full",
    });
    expect(useGitStore.getState().worktreeStatuses["/repo-wt"]).toEqual(worktreeStatus);
  });

  it("keeps hidden worktree threads watched while they are open in a thread pane", async () => {
    const gitWatchWorktrees = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const gitWorktreeStatusBatch = vi
      .fn<
        (payload: {
          projectLocation: ProjectLocation;
          worktreePaths: string[];
        }) => Promise<{ statuses: Record<string, GitStatusResult> }>
      >()
      .mockResolvedValue({ statuses: {} });
    const gitProjectSnapshot = vi
      .fn<() => Promise<{ status: GitStatusResult; worktrees: []; ghAvailable: boolean }>>()
      .mockResolvedValue({ status, worktrees: [], ghAvailable: false });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        gitProjectSnapshot,
        gitWatchWorktrees,
        gitWorktreeStatusBatch,
      },
    });
    useSidebarUiStore.setState({ threadListLimits: { p1: 1 } });
    useAppStore.setState({
      threads: [worktreeThread, hiddenWorktreeThread],
      view: { kind: "thread", panes: ["t-hidden"] as [string, ...string[]] },
    });

    await refreshGitProject(project, "initial", "full");

    expect(gitWatchWorktrees).toHaveBeenCalledWith({
      projectId: "p1",
      worktreePaths: ["/repo-hidden", "/repo-wt"],
    });
  });

  it("keeps hidden worktree threads watched while their git panel is active", async () => {
    const gitWatchWorktrees = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const gitWorktreeStatusBatch = vi
      .fn<
        (payload: {
          projectLocation: ProjectLocation;
          worktreePaths: string[];
        }) => Promise<{ statuses: Record<string, GitStatusResult> }>
      >()
      .mockResolvedValue({ statuses: {} });
    const gitProjectSnapshot = vi
      .fn<() => Promise<{ status: GitStatusResult; worktrees: []; ghAvailable: boolean }>>()
      .mockResolvedValue({ status, worktrees: [], ghAvailable: false });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        gitProjectSnapshot,
        gitWatchWorktrees,
        gitWorktreeStatusBatch,
      },
    });
    useSidebarUiStore.setState({ threadListLimits: { p1: 1 } });
    usePanelStore.setState({
      gitReviewContext: { projectId: "p1", worktreePath: "/repo-hidden" },
      gitReviewAsPanel: true,
      rightPanelTab: "git",
    });
    useAppStore.setState({ threads: [worktreeThread, hiddenWorktreeThread] });

    await refreshGitProject(project, "initial", "full");

    expect(gitWatchWorktrees).toHaveBeenCalledWith({
      projectId: "p1",
      worktreePaths: ["/repo-hidden", "/repo-wt"],
    });
  });

  function seedDecidedExperimentCandidate(candidatePath: string): void {
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        dbSetState: vi
          .fn<(key: string, value: string) => Promise<void>>()
          .mockResolvedValue(undefined),
      },
    });
    useSidebarUiStore.setState({ collapsedProjects: { [project.id]: true } });
    useAppStore.setState({
      threads: [
        {
          ...worktreeThread,
          id: "candidate-1",
          worktreePath: candidatePath,
          worktreeBranch: "poracode/one",
        },
      ],
      view: { kind: "home" },
    });
    useExperimentStore.setState({ experiments: {} });
    useExperimentStore.getState().addExperiment({
      id: "experiment-1",
      projectId: project.id,
      title: "Experiment",
      prompt: "Implement it",
      baseBranch: "main",
      baseCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidates: [
        {
          threadId: "candidate-1",
          agentKind: "codex",
          worktreePath: candidatePath,
          worktreeBranch: "poracode/one",
          worktreeOwnerToken: "experiment-1:candidate-1",
          worktreeState: "owned",
        },
      ],
      winnerThreadId: "candidate-1",
      status: "decided",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
    });
  }

  it("watches a decided experiment candidate opened in the git review panel", () => {
    const candidatePath = "/repo/experiment-one";
    seedDecidedExperimentCandidate(candidatePath);
    usePanelStore.setState({
      gitReviewContext: { projectId: project.id, worktreePath: candidatePath },
      gitReviewAsPanel: true,
      gitOverlayOpen: false,
      rightPanelTab: "git",
    });

    expect(getProjectActiveWorktreePaths(project.id)).toContain(candidatePath);
  });

  it("watches a decided experiment candidate opened in the git review overlay", () => {
    const candidatePath = "/repo/experiment-one";
    seedDecidedExperimentCandidate(candidatePath);
    usePanelStore.setState({
      gitReviewContext: { projectId: project.id, worktreePath: candidatePath },
      gitReviewAsPanel: false,
      gitOverlayOpen: true,
      rightPanelTab: "files",
    });

    expect(getProjectActiveWorktreePaths(project.id)).toContain(candidatePath);
  });
});
