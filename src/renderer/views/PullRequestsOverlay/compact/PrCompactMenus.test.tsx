// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  makeTestDetails,
  makeTestPrData,
  makeTestScopedSource,
  renderInPrDetail,
} from "../testing/prDetailTestScope";
import { ChangesToolbarCompact } from "../changes/ChangesToolbarCompact";
import { PrReactionAdd } from "../parts/PrReactions";
import { SubmitReviewPopover } from "../parts/SubmitReviewPopover";
import { ActivityFeed } from "../summary/ActivityFeed";
import { LabelPicker } from "../summary/LabelPicker";
import { ReviewerPicker } from "../summary/ReviewerPicker";
import { TimelineTab } from "../timeline/TimelineTab";
import { PrCompactMenu } from "./PrCompactMenu";
import { PrCompactMergeAction } from "./PrCompactMergeAction";

vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => true }));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    forgeListPrLabelCandidates: () =>
      Promise.resolve({ labels: [{ name: "bug" }], truncated: false }),
    forgeListPrReviewerCandidates: () => Promise.resolve({ reviewers: [], truncated: false }),
  }),
  isRemoteSession: () => false,
}));

/** On compact every menu is the app's bottom sheet; a desktop popover would carry `data-trigger`. */
function presentation() {
  return {
    sheet: document.querySelector(".m-sheet") !== null,
    popover: document.querySelector("[data-trigger]") !== null,
  };
}
const BOTTOM_SHEET = { sheet: true, popover: false };

describe("menus on the compact layout", () => {
  it("opens the more menu as a bottom sheet", async () => {
    renderInPrDetail(<PrCompactMenu />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("dialog", { name: "More actions" });
    expect(presentation()).toEqual(BOTTOM_SHEET);
  });

  it("opens the activity filter as a bottom sheet", async () => {
    renderInPrDetail(<ActivityFeed />, {}, { details: makeTestDetails() });
    fireEvent.click(screen.getByRole("button", { name: "Filter activity" }));
    await screen.findByRole("dialog", { name: "Filter activity" });
    expect(presentation()).toEqual(BOTTOM_SHEET);
  });

  it("opens the timeline filter as a bottom sheet", async () => {
    renderInPrDetail(<TimelineTab />, {}, { details: makeTestDetails() });
    fireEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await screen.findByRole("dialog", { name: "Filter timeline" });
    expect(presentation()).toEqual(BOTTOM_SHEET);
  });

  it("opens the diff view options as a bottom sheet", async () => {
    renderInPrDetail(
      <ChangesToolbarCompact
        mode={4}
        onMode={() => undefined}
        wrap={false}
        onWrap={() => undefined}
        hideWhitespace={false}
        onHideWhitespace={() => undefined}
        allCollapsed={false}
        onCollapseAll={() => undefined}
        onExpandAll={() => undefined}
        commits={null}
        commitScope={null}
        onCommitScope={() => undefined}
        commentsOffReason={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View options" }));
    await screen.findByRole("dialog", { name: "View options" });
    expect(presentation()).toEqual(BOTTOM_SHEET);
  });

  it("opens the reaction picker as a bottom sheet", async () => {
    renderInPrDetail(
      <PrReactionAdd
        reactions={[]}
        supported={["+1", "heart"]}
        disabled={false}
        pending={new Set()}
        onToggle={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add reaction" }));
    await screen.findByTestId("reaction-picker-grid");
    expect(presentation()).toEqual(BOTTOM_SHEET);
  });

  it("opens the label picker as a bottom sheet", async () => {
    renderInPrDetail(<LabelPicker current={[]} disabled={false} onApply={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));
    await screen.findByRole("checkbox", { name: "bug" });
    expect(presentation()).toEqual(BOTTOM_SHEET);
  });

  it("opens the reviewer picker as a bottom sheet", async () => {
    renderInPrDetail(
      <ReviewerPicker
        requested={[]}
        authorLogin={undefined}
        disabled={false}
        onPick={() => Promise.resolve(true)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Request a reviewer" }));
    await screen.findByRole("textbox", { name: "Search people" });
    expect(presentation()).toEqual(BOTTOM_SHEET);
  });

  it("opens the merge confirmation as a bottom sheet", async () => {
    renderInPrDetail(<PrCompactMergeAction />);
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await screen.findByRole("button", { name: "Confirm merge" });
    expect(presentation()).toEqual(BOTTOM_SHEET);
  });

  it("opens the review submission as a bottom sheet", async () => {
    const { scope } = renderInPrDetail(
      <SubmitReviewPopover
        projectLocation={{ kind: "posix", path: "/repo" }}
        prNumber={42}
        prKey="project-1:feature/test"
        cacheKey="project-1#42"
        triggerLabel="Review changes"
        triggerPresentation="circle"
        onSubmitted={() => undefined}
      />,
      {},
      {
        details: makeTestDetails({ source: makeTestScopedSource() }),
        prData: makeTestPrData({ source: makeTestScopedSource() }),
      },
    );
    expect(scope).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    await screen.findByRole("button", { name: "Submit review" });
    expect(presentation()).toEqual(BOTTOM_SHEET);
  });
});
