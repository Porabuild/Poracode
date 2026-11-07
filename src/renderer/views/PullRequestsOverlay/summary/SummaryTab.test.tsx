// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeTestDetails, makeTestPrData, renderInPrDetail } from "../testing/prDetailTestScope";
import { SummaryTab } from "./SummaryTab";

vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({}), isRemoteSession: () => false }));

const details = makeTestDetails({
  body: "Describes the change",
  additions: 12,
  deletions: 3,
  changedFiles: 4,
  comments: [
    {
      id: "c1",
      author: { login: "bob" },
      body: "a remark",
      createdAt: "2026-07-01T00:00:00Z",
      reactions: [{ content: "heart", count: 1, viewerReacted: false }],
    },
  ],
  labels: [{ name: "bug" }],
  requestedReviewers: [{ id: "u1", login: "alice" }],
  reactions: [{ content: "+1", count: 2, viewerReacted: false }],
  checks: [{ name: "Typecheck", state: "COMPLETED", conclusion: "SUCCESS" }],
});

describe("SummaryTab", () => {
  it("shows the description, activity, composer and every rail section", () => {
    renderInPrDetail(<SummaryTab />, {}, { details });

    expect(screen.getByText("Describes the change")).toBeInTheDocument();
    expect(screen.getByText("a remark")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Write a comment" })).toBeInTheDocument();
    for (const heading of ["Merge status", "Changes", "Reviewers", "Labels", "Checks"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    // Reactions on the description and under the comment.
    expect(screen.getByRole("button", { name: "Thumbs up: 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Heart: 1" })).toBeInTheDocument();
  });

  it("summarises the size of the change and sends the files link to the Changes tab", () => {
    renderInPrDetail(<SummaryTab />, {}, { details });

    expect(screen.getByLabelText("12 additions and 3 deletions")).toBeInTheDocument();
    expect(screen.getByText("1 comment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "4 files" }));

    expect(screen.getByTestId("pr-nav")).toHaveAttribute("data-tab", "changes");
  });

  it("names the merge status and why a review is blocked", () => {
    renderInPrDetail(
      <SummaryTab />,
      {},
      { details, prData: makeTestPrData({ mergeStateStatus: "DIRTY", mergeable: "CONFLICTING" }) },
    );

    expect(screen.getByText("Merge conflicts must be resolved.")).toBeInTheDocument();
  });

  it("shows a loader until the review's content arrives", () => {
    const { container } = renderInPrDetail(
      <SummaryTab />,
      { contentReady: false },
      { details: null },
    );

    expect(container.querySelector("section")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Write a comment" })).not.toBeInTheDocument();
  });

  it("says so when the content is ready but there is no review", () => {
    renderInPrDetail(<SummaryTab />, { contentReady: true }, { details: null });

    expect(screen.getByText("This pull request could not be loaded.")).toBeInTheDocument();
  });

  it("disables every write while the review is read-only", () => {
    renderInPrDetail(<SummaryTab />, { readOnly: true }, { details });

    expect(screen.queryByRole("button", { name: "Edit description" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Write a comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request a reviewer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove alice" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit labels" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Thumbs up: 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Heart: 1" })).toBeDisabled();
  });
});
