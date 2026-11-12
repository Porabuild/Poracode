import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import type {
  GitStatusResult,
  ForgeRepository,
  PrData,
  PrDetails,
  Project,
  ProjectLocation,
  Thread,
} from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { msg } from "@/shared/messages";
import * as adaptiveLayout from "@/renderer/adaptiveLayout";
import { useAppStore } from "./appStore";
import { useGitStore } from "./gitStore";
import { emptyGitStateSnapshot, gitTargetKey, pullRequestKey } from "@/shared/gitState";
import { projectGitReadModelIntoLegacyStore } from "./gitReadModelLegacyProjection";
import { useExperimentStore } from "./experimentStore";
import { buildBranchPrKey } from "./gitSelectors";
import { usePanelStore } from "./panelStore";
import { useSidebarUiStore } from "./sidebarUiStore";
import { useDevTerminalStore } from "./devTerminalStore";
import { useSharedSettings } from "./sharedSettingsStore";
import { shouldPollProject } from "./wslBackgroundActivity";
import {
  cleanupGitRefreshProjects,
  getProjectActiveWorktreePaths,
  getWatcherRefreshMode,
  prefetchBranchPrData,
  prefetchVisibleGitPanelPrData,
  PR_PENDING_REFRESH_INTERVAL_MS,
  PR_POST_PUSH_STATUS_POLL_MS,
  refreshGitProject,
  refreshPrAfterForgeActivity,
  refreshSinglePr,
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
const forgeGetPrForBranchMock = vi.fn<PoracodeBridge["forgeGetPrForBranch"]>();
const forgeGetPrDetailsMock = vi.fn<PoracodeBridge["forgeGetPrDetails"]>();
const checkPrWatchMock =
  vi.fn<(payload: { projectId: string; prNumber: number }) => Promise<void>>();
const ghListPrsMock =
  vi.fn<
    (payload: { projectLocation: ProjectLocation }) => Promise<{ prs: Record<string, PrData> }>
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

const forgeSource: ForgeRepository = {
  forge: "gitlab",
  host: "https://gitlab.com",
  repository: "team/app",
  remote: "origin",
  account: { forge: "gitlab", host: "https://gitlab.com", login: "alice" },
  capabilities: {
    mergeMethods: ["merge", "squash"],
    reviewDecisions: ["approve", "comment"],
    draft: true,
    reopen: true,
    updateBranch: false,
    rebaseBranch: true,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: true,
    autoFix: true,
    adminMerge: false,
  },
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
  it("stops WSL background polls for unloaded projects and resumes for loaded threads or terminals", () => {
    const wslProject = { ...project, location: wslLocation };
    useDevTerminalStore.setState({ isOpen: false, activeProjectId: null });
    expect(shouldPollProject(project)).toBe(true);
    expect(shouldPollProject(wslProject)).toBe(false);
    useAppStore.setState({ threads: [{ ...worktreeThread, status: "inactive" }] });
    expect(shouldPollProject(wslProject)).toBe(false);
    useAppStore.setState({ threads: [worktreeThread] });
    expect(shouldPollProject(wslProject)).toBe(true);
    useAppStore.setState({ threads: [{ ...worktreeThread, projectId: "other" }] });
    expect(shouldPollProject(wslProject)).toBe(false);
    useDevTerminalStore.setState({ isOpen: true, activeProjectId: project.id });
    expect(shouldPollProject(wslProject)).toBe(true);
    useDevTerminalStore.setState({ isOpen: false, activeProjectId: null });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    ghGetPrForBranchMock.mockReset();
    ghGetPrDetailsMock.mockReset();
    forgeGetPrForBranchMock
      .mockReset()
      .mockRejectedValue(new Error(msg("forge.repositoryChanged")));
    forgeGetPrDetailsMock.mockReset();
    checkPrWatchMock.mockReset();
    ghListPrsMock.mockReset();
    checkPrWatchMock.mockResolvedValue(undefined);
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        dbSetState: vi
          .fn<(key: string, value: string) => Promise<void>>()
          .mockResolvedValue(undefined),
        ghGetPrForBranch: ghGetPrForBranchMock,
        ghGetPrDetails: ghGetPrDetailsMock,
        forgeGetPrForBranch: forgeGetPrForBranchMock,
        forgeGetPrDetails: forgeGetPrDetailsMock,
        checkPrWatch: checkPrWatchMock,
        ghListPrs: ghListPrsMock,
        ghPollPullRequests: mockPollPullRequests,
      },
    });
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: {},
      githubPollingProblems: {},
      prData: {},
      worktreeSourceInfo: {},
      prDetails: {},
      prFiles: {},
      prDiffs: {},
    });
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      gitOverlayOpen: false,
      filesPanelContext: null,
      rightPanelTab: "git",
      rightPanelSplit: null,
      bottomPanelDocks: { left: null, right: null },
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

  it("maps one bulk PR query to all thread worktrees and reapplies its cache", async () => {
    const bulkProject = { ...project, id: "bulk-p1" };
    const visibleThread = {
      ...worktreeThread,
      id: "bulk-visible",
      projectId: bulkProject.id,
      worktreePath: "/repo-visible",
      worktreeBranch: "feature/visible",
    };
    const hiddenThread = {
      ...worktreeThread,
      id: "bulk-hidden",
      projectId: bulkProject.id,
      worktreePath: "/repo-hidden",
      worktreeBranch: "feature/hidden",
    };
    const visiblePr = { ...basePr, number: 101, checksStatus: "SUCCESS" as const };
    const hiddenPr = { ...basePr, number: 102, state: "merged" as const };
    const mainPr = { ...basePr, number: 103, checksStatus: "FAILURE" as const };

    useAppStore.setState({ projects: [bulkProject], threads: [visibleThread] });
    useGitStore.setState({
      statuses: { [bulkProject.id]: { ...status, branch: "feature/main" } },
      ghAvailable: { [bulkProject.id]: true },
      prData: {
        "/repo-visible": {
          ...basePr,
          number: 101,
          viewerDidAuthor: true,
          updatedAt: "2026-04-03T00:00:00.000Z",
        },
      },
    });
    ghListPrsMock.mockResolvedValue({
      prs: {
        "feature/visible": visiblePr,
        "feature/hidden": hiddenPr,
        "feature/main": mainPr,
      },
    });

    await prefetchBranchPrData(bulkProject);

    expect(ghListPrsMock).toHaveBeenCalledOnce();
    expect(useGitStore.getState().prData["/repo-visible"]).toEqual({
      ...visiblePr,
      viewerDidAuthor: true,
    });
    expect(useGitStore.getState().prData[buildBranchPrKey(bulkProject.id)]).toEqual(mainPr);

    useGitStore.getState().setPrData("/repo-visible", {
      ...visiblePr,
      state: "merged",
      updatedAt: "2026-04-05T00:00:00.000Z",
      viewerDidAuthor: true,
    });
    useAppStore.setState({ threads: [visibleThread, hiddenThread] });
    await prefetchBranchPrData(bulkProject);

    expect(ghListPrsMock).toHaveBeenCalledOnce();
    expect(useGitStore.getState().prData["/repo-hidden"]).toEqual(hiddenPr);
    expect(useGitStore.getState().prData["/repo-visible"]?.state).toBe("merged");
  });

  it("prefetches for a matching visible Git panel when source-host reviews are available", async () => {
    const visibleProject = { ...project, id: "visible-git-project" };
    useAppStore.setState({ projects: [visibleProject] });
    usePanelStore.setState({
      gitReviewContext: { projectId: visibleProject.id, worktreePath: "/repo-visible" },
      gitReviewAsPanel: true,
    });
    ghListPrsMock.mockResolvedValue({ prs: {} });

    await prefetchVisibleGitPanelPrData(visibleProject.id, "/another-worktree");
    expect(ghListPrsMock).not.toHaveBeenCalled();

    useGitStore.setState({
      ghAvailable: { [visibleProject.id]: false },
      statuses: { [visibleProject.id]: status },
    });
    await prefetchVisibleGitPanelPrData(visibleProject.id, "/repo-visible");
    expect(ghListPrsMock).not.toHaveBeenCalled();

    useGitStore.setState({
      ghAvailable: { [visibleProject.id]: true },
      statuses: {
        [visibleProject.id]: {
          ...status,
          remoteInfo: { ...status.remoteInfo!, platform: "gitlab" },
        },
      },
    });
    await prefetchVisibleGitPanelPrData(visibleProject.id, "/repo-visible");
    expect(ghListPrsMock).toHaveBeenCalledOnce();

    useGitStore.setState({ statuses: { [visibleProject.id]: status } });
    await prefetchVisibleGitPanelPrData(visibleProject.id, "/repo-visible");
    expect(ghListPrsMock).toHaveBeenCalledOnce();
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

  it.each(["default", "account", "host", "repository", "legacy"] as const)(
    "rediscovers the current %s review identity before fetching scoped details",
    async (changed) => {
      const nextSource: ForgeRepository =
        changed === "account"
          ? { ...forgeSource, account: { ...forgeSource.account!, login: "bob" } }
          : changed === "host"
            ? {
                ...forgeSource,
                host: "https://git.example",
                account: { ...forgeSource.account!, host: "https://git.example" },
              }
            : changed === "repository"
              ? { ...forgeSource, repository: "other/app" }
              : forgeSource;
      const previous = changed === "legacy" ? basePr : { ...basePr, source: forgeSource };
      const current = { ...basePr, source: nextSource };
      const currentDetails = { ...baseDetails, source: nextSource };
      const key = buildBranchPrKey(project.id);
      useGitStore.getState().setPrData(key, previous);
      useGitStore.getState().setPrDetails("p1#42", { ...baseDetails, source: forgeSource });
      useGitStore.getState().setPrDiff("p1#42", "old diff");
      useGitStore.getState().setPrFiles("p1#42", [{ path: "old.ts", additions: 1, deletions: 0 }]);
      ghGetPrForBranchMock.mockResolvedValue(current);
      forgeGetPrDetailsMock.mockResolvedValue({ pr: current, details: currentDetails });
      await refreshSinglePr({
        projectLocation: location,
        prKey: key,
        branch: status.branch,
        projectId: project.id,
        detailsCacheKey: "p1#42",
        prNumber: 42,
      });
      expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
        projectLocation: location,
        branch: status.branch,
      });
      expect(forgeGetPrForBranchMock).not.toHaveBeenCalled();
      expect(forgeGetPrDetailsMock).toHaveBeenCalledWith({
        projectLocation: location,
        prNumber: 42,
        forgeAccount: nextSource.account,
        forgeRepository: nextSource.repository,
      });
      expect(useGitStore.getState().prData[key]).toEqual(current);
      expect(useGitStore.getState().prDetails["p1#42"]).toEqual(currentDetails);
      expect(useGitStore.getState().prDiffs["p1#42"]).toBe(
        changed === "default" ? "old diff" : undefined,
      );
      expect(useGitStore.getState().prFiles["p1#42"]).toEqual(
        changed === "default" ? [{ path: "old.ts", additions: 1, deletions: 0 }] : undefined,
      );
    },
  );

  it.each(["forge.repositoryChanged", "forge.hostMismatch", "forge.accountMismatch"] as const)(
    "clears an actual %s refusal and recovers through current discovery",
    async (message) => {
      const key = buildBranchPrKey(project.id);
      const previous = { ...basePr, source: forgeSource };
      useGitStore.getState().setPrData(key, previous);
      useGitStore.getState().setPrDetails("p1#42", { ...baseDetails, source: forgeSource });
      useGitStore.getState().setPrDiff("p1#42", "old diff");
      ghGetPrForBranchMock.mockRejectedValueOnce(
        new Error(`Error invoking remote method 'ghGetPrForBranch': Error: ${msg(message)}`),
      );
      const input = {
        projectLocation: location,
        prKey: key,
        branch: status.branch,
        projectId: project.id,
        detailsCacheKey: "p1#42",
        prNumber: 42,
      };
      await refreshSinglePr(input);
      expect(useGitStore.getState().prData[key]).toBeNull();
      expect(useGitStore.getState().prDetails["p1#42"]).toBeUndefined();
      expect(useGitStore.getState().prDiffs["p1#42"]).toBeUndefined();
      const recovered = {
        ...previous,
        source: { ...forgeSource, account: { ...forgeSource.account!, login: "bob" } },
      };
      ghGetPrForBranchMock.mockResolvedValue(recovered);
      forgeGetPrDetailsMock.mockResolvedValue({
        pr: recovered,
        details: { ...baseDetails, source: recovered.source },
      });
      await refreshSinglePr(input);
      expect(useGitStore.getState().prData[key]).toEqual(recovered);
      expect(forgeGetPrForBranchMock).not.toHaveBeenCalled();
    },
  );

  it("keeps a successful scoped snapshot on a transient discovery failure", async () => {
    const key = buildBranchPrKey(project.id);
    const previous = { ...basePr, source: forgeSource };
    const details = { ...baseDetails, source: forgeSource };
    useGitStore.getState().setPrData(key, previous);
    useGitStore.getState().setPrDetails("p1#42", details);
    ghGetPrForBranchMock.mockRejectedValue(new Error(msg("forge.networkFailed")));
    await refreshSinglePr({
      projectLocation: location,
      prKey: key,
      branch: status.branch,
      detailsCacheKey: "p1#42",
      prNumber: 42,
    });
    expect(useGitStore.getState().prData[key]).toBe(previous);
    expect(useGitStore.getState().prDetails["p1#42"]).toBe(details);
    expect(forgeGetPrDetailsMock).not.toHaveBeenCalled();
  });

  it("clears an identity refusal after discovery instead of retrying as another account", async () => {
    const key = buildBranchPrKey(project.id);
    const previous = { ...basePr, source: forgeSource };
    useGitStore.getState().setPrData(key, previous);
    ghGetPrForBranchMock.mockResolvedValue(previous);
    forgeGetPrDetailsMock.mockRejectedValue(new Error(msg("forge.accountMismatch")));
    await refreshSinglePr({
      projectLocation: location,
      prKey: key,
      branch: status.branch,
      detailsCacheKey: "p1#42",
      prNumber: 42,
    });
    expect(useGitStore.getState().prData[key]).toBeNull();
    expect(forgeGetPrDetailsMock).toHaveBeenCalledOnce();
    expect(ghGetPrDetailsMock).not.toHaveBeenCalled();
  });

  it("preserves scoped details through a transient detail failure", async () => {
    const key = buildBranchPrKey(project.id);
    const previous = { ...basePr, source: forgeSource };
    const details = { ...baseDetails, source: forgeSource };
    useGitStore.getState().setPrData(key, previous);
    useGitStore.getState().setPrDetails("p1#42", details);
    ghGetPrForBranchMock.mockResolvedValue(previous);
    forgeGetPrDetailsMock.mockRejectedValue(new Error(msg("forge.networkFailed")));
    await refreshSinglePr({
      projectLocation: location,
      prKey: key,
      branch: status.branch,
      detailsCacheKey: "p1#42",
      prNumber: 42,
    });
    expect(useGitStore.getState().prData[key]).toBe(previous);
    expect(useGitStore.getState().prDetails["p1#42"]).toBe(details);
  });

  it("removes the previous review cache when discovery confirms there is no PR", async () => {
    const key = buildBranchPrKey(project.id);
    useGitStore.getState().setPrData(key, { ...basePr, source: forgeSource });
    useGitStore.getState().setPrDetails("p1#42", { ...baseDetails, source: forgeSource });
    ghGetPrForBranchMock.mockResolvedValue(null);
    await refreshSinglePr({
      projectLocation: location,
      prKey: key,
      branch: status.branch,
      projectId: project.id,
    });
    expect(useGitStore.getState().prData[key]).toBeNull();
    expect(useGitStore.getState().prDetails["p1#42"]).toBeUndefined();
    expect(forgeGetPrDetailsMock).not.toHaveBeenCalled();
  });

  it("loads a newly discovered PR under its own detail cache key", async () => {
    const key = buildBranchPrKey(project.id);
    useGitStore.getState().setPrData(key, { ...basePr, source: forgeSource });
    const current = { ...basePr, number: 43, source: { ...forgeSource, repository: "other/app" } };
    const currentDetails = { ...baseDetails, number: 43, source: current.source };
    ghGetPrForBranchMock.mockResolvedValue(current);
    forgeGetPrDetailsMock.mockResolvedValue({ pr: current, details: currentDetails });
    await refreshSinglePr({
      projectLocation: location,
      prKey: key,
      branch: status.branch,
      projectId: project.id,
      detailsCacheKey: "p1#42",
      prNumber: 42,
    });
    expect(forgeGetPrDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 43, forgeRepository: "other/app" }),
    );
    expect(useGitStore.getState().prDetails["p1#43"]).toBe(currentDetails);
    expect(useGitStore.getState().prDetails["p1#42"]).toBeUndefined();
  });

  it("does not replace a newer scoped row with a late discovery result", async () => {
    const key = buildBranchPrKey(project.id);
    const previous = { ...basePr, source: forgeSource };
    const current = { ...previous, source: { ...forgeSource, repository: "other/app" } };
    const held = Promise.withResolvers<PrData>();
    useGitStore.getState().setPrData(key, previous);
    ghGetPrForBranchMock.mockReturnValueOnce(held.promise).mockResolvedValueOnce(current);
    const input = { projectLocation: location, prKey: key, branch: status.branch };
    const first = refreshSinglePr(input);
    await refreshSinglePr(input);
    held.resolve(previous);
    await first;
    expect(useGitStore.getState().prData[key]).toBe(current);
    expect(forgeGetPrForBranchMock).not.toHaveBeenCalled();
  });

  it.each(["new refresh", "external source update"] as const)(
    "ignores late scoped details after a %s",
    async (replacement) => {
      const key = buildBranchPrKey(project.id);
      const previous = { ...basePr, source: forgeSource };
      const current = {
        ...previous,
        source: { ...forgeSource, account: { ...forgeSource.account!, login: "bob" } },
      };
      const currentDetails = { ...baseDetails, source: current.source };
      const held = Promise.withResolvers<{ pr: PrData; details: PrDetails }>();
      useGitStore.getState().setPrData(key, previous);
      ghGetPrForBranchMock.mockResolvedValueOnce(previous).mockResolvedValueOnce(current);
      forgeGetPrDetailsMock
        .mockReturnValueOnce(held.promise)
        .mockResolvedValueOnce({ pr: current, details: currentDetails });
      const input = {
        projectLocation: location,
        prKey: key,
        branch: status.branch,
        detailsCacheKey: "p1#42",
        prNumber: 42,
      };
      const first = refreshSinglePr(input);
      await vi.waitFor(() => expect(forgeGetPrDetailsMock).toHaveBeenCalledOnce());
      if (replacement === "new refresh") await refreshSinglePr(input);
      else {
        useGitStore.getState().setPrData(key, current);
        useGitStore.getState().setPrDetails("p1#42", currentDetails);
      }
      held.resolve({ pr: previous, details: { ...baseDetails, source: forgeSource } });
      await first;
      expect(useGitStore.getState().prData[key]).toBe(current);
      expect(useGitStore.getState().prDetails["p1#42"]).toBe(currentDetails);
    },
  );

  it.each([
    { label: "open", pr: basePr },
    { label: "empty", pr: null },
  ])("keeps a canonical merge after a delayed $label renderer response", async ({ pr }) => {
    const prKey = buildBranchPrKey("p1");
    useGitStore.getState().setPrData(prKey, basePr);
    useGitStore.getState().setPrDetails("p1#42", baseDetails);
    const coreResponse = Promise.withResolvers<PrData | null>();
    const detailsResponse = Promise.withResolvers<{ details: PrDetails }>();
    ghGetPrForBranchMock.mockReturnValueOnce(coreResponse.promise);
    ghGetPrDetailsMock.mockReturnValueOnce(detailsResponse.promise);
    const refresh = refreshSinglePr({
      projectLocation: location,
      prKey,
      branch: status.branch,
      detailsCacheKey: "p1#42",
      prNumber: 42,
    });
    const merged: PrData = { ...basePr, state: "merged", checksStatus: "SUCCESS" };
    const mergedDetails: PrDetails = {
      ...baseDetails,
      mergedAt: "2026-04-04T00:10:00.000Z",
      checks: [{ name: "CI", state: "COMPLETED", conclusion: "SUCCESS" }],
    };
    const targetRef = { hostId: "desktop-1", projectId: "p1" };
    const prRef = { ...targetRef, prNumber: 42 };
    const canonicalPrKey = pullRequestKey(prRef);
    const snapshot = {
      ...emptyGitStateSnapshot(),
      revision: 1,
      targets: {
        [gitTargetKey(targetRef)]: {
          ref: targetRef,
          pullRequestKey: canonicalPrKey,
          refreshedAt: merged.updatedAt,
        },
      },
      pullRequests: {
        [canonicalPrKey]: {
          ref: prRef,
          data: merged,
          details: mergedDetails,
          freshness: { core: merged.updatedAt, details: merged.updatedAt },
        },
      },
    };
    projectGitReadModelIntoLegacyStore(snapshot);
    coreResponse.resolve(pr);
    detailsResponse.resolve({ details: baseDetails });
    await refresh;

    expect(useGitStore.getState().prData[prKey]).toBe(merged);
    expect(useGitStore.getState().prDetails["p1#42"]).toBe(mergedDetails);
    projectGitReadModelIntoLegacyStore({ ...snapshot, revision: 2 }, snapshot);
    expect(useGitStore.getState().prData[prKey]).toBe(merged);
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

    await vi.advanceTimersByTimeAsync(0);
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
    expect(checkPrWatchMock).toHaveBeenCalledOnce();
    expect(checkPrWatchMock).toHaveBeenCalledWith({ projectId: "p1", prNumber: 42 });

    ghGetPrForBranchMock.mockClear();
    ghGetPrDetailsMock.mockClear();
    await vi.advanceTimersByTimeAsync(PR_PENDING_REFRESH_INTERVAL_MS);

    expect(ghGetPrForBranchMock).not.toHaveBeenCalled();
    expect(ghGetPrDetailsMock).not.toHaveBeenCalled();
    expect(checkPrWatchMock).toHaveBeenCalledOnce();
  });

  it("polls when the PR summary is stale failed but loaded check details are pending", async () => {
    const prKey = buildBranchPrKey("p1");
    useGitStore.getState().setStatus("p1", status);
    useGitStore.getState().setPrData(prKey, { ...basePr, checksStatus: "FAILURE" });
    useGitStore.getState().setPrDetails("p1#42", baseDetails);
    ghGetPrForBranchMock.mockResolvedValue({ ...basePr, checksStatus: "PENDING" });
    ghGetPrDetailsMock.mockResolvedValue({ details: baseDetails });

    syncPendingPrRefreshProjects([{ id: "p1", location }]);

    await vi.advanceTimersByTimeAsync(0);
    expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
      projectLocation: location,
      branch: "feature/pr-checks",
    });
    expect(ghGetPrDetailsMock).toHaveBeenCalledWith({ projectLocation: location, prNumber: 42 });
  });

  it("pauses pending PR polling on WSL unload and resumes when a thread loads", async () => {
    const wslProject = { ...project, location: wslLocation };
    useAppStore.setState({ projects: [wslProject], threads: [worktreeThread] });
    useGitStore.getState().setStatus("p1", status);
    useGitStore.getState().setPrData(buildBranchPrKey("p1"), basePr);
    ghGetPrForBranchMock.mockResolvedValue(basePr);
    ghGetPrDetailsMock.mockResolvedValue({ details: baseDetails });
    syncPendingPrRefreshProjects([wslProject]);
    await vi.advanceTimersByTimeAsync(0);
    expect(ghGetPrForBranchMock).toHaveBeenCalled();
    useAppStore.setState({ threads: [{ ...worktreeThread, status: "inactive" }] });
    syncPendingPrRefreshProjects([wslProject]);
    ghGetPrForBranchMock.mockClear();
    await vi.advanceTimersByTimeAsync(2 * PR_PENDING_REFRESH_INTERVAL_MS);
    expect(ghGetPrForBranchMock).not.toHaveBeenCalled();
    useAppStore.setState({ threads: [worktreeThread] });
    syncPendingPrRefreshProjects([wslProject]);
    expect(ghGetPrForBranchMock).toHaveBeenCalled();
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
  it("discovers repository metadata when queued watcher details outlive a non-repo snapshot", async () => {
    const initial =
      Promise.withResolvers<Awaited<ReturnType<PoracodeBridge["gitProjectSnapshot"]>>>();
    const branches = { current: status.branch, branches: [] };
    const worktrees = [{ path: "/repo", branch: status.branch, commit: "abc123", isMain: true }];
    const gitProjectSnapshot = vi
      .fn<PoracodeBridge["gitProjectSnapshot"]>()
      .mockImplementationOnce(() => initial.promise)
      .mockResolvedValue({ status, branches, worktrees, ghAvailable: false });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        gitProjectSnapshot,
        getGitStatus: vi.fn<PoracodeBridge["getGitStatus"]>().mockResolvedValue(status),
        gitWatchWorktrees: vi
          .fn<PoracodeBridge["gitWatchWorktrees"]>()
          .mockResolvedValue(undefined),
      },
    });
    const nonRepoStatus = { ...status, isRepo: false };
    useGitStore.getState().setStatus(project.id, nonRepoStatus);
    const pending = refreshGitProject(project, "initial", "full");
    await refreshGitProject(project, "watcher", getWatcherRefreshMode(project.id));
    await refreshGitProject(project, "watcher-details", "status");
    initial.resolve({ status: nonRepoStatus, branches: null, worktrees: [], ghAvailable: false });
    await pending;
    await vi.waitFor(() => expect(useGitStore.getState().branches.p1).toEqual(branches));
    expect(useGitStore.getState().worktrees.p1).toEqual(worktrees);
    expect(gitProjectSnapshot).toHaveBeenCalledTimes(2);
  });

  it("keeps queued count refreshes behind the current request when a retired request finishes", async () => {
    const retired = Promise.withResolvers<GitStatusResult>();
    const current = Promise.withResolvers<GitStatusResult>();
    const getGitStatus = vi
      .fn<PoracodeBridge["getGitStatus"]>()
      .mockImplementationOnce(() => retired.promise)
      .mockImplementationOnce(() => current.promise)
      .mockResolvedValue(status);
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: { platform: "darwin", getGitStatus },
    });
    const options = { includeMainStatus: true, worktreePaths: [] };
    const oldRequest = refreshGitProject(project, "watcher", "status", options);
    cleanupGitRefreshProjects(new Set());
    const newRequest = refreshGitProject(project, "watcher", "status", options);
    await refreshGitProject(project, "watcher-details", "status", options);
    try {
      expect(getGitStatus).toHaveBeenCalledTimes(2);
      retired.resolve(status);
      await oldRequest;
      expect(getGitStatus).toHaveBeenCalledTimes(2);
      current.resolve(status);
      await newRequest;
      await vi.waitFor(() => expect(getGitStatus).toHaveBeenCalledTimes(3));
      expect(getGitStatus.mock.calls[2]?.[0].detail).toBeUndefined();
    } finally {
      retired.resolve(status);
      current.resolve(status);
      await Promise.all([oldRequest, newRequest]);
    }
  });

  beforeEach(() => {
    cleanupGitRefreshProjects(new Set());
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: {},
      githubPollingProblems: {},
      prData: {},
      worktreeSourceInfo: {},
      prDetails: {},
      prFiles: {},
      prDiffs: {},
    });
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      gitOverlayOpen: false,
      mobileUtilityPage: null,
      filesPanelContext: null,
      rightPanelTab: "git",
      rightPanelSplit: null,
      bottomPanelDocks: { left: null, right: null },
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
      detail: "summary",
    });
    expect(useGitStore.getState().worktreeStatuses["/repo-wt"]).toEqual(worktreeStatus);
  });

  it("refreshes only the changed worktree and skips main-checkout status when a worktree watcher fires", async () => {
    const secondWorktreeThread: Thread = {
      ...worktreeThread,
      id: "t2",
      worktreePath: "/repo-wt-2",
      worktreeBranch: "feature/wt-2",
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
      .mockResolvedValue({ statuses: { "/repo-wt-2": status } });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        getGitStatus,
        gitWorktreeStatusBatch,
      },
    });
    useSidebarUiStore.setState({ threadListLimits: { p1: 10 } });
    useAppStore.setState({ threads: [worktreeThread, secondWorktreeThread] });

    await refreshGitProject(project, "watcher", "status", {
      includeMainStatus: false,
      worktreePaths: ["/repo-wt-2"],
    });

    expect(getGitStatus).not.toHaveBeenCalled();
    expect(gitWorktreeStatusBatch).toHaveBeenCalledTimes(1);
    expect(gitWorktreeStatusBatch).toHaveBeenCalledWith({
      projectLocation: location,
      worktreePaths: ["/repo-wt-2"],
      detail: "summary",
    });
  });

  it.each(["main", "worktree"] as const)(
    "keeps cached-repository watcher refreshes status-only for %s scope",
    async (scope) => {
      useGitStore.getState().setStatus(project.id, status);
      useAppStore.setState({ threads: [worktreeThread, hiddenWorktreeThread] });
      usePanelStore.setState({
        gitReviewContext: {
          projectId: project.id,
          ...(scope === "worktree" ? { worktreePath: "/repo-wt" } : {}),
        },
        gitReviewAsPanel: true,
      });
      const getGitStatus = vi.fn<PoracodeBridge["getGitStatus"]>().mockResolvedValue(status);
      const gitWorktreeStatusBatch = vi
        .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
        .mockResolvedValue({ statuses: {} });
      const gitListBranches = vi.fn<PoracodeBridge["gitListBranches"]>();
      const gitListWorktrees = vi.fn<PoracodeBridge["gitListWorktrees"]>();
      const gitProjectSnapshot = vi.fn<PoracodeBridge["gitProjectSnapshot"]>();
      Object.defineProperty(window, "poracode", {
        configurable: true,
        value: {
          platform: "darwin",
          getGitStatus,
          gitWorktreeStatusBatch,
          gitListBranches,
          gitListWorktrees,
          gitProjectSnapshot,
        },
      });
      const mode = getWatcherRefreshMode(project.id);
      expect(mode).toBe("status");

      await refreshGitProject(
        project,
        "watcher",
        mode,
        scope === "worktree" ? { includeMainStatus: false, worktreePaths: ["/repo-wt"] } : {},
      );

      expect(getGitStatus.mock.calls).toEqual(
        scope === "main" ? [[{ projectLocation: location, detail: "full" }]] : [],
      );
      expect(gitWorktreeStatusBatch).toHaveBeenCalledExactlyOnceWith({
        projectLocation: location,
        worktreePaths: scope === "main" ? ["/repo-hidden", "/repo-wt"] : ["/repo-wt"],
        detail: scope === "worktree" ? "full" : "summary",
      });
      expect(gitListBranches).not.toHaveBeenCalled();
      expect(gitListWorktrees).not.toHaveBeenCalled();
      expect(gitProjectSnapshot).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])("measures six scoped watcher events with review open=%s", async (open) => {
    const threads = Array.from({ length: 6 }, (_, index) => ({
      ...worktreeThread,
      id: `watcher-${index}`,
      worktreePath: `/repo-wt-${index}`,
    }));
    useAppStore.setState({
      threads,
      view: { kind: "thread", panes: [threads[0]!.id] },
    });
    usePanelStore.setState({
      gitReviewContext: { projectId: project.id, worktreePath: threads[0]!.worktreePath },
      gitReviewAsPanel: open,
      gitOverlayOpen: false,
    });
    const gitWorktreeStatusBatch = vi
      .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
      .mockImplementation(async ({ worktreePaths, detail }) => ({
        statuses: Object.fromEntries(
          worktreePaths.map((path) => [
            path,
            {
              ...status,
              ...(detail ? { detail } : {}),
              unstaged: [
                { path: "new.ts", status: "?", staged: false, insertions: 0, deletions: 0 },
              ],
            },
          ]),
        ),
      }));
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: { platform: "darwin", gitWorktreeStatusBatch },
    });

    for (const thread of threads) {
      await refreshGitProject(project, "watcher", "status", {
        includeMainStatus: false,
        worktreePaths: [thread.worktreePath],
      });
    }

    expect(gitWorktreeStatusBatch).toHaveBeenCalledTimes(6);
    expect(gitWorktreeStatusBatch.mock.calls.map(([payload]) => payload.detail)).toEqual([
      open ? "full" : "summary",
      "summary",
      "summary",
      "summary",
      "summary",
      "summary",
    ]);
  });

  it.each(["main", "worktree"] as const)(
    "refreshes hidden %s line counts after lightweight watcher status",
    async (scope) => {
      useAppStore.setState({ threads: [worktreeThread] });
      usePanelStore.setState({
        gitReviewContext: null,
        gitReviewAsPanel: false,
        gitOverlayOpen: false,
      });
      const full: GitStatusResult = {
        ...status,
        unstaged: [{ path: "new.ts", status: "?", staged: false, insertions: 17, deletions: 0 }],
        totalInsertions: 17,
      };
      const summary: GitStatusResult = {
        ...full,
        detail: "summary",
        totalInsertions: 0,
        unstaged: full.unstaged.map((file) => ({ ...file, insertions: 0 })),
      };
      const getGitStatus = vi
        .fn<PoracodeBridge["getGitStatus"]>()
        .mockImplementation(async ({ detail }) => (detail === "summary" ? summary : full));
      const gitWorktreeStatusBatch = vi
        .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
        .mockImplementation(async ({ detail }) => ({
          statuses: { "/repo-wt": detail === "summary" ? summary : full },
        }));
      Object.defineProperty(window, "poracode", {
        configurable: true,
        value: { platform: "darwin", getGitStatus, gitWorktreeStatusBatch },
      });
      const options =
        scope === "main"
          ? { includeMainStatus: true, worktreePaths: [] }
          : { includeMainStatus: false, worktreePaths: ["/repo-wt"] };
      await refreshGitProject(project, "watcher", "status", options);
      await refreshGitProject(project, "watcher-details", "status", options);
      const current =
        scope === "main"
          ? useGitStore.getState().statuses[project.id]
          : useGitStore.getState().worktreeStatuses["/repo-wt"];
      expect(current?.totalInsertions).toBe(17);
      expect(current?.unstaged).toEqual(full.unstaged);
      expect(gitWorktreeStatusBatch.mock.calls.map(([payload]) => payload.detail)).toEqual(
        scope === "worktree" ? ["summary", "full"] : [],
      );
    },
  );

  it.each(["main", "worktree"] as const)(
    "requests full watcher status only for the visible %s review root",
    async (root) => {
      const getGitStatus = vi.fn<PoracodeBridge["getGitStatus"]>().mockResolvedValue(status);
      const gitWorktreeStatusBatch = vi
        .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
        .mockImplementation(async ({ worktreePaths, detail }) => ({
          statuses: Object.fromEntries(
            worktreePaths.map((path) => [path, { ...status, ...(detail ? { detail } : {}) }]),
          ),
        }));
      Object.defineProperty(window, "poracode", {
        configurable: true,
        value: { platform: "darwin", getGitStatus, gitWorktreeStatusBatch },
      });
      useAppStore.setState({ threads: [worktreeThread, hiddenWorktreeThread] });
      usePanelStore.setState({
        gitReviewContext: {
          projectId: project.id,
          ...(root === "worktree" ? { worktreePath: "/repo-wt" } : {}),
        },
        gitReviewAsPanel: true,
      });

      await refreshGitProject(project, "watcher", "status");

      expect(getGitStatus).toHaveBeenCalledWith({
        projectLocation: location,
        detail: root === "main" ? "full" : "summary",
      });
      const requested = gitWorktreeStatusBatch.mock.calls.flatMap(([payload]) =>
        payload.worktreePaths.map((path) => [path, payload.detail]),
      );
      expect(requested).toContainEqual(["/repo-wt", root === "worktree" ? "full" : "summary"]);
      expect(requested).toContainEqual(["/repo-hidden", "summary"]);
    },
  );

  it.each(["overlay", "split", "bottom", "hidden", "other-project"] as const)(
    "uses actual review visibility for %s",
    async (surface) => {
      useSharedSettings.setState({ terminalPosition: "bottom" });
      useAppStore.setState({ threads: [worktreeThread] });
      usePanelStore.setState({
        gitReviewContext: {
          projectId: surface === "other-project" ? "p2" : project.id,
          worktreePath: "/repo-wt",
        },
        gitReviewAsPanel: true,
        gitOverlayOpen: surface === "overlay",
        rightPanelTab: surface === "other-project" ? "git" : "files",
        rightPanelSplit: surface === "split" ? { tab: "git", placement: "bottom" } : null,
        bottomPanelDocks: { left: surface === "bottom" ? "git" : null, right: null },
      });
      const gitWorktreeStatusBatch = vi
        .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
        .mockResolvedValue({ statuses: {} });
      Object.defineProperty(window, "poracode", {
        configurable: true,
        value: { platform: "darwin", gitWorktreeStatusBatch },
      });

      await refreshGitProject(project, "watcher", "status", {
        includeMainStatus: false,
        worktreePaths: ["/repo-wt"],
      });

      expect(gitWorktreeStatusBatch).toHaveBeenCalledExactlyOnceWith({
        projectLocation: location,
        worktreePaths: ["/repo-wt"],
        detail: surface === "hidden" || surface === "other-project" ? "summary" : "full",
      });
    },
  );

  it.each([
    { page: "workspace", tab: "git", overlay: false, detail: "full" },
    { page: "workspace", tab: "files", overlay: false, detail: "summary" },
    { page: "settings", tab: "git", overlay: false, detail: "summary" },
    { page: "githubActions", tab: "git", overlay: false, detail: "summary" },
    { page: null, tab: "git", overlay: false, detail: "summary" },
    { page: "settings", tab: "files", overlay: true, detail: "full" },
  ] as const)(
    "uses the rendered compact review surface despite stale desktop docks: %j",
    async ({ page, tab, overlay, detail }) => {
      const compact = vi.spyOn(adaptiveLayout, "isCompactLayoutViewport").mockReturnValue(true);
      try {
        useSharedSettings.setState({ terminalPosition: "bottom" });
        useAppStore.setState({ threads: [worktreeThread] });
        const context = { projectId: project.id, worktreePath: "/repo-wt" };
        usePanelStore.setState({
          gitReviewContext: context,
          gitReviewAsPanel: true,
          gitOverlayOpen: overlay,
          mobileUtilityPage: "workspace",
          rightPanelTab: tab,
          rightPanelSplit: { tab: "git", placement: "bottom" },
          bottomPanelDocks: { left: "git", right: null },
        });
        if (page === null) usePanelStore.getState().closeMobileUtilityPage();
        else usePanelStore.getState().openMobileUtilityPage(page);
        expect(usePanelStore.getState().gitReviewContext).toBe(context);
        const gitWorktreeStatusBatch = vi
          .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
          .mockResolvedValue({ statuses: {} });
        Object.defineProperty(window, "poracode", {
          configurable: true,
          value: { platform: "darwin", gitWorktreeStatusBatch },
        });

        await refreshGitProject(project, "watcher", "status", {
          includeMainStatus: false,
          worktreePaths: ["/repo-wt"],
        });

        expect(gitWorktreeStatusBatch).toHaveBeenCalledExactlyOnceWith({
          projectLocation: location,
          worktreePaths: ["/repo-wt"],
          detail,
        });
        useAppStore.setState({ threads: [] });
        useSidebarUiStore.setState({ collapsedProjects: { [project.id]: true } });
        expect(getProjectActiveWorktreePaths(project.id).includes("/repo-wt")).toBe(
          detail === "full",
        );
      } finally {
        compact.mockRestore();
      }
    },
  );

  it.each(["main", "worktree"] as const)(
    "discards a buffered %s summary when review opens and hydrates",
    async (root) => {
      let settle!: (value: GitStatusResult) => void;
      const pending = new Promise<GitStatusResult>((resolve) => {
        settle = resolve;
      });
      const getGitStatus = vi.fn<PoracodeBridge["getGitStatus"]>().mockReturnValue(pending);
      const gitWorktreeStatusBatch = vi
        .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
        .mockImplementation(async () => ({ statuses: { "/repo-wt": await pending } }));
      Object.defineProperty(window, "poracode", {
        configurable: true,
        value: { platform: "darwin", getGitStatus, gitWorktreeStatusBatch },
      });
      if (root === "worktree") useAppStore.setState({ threads: [worktreeThread] });
      const refresh = refreshGitProject(
        project,
        "watcher",
        "status",
        root === "worktree" ? { includeMainStatus: false, worktreePaths: ["/repo-wt"] } : {},
      );
      usePanelStore.setState({
        gitReviewContext: {
          projectId: project.id,
          ...(root === "worktree" ? { worktreePath: "/repo-wt" } : {}),
        },
        gitReviewAsPanel: true,
      });
      const hydrated = { ...status, detail: "full" as const, totalInsertions: 7 };
      if (root === "main") useGitStore.getState().setStatus(project.id, hydrated);
      else useGitStore.getState().setWorktreeStatus("/repo-wt", hydrated);
      settle({ ...status, detail: "summary", branch: "stale-branch" });
      await refresh;

      expect(
        root === "main"
          ? useGitStore.getState().statuses[project.id]
          : useGitStore.getState().worktreeStatuses["/repo-wt"],
      ).toEqual(hydrated);
      expect(getGitStatus.mock.calls.length + gitWorktreeStatusBatch.mock.calls.length).toBe(1);
    },
  );

  it("keeps explicit manual worktree refreshes full when review is closed", async () => {
    useAppStore.setState({ threads: [worktreeThread] });
    const gitWorktreeStatusBatch = vi
      .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
      .mockResolvedValue({ statuses: {} });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: { platform: "darwin", gitWorktreeStatusBatch },
    });
    await refreshGitProject(project, "manual", "status", {
      includeMainStatus: false,
      worktreePaths: ["/repo-wt"],
    });
    expect(gitWorktreeStatusBatch).toHaveBeenCalledExactlyOnceWith({
      projectLocation: location,
      worktreePaths: ["/repo-wt"],
      detail: "full",
    });
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

  it("shares branch reads when 800 threads use the same worktree", async () => {
    const getPr = vi.fn<PoracodeBridge["ghGetPrForBranch"]>().mockResolvedValue(basePr);
    const gitProjectSnapshot = vi.fn<PoracodeBridge["gitProjectSnapshot"]>().mockResolvedValue({
      status,
      branches: { current: status.branch, branches: [] },
      worktrees: [{ path: "/repo-wt", branch: "feature/wt", commit: "abc", isMain: false }],
      ghAvailable: true,
    });
    const gitWorktreeStatusBatch = vi
      .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
      .mockResolvedValue({ statuses: {} });
    const gitGetWorktreeSourceBranch = vi
      .fn<PoracodeBridge["gitGetWorktreeSourceBranch"]>()
      .mockResolvedValue({ sourceBranch: "main", commitsAhead: 1, sourceAhead: 0 });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        ...window.poracode,
        gitProjectSnapshot,
        gitWorktreeStatusBatch,
        gitGetWorktreeSourceBranch,
        ghGetPrForBranch: getPr,
        ghListPrs: vi.fn<PoracodeBridge["ghListPrs"]>().mockResolvedValue({ prs: {} }),
        ghPollPullRequests: mockPollPullRequests,
        gitWatchWorktrees: vi
          .fn<PoracodeBridge["gitWatchWorktrees"]>()
          .mockResolvedValue(undefined),
      },
    });
    useAppStore.setState({
      threads: Array.from({ length: 800 }, (_, index) => ({
        ...worktreeThread,
        id: `thread-${index}`,
      })),
    });

    await refreshGitProject(project, "initial", "full");

    expect(getPr).toHaveBeenCalledTimes(2);
    expect(gitProjectSnapshot).toHaveBeenCalledTimes(1);
    expect(gitWorktreeStatusBatch).toHaveBeenCalledTimes(1);
    expect(gitGetWorktreeSourceBranch).toHaveBeenCalledTimes(1);
    expect(
      useAppStore.getState().threads.every((thread) => thread.prNumber === basePr.number),
    ).toBe(true);
  });

  it("keeps a merged PR and thread association when a buffered full refresh finishes", async () => {
    const readStarted = Promise.withResolvers<void>();
    const response = Promise.withResolvers<PrData | null>();
    const source = Promise.withResolvers<{
      sourceBranch: string | null;
      commitsAhead: number;
      sourceAhead: number;
    }>();
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        gitProjectSnapshot: vi.fn<PoracodeBridge["gitProjectSnapshot"]>().mockResolvedValue({
          status,
          branches: { current: status.branch, branches: [] },
          worktrees: [{ path: "/repo-wt", branch: "feature/wt", commit: "abc", isMain: false }],
          ghAvailable: true,
        }),
        gitWatchWorktrees: vi
          .fn<PoracodeBridge["gitWatchWorktrees"]>()
          .mockResolvedValue(undefined),
        gitWorktreeStatusBatch: vi
          .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
          .mockResolvedValue({ statuses: {} }),
        gitGetWorktreeSourceBranch: vi
          .fn<PoracodeBridge["gitGetWorktreeSourceBranch"]>()
          .mockReturnValue(source.promise),
        ghListPrs: vi.fn<PoracodeBridge["ghListPrs"]>().mockResolvedValue({ prs: {} }),
        ghPollPullRequests: mockPollPullRequests,
        ghGetPrForBranch: vi.fn<PoracodeBridge["ghGetPrForBranch"]>(({ branch }) => {
          if (branch !== "feature/wt") return Promise.resolve(null);
          readStarted.resolve();
          return response.promise;
        }),
      },
    });
    useAppStore.setState({ threads: [{ ...worktreeThread, prNumber: 42 }] });
    useGitStore.getState().setPrData("/repo-wt", basePr);
    const refresh = refreshGitProject(project, "manual", "full");
    try {
      await readStarted.promise;
      response.resolve(null);
      await response.promise;
      const merged: PrData = { ...basePr, state: "merged" };
      useGitStore.getState().setPrData("/repo-wt", merged);
      source.resolve({ sourceBranch: "main", commitsAhead: 1, sourceAhead: 0 });
      await refresh;

      expect(useGitStore.getState().prData["/repo-wt"]).toBe(merged);
      expect(useAppStore.getState().threads[0]?.prNumber).toBe(42);
    } finally {
      response.resolve(null);
      source.resolve({ sourceBranch: "main", commitsAhead: 1, sourceAhead: 0 });
      await refresh;
    }
  });

  it.each(["gitlab", "bitbucket"] as const)(
    "refreshes project and worktree reviews for an available %s source host",
    async (platform) => {
      const getPr = vi.fn<PoracodeBridge["ghGetPrForBranch"]>().mockResolvedValue(basePr);
      Object.defineProperty(window, "poracode", {
        configurable: true,
        value: {
          platform: "darwin",
          gitProjectSnapshot: vi.fn<PoracodeBridge["gitProjectSnapshot"]>().mockResolvedValue({
            status: { ...status, remoteInfo: { ...status.remoteInfo!, platform } },
            branches: { current: status.branch, branches: [] },
            worktrees: [],
            ghAvailable: true,
          }),
          gitWatchWorktrees: vi
            .fn<PoracodeBridge["gitWatchWorktrees"]>()
            .mockResolvedValue(undefined),
          gitWorktreeStatusBatch: vi
            .fn<PoracodeBridge["gitWorktreeStatusBatch"]>()
            .mockResolvedValue({ statuses: {} }),
          ghGetPrForBranch: getPr,
          ghListPrs: vi.fn<PoracodeBridge["ghListPrs"]>().mockResolvedValue({ prs: {} }),
          ghPollPullRequests: mockPollPullRequests,
        },
      });
      useAppStore.setState({ threads: [worktreeThread] });

      await refreshGitProject(project, "manual", "full");

      expect(getPr).toHaveBeenCalledWith({
        projectLocation: location,
        branch: status.branch,
      });
      expect(getPr).toHaveBeenCalledWith({
        projectLocation: location,
        branch: worktreeThread.worktreeBranch,
      });
      expect(useGitStore.getState().prData[buildBranchPrKey(project.id)]).toEqual(basePr);
      expect(useGitStore.getState().prData[worktreeThread.worktreePath!]).toEqual(basePr);
    },
  );

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

  it("refreshes repository metadata with summary status after a project becomes a Git repo", async () => {
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
    const gitProjectSnapshot = vi.fn<PoracodeBridge["gitProjectSnapshot"]>().mockResolvedValue({
      status,
      branches: { current: "feature/pr-checks", branches: [] },
      worktrees: [{ path: "/repo", branch: "feature/pr-checks", commit: "abc123", isMain: true }],
      ghAvailable: false,
    });
    const getGitStatus = vi.fn<PoracodeBridge["getGitStatus"]>().mockResolvedValue(status);
    const gitWatchWorktrees = vi
      .fn<PoracodeBridge["gitWatchWorktrees"]>()
      .mockResolvedValue(undefined);
    const gitListBranches = vi.fn<PoracodeBridge["gitListBranches"]>().mockResolvedValue({
      current: "feature/pr-checks",
      branches: [],
    });
    const gitListWorktrees = vi.fn<PoracodeBridge["gitListWorktrees"]>().mockResolvedValue({
      worktrees: [{ path: "/repo", branch: "feature/pr-checks", commit: "abc123", isMain: true }],
    });
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        getGitStatus,
        gitProjectSnapshot,
        gitWatchWorktrees,
        gitListBranches,
        gitListWorktrees,
        ghCheckAvailable: vi
          .fn<PoracodeBridge["ghCheckAvailable"]>()
          .mockResolvedValue({ available: false }),
      },
    });
    useGitStore.getState().setStatus("p1", nonRepoStatus);

    await refreshGitProject(project, "watcher", getWatcherRefreshMode("p1"));

    expect(getGitStatus).toHaveBeenCalledWith({ projectLocation: location, detail: "summary" });
    expect(gitProjectSnapshot).not.toHaveBeenCalled();
    expect(gitListBranches).toHaveBeenCalledExactlyOnceWith({
      projectLocation: location,
      includeRemote: true,
    });
    expect(gitListWorktrees).toHaveBeenCalledExactlyOnceWith({ projectLocation: location });
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

async function mockPollPullRequests(
  input: Parameters<PoracodeBridge["ghPollPullRequests"]>[0],
): ReturnType<PoracodeBridge["ghPollPullRequests"]> {
  if (input.branch) {
    const pr = await window.poracode.ghGetPrForBranch({
      projectLocation: input.projectLocation,
      branch: input.branch,
    });
    return { status: "ready", prs: pr ? { [input.branch]: pr } : {}, pullRequests: [] };
  }
  const { prs } = await window.poracode.ghListPrs(input);
  return { status: "ready", prs, pullRequests: [] };
}

describe("forge activity PR refresh", () => {
  const activityThread: Thread = {
    ...worktreeThread,
    id: "t-forge",
    worktreePath: "/wt/a",
    worktreeBranch: "feat-a",
  };

  beforeEach(() => {
    cleanupGitRefreshProjects(new Set());
    ghGetPrForBranchMock.mockReset();
    ghGetPrDetailsMock.mockReset();
    ghListPrsMock.mockReset();
    forgeGetPrForBranchMock.mockReset();
    forgeGetPrDetailsMock.mockReset();
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        ghGetPrForBranch: ghGetPrForBranchMock,
        ghGetPrDetails: ghGetPrDetailsMock,
        ghListPrs: ghListPrsMock,
        ghPollPullRequests: mockPollPullRequests,
      },
    });
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: { p1: true },
      githubPollingProblems: {},
      prData: {},
      worktreeSourceInfo: {},
      prDetails: {},
      prFiles: {},
      prDiffs: {},
    });
    useAppStore.setState({
      projects: [project],
      threads: [activityThread],
      view: { kind: "home" },
    });
    // Keep the checkout active for the post-push target: earlier tests leave
    // collapsed sidebar state behind.
    useSidebarUiStore.setState({
      collapsedProjects: {},
      collapsedWorktrees: {},
      threadListLimits: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupGitRefreshProjects(new Set());
  });

  it("re-reads the worktree PR by its thread branch and stores it under the worktree key", async () => {
    const worktreePr: PrData = { ...basePr, number: 77 };
    ghGetPrForBranchMock.mockImplementation(async ({ branch }) =>
      branch === "feat-a" ? worktreePr : null,
    );
    ghGetPrDetailsMock.mockResolvedValue({ details: baseDetails });
    ghListPrsMock.mockResolvedValue({ prs: {} });

    refreshPrAfterForgeActivity({ projectId: "p1", worktreePath: "/wt/a", action: "create" });

    await vi.waitFor(() => expect(useGitStore.getState().prData["/wt/a"]).toEqual(worktreePr));
    expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
      projectLocation: location,
      branch: "feat-a",
    });
    // `refreshSinglePr` derives the details cache key from the discovered PR.
    await vi.waitFor(() => expect(useGitStore.getState().prDetails["p1#77"]).toEqual(baseDetails));
    expect(ghGetPrDetailsMock).toHaveBeenCalledWith({ projectLocation: location, prNumber: 77 });
  });

  it("polls a pushed open PR for fresh checks", async () => {
    vi.useFakeTimers();
    useGitStore.getState().setPrData("/wt/a", basePr);
    ghGetPrForBranchMock.mockResolvedValue({
      ...basePr,
      checksStatus: "PENDING",
      updatedAt: "2026-04-04T00:00:30.000Z",
    });
    ghGetPrDetailsMock.mockResolvedValue({ details: baseDetails });
    ghListPrsMock.mockResolvedValue({ prs: {} });
    const branchPolls = () =>
      ghGetPrForBranchMock.mock.calls.filter(([payload]) => payload.branch === "feat-a").length;

    refreshPrAfterForgeActivity({ projectId: "p1", worktreePath: "/wt/a", action: "push" });
    await vi.advanceTimersByTimeAsync(0);
    expect(branchPolls()).toBe(1);

    await vi.advanceTimersByTimeAsync(PR_POST_PUSH_STATUS_POLL_MS);
    expect(branchPolls()).toBe(2);
  });

  it("coalesces a burst into at most one follow-up refresh", async () => {
    ghGetPrForBranchMock.mockResolvedValue(null);
    ghListPrsMock.mockResolvedValue({ prs: {} });
    const branchPolls = () =>
      ghGetPrForBranchMock.mock.calls.filter(([payload]) => payload.branch === "feat-a").length;

    // Reconnect replay can deliver several frames for the same checkout.
    refreshPrAfterForgeActivity({ projectId: "p1", worktreePath: "/wt/a", action: "create" });
    refreshPrAfterForgeActivity({ projectId: "p1", worktreePath: "/wt/a", action: "create" });
    refreshPrAfterForgeActivity({ projectId: "p1", worktreePath: "/wt/a", action: "create" });

    await vi.waitFor(() => expect(ghListPrsMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ghListPrsMock).toHaveBeenCalledTimes(2);
    expect(branchPolls()).toBe(2);
  });

  it("bypasses the bulk branch-prefetch throttle for a repeat event", async () => {
    ghGetPrForBranchMock.mockResolvedValue(null);
    ghListPrsMock.mockResolvedValue({ prs: {} });

    refreshPrAfterForgeActivity({ projectId: "p1", worktreePath: "/wt/a", action: "create" });
    await vi.waitFor(() => expect(ghListPrsMock).toHaveBeenCalledTimes(1));
    // Let the first bulk prefetch finish and clear its in-flight marker.
    await new Promise((resolve) => setTimeout(resolve, 0));

    refreshPrAfterForgeActivity({ projectId: "p1", worktreePath: "/wt/a", action: "create" });
    await vi.waitFor(() => expect(ghListPrsMock).toHaveBeenCalledTimes(2));
  });

  it("does nothing for the Home project", async () => {
    refreshPrAfterForgeActivity({
      projectId: HOME_PROJECT_ID,
      worktreePath: "/wt/a",
      action: "push",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ghGetPrForBranchMock).not.toHaveBeenCalled();
    expect(ghListPrsMock).not.toHaveBeenCalled();
  });
});
