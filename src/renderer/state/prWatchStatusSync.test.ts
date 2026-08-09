import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, PrData, PrDetails, Thread } from "@/shared/contracts";
import type { PrWatchStatusEvent } from "@/shared/ipc";
import { useAppStore } from "./appStore";
import { buildBranchNamePrKey, buildBranchPrKey } from "./gitSelectors";
import { useGitStore } from "./gitStore";
import { startPrWatchStatusSync } from "./prWatchStatusSync";

let statusListener: ((event: PrWatchStatusEvent) => void) | undefined;
const syncMergedPrBaseMock = vi.hoisted(() =>
  vi.fn<(projectId: string, pr: PrData) => Promise<void>>(),
);

vi.mock("./prMergeBaseSync", () => ({
  syncMergedPrBase: (projectId: string, pr: PrData) => syncMergedPrBaseMock(projectId, pr),
}));

const openPr: PrData = {
  number: 7,
  state: "open",
  title: "Land the thing",
  url: "https://github.com/owner/repo/pull/7",
  baseBranch: "main",
  isDraft: false,
  checksStatus: "SUCCESS",
  updatedAt: "2026-07-20T00:00:00.000Z",
};
const mergedPr: PrData = { ...openPr, state: "merged" };

const details: PrDetails = {
  number: 7,
  title: openPr.title,
  body: "",
  baseBranch: "main",
  headBranch: "feature/wt",
  additions: 202,
  deletions: 5,
  changedFiles: 8,
  commits: [],
  comments: [],
  reviews: [],
  checks: [],
};

const thread: Thread = {
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
  prNumber: 7,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};

function statusEvent(overrides: Partial<PrWatchStatusEvent> = {}): PrWatchStatusEvent {
  return {
    projectId: "p1",
    prNumber: 7,
    headBranch: "feature/wt",
    pr: mergedPr,
    details,
    ...overrides,
  };
}

function gitStatus(branch: string): GitStatusResult {
  return {
    isRepo: true,
    branch,
    tracking: `origin/${branch}`,
    hasRemote: true,
    remoteInfo: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
  };
}

let stop: () => void = () => {};

describe("prWatchStatusSync", () => {
  beforeEach(() => {
    syncMergedPrBaseMock.mockReset();
    syncMergedPrBaseMock.mockResolvedValue(undefined);
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        platform: "darwin",
        onPrWatchStatus: vi.fn<(listener: (event: PrWatchStatusEvent) => void) => () => void>(
          (listener) => {
            statusListener = listener;
            return () => {
              statusListener = undefined;
            };
          },
        ),
        dbSetState: vi
          .fn<(key: string, value: string) => Promise<void>>()
          .mockResolvedValue(undefined),
      },
    });
    useGitStore.setState({ prData: {}, prDetails: {}, statuses: {} });
    useAppStore.setState({ threads: [thread], view: { kind: "home" } });
    stop = startPrWatchStatusSync();
  });

  afterEach(() => {
    stop();
  });

  it("flips a stale open snapshot to the observed merged state", () => {
    useGitStore.getState().setPrData("/repo-wt", openPr);

    statusListener?.(statusEvent({ worktreePath: "/repo-wt" }));

    const state = useGitStore.getState();
    expect(state.prData["/repo-wt"]?.state).toBe("merged");
    expect(state.prData[buildBranchNamePrKey("p1", "feature/wt")]?.state).toBe("merged");
    expect(state.prDetails["p1#7"]).toEqual(details);
  });

  it("updates a terminal summary without replacing cached details", () => {
    useGitStore.getState().setPrDetails("p1#7", details);

    statusListener?.({
      projectId: "p1",
      prNumber: 7,
      headBranch: "feature/wt",
      pr: mergedPr,
    });

    const state = useGitStore.getState();
    expect(state.prData[buildBranchNamePrKey("p1", "feature/wt")]?.state).toBe("merged");
    expect(state.prDetails["p1#7"]).toEqual(details);
    expect(syncMergedPrBaseMock).toHaveBeenCalledWith("p1", mergedPr);
  });

  it("reaches worktree threads on the head branch when the watch has no worktree path", () => {
    useGitStore.getState().setPrData("/repo-wt", openPr);

    statusListener?.(statusEvent());

    expect(useGitStore.getState().prData["/repo-wt"]?.state).toBe("merged");
  });

  it("updates the project row when the head branch is checked out", () => {
    useGitStore.getState().setStatus("p1", gitStatus("feature/wt"));

    statusListener?.(statusEvent());

    expect(useGitStore.getState().prData[buildBranchPrKey("p1")]?.state).toBe("merged");
  });

  it("leaves the project row alone on another branch", () => {
    useGitStore.getState().setStatus("p1", gitStatus("master"));

    statusListener?.(statusEvent());

    expect(useGitStore.getState().prData[buildBranchPrKey("p1")]).toBeUndefined();
  });

  it("keeps a newer PR cached for the same worktree", () => {
    const followUpPr: PrData = { ...openPr, number: 9 };
    useGitStore.getState().setPrData("/repo-wt", followUpPr);

    statusListener?.(statusEvent({ worktreePath: "/repo-wt" }));

    expect(useGitStore.getState().prData["/repo-wt"]).toEqual(followUpPr);
  });
});
