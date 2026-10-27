// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  makeTestDetails,
  makeTestPrData,
  makeTestScopedSource,
  renderInPrDetail,
} from "../../testing/prDetailTestScope";
import { PrMergeControls } from "./PrMergeControls";

/** The popover trigger wraps the button in a role=button element; press the inner one. */
function mergeButton(): HTMLElement {
  const button = screen
    .getAllByRole("button", { name: "Merge" })
    .find((element) => element.tagName === "BUTTON");
  if (!button) throw new Error("merge button not found");
  return button;
}

const blocked = makeTestPrData({ mergeStateStatus: "BLOCKED", mergeable: "MERGEABLE" });

describe("PrMergeControls", () => {
  beforeEach(() => {
    useSharedSettings.setState({ prMergeMethod: "squash" });
  });

  it("asks for confirmation before merging with the preferred method", async () => {
    const { scope } = renderInPrDetail(<PrMergeControls />);

    fireEvent.click(mergeButton());
    const items = await screen.findAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Squash and merge");
    fireEvent.click(items[0]!);
    expect(scope.actions.handleMergePr).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    expect(scope.actions.handleMergePr).toHaveBeenCalledWith("squash", false);
  });

  it("lists the preferred method first", async () => {
    useSharedSettings.setState({ prMergeMethod: "rebase" });
    renderInPrDetail(<PrMergeControls />);

    fireEvent.click(mergeButton());
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Rebase and merge",
      "Squash and merge",
      "Merge commit",
    ]);
  });

  it("cancelling the confirmation merges nothing", async () => {
    const { scope } = renderInPrDetail(<PrMergeControls />);

    fireEvent.click(mergeButton());
    fireEvent.click(await screen.findByRole("menuitem", { name: "Squash and merge" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(scope.actions.handleMergePr).not.toHaveBeenCalled();
  });

  it("merges with the method picked from the menu", async () => {
    const { scope } = renderInPrDetail(<PrMergeControls />);

    fireEvent.click(mergeButton());
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rebase and merge" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm merge" }));

    expect(scope.actions.handleMergePr).toHaveBeenCalledWith("rebase", false);
  });

  it("closes the method menu when the confirmation opens", async () => {
    renderInPrDetail(<PrMergeControls />);

    fireEvent.click(mergeButton());
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rebase and merge" }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("heading", { name: "Rebase and merge" })).toBeInTheDocument();
  });

  it("disables methods the host does not offer", async () => {
    const source = makeTestScopedSource({ mergeMethods: ["merge"] });
    renderInPrDetail(
      <PrMergeControls />,
      { scoped: source },
      { details: makeTestDetails({ source }) },
    );

    fireEvent.click(mergeButton());
    expect(await screen.findByRole("menuitem", { name: "Squash and merge" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Merge commit" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("opens the confirmation for a blocked merge the admin can bypass", async () => {
    renderInPrDetail(<PrMergeControls />, {}, { prData: blocked });

    expect(mergeButton()).not.toBeDisabled();
    fireEvent.click(mergeButton());
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rebase and merge" }));

    const confirm = screen.getByRole("button", { name: "Confirm merge" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("switch"));
    expect(confirm).not.toBeDisabled();
  });

  it("stays disabled for a blocked review the admin cannot bypass", () => {
    const source = makeTestScopedSource({ adminMerge: false });
    renderInPrDetail(
      <PrMergeControls />,
      { scoped: source },
      { prData: blocked, details: makeTestDetails({ source }) },
    );

    expect(mergeButton()).toBeDisabled();
  });

  it("is disabled while the review is read-only", () => {
    renderInPrDetail(<PrMergeControls />, { readOnly: true });

    expect(mergeButton()).toBeDisabled();
  });
});
