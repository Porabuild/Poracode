// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UsePrWriteActionsResult } from "@/renderer/hooks/usePrWriteActions";
import { makeTestActions, makeTestDetails, renderInPrDetail } from "../testing/prDetailTestScope";
import { DescriptionCard } from "./DescriptionCard";

vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => true }));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({}), isRemoteSession: () => false }));

describe("DescriptionCard on the compact layout", () => {
  it("edits in a bottom sheet and leaves the card in place behind it", async () => {
    const handleEditPr = vi.fn<UsePrWriteActionsResult["handleEditPr"]>(() =>
      Promise.resolve(true),
    );
    renderInPrDetail(
      <DescriptionCard />,
      { actions: makeTestActions({ handleEditPr }) },
      { details: makeTestDetails({ body: "Original body" }) },
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));

    const editor = await screen.findByRole("textbox", { name: "Description" });
    expect(document.querySelector(".m-sheet")).not.toBeNull();
    expect(editor.closest("section[aria-label='Description']")).toBeNull();
    // The card keeps showing the saved text: nothing behind the sheet reflows.
    expect(screen.getByRole("region", { name: "Description", hidden: true })).toHaveTextContent(
      "Original body",
    );
    fireEvent.change(editor, { target: { value: "Rewritten" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(handleEditPr).toHaveBeenCalledWith({
        body: "Rewritten",
        expectedBody: "Original body",
      }),
    );
  });

  it("cancels without saving", async () => {
    const handleEditPr = vi.fn<UsePrWriteActionsResult["handleEditPr"]>(() =>
      Promise.resolve(true),
    );
    renderInPrDetail(
      <DescriptionCard />,
      { actions: makeTestActions({ handleEditPr }) },
      { details: makeTestDetails({ body: "Original body" }) },
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(handleEditPr).not.toHaveBeenCalled();
  });
});
