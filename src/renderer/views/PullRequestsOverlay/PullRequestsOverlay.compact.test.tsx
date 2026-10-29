// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
const chatControls = vi.hoisted(() => ({
  setOpen: undefined as ((open: boolean) => void) | undefined,
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => bridge,
  isMac: () => false,
  isWindows: () => false,
  isRemoteSession: () => false,
}));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => true }));
// The chat thread itself is not under test: a session whose open state the test drives.
vi.mock("./chat/usePrAskChatSession", async () => {
  const { useState } = await import("react");
  return {
    usePrAskChatSession: () => {
      const [open, setOpen] = useState(false);
      chatControls.setOpen = setOpen;
      return {
        open,
        setOpen,
        ask: () => undefined,
        send: () => Promise.resolve(true),
        draft: "",
        setDraft: () => undefined,
        available: true,
        threadId: undefined,
        starting: false,
        busy: false,
        error: undefined,
        retry: () => undefined,
        openAsThread: () => undefined,
      };
    },
  };
});
vi.mock("./chat/PrAskChatPanel", () => ({
  PrAskChatPanel: () => <section aria-label="Chat page">chat</section>,
}));

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

describe("PullRequestsOverlay in the compact layout", () => {
  beforeEach(() => {
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

  it("keeps the review's tab while the chat page covers it, and Back from the chat returns to it", async () => {
    render(<PullRequestsOverlay onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));
    const tabs = await screen.findByRole("tablist", { name: "Pull request sections" });
    fireEvent.click(within(tabs).getByRole("tab", { name: "Timeline" }));
    await waitFor(() =>
      expect(within(tabs).getByRole("tab", { name: "Timeline" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask about this pull request" }));

    expect(await screen.findByRole("region", { name: "Chat page" })).toBeInTheDocument();
    const covered = screen.getByRole("tablist", {
      name: "Pull request sections",
      hidden: true,
    });
    expect(covered.closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByRole("region", { name: "Chat page" })).not.toBeInTheDocument();
    const restored = await screen.findByRole("tablist", { name: "Pull request sections" });
    expect(restored).toBe(covered);
    expect(restored.closest("[inert]")).toBeNull();
    expect(within(restored).getByRole("tab", { name: "Timeline" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(usePanelStore.getState().prReviewContext).not.toBeNull();
  });

  it("puts the review's actions in the page header and its primary action in the bottom row", async () => {
    render(<PullRequestsOverlay onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));
    const tabs = await screen.findByRole("tablist", { name: "Pull request sections" });

    // The header is short (`#number` and the repository) with one button for every action;
    // the full title appears once, in the page's title block.
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PR automation" })).not.toBeInTheDocument();
    // The title is in the header once; the content has no title heading of its own.
    expect(
      screen.queryByRole("heading", { name: /Fix the pixel renderer/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Fix the pixel renderer")).toHaveLength(1);
    expect(tabs.querySelectorAll("[role=tab]")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Ask about this pull request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review changes" })).not.toBeInTheDocument();

    // On Changes the trailing action becomes Review changes.
    fireEvent.click(within(tabs).getByRole("tab", { name: "Changes" }));
    expect(await screen.findByRole("button", { name: "Review changes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
  });

  it("keeps the bottom tabs the same size in every state", async () => {
    render(<PullRequestsOverlay onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));
    const tabs = await screen.findByRole("tablist", { name: "Pull request sections" });

    // Equal-width segments with one font weight; selection never changes a box. Pressing the
    // pill must not rescale it (the shared selector's :active scale is overridden in styles.css).
    const segments = [...tabs.querySelectorAll("[role=tab]")];
    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      expect(segment).toHaveClass("flex-1", "font-semibold");
      expect(segment.className).not.toMatch(/font-(bold|medium|normal)/);
    }
    expect(tabs).toHaveClass("m-pr-tabs", "w-full");
    expect(tabs.className).not.toMatch(/scale/);
  });

  it("flows the whole review in one scroll container", async () => {
    render(<PullRequestsOverlay onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));
    const tabpanel = await screen.findByRole("tabpanel");

    const scroller = tabpanel.closest(".m-pr-scroll");
    expect(scroller).not.toBeNull();
    // Nothing between the page scroller and the tab's content scrolls on its own.
    expect(tabpanel.querySelectorAll(".overflow-y-auto")).toHaveLength(0);
  });

  it("leaves the review for the list when Back is pressed on the review itself", async () => {
    render(<PullRequestsOverlay onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Fix the pixel renderer/ }));
    await screen.findByRole("tablist", { name: "Pull request sections" });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(usePanelStore.getState().prReviewContext).toBeNull();
  });
});
