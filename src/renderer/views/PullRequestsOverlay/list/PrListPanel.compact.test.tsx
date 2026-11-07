// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ForgeListPullRequestsInStatePayload,
  GhListPullRequestsPayload,
  GhListPullRequestsResult,
  Project,
  PullRequestSummary,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
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
const layout = vi.hoisted(() => ({ compact: true }));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => layout.compact }));

import { openPullRequestEntry } from "./openPullRequestEntry";
import { PrListPanel } from "./PrListPanel";

const project: Project = {
  id: "windows-project",
  name: "Windows app",
  location: { kind: "windows", path: "E:\\work\\windows-app" },
  createdAt: "2026-07-13T10:00:00.000Z",
};

const remoteProject: Project = {
  id: "remote-project",
  name: "Mac app",
  location: { kind: "posix", path: "/work/mac-app", remoteServerId: "desktop-1" },
  remoteServerId: "desktop-1",
  remoteId: "remote-1",
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
  },
  headBranch: "fix/pixels",
  author: { login: "reviewer" },
  additions: 12,
  deletions: 3,
  repository: "example/windows-app",
  reviewRequested: true,
};

describe("PrListPanel in the compact layout", () => {
  beforeEach(() => {
    layout.compact = true;
    bridge.ghListPullRequests
      .mockReset()
      .mockResolvedValue({ pullRequests: [summary], viewerLogin: "reviewer" });
    bridge.forgeListPullRequestsInState
      .mockReset()
      .mockResolvedValue({ pullRequests: [], viewerLogin: "reviewer" });
    useAppStore.setState({ projects: [project] });
    useGitStore.setState({ statuses: {}, worktrees: {}, prData: {} });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Studio",
          endpoint: "https://desktop.example.test",
          accessToken: "token",
          scopes: ["projects:manage"],
        },
      ],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    });
    usePanelStore.setState({ prReviewContext: null, pullRequestsOverlayOpen: false });
  });

  it("has no header row of sort, filter and more buttons, only the bottom row", async () => {
    render(<PrListPanel selectedKey={null} onOpen={openPullRequestEntry} />);
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    for (const name of [
      "Sort pull requests",
      "Filter pull requests",
      "More pull request actions",
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Filter and sort" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Search or paste a pull request link" }),
    ).toHaveClass("h-10");
    expect(screen.getByRole("button", { name: /Needs my review/ })).toHaveClass("min-h-9");
  });

  it("puts the machine picker between filter and refresh when the host supplies a machine", async () => {
    useAppStore.setState({ projects: [remoteProject] });
    render(
      <PrListPanel
        remoteDesktopId="desktop-1"
        onRemoteDesktopChange={vi.fn<(desktopId: string | null) => void>()}
        selectedKey={null}
        onOpen={openPullRequestEntry}
      />,
    );
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    const picker = screen.getByRole("button", { name: "Connections" });
    expect(picker).toHaveTextContent("Studio");
    expect(picker).toHaveClass("m-floating-selector");
    const bar = picker.parentElement!;
    expect(bar).toHaveClass("m-utility-floating-actions--with-selector");
    expect(bar.children).toHaveLength(3);
    expect(bar.children[0]).toContainElement(
      screen.getByRole("button", { name: "Filter and sort" }),
    );
    expect(bar.children[2]).toContainElement(screen.getByRole("button", { name: "Refresh" }));
  });

  it("renders the same row without a picker when no machine is supplied", async () => {
    render(<PrListPanel selectedKey={null} onOpen={openPullRequestEntry} />);
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    expect(screen.queryByRole("button", { name: "Connections" })).not.toBeInTheDocument();
    const bar = screen
      .getByRole("button", { name: "Refresh" })
      .closest(".m-utility-floating-actions");
    expect(bar).not.toBeNull();
    expect(bar).not.toHaveClass("m-utility-floating-actions--with-selector");
  });

  it("keeps every sort and filter function in the one menu", async () => {
    render(<PrListPanel selectedKey={null} onOpen={openPullRequestEntry} />);
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    fireEvent.click(screen.getByRole("button", { name: "Filter and sort" }));
    await screen.findByRole("button", { name: "Recently updated" });
    for (const name of [
      "Largest",
      "Smallest",
      "Merge readiness",
      "Closed",
      "Drafts only",
      "Approved",
      "Passing",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    // Nothing is filtered yet, so there is nothing to clear.
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();
    // It is the app's bottom sheet, not a popover.
    expect(document.querySelector(".m-sheet")).not.toBeNull();
    expect(document.querySelector("[data-trigger]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    await waitFor(() =>
      expect(bridge.forgeListPullRequestsInState).toHaveBeenCalledWith({
        projectLocation: project.location,
        state: "closed",
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Filter and sort (1 active)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("button", { name: "Filter and sort" })).toBeInTheDocument();
  });

  it("refreshes from the bottom row", async () => {
    render(<PrListPanel selectedKey={null} onOpen={openPullRequestEntry} />);
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });
    expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(2));
  });

  it("leaves header actions to PageLayout on wide layouts", async () => {
    layout.compact = false;
    render(<PrListPanel selectedKey={null} onOpen={openPullRequestEntry} />);
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    expect(screen.getByRole("heading", { name: "Pull requests" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open pull requests" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sort pull requests" })).not.toBeInTheDocument();
  });
});
