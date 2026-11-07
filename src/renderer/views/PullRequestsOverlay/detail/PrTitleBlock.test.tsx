// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  makeTestDetails,
  makeTestPrData,
  makeTestScopedSource,
  renderInPrDetail,
} from "../testing/prDetailTestScope";
import { PrTitleBlock } from "./PrTitleBlock";

describe("PrTitleBlock", () => {
  it("shows the title, number, author and branches", () => {
    renderInPrDetail(
      <PrTitleBlock />,
      {},
      { details: makeTestDetails({ additions: 7, deletions: 2, changedFiles: 3 }) },
    );

    expect(screen.getByRole("heading", { name: /Improve the overlay/ })).toHaveTextContent("#42");
    expect(screen.getByText("author")).toBeInTheDocument();
    expect(screen.getByText("feature/test")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByLabelText("7 additions and 2 deletions")).toBeInTheDocument();
  });

  it("edits only the title and leaves the description to the host's live copy", async () => {
    const { scope } = renderInPrDetail(
      <PrTitleBlock />,
      {},
      { details: makeTestDetails({ body: "Existing description" }) },
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "A better title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(scope.actions.handleEditPr).toHaveBeenCalledWith({ title: "A better title" });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull());
  });

  it("does not offer editing without the capability or while read-only", () => {
    const noEdit = makeTestScopedSource({ edit: false });
    const { unmount } = renderInPrDetail(
      <PrTitleBlock />,
      { scoped: noEdit },
      { details: makeTestDetails({ source: noEdit }) },
    );
    expect(screen.queryByRole("button", { name: "Edit title" })).not.toBeInTheDocument();
    unmount();

    renderInPrDetail(<PrTitleBlock />, { readOnly: true });
    expect(screen.queryByRole("button", { name: "Edit title" })).not.toBeInTheDocument();
  });

  it("warns when the branch is behind and updates it where the host allows", () => {
    const { scope } = renderInPrDetail(
      <PrTitleBlock />,
      {},
      { prData: makeTestPrData({ mergeStateStatus: "BEHIND" }) },
    );

    expect(screen.getByText("This branch is behind main.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update branch" }));
    expect(scope.actions.handleUpdatePrBranch).toHaveBeenCalledWith(false);
  });

  it("offers no update button when the host cannot update branches", () => {
    const source = makeTestScopedSource({ updateBranch: false, rebaseBranch: false });
    renderInPrDetail(
      <PrTitleBlock />,
      { scoped: source },
      {
        details: makeTestDetails({ source }),
        prData: makeTestPrData({ mergeStateStatus: "BEHIND" }),
      },
    );

    expect(screen.getByText("This branch is behind main.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update branch" })).not.toBeInTheDocument();
  });
});
