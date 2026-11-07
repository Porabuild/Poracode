// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDetails, renderInPrDetail } from "../testing/prDetailTestScope";
import { ChangesTab } from "./ChangesTab";
import { clearReview, resetBridge, seedReview } from "./changesFixtures";

vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => true }));
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

describe("ChangesTab in the compact layout", () => {
  beforeEach(() => {
    resetBridge();
    Element.prototype.scrollIntoView = vi.fn<() => void>();
    clearReview();
    seedReview();
  });
  afterEach(() => clearReview());

  it("draws unified diffs under one view-options menu instead of a row of icon buttons", async () => {
    renderInPrDetail(<ChangesTab />, {}, { details: makeTestDetails() });

    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));
    for (const view of screen.getAllByTestId("diff-view")) {
      expect(view).toHaveAttribute("data-mode", "4");
    }
    expect(screen.getByRole("button", { name: "View options" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Split view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wrap lines" })).not.toBeInTheDocument();
  });

  it("switches the layout from the view-options menu", async () => {
    renderInPrDetail(<ChangesTab />, {}, { details: makeTestDetails() });
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));

    fireEvent.click(screen.getByRole("button", { name: "View options" }));
    fireEvent.click(await screen.findByRole("button", { name: "Split view" }));

    await waitFor(() => {
      for (const view of screen.getAllByTestId("diff-view")) {
        expect(view).toHaveAttribute("data-mode", "1");
      }
    });
  });

  it("keeps the file list in a collapsible section that folds after a file is picked", async () => {
    renderInPrDetail(<ChangesTab />, {}, { details: makeTestDetails() });
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));
    expect(screen.queryByRole("navigation", { name: "Changed files" })).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /^Files/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    const tree = screen.getByRole("navigation", { name: "Changed files" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(within(tree).getByText("README.md"));

    await waitFor(() =>
      expect(screen.queryByRole("navigation", { name: "Changed files" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^Files/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("leaves Review changes to the page's bottom bar", async () => {
    renderInPrDetail(<ChangesTab />, {}, { details: makeTestDetails() });
    await waitFor(() => expect(screen.getAllByTestId("diff-view")).toHaveLength(3));

    expect(screen.queryByRole("button", { name: "Review changes" })).not.toBeInTheDocument();
  });
});
