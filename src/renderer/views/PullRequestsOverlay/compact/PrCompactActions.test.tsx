// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  makeTestDetails,
  makeTestPrData,
  makeTestScopedSource,
  renderInPrDetail,
} from "../testing/prDetailTestScope";
import { PrCompactMenu } from "./PrCompactMenu";
import { PrCompactMergeAction } from "./PrCompactMergeAction";

vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => true }));

describe("PrCompactMenu", () => {
  it("offers state changes, links and refresh from one menu", async () => {
    const { scope } = renderInPrDetail(<PrCompactMenu />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("dialog", { name: "More actions" });
    for (const name of [
      "Convert to draft",
      "Close pull request",
      "Copy link",
      "Copy number",
      "Open on source host",
      "Refresh",
    ]) {
      expect(within(menu).getByRole("button", { name })).toBeInTheDocument();
    }

    fireEvent.click(within(menu).getByRole("button", { name: "Close pull request" }));
    expect(scope.actions.handleClosePr).toHaveBeenCalledTimes(1);
  });

  it("is a bottom sheet with grouped rows, never a popover", async () => {
    const { scope } = renderInPrDetail(<PrCompactMenu />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("dialog", { name: "More actions" });

    expect(document.querySelector(".m-sheet")).not.toBeNull();
    expect(document.querySelector("[data-trigger]")).toBeNull();
    for (const title of ["State", "Share", "Other"]) {
      expect(screen.getByText(title)).toHaveClass("m-sheet-section");
    }
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(scope.reload).toHaveBeenCalledTimes(1);
  });

  it("opens PR automation from the menu when the review can be watched", async () => {
    const onOpenAutomation = vi.fn<() => void>();
    renderInPrDetail(<PrCompactMenu onOpenAutomation={onOpenAutomation} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("button", { name: "PR automation" }));

    expect(onOpenAutomation).toHaveBeenCalledTimes(1);
  });

  it("offers no PR automation entry when there is nothing to watch", async () => {
    renderInPrDetail(<PrCompactMenu />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(await screen.findByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PR automation" })).not.toBeInTheDocument();
  });

  it("offers the review guide only where the host writes guides", async () => {
    const source = makeTestScopedSource({ reviewGuides: true });
    renderInPrDetail(
      <PrCompactMenu />,
      { scoped: source },
      { details: makeTestDetails({ source }) },
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(await screen.findByRole("button", { name: "Review guide" })).toBeInTheDocument();
  });

  it("leaves out state changes for a merged review and while read-only", async () => {
    renderInPrDetail(
      <PrCompactMenu />,
      { readOnly: true },
      { prData: makeTestPrData({ state: "merged" }) },
    );

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(await screen.findByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close pull request" })).not.toBeInTheDocument();
  });
});

describe("PrCompactMergeAction", () => {
  beforeEach(() => {
    useSharedSettings.setState({ prMergeMethod: "squash" });
  });

  it("asks for confirmation in a sheet before merging with the preferred method", async () => {
    const { scope } = renderInPrDetail(<PrCompactMergeAction />);

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(scope.actions.handleMergePr).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Squash and merge" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    expect(scope.actions.handleMergePr).toHaveBeenCalledWith("squash", false);
  });

  it("merges with the method picked in the sheet", async () => {
    const { scope } = renderInPrDetail(<PrCompactMergeAction />);

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rebase and merge" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));

    expect(scope.actions.handleMergePr).toHaveBeenCalledWith("rebase", false);
  });

  it("only offers the methods the host allows", async () => {
    const source = makeTestScopedSource({ mergeMethods: ["merge"] });
    renderInPrDetail(
      <PrCompactMergeAction />,
      { scoped: source },
      { details: makeTestDetails({ source }) },
    );

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));

    expect(await screen.findByRole("button", { name: "Merge commit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Squash and merge" })).not.toBeInTheDocument();
  });

  it("is disabled while the review is blocked and the admin cannot bypass", () => {
    const source = makeTestScopedSource({ adminMerge: false });
    renderInPrDetail(
      <PrCompactMergeAction />,
      { scoped: source },
      {
        prData: makeTestPrData({ mergeStateStatus: "BLOCKED", mergeable: "MERGEABLE" }),
        details: makeTestDetails({ source }),
      },
    );

    expect(screen.getByRole("button", { name: "Merge" })).toBeDisabled();
  });

  it("cancelling the confirmation merges nothing", async () => {
    const { scope } = renderInPrDetail(<PrCompactMergeAction />);

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(scope.actions.handleMergePr).not.toHaveBeenCalled();
  });
});
