// @vitest-environment jsdom
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrFile } from "@/shared/contracts";
import { reviewViewedScope } from "@/renderer/utils/forgeReviews";
import { viewedFingerprint } from "@/shared/reviewDiff";
import { PrDetailScopeProvider, usePrDetailScope } from "../detail/prDetailScope";
import {
  makeTestDetails,
  makeTestScopedSource,
  renderInPrDetail,
} from "../testing/prDetailTestScope";
import { useSyncedPrViewedFiles } from "../viewed/useSyncedPrViewedFiles";
import { ChangesTab } from "./ChangesTab";
import {
  bridge,
  navHandle,
  NavCapture,
  clearReview,
  DIFF,
  FILES,
  PATCH_A,
  PATCH_README,
  resetBridge,
  seedReview,
} from "./changesFixtures";

vi.mock("@/renderer/bridge", async () => {
  const { bridge: fake } = await import("./changesFixtures");
  return { readBridge: () => fake, isRemoteSession: () => false, isMac: () => false };
});
vi.mock("@git-diff-view/react", async (importOriginal) => {
  const { FakeDiffView } = await import("./changesFixtures");
  return {
    ...(await importOriginal<typeof import("@git-diff-view/react")>()),
    DiffView: FakeDiffView,
  };
});
vi.mock("../../GitReviewOverlay/parts/diffBuildClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../GitReviewOverlay/parts/diffBuildClient")>()),
  useDiffTheme: () => "light" as const,
}));

const scrolled = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();
/** Gives the tab the real synced viewed hook instead of the harness's inert one. */
function SyncedViewed(props: { children: ReactNode }) {
  const base = usePrDetailScope();
  const viewed = useSyncedPrViewedFiles(
    reviewViewedScope(base.source, base.projectId, base.prNumber),
    base.scoped
      ? {
          projectLocation: base.location,
          prNumber: base.prNumber,
          forgeAccount: base.scoped.account,
          forgeRepository: base.scoped.repository,
        }
      : undefined,
  );
  const load = useEffectEvent(() => {
    void viewed.refresh();
  });
  useEffect(() => load(), []);
  return (
    <PrDetailScopeProvider value={{ ...base, viewed, viewedLabel: "Viewed on source host" }}>
      {props.children}
    </PrDetailScopeProvider>
  );
}

function renderTab(options: { synced?: boolean; readOnly?: boolean } = {}) {
  return renderInPrDetail(
    <>
      <NavCapture />
      {options.synced ? (
        <SyncedViewed>
          <ChangesTab />
        </SyncedViewed>
      ) : (
        <ChangesTab />
      )}
    </>,
    options.readOnly ? { readOnly: true } : {},
    { details: makeTestDetails() },
  );
}

function cardPaths(): string[] {
  return [...document.querySelectorAll("section[data-diff-path]")].map(
    (element) => element.getAttribute("data-diff-path") ?? "",
  );
}

function card(path: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`section[data-diff-path="${path}"]`);
  if (!found) throw new Error(`no card for ${path}`);
  return found;
}

describe("ChangesTab", () => {
  beforeEach(() => {
    resetBridge();
    scrolled.mockReset();
    Element.prototype.scrollIntoView = scrolled;
    navHandle.current = undefined;
    clearReview();
    seedReview();
  });
  afterEach(() => clearReview());

  it("lists changed files as a folder tree and draws the cards in the same order", async () => {
    renderTab();
    const tree = screen.getByRole("navigation", { name: "Changed files" });
    expect(within(tree).getByRole("button", { name: /src$/ })).toBeInTheDocument();
    expect(within(tree).getByText("README.md")).toBeInTheDocument();
    expect(within(tree).getByText("b.ts")).toBeInTheDocument();
    expect(within(tree).getByText("0 of 3 viewed")).toBeInTheDocument();
    await waitFor(() => expect(cardPaths()).toEqual(["README.md", "src/a.ts", "src/lib/b.ts"]));
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));
  });

  it("collapses a folder in the tree", () => {
    renderTab();
    const tree = screen.getByRole("navigation", { name: "Changed files" });
    fireEvent.click(within(tree).getByRole("button", { name: /^src$/ }));
    expect(within(tree).queryByText("a.ts")).not.toBeInTheDocument();
    expect(within(tree).getByText("README.md")).toBeInTheDocument();
    fireEvent.click(within(tree).getByRole("button", { name: /^src$/ }));
    expect(within(tree).getByText("a.ts")).toBeInTheDocument();
  });

  it("scrolls the diff to a file picked in the tree and expands it", async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));
    fireEvent.click(within(card("src/a.ts")).getByRole("button", { name: "Collapse src/a.ts" }));
    expect(within(card("src/a.ts")).queryByTestId("diff-view")).not.toBeInTheDocument();
    scrolled.mockClear();
    const tree = screen.getByRole("navigation", { name: "Changed files" });
    fireEvent.click(within(tree).getByTitle("src/a.ts"));
    expect(scrolled.mock.contexts).toContain(card("src/a.ts"));
    await waitFor(() =>
      expect(within(card("src/a.ts")).getByTestId("diff-view")).toBeInTheDocument(),
    );
  });

  it("scrolls to and expands the focused file, and to its line", async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));
    fireEvent.click(
      within(card("src/lib/b.ts")).getByRole("button", { name: "Collapse src/lib/b.ts" }),
    );
    scrolled.mockClear();
    act(() => navHandle.current?.openFile("src/lib/b.ts", 11, "RIGHT"));
    await waitFor(() =>
      expect(within(card("src/lib/b.ts")).getByTestId("diff-view")).toBeInTheDocument(),
    );
    const lineCell = card("src/lib/b.ts").querySelector('.diff-line-new-num [data-line-num="11"]');
    expect(lineCell).not.toBeNull();
    await waitFor(() => expect(scrolled.mock.contexts).toContain(lineCell));
    expect(screen.getByTestId("pr-nav")).toHaveAttribute("data-side", "RIGHT");
  });

  it("scrolls an old-side focus to the old line when both sides share a number", async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));
    scrolled.mockClear();

    act(() => navHandle.current?.openFile("src/a.ts", 2, "LEFT"));

    const oldLine = card("src/a.ts").querySelector('.diff-line-old-num [data-line-num="2"]');
    const newLine = card("src/a.ts").querySelector('.diff-line-new-num [data-line-num="2"]');
    expect(oldLine).not.toBeNull();
    expect(newLine).not.toBeNull();
    await waitFor(() => expect(scrolled.mock.contexts).toContain(oldLine));
    expect(scrolled.mock.contexts).not.toContain(newLine);
  });

  it("applies a focus request that was made before the diff arrived", async () => {
    clearReview();
    renderTab();
    act(() => navHandle.current?.openFile("src/a.ts"));
    expect(cardPaths()).toEqual([]);
    scrolled.mockClear();
    act(() => seedReview());
    await waitFor(() => expect(scrolled.mock.contexts).toContain(card("src/a.ts")));
  });

  it("marks and clears viewed through the synced hook and groups viewed files", async () => {
    renderTab({ synced: true });
    const readme = FILES[0] as PrFile;
    const fingerprint = viewedFingerprint(PATCH_README, readme);
    const tree = screen.getByRole("navigation", { name: "Changed files" });
    await waitFor(() => expect(bridge.forgeGetPrViewedFiles).toHaveBeenCalled());
    await waitFor(() => expect(within(tree).getAllByRole("checkbox")[0]).toBeEnabled());

    bridge.forgeSetPrFileViewed.mockResolvedValue({
      storage: "host",
      files: [{ path: "README.md", fingerprint }],
    });
    fireEvent.click(within(tree).getAllByRole("checkbox", { name: "Mark as viewed" })[0]!);
    await waitFor(() =>
      expect(bridge.forgeSetPrFileViewed).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ path: "README.md", fingerprint, prNumber: 42 }),
      ),
    );
    expect(await within(tree).findByText("1 of 3 viewed")).toBeInTheDocument();
    const group = within(tree).getByRole("button", { name: /Viewed on source host/ });
    expect(group).toHaveAttribute("aria-expanded", "false");
    // The viewed card collapses with it.
    expect(within(card("README.md")).queryByTestId("diff-view")).not.toBeInTheDocument();

    bridge.forgeSetPrFileViewed.mockResolvedValue({ storage: "host", files: [] });
    fireEvent.click(group);
    fireEvent.click(await within(tree).findByRole("checkbox", { name: "Mark as not viewed" }));
    await waitFor(() =>
      expect(bridge.forgeSetPrFileViewed).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: "README.md", fingerprint: null }),
      ),
    );
    expect(await within(tree).findByText("0 of 3 viewed")).toBeInTheDocument();
  });

  it("marks a file viewed from its card header", async () => {
    renderTab({ synced: true });
    await waitFor(() => expect(bridge.forgeGetPrViewedFiles).toHaveBeenCalled());
    const mark = within(card("src/a.ts")).getByRole("button", { name: "Mark as viewed" });
    await waitFor(() => expect(mark).toBeEnabled());
    fireEvent.click(mark);
    await waitFor(() =>
      expect(bridge.forgeSetPrFileViewed).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          path: "src/a.ts",
          fingerprint: viewedFingerprint(PATCH_A, FILES[1] as PrFile),
        }),
      ),
    );
  });

  it("refuses viewed writes while the review is read-only", async () => {
    renderTab({ synced: true, readOnly: true });
    await waitFor(() => expect(bridge.forgeGetPrViewedFiles).toHaveBeenCalled());
    const tree = screen.getByRole("navigation", { name: "Changed files" });
    for (const checkbox of within(tree).getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
    expect(within(card("src/a.ts")).getByRole("button", { name: "Mark as viewed" })).toBeDisabled();
    fireEvent.click(within(tree).getAllByRole("checkbox")[0]!);
    expect(bridge.forgeSetPrFileViewed).not.toHaveBeenCalled();
  });

  it("switches between split and unified and toggles wrapping", async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));
    const view = () => screen.getAllByTestId("diff-view")[0]!;
    expect(view()).toHaveAttribute("data-mode", "1");
    fireEvent.click(screen.getByRole("button", { name: "Unified view" }));
    expect(view()).toHaveAttribute("data-mode", "4");
    expect(screen.getByRole("button", { name: "Unified view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Split view" }));
    expect(view()).toHaveAttribute("data-mode", "1");
    expect(view()).toHaveAttribute("data-wrap", "false");
    fireEvent.click(screen.getByRole("button", { name: "Wrap lines" }));
    expect(view()).toHaveAttribute("data-wrap", "true");
  });

  it("collapses and expands every file", async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryAllByTestId("diff-view")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));
  });

  it("hides whitespace-only changes and says when a file has nothing else", async () => {
    const spaced = [
      "diff --git a/src/space.ts b/src/space.ts",
      "index 1..2 100644",
      "--- a/src/space.ts",
      "+++ b/src/space.ts",
      "@@ -1,2 +1,2 @@",
      " keep",
      "-\tindented();",
      "+    indented();",
    ].join("\n");
    clearReview();
    seedReview(
      [
        { path: "src/space.ts", additions: 1, deletions: 1 },
        { path: "src/a.ts", additions: 1, deletions: 1 },
      ],
      `${PATCH_A}\n${spaced}\n`,
    );
    renderTab();
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Hide whitespace changes" }));
    expect(within(card("src/space.ts")).getByText("Only whitespace changes")).toBeInTheDocument();
    expect(within(card("src/space.ts")).queryByTestId("diff-view")).not.toBeInTheDocument();
    expect(within(card("src/a.ts")).getByTestId("diff-view")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide whitespace changes" }));
    await waitFor(() =>
      expect(within(card("src/space.ts")).getByTestId("diff-view")).toBeInTheDocument(),
    );
  });

  it("holds back a very large file until its diff is requested", async () => {
    clearReview();
    seedReview([{ path: "src/a.ts", additions: 1500, deletions: 1 }], DIFF);
    renderTab();
    expect(await screen.findByRole("button", { name: "Load diff" })).toBeInTheDocument();
    expect(screen.queryByTestId("diff-view")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load diff" }));
    await waitFor(() => expect(screen.getByTestId("diff-view")).toBeInTheDocument());
  });

  it("shows no files that belong to another source", () => {
    renderInPrDetail(
      <ChangesTab />,
      {},
      {
        details: makeTestDetails({
          source: {
            ...makeTestScopedSource(),
            account: { forge: "github", host: "https://github.com", login: "someone-else" },
          },
        }),
      },
    );
    expect(screen.getAllByText("No changes").length).toBeGreaterThan(0);
    expect(cardPaths()).toEqual([]);
  });

  it("shows the load error with a retry when the review fails to load", () => {
    clearReview();
    const { scope } = renderInPrDetail(<ChangesTab />, {
      loadError: "Could not load the diff",
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the diff");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(scope.reload).toHaveBeenCalledTimes(1);
  });
});
