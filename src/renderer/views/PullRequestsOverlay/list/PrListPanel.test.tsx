// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ForgeListPullRequestsInStatePayload,
  GhListPullRequestsPayload,
  GhListPullRequestsResult,
  Project,
  PullRequestSummary,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

const bridge = vi.hoisted(() => ({
  ghListPullRequests:
    vi.fn<(payload: GhListPullRequestsPayload) => Promise<GhListPullRequestsResult>>(),
  forgeListPullRequestsInState:
    vi.fn<(payload: ForgeListPullRequestsInStatePayload) => Promise<GhListPullRequestsResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

import { openPullRequestEntry } from "./openPullRequestEntry";
import { PrListPanel } from "./PrListPanel";

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
    checksStatus: "SUCCESS",
  },
  headBranch: "fix/pixels",
  author: { login: "reviewer" },
  additions: 12,
  deletions: 3,
  repository: "example/windows-app",
  reviewRequested: true,
  labels: [{ name: "bug", color: "d73a4a" }],
};

function renderPanel(selectedKey: string | null = null) {
  return render(<PrListPanel selectedKey={selectedKey} onOpen={openPullRequestEntry} />);
}

describe("PrListPanel", () => {
  beforeEach(() => {
    bridge.ghListPullRequests.mockReset().mockImplementation(async ({ projectLocation }) => {
      if (projectLocation.kind === "wsl") throw new Error("WSL GitHub account unavailable");
      return { pullRequests: [summary], viewerLogin: "reviewer" };
    });
    bridge.forgeListPullRequestsInState
      .mockReset()
      .mockResolvedValue({ pullRequests: [], viewerLogin: "reviewer" });
    useAppStore.setState({ projects: [windowsProject, wslProject] });
    useGitStore.setState({ statuses: {}, worktrees: {}, prData: {} });
    useRemoteServersStore.setState({ runtime: {} });
    usePanelStore.setState({ prReviewContext: null, pullRequestsOverlayOpen: false });
  });

  it("loads each project independently and keeps successful rows visible", async () => {
    renderPanel();

    const row = await screen.findByRole("button", { name: /Fix the pixel renderer/ });
    expect(row).toHaveTextContent("#42");
    expect(within(row).getByText("reviewer")).toBeInTheDocument();
    expect(within(row).getByText("bug")).toBeInTheDocument();
    expect(within(row).getByLabelText("Checks passed")).toBeInTheDocument();
    expect(within(row).getByLabelText("Your review is requested")).toBeInTheDocument();
    expect(within(row).getByLabelText("12 additions and 3 deletions")).toBeInTheDocument();
    expect(
      await screen.findByText("Could not load pull requests for WSL app."),
    ).toBeInTheDocument();
    expect(bridge.ghListPullRequests).toHaveBeenCalledWith({
      projectLocation: windowsProject.location,
    });
    expect(bridge.ghListPullRequests).toHaveBeenCalledWith({
      projectLocation: wslProject.location,
    });
  });

  it("selecting a row seeds the review and opens it without pulling local changes", async () => {
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
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));

    const prKey = buildBranchNamePrKey(windowsProject.id, summary.headBranch);
    expect(useGitStore.getState().prData[prKey]).toEqual(summary.pr);
    expect(usePanelStore.getState().prReviewContext).toEqual({
      projectId: windowsProject.id,
      worktreePath: "E:\\work\\windows-app-fix-pixels",
      prNumber: summary.pr.number,
      prKey,
      skipLocalSync: true,
    });
  });

  it("marks the selected row", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    const { rerender } = renderPanel();
    const row = await screen.findByRole("button", { name: /Fix the pixel renderer/ });
    expect(row).not.toHaveAttribute("aria-current");

    // Rows without a host identity key on the project and number.
    rerender(
      <PrListPanel selectedKey="project:windows-project#42" onOpen={openPullRequestEntry} />,
    );
    expect(screen.getByRole("button", { name: /Fix the pixel renderer/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("hides the repeated title and shows the filter summary above search", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    render(<PrListPanel hideTitle selectedKey={null} onOpen={openPullRequestEntry} />);

    await screen.findByRole("button", { name: /Fix the pixel renderer/ });
    expect(screen.queryByRole("heading", { name: "Pull requests" })).not.toBeInTheDocument();
    const search = screen.getByRole("textbox", { name: "Search or paste a pull request link" });
    const filter = screen.getByRole("button", { name: "Open pull requests" });
    expect(search).toBeVisible();
    expect(filter).toBeVisible();
    expect(filter.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "More pull request actions" }),
    ).not.toBeInTheDocument();
  });

  it("filters by search text and by label qualifier", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    const other: PullRequestSummary = {
      ...summary,
      pr: { ...summary.pr, number: 43, title: "Authored dashboard change" },
      headBranch: "feature/dashboard",
      labels: [{ name: "feature" }],
    };
    bridge.ghListPullRequests.mockResolvedValue({
      pullRequests: [summary, other],
      viewerLogin: "reviewer",
    });
    renderPanel();
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    const search = screen.getByRole("textbox", { name: "Search or paste a pull request link" });
    fireEvent.change(search, { target: { value: "dashboard" } });
    expect(
      screen.queryByRole("button", { name: /Fix the pixel renderer/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Authored dashboard change/ })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "label:bug" } });
    expect(screen.getByRole("button", { name: /Fix the pixel renderer/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Authored dashboard change/ }),
    ).not.toBeInTheDocument();
  });

  it("opens a pasted review link that is in the list, and says so when it is not", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    renderPanel();
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });
    const search = screen.getByRole("textbox", { name: "Search or paste a pull request link" });

    fireEvent.change(search, {
      target: { value: "https://github.com/example/windows-app/pull/99" },
    });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(await screen.findByText(/not in this list/)).toBeInTheDocument();
    expect(usePanelStore.getState().prReviewContext).toBeNull();

    fireEvent.change(search, { target: { value: summary.pr.url } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(usePanelStore.getState().prReviewContext?.prNumber).toBe(42));
  });

  it("reads closed reviews through the state-aware procedure", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    renderPanel();
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    fireEvent.click(screen.getByRole("button", { name: "Open pull requests" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Closed" }));

    await waitFor(() =>
      expect(bridge.forgeListPullRequestsInState).toHaveBeenCalledWith({
        projectLocation: windowsProject.location,
        state: "closed",
      }),
    );
  });

  it("lists each filter section's own options, even when sections share option names", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    renderPanel();
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    fireEvent.click(screen.getByRole("button", { name: "Open pull requests" }));
    await screen.findByRole("menuitemradio", { name: "Closed" });

    // State, drafts, review and checks each offer "All"; they must stay separate rows.
    expect(screen.getAllByRole("menuitemradio", { name: "All" })).toHaveLength(4);
    for (const name of ["Drafts only", "Hide drafts", "Approved", "Changes requested", "Passing"]) {
      expect(screen.getByRole("menuitemradio", { name })).toBeTruthy();
    }
    // Choosing a draft option changes only the drafts section.
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Drafts only" }));
    await screen.findByRole("button", { name: "Open pull requests · 1 filter" });
  });

  it("summarizes the state and clears state and facet filters", async () => {
    useAppStore.setState({ projects: [windowsProject] });
    renderPanel();
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    fireEvent.click(screen.getByRole("button", { name: "Open pull requests" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Merged" }));
    expect(
      await screen.findByRole("button", { name: "Merged pull requests · 1 filter" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Merged pull requests · 1 filter" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Drafts only" }));
    expect(
      await screen.findByRole("button", { name: "Merged pull requests · 2 filters" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Merged pull requests · 2 filters" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Clear filters" }));
    expect(await screen.findByRole("button", { name: "Open pull requests" })).toBeInTheDocument();
  });

  it("queries only projects owned by the selected remote desktop", async () => {
    const remoteProject: Project = {
      id: "remote-project",
      name: "Mac app",
      location: { kind: "posix", path: "/work/mac-app", remoteServerId: "mac" },
      remoteServerId: "mac",
      remoteId: "remote-1",
      createdAt: "2026-07-13T10:00:00.000Z",
    };
    useAppStore.setState({ projects: [windowsProject, remoteProject] });
    useRemoteServersStore.setState({
      runtime: { mac: { status: "online", projects: [], threads: [] } },
    });
    render(<PrListPanel remoteDesktopId="mac" selectedKey={null} onOpen={openPullRequestEntry} />);

    await screen.findByRole("button", { name: /Fix the pixel renderer/ });
    expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(1);
    expect(bridge.ghListPullRequests).toHaveBeenCalledWith({
      projectLocation: remoteProject.location,
    });
  });
});
