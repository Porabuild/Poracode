// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GhGetPrDetailsPayload,
  GhGetPrDetailsResult,
  GhListPullRequestsResult,
  PrDetails,
  Project,
  PullRequestSummary,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";

const bridge = vi.hoisted(() => ({
  ghListPullRequests: vi.fn<() => Promise<GhListPullRequestsResult>>(),
  ghGetPrFiles: vi.fn<() => Promise<{ files: never[] }>>(),
  ghGetPrDiff: vi.fn<() => Promise<{ diff: string }>>(),
  ghGetPrDetails: vi.fn<(payload: GhGetPrDetailsPayload) => Promise<GhGetPrDetailsResult>>(),
  ghGetPrReviewComments: vi.fn<() => Promise<{ threads: never[] }>>(),
}));
const layout = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => bridge,
  isMac: () => false,
  isWindows: () => false,
  isRemoteSession: () => false,
}));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => layout.compact }));

import { PullRequestsOverlay } from "./PullRequestsOverlay";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/work/poracode" },
  createdAt: "2026-07-13T10:00:00.000Z",
};

const summary: PullRequestSummary = {
  pr: {
    number: 42,
    state: "open",
    title: "Fix the pixel renderer",
    url: "https://github.com/example/poracode/pull/42",
    baseBranch: "main",
    isDraft: false,
    viewerDidAuthor: false,
    updatedAt: "2026-07-13T11:00:00.000Z",
  },
  headBranch: "fix/pixels",
  author: { login: "reviewer" },
  additions: 12,
  deletions: 3,
  repository: "example/poracode",
  reviewRequested: false,
};

const details: PrDetails = {
  number: 42,
  title: "Fix the pixel renderer",
  body: "Renders pixels correctly.",
  author: { login: "reviewer" },
  baseBranch: "main",
  headBranch: "fix/pixels",
  additions: 12,
  deletions: 3,
  changedFiles: 2,
  commits: [],
  comments: [],
  reviews: [],
  checks: [],
};

describe("PullRequestsOverlay", () => {
  beforeEach(() => {
    layout.compact = false;
    bridge.ghListPullRequests
      .mockReset()
      .mockResolvedValue({ pullRequests: [summary], viewerLogin: "reviewer" });
    bridge.ghGetPrFiles.mockReset().mockResolvedValue({ files: [] });
    bridge.ghGetPrDiff.mockReset().mockResolvedValue({ diff: "" });
    bridge.ghGetPrDetails.mockReset().mockResolvedValue({ details, pr: summary.pr });
    bridge.ghGetPrReviewComments.mockReset().mockResolvedValue({ threads: [] });
    useAppStore.setState({ projects: [project] });
    useGitStore.setState({ statuses: {}, worktrees: {}, prData: {}, prDetails: {}, prFiles: {} });
    usePanelStore.setState({ prReviewContext: null, pullRequestsOverlayOpen: true });
  });

  it("opens on the list and asks for a selection", async () => {
    render(<PullRequestsOverlay onClose={() => {}} />);

    expect(await screen.findByText("Select a pull request")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Fix the pixel renderer/ }),
    ).toBeInTheDocument();
    expect(bridge.ghGetPrDetails).not.toHaveBeenCalled();
  });

  it("places list sorting and refresh in the desktop page header", async () => {
    render(<PullRequestsOverlay onClose={() => {}} />);
    await screen.findByRole("button", { name: /Fix the pixel renderer/ });

    expect(screen.getByRole("button", { name: "Sort pull requests" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "More pull request actions" }),
    ).not.toBeInTheDocument();
    expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(bridge.ghListPullRequests).toHaveBeenCalledTimes(2));
  });

  it("selecting a row loads its detail beside the list and highlights the row", async () => {
    render(<PullRequestsOverlay onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));

    expect(
      await screen.findByRole("heading", { name: /Fix the pixel renderer/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Renders pixels correctly.")).toBeInTheDocument();
    expect(bridge.ghGetPrDetails).toHaveBeenCalledTimes(1);
    const row = screen.getAllByRole("button", { name: /Fix the pixel renderer/ })[0]!;
    expect(row).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText("Select a pull request")).not.toBeInTheDocument();
  });

  it("opens a review selected elsewhere, like the branch review's Review PR", async () => {
    const prKey = buildBranchNamePrKey(project.id, summary.headBranch);
    useGitStore.getState().setPrData(prKey, summary.pr);
    usePanelStore.setState({
      pullRequestsOverlayOpen: false,
      prReviewContext: { projectId: project.id, prNumber: 42, prKey, skipLocalSync: true },
    });
    render(<PullRequestsOverlay onClose={() => {}} />);

    expect(
      await screen.findByRole("heading", { name: /Fix the pixel renderer/ }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /Summary/ })).toBeInTheDocument();
  });

  it("switches between the review tabs", async () => {
    render(<PullRequestsOverlay onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));
    await screen.findByText("Renders pixels correctly.");

    for (const name of ["Timeline", "Changes"]) {
      const tabs = screen.getByRole("tablist", { name: "Pull request sections" });
      fireEvent.click(within(tabs).getByRole("tab", { name }));
      await waitFor(() =>
        expect(within(tabs).getByRole("tab", { name })).toHaveAttribute("aria-selected", "true"),
      );
    }
  });

  it("Return to app closes the overlay and clears the selection", async () => {
    const onClose = vi.fn<() => void>();
    render(<PullRequestsOverlay onClose={onClose} />);
    await screen.findByText("Select a pull request");

    fireEvent.click(screen.getByRole("button", { name: "Return to app" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows only the list in the compact layout when nothing is selected, and the review once selected", async () => {
    layout.compact = true;
    render(<PullRequestsOverlay onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));
    // In the compact layout the review's title is the page header's, and its tabs are at the bottom.
    expect(
      await screen.findByRole("tablist", { name: "Pull request sections" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fix the pixel renderer")).toBeInTheDocument();
    expect(screen.queryByText("Select a pull request")).not.toBeInTheDocument();
    act(() => usePanelStore.getState().setPrReviewContext(null));
    expect(
      await screen.findByRole("button", { name: /Fix the pixel renderer/ }),
    ).toBeInTheDocument();
  });
});
