// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  makeTestDetails,
  makeTestPrData,
  makeTestScopedSource,
  renderInPrDetail,
} from "../../testing/prDetailTestScope";
import { PrStateMenu } from "./PrStateMenu";

describe("PrStateMenu", () => {
  it("offers draft conversion and close for an open review", async () => {
    const { scope } = renderInPrDetail(<PrStateMenu />);

    fireEvent.click(screen.getByRole("button", { name: "Change state" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Close pull request" }));
    expect(scope.actions.handleClosePr).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Change state" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Convert to draft" }));
    expect(scope.actions.handleConvertPrToDraft).toHaveBeenCalledTimes(1);
  });

  it("hides draft conversion on hosts that cannot do it", async () => {
    const source = makeTestScopedSource({ convertToDraft: undefined });
    renderInPrDetail(<PrStateMenu />, { scoped: source }, { details: makeTestDetails({ source }) });

    fireEvent.click(screen.getByRole("button", { name: "Change state" }));
    expect(await screen.findByRole("menuitem", { name: "Close pull request" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Convert to draft" })).not.toBeInTheDocument();
  });

  it("marks a draft ready for review", async () => {
    const { scope } = renderInPrDetail(
      <PrStateMenu />,
      {},
      { prData: makeTestPrData({ isDraft: true, state: "draft" }) },
    );

    fireEvent.click(screen.getByRole("button", { name: "Change state" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Ready for review" }));
    expect(scope.actions.handleMarkPrReady).toHaveBeenCalledTimes(1);
  });

  it("reopens a closed review", async () => {
    const { scope } = renderInPrDetail(
      <PrStateMenu />,
      {},
      { prData: makeTestPrData({ state: "closed" }) },
    );

    fireEvent.click(screen.getByRole("button", { name: "Change state" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reopen pull request" }));
    expect(scope.actions.handleReopenPr).toHaveBeenCalledTimes(1);
  });

  it("is a plain label for a merged review and while read-only", () => {
    const { unmount } = renderInPrDetail(
      <PrStateMenu />,
      {},
      { prData: makeTestPrData({ state: "merged" }) },
    );
    expect(screen.queryByRole("button", { name: "Change state" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("State")).toBeInTheDocument();
    unmount();

    renderInPrDetail(<PrStateMenu />, { readOnly: true });
    expect(screen.queryByRole("button", { name: "Change state" })).not.toBeInTheDocument();
  });
});
