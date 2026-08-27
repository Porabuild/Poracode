// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { GitStatusResult, PrDetails, Project, ProjectLocation } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import { PrContextProvider, type PrContextValue } from "./prContext";
import { PrOverviewPage } from "./PrOverviewPage";

const popoverMock = vi.hoisted(() => ({
  submitReview:
    vi.fn<
      (props: {
        projectLocation: ProjectLocation;
        prNumber: number;
        hidden?: boolean;
        triggerPresentation?: "compact" | "touch";
        onSubmitted: () => void;
      }) => void
    >(),
}));
const prWatchControlsMock = vi.hoisted(() => vi.fn<(props: unknown) => void>());

const bridgeMock = vi.hoisted(() => ({
  ghMergePr: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getGitStatus: vi.fn<() => Promise<GitStatusResult>>(),
  gitPull: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  openExternal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@/renderer/views/PrReviewOverlay/parts/SubmitReviewPopover", () => ({
  SubmitReviewPopover: (props: {
    projectLocation: ProjectLocation;
    prNumber: number;
    hidden?: boolean;
    triggerPresentation?: "compact" | "touch";
    onSubmitted: () => void;
  }) => {
    popoverMock.submitReview(props);
    return <button type="button">Submit review</button>;
  },
}));

vi.mock("@/renderer/views/PrReviewOverlay/parts/PrHeaderCard", () => ({
  PrHeaderCard: () => <div data-testid="pr-header-card" />,
}));

vi.mock("@/renderer/views/PrReviewOverlay/parts/PrMetaRow", () => ({
  PrMetaRow: () => <div data-testid="pr-meta-row" />,
}));

vi.mock("@/renderer/views/GitReviewOverlay/parts/GitReviewSidebar/parts/PrWatchControls", () => ({
  PrWatchControls: (props: unknown) => {
    prWatchControlsMock(props);
    return <button type="button">PR automation</button>;
  },
}));

vi.mock("@/renderer/hooks/usePrCombinedChecksStatus", () => ({
  usePrCombinedChecksStatus: () => undefined,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

const toastDangerSpy = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);

const projectLocation: ProjectLocation = { kind: "posix", path: "/repo" };
const project: Project = {
  id: "project-1",
  name: "Repo",
  location: projectLocation,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function renderOverview(overrides?: Partial<PrContextValue>) {
  const value: PrContextValue = {
    project,
    projectLocation,
    prNumber: 42,
    prKey: "project-1#42",
    cacheKey: "project-1#42",
    loading: false,
    reload: vi.fn<() => void>(),
    toOverview: vi.fn<() => void>(),
    toPage: vi.fn<() => void>(),
    close: vi.fn<() => void>(),
    ...overrides,
  };
  render(
    <PrContextProvider value={value}>
      <PrOverviewPage />
    </PrContextProvider>,
  );
  return value;
}

describe("PrOverviewPage", () => {
  beforeEach(() => {
    popoverMock.submitReview.mockClear();
    prWatchControlsMock.mockClear();
    bridgeMock.ghMergePr.mockClear();
    bridgeMock.getGitStatus.mockReset();
    bridgeMock.getGitStatus.mockResolvedValue({
      isRepo: true,
      branch: "main",
      tracking: "origin/main",
      hasRemote: true,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    });
    bridgeMock.gitPull.mockClear();
    bridgeMock.gitPull.mockResolvedValue(undefined);
    bridgeMock.openExternal.mockClear();
    bridgeMock.openExternal.mockResolvedValue(undefined);
    toastDangerSpy.mockClear();
    useGitStore.setState({
      prData: {},
      prFiles: {},
      prDetails: {},
      prDiffs: {},
    });
  });

  it("exposes submit review from the mobile PR overview", () => {
    const context = renderOverview();

    expect(screen.getByRole("button", { name: "Submit review" })).toBeInTheDocument();
    expect(popoverMock.submitReview).toHaveBeenCalledWith({
      projectLocation,
      prNumber: 42,
      hidden: false,
      triggerPresentation: "touch",
      onSubmitted: context.reload,
    });
  });

  it("exposes PR automation from the mobile PR overview", () => {
    const reload = vi.fn<() => void>();
    const details: PrDetails = {
      number: 42,
      title: "Ship mobile automation",
      body: "",
      baseBranch: "main",
      headBranch: "feature/mobile",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      mergedAt: null,
      mergedBy: null,
      closedAt: null,
      commits: [],
      comments: [],
      reviews: [],
      checks: [],
    };
    useGitStore.setState({
      prData: {
        "project-1#42": {
          number: 42,
          state: "open",
          title: details.title,
          url: "https://github.test/repo/pull/42",
          baseBranch: details.baseBranch,
          isDraft: false,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          viewerDidAuthor: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      prDetails: { "project-1#42": details },
    });

    renderOverview({ reload, worktreePath: "/repo/worktree" });

    expect(screen.getByRole("button", { name: "PR automation" })).toBeInTheDocument();
    expect(prWatchControlsMock).toHaveBeenCalledWith({
      projectId: project.id,
      prNumber: 42,
      headBranch: "feature/mobile",
      worktreePath: "/repo/worktree",
      onRefreshPr: reload,
    });
  });

  it("merges an open clean pull request from mobile", async () => {
    const reload = vi.fn<() => void>();
    useGitStore.setState({
      prData: {
        "project-1#42": {
          number: 42,
          state: "open",
          title: "Ship mobile review",
          url: "https://github.test/repo/pull/42",
          baseBranch: "main",
          isDraft: false,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          viewerDidAuthor: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    renderOverview({ reload });

    fireEvent.click(screen.getByRole("button", { name: /Merge PR: Squash/ }));

    await waitFor(() => {
      expect(bridgeMock.ghMergePr).toHaveBeenCalledWith({
        projectLocation,
        prNumber: 42,
        method: "squash",
        admin: false,
      });
    });
    expect(useGitStore.getState().prData["project-1#42"]?.state).toBe("merged");
    expect(bridgeMock.gitPull).toHaveBeenCalledWith({
      projectLocation,
      remote: "origin",
    });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("blocks merging when approval is required and merge-state data is missing", () => {
    useGitStore.setState({
      prData: {
        "project-1#42": {
          number: 42,
          state: "open",
          title: "Ship mobile review",
          url: "https://github.test/repo/pull/42",
          baseBranch: "main",
          isDraft: false,
          checksStatus: "SUCCESS",
          reviewDecision: "REVIEW_REQUIRED",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    renderOverview();

    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Merge PR: Squash/ })).not.toBeInTheDocument();
  });

  it("reports failed GitHub link opens from mobile", async () => {
    bridgeMock.openExternal.mockRejectedValueOnce(new Error("open failed"));
    useGitStore.setState({
      prData: {
        "project-1#42": {
          number: 42,
          state: "open",
          title: "Ship mobile review",
          url: "https://github.test/repo/pull/42",
          baseBranch: "main",
          isDraft: false,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          viewerDidAuthor: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    renderOverview();

    fireEvent.click(screen.getByRole("button", { name: "Open on GitHub" }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("open failed");
    });
    expect(bridgeMock.openExternal).toHaveBeenCalledWith("https://github.test/repo/pull/42");
  });

  it("uses an explicit branch PR key for mobile merge actions", async () => {
    const reload = vi.fn<() => void>();
    const branchPrKey = "__branchname:project-1:feature/mobile";
    useGitStore.setState({
      prData: {
        [branchPrKey]: {
          number: 42,
          state: "open",
          title: "Ship branch PR",
          url: "https://github.test/repo/pull/42",
          baseBranch: "main",
          isDraft: false,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          viewerDidAuthor: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    renderOverview({ prKey: branchPrKey, reload });

    fireEvent.click(screen.getByRole("button", { name: /Merge PR: Squash/ }));

    await waitFor(() => {
      expect(bridgeMock.ghMergePr).toHaveBeenCalledWith({
        projectLocation,
        prNumber: 42,
        method: "squash",
        admin: false,
      });
    });
    expect(useGitStore.getState().prData[branchPrKey]?.state).toBe("merged");
    expect(useGitStore.getState().prData["project-1#42"]).toBeUndefined();
    expect(reload).toHaveBeenCalledOnce();
  });
});
