// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UsePrWriteActionsResult } from "@/renderer/hooks/usePrWriteActions";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  makeTestActions,
  makeTestDetails,
  makeTestScopedSource,
  renderInPrDetail,
} from "../testing/prDetailTestScope";
import { DescriptionCard } from "./DescriptionCard";

vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({}), isRemoteSession: () => false }));

const details = makeTestDetails({ title: "Fix the thing", body: "Original body" });

describe("DescriptionCard", () => {
  it("renders the description and shows an empty state when there is none", () => {
    const { unmount } = renderInPrDetail(<DescriptionCard />, {}, { details });
    expect(screen.getByText("Original body")).toBeInTheDocument();
    unmount();

    renderInPrDetail(<DescriptionCard />, {}, { details: makeTestDetails({ body: "  " }) });
    expect(screen.getByText("No description provided")).toBeInTheDocument();
  });

  it("saves only the body through handleEditPr, guarded by the text the editor started from", async () => {
    const handleEditPr = vi.fn<UsePrWriteActionsResult["handleEditPr"]>(() =>
      Promise.resolve(true),
    );
    renderInPrDetail(
      <DescriptionCard />,
      { actions: makeTestActions({ handleEditPr }) },
      { details },
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    const editor = screen.getByRole("textbox", { name: "Description" });
    expect(editor).toHaveValue("Original body");
    fireEvent.change(editor, { target: { value: "Rewritten" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(handleEditPr).toHaveBeenCalledTimes(1));
    expect(handleEditPr).toHaveBeenCalledWith({
      body: "Rewritten",
      expectedBody: "Original body",
    });
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument(),
    );
  });

  it("guards the save with the description the editor opened with, not a later reload", async () => {
    const handleEditPr = vi.fn<UsePrWriteActionsResult["handleEditPr"]>(() =>
      Promise.resolve(false),
    );
    const { scope } = renderInPrDetail(
      <DescriptionCard />,
      { actions: makeTestActions({ handleEditPr }) },
      { details },
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Mine" },
    });
    act(() => {
      useGitStore
        .getState()
        .setPrDetails(scope.cacheKey, { ...details, body: "Someone else's newer text" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(handleEditPr).toHaveBeenCalledTimes(1));
    expect(handleEditPr).toHaveBeenCalledWith({ body: "Mine", expectedBody: "Original body" });
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Mine");
  });

  it("stays in the editor when the save is refused, and Cancel discards the draft", async () => {
    const handleEditPr = vi.fn<UsePrWriteActionsResult["handleEditPr"]>(() =>
      Promise.resolve(false),
    );
    renderInPrDetail(
      <DescriptionCard />,
      { actions: makeTestActions({ handleEditPr }) },
      { details },
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(handleEditPr).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Draft");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Original body");
  });

  it("offers no editor without the edit capability", () => {
    renderInPrDetail(
      <DescriptionCard />,
      { scoped: makeTestScopedSource({ edit: false }) },
      { details },
    );

    expect(screen.queryByRole("button", { name: "Edit description" })).not.toBeInTheDocument();
  });

  it("offers no editor while the review is read-only", () => {
    renderInPrDetail(<DescriptionCard />, { readOnly: true }, { details });

    expect(screen.queryByRole("button", { name: "Edit description" })).not.toBeInTheDocument();
  });
});
