// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeTestDetails, makeTestPrData, renderInPrDetail } from "../testing/prDetailTestScope";
import { usePrDetailNav } from "./prDetailNav";
import { PrTitleBlock } from "./PrTitleBlock";

vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => true }));

/** Stands in for the header menu's "Edit title" row. */
function StartEditing() {
  const nav = usePrDetailNav();
  return (
    <button type="button" onClick={() => nav.setTitleEditing(true)}>
      Start editing
    </button>
  );
}

describe("PrTitleBlock on the compact page", () => {
  it("keeps the title out of the content and edits it in a bottom sheet the menu opens", async () => {
    const { scope } = renderInPrDetail(
      <>
        <StartEditing />
        <PrTitleBlock />
      </>,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit title" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start editing" }));
    const field = await screen.findByRole("textbox", { name: "Title" });
    expect(field).toHaveValue("Improve the overlay");
    expect(document.querySelector(".m-sheet")).not.toBeNull();
    fireEvent.change(field, { target: { value: "A better title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(scope.actions.handleEditPr).toHaveBeenCalledWith({ title: "A better title" });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull());
  });

  it("offers Update branch as a small text action, not a pill button", () => {
    const { scope } = renderInPrDetail(
      <PrTitleBlock />,
      {},
      {
        details: makeTestDetails(),
        prData: makeTestPrData({ mergeStateStatus: "BEHIND" }),
      },
    );

    const update = screen.getByRole("button", { name: "Update branch" });
    expect(update.hasAttribute("data-slot")).toBe(false);
    fireEvent.click(update);
    expect(scope.actions.handleUpdatePrBranch).toHaveBeenCalledTimes(1);
  });

  it("folds the read-only note into a quiet line under the authorship", () => {
    renderInPrDetail(<PrTitleBlock />, { readOnly: true, loading: true });

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
