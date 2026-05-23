import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrData, PrDetails, ProjectLocation } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import { PR_PENDING_REFRESH_INTERVAL_MS, usePendingPrRefresh } from "./usePendingPrRefresh";

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

describe("usePendingPrRefresh", () => {
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refetches pending PR status immediately, then every 30 seconds until it leaves pending", async () => {
    useGitStore.getState().setPrData("pr-key", basePr);
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

    renderHook(() =>
      usePendingPrRefresh({
        prKey: "pr-key",
        projectLocation: location,
        branch: "feature/pr-checks",
        cacheKey: "p1#42",
      }),
    );

    await act(async () => {});

    expect(ghGetPrForBranchMock).toHaveBeenCalledTimes(1);
    expect(ghGetPrForBranchMock).toHaveBeenLastCalledWith({
      projectLocation: location,
      branch: "feature/pr-checks",
    });
    expect(ghGetPrDetailsMock).toHaveBeenCalledTimes(1);
    expect(useGitStore.getState().prData["pr-key"]?.checksStatus).toBe("PENDING");

    ghGetPrForBranchMock.mockClear();
    ghGetPrDetailsMock.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PR_PENDING_REFRESH_INTERVAL_MS);
    });

    expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
      projectLocation: location,
      branch: "feature/pr-checks",
    });
    expect(ghGetPrDetailsMock).toHaveBeenCalledWith({ projectLocation: location, prNumber: 42 });
    expect(useGitStore.getState().prData["pr-key"]?.checksStatus).toBe("SUCCESS");
    expect(useGitStore.getState().prDetails["p1#42"]?.checks[0]?.conclusion).toBe("SUCCESS");

    ghGetPrForBranchMock.mockClear();
    ghGetPrDetailsMock.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PR_PENDING_REFRESH_INTERVAL_MS);
    });

    expect(ghGetPrForBranchMock).not.toHaveBeenCalled();
    expect(ghGetPrDetailsMock).not.toHaveBeenCalled();
  });
});
