// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GhListPullRequestsPayload,
  GhListPullRequestsResult,
  GitStatusResult,
  Project,
  PullRequestSummary,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";

const bridge = vi.hoisted(() => ({
  ghListPullRequests:
    vi.fn<(payload: GhListPullRequestsPayload) => Promise<GhListPullRequestsResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

import { PullRequestsView } from "./PullRequestsView";

const windowsProject: Project = {
  id: "windows-project",
  name: "Windows app",
  location: { kind: "windows", path: "E:\\work\\windows-app" },
  createdAt: "2026-07-13T10:00:00.000Z",
};

const wslProject: Project = {
  id: "wsl-project",
  name: "WSL app",
  location: {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/work/wsl-app",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\work\\wsl-app",
  },
  createdAt: "2026-07-13T10:00:00.000Z",
};

function makeStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
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
    ...overrides,
  };
}

const summary: PullRequestSummary = {
  pr: {
    number: 42,
    state: "open",
    title: "Fix the pixel renderer",
    url: "https://github.com/example/windows-app/pull/42",
    baseBranch: "main",
    isDraft: false,
    viewerDidAuthor: false,
    updatedAt: "2026-07-13T11:00:00.000Z",
  },
  headBranch: "fix/pixels",
  author: { login: "reviewer" },
  additions: 12,
  deletions: 3,
  repository: "example/windows-app",
  reviewRequested: true,
};

describe("PullRequestsView", () => {
  beforeEach(() => {
    bridge.ghListPullRequests.mockReset().mockImplementation(async ({ projectLocation }) => {
      if (projectLocation.kind === "wsl") {
        throw new Error("WSL GitHub account unavailable");
      }
      return { pullRequests: [summary], viewerLogin: "reviewer" };
    });
    useAppStore.setState({ projects: [windowsProject, wslProject] });
    useGitStore.setState({ statuses: {}, worktrees: {}, prData: {} });
    usePanelStore.setState({ prReviewContext: null });
  });

  it("loads every project location independently and keeps successful rows visible", async () => {
    render(<PullRequestsView />);

    const row = await screen.findByRole("button", { name: new RegExp(summary.pr.title) });
    expect(within(row).getByText(summary.headBranch)).toBeInTheDocument();
    expect(within(row).getByText(summary.pr.baseBranch)).toBeInTheDocument();
    expect(screen.getByText("Could not load pull requests for WSL app.")).toBeInTheDocument();
    expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(2);
    expect(bridge.ghListPullRequests).toHaveBeenCalledWith({
      projectLocation: windowsProject.location,
    });
    expect(bridge.ghListPullRequests).toHaveBeenCalledWith({
      projectLocation: wslProject.location,
    });

    fireEvent.click(row);

    const prKey = buildBranchNamePrKey(windowsProject.id, summary.headBranch);
    expect(useGitStore.getState().prData[prKey]).toEqual(summary.pr);
    expect(usePanelStore.getState().prReviewContext).toEqual({
      projectId: windowsProject.id,
      prNumber: summary.pr.number,
      prKey,
      skipLocalSync: true,
    });

    act(() => usePanelStore.getState().setPrReviewContext(null));
    await waitFor(() => expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(4));
  });

  it("queries only the local checkout when a mirrored project shares its origin", async () => {
    const mirroredProject: Project = {
      id: "mirrored-project",
      name: "Mac app",
      location: { kind: "posix", path: "/Users/leon/work/windows-app", remoteServerId: "mac" },
      remoteServerId: "mac",
      remoteId: "remote-1",
      createdAt: "2026-07-13T10:00:00.000Z",
    };
    const remoteInfo = {
      url: "https://github.com/example/windows-app.git",
      platform: "github" as const,
      owner: "example",
      repo: "windows-app",
    };
    useAppStore.setState({ projects: [mirroredProject, windowsProject] });
    useGitStore.setState({
      statuses: {
        [windowsProject.id]: makeStatus({ remoteInfo }),
        // The same repo over an SSH host alias, so the URL and platform differ.
        [mirroredProject.id]: makeStatus({
          remoteInfo: { ...remoteInfo, url: "gh:example/windows-app.git", platform: "unknown" },
        }),
      },
    });

    render(<PullRequestsView />);

    expect(await screen.findByText(summary.pr.title)).toBeInTheDocument();
    expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(1);
    expect(bridge.ghListPullRequests).toHaveBeenCalledWith({
      projectLocation: windowsProject.location,
    });

    fireEvent.click(screen.getByRole("button", { name: "Filter pull requests" }));
    expect(screen.getByRole("checkbox", { name: windowsProject.name })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: mirroredProject.name })).not.toBeInTheDocument();
  });

  it("shows a successful project while another project is still loading", async () => {
    let resolveWsl!: (value: GhListPullRequestsResult) => void;
    const pendingWsl = new Promise<GhListPullRequestsResult>((resolve) => {
      resolveWsl = resolve;
    });
    bridge.ghListPullRequests.mockImplementation(({ projectLocation }) =>
      projectLocation.kind === "wsl"
        ? pendingWsl
        : Promise.resolve({ pullRequests: [summary], viewerLogin: "reviewer" }),
    );

    render(<PullRequestsView />);

    expect(await screen.findByText(summary.pr.title)).toBeInTheDocument();
    expect(
      screen.getByText("Review and track work across your GitHub accounts."),
    ).toBeInTheDocument();
    await act(async () => {
      resolveWsl({ pullRequests: [], viewerLogin: "wsl-reviewer" });
      await pendingWsl;
    });
    expect(
      screen.getByText("Review and track work across your GitHub accounts."),
    ).toBeInTheDocument();
  });

  it("shows a blocked danger status when approval is required despite green checks", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    bridge.ghListPullRequests.mockResolvedValue({
      pullRequests: [
        {
          ...summary,
          pr: {
            ...summary.pr,
            checksStatus: "SUCCESS",
            reviewDecision: "REVIEW_REQUIRED",
          },
        },
      ],
      viewerLogin: "reviewer",
    });

    render(<PullRequestsView />);

    const row = await screen.findByRole("button", { name: new RegExp(summary.pr.title) });
    expect(within(row).getByText("Merging is blocked")).toBeInTheDocument();
    expect(row.querySelector(".lucide-git-pull-request")).toHaveClass("text-danger");
    expect(row.querySelector(".rounded-full")).toHaveClass("bg-danger");
  });

  it("shows pending checks when GitHub blocks a PR while CI is running", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    bridge.ghListPullRequests.mockResolvedValue({
      pullRequests: [
        {
          ...summary,
          pr: {
            ...summary.pr,
            checksStatus: "PENDING",
            mergeable: "MERGEABLE",
            mergeStateStatus: "BLOCKED",
          },
        },
      ],
      viewerLogin: "reviewer",
    });

    render(<PullRequestsView />);

    const row = await screen.findByRole("button", { name: new RegExp(summary.pr.title) });
    expect(within(row).getByText("Checks pending")).toBeInTheDocument();
    expect(row.querySelector(".lucide-git-pull-request")).toHaveClass("text-warning");
    expect(row.querySelector(".rounded-full")).toHaveClass("bg-warning");
  });

  it("refreshes every project on demand", async () => {
    render(<PullRequestsView />);

    expect(await screen.findByText(summary.pr.title)).toBeInTheDocument();
    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    await waitFor(() => expect(refreshButton).toBeEnabled());

    fireEvent.click(refreshButton);

    await waitFor(() => expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(4));
  });

  it("opens a matching worktree without pulling local changes", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    useGitStore.setState({
      worktrees: {
        [windowsProject.id]: [
          {
            path: "E:\\work\\windows-app-fix-pixels",
            branch: summary.headBranch,
            commit: "abc123",
            isMain: false,
          },
        ],
      },
    });

    render(<PullRequestsView />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(summary.pr.title) }));

    await waitFor(() =>
      expect(usePanelStore.getState().prReviewContext).toEqual({
        projectId: windowsProject.id,
        worktreePath: "E:\\work\\windows-app-fix-pixels",
        prNumber: summary.pr.number,
        prKey: buildBranchNamePrKey(windowsProject.id, summary.headBranch),
        skipLocalSync: true,
      }),
    );
  });

  it("filters rows by relationship and search text", async () => {
    const authoredSummary: PullRequestSummary = {
      ...summary,
      pr: {
        ...summary.pr,
        number: 43,
        title: "Authored dashboard change",
        viewerDidAuthor: true,
      },
      headBranch: "feature/dashboard",
      author: { login: "reviewer" },
      reviewRequested: false,
    };
    const otherSummary: PullRequestSummary = {
      ...summary,
      pr: {
        ...summary.pr,
        number: 44,
        title: "Dependency update",
      },
      headBranch: "deps/update",
      author: { login: "dependabot" },
      reviewRequested: false,
    };
    useAppStore.setState({ projects: [windowsProject] });
    bridge.ghListPullRequests.mockResolvedValue({
      pullRequests: [summary, authoredSummary, otherSummary],
      viewerLogin: "reviewer",
    });

    render(<PullRequestsView />);
    expect(await screen.findByText(authoredSummary.pr.title)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Authored" }));
    expect(screen.getByText(authoredSummary.pr.title)).toBeInTheDocument();
    expect(screen.queryByText(summary.pr.title)).not.toBeInTheDocument();
    expect(screen.queryByText(otherSummary.pr.title)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search pull requests" }), {
      target: { value: "deps/update" },
    });
    expect(screen.getByText(otherSummary.pr.title)).toBeInTheDocument();
    expect(screen.queryByText(authoredSummary.pr.title)).not.toBeInTheDocument();
    expect(screen.queryByText(summary.pr.title)).not.toBeInTheDocument();
  });

  it("filters rows by the active account", async () => {
    useAppStore.setState({ projects: [windowsProject] });

    render(<PullRequestsView />);
    expect(await screen.findByText(summary.pr.title)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filter pull requests" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "reviewer" }));

    expect(screen.queryByText(summary.pr.title)).not.toBeInTheDocument();
    expect(screen.getByText("No matching pull requests.")).toBeInTheDocument();
  });

  it("orders pull requests from different projects by most recent update", async () => {
    const newerWslSummary: PullRequestSummary = {
      ...summary,
      pr: {
        ...summary.pr,
        number: 99,
        title: "Newer WSL pull request",
        updatedAt: "2026-07-13T12:00:00.000Z",
      },
      repository: "example/wsl-app",
    };
    bridge.ghListPullRequests.mockImplementation(async ({ projectLocation }) =>
      projectLocation.kind === "wsl"
        ? { pullRequests: [newerWslSummary], viewerLogin: "wsl-reviewer" }
        : { pullRequests: [summary], viewerLogin: "reviewer" },
    );

    render(<PullRequestsView />);
    expect(await screen.findByText(newerWslSummary.pr.title)).toBeInTheDocument();

    const rowTitles = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => text.includes(newerWslSummary.pr.title) || text.includes(summary.pr.title))
      .map((text) =>
        text.includes(newerWslSummary.pr.title) ? newerWslSummary.pr.title : summary.pr.title,
      );
    expect(rowTitles).toEqual([newerWslSummary.pr.title, summary.pr.title]);
  });
});
