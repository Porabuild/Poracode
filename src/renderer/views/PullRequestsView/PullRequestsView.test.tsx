// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
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
}));
const layout = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => layout.compact }));

import { PullRequestsView } from "./PullRequestsView";

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

describe("PullRequestsView", () => {
  beforeEach(() => {
    layout.compact = false;
    bridge.ghListPullRequests
      .mockReset()
      .mockResolvedValue({ pullRequests: [summary], viewerLogin: "reviewer" });
    useAppStore.setState({ projects: [project] });
    useGitStore.setState({ statuses: {}, worktrees: {}, prData: {} });
    usePanelStore.setState({ prReviewContext: null, pullRequestsOverlayOpen: false });
  });

  it("is the review list with a title, and selecting a review opens it in the overlay", async () => {
    render(<PullRequestsView />);

    expect(screen.getByRole("heading", { name: "Pull requests" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));

    expect(usePanelStore.getState().prReviewContext).toMatchObject({
      projectId: project.id,
      prNumber: 42,
    });
  });

  it("drops its own title in the compact layout, where the page header names it", async () => {
    layout.compact = true;
    render(<PullRequestsView />);

    await screen.findByRole("button", { name: /Fix the pixel renderer/ });
    expect(screen.queryByRole("heading", { name: "Pull requests" })).not.toBeInTheDocument();
  });

  it("shows exactly one bottom row with the machine picker in the compact layout", async () => {
    layout.compact = true;
    useAppStore.setState({ projects: [remoteProject] });
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
    render(
      <PullRequestsView
        remoteDesktopId="desktop-1"
        onRemoteDesktopChange={vi.fn<(desktopId: string | null) => void>()}
      />,
    );

    await screen.findByRole("button", { name: /Fix the pixel renderer/ });
    expect(screen.getAllByRole("button", { name: "Connections" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Filter and sort" })).toBeInTheDocument();
    expect(document.querySelectorAll(".m-utility-floating-actions")).toHaveLength(1);
  });

  it("has no bottom row on the desktop route", async () => {
    render(<PullRequestsView />);

    await screen.findByRole("button", { name: /Fix the pixel renderer/ });
    expect(document.querySelector(".m-utility-floating-actions")).toBeNull();
  });
});
