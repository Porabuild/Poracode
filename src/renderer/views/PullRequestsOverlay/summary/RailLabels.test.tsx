// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ForgeListPrLabelCandidatesPayload,
  ForgePrLabelCandidatesResult,
  ForgeSetPrLabelsPayload,
} from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  makeTestDetails,
  makeTestScopedSource,
  renderInPrDetail,
} from "../testing/prDetailTestScope";
import { RailLabels } from "./RailLabels";

const mocks = vi.hoisted(() => ({
  candidates:
    vi.fn<(payload: ForgeListPrLabelCandidatesPayload) => Promise<ForgePrLabelCandidatesResult>>(),
  setLabels: vi.fn<(payload: ForgeSetPrLabelsPayload) => Promise<void>>(),
  toastDanger: vi.fn<(message: string) => void>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    forgeListPrLabelCandidates: mocks.candidates,
    forgeSetPrLabels: mocks.setLabels,
  }),
  isRemoteSession: () => false,
}));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { danger: mocks.toastDanger, success: vi.fn<(message: string) => void>() },
}));

const details = makeTestDetails({
  labels: [{ name: "bug", color: "d73a4a" }, { name: "docs" }],
});

describe("RailLabels", () => {
  beforeEach(() => {
    mocks.candidates.mockReset();
    mocks.candidates.mockResolvedValue({
      labels: [{ name: "bug" }, { name: "docs" }, { name: "feature" }, { name: "ui" }],
      truncated: false,
    });
    mocks.setLabels.mockReset();
    mocks.setLabels.mockResolvedValue(undefined);
    mocks.toastDanger.mockReset();
  });

  async function openEditor() {
    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));
    return screen.findByRole("checkbox", { name: "feature" });
  }

  it("shows the labels as chips", () => {
    renderInPrDetail(<RailLabels />, {}, { details });

    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("sends only the net change when the editor closes", async () => {
    const { scope } = renderInPrDetail(<RailLabels />, {}, { details });

    await openEditor();
    expect(screen.getByRole("checkbox", { name: "bug" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "feature" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "feature" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "docs" }));
    // Toggled and toggled back: not part of the change.
    fireEvent.click(screen.getByRole("checkbox", { name: "ui" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "ui" }));
    expect(mocks.setLabels).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Edit labels" }), { key: "Escape" });

    await waitFor(() => expect(mocks.setLabels).toHaveBeenCalledTimes(1));
    expect(mocks.setLabels).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 42,
        add: ["feature"],
        remove: ["docs"],
        forgeRepository: "owner/repo",
      }),
    );
    await waitFor(() => expect(scope.reload).toHaveBeenCalledTimes(1));
  });

  it("does not revert a label the host changed while the editor was open", async () => {
    const { scope } = renderInPrDetail(<RailLabels />, {}, { details });

    await openEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: "feature" }));
    act(() => {
      useGitStore.getState().setPrDetails(
        scope.cacheKey,
        makeTestDetails({
          labels: [{ name: "bug", color: "d73a4a" }, { name: "docs" }, { name: "ui" }],
        }),
      );
    });
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Edit labels" }), { key: "Escape" });

    await waitFor(() => expect(mocks.setLabels).toHaveBeenCalledTimes(1));
    expect(mocks.setLabels).toHaveBeenCalledWith(
      expect.objectContaining({ add: ["feature"], remove: [] }),
    );
  });

  it("does not call the host when nothing changed", async () => {
    renderInPrDetail(<RailLabels />, {}, { details });

    await openEditor();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Edit labels" }), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.setLabels).not.toHaveBeenCalled();
  });

  it("filters the candidates by name", async () => {
    renderInPrDetail(<RailLabels />, {}, { details });

    await openEditor();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter labels" }), {
      target: { value: "fea" },
    });

    expect(screen.getAllByRole("checkbox").map((box) => box.textContent)).toEqual(["feature"]);
  });

  it("reports the host's error and leaves the labels to the next reload", async () => {
    mocks.setLabels.mockRejectedValueOnce(new Error("Label refused"));
    const { scope } = renderInPrDetail(<RailLabels />, {}, { details });

    await openEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: "feature" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Edit labels" }), { key: "Escape" });

    await waitFor(() => expect(mocks.toastDanger).toHaveBeenCalledTimes(1));
    expect(scope.reload).not.toHaveBeenCalled();
  });

  it("hides the editor without the labels capability but still shows the labels", () => {
    renderInPrDetail(
      <RailLabels />,
      { scoped: makeTestScopedSource({ labels: undefined }) },
      { details },
    );

    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit labels" })).not.toBeInTheDocument();
  });

  it("hides the whole section without the capability or any label", () => {
    const { container } = renderInPrDetail(
      <RailLabels />,
      { scoped: makeTestScopedSource({ labels: undefined }) },
      { details: makeTestDetails() },
    );

    expect(container.querySelector("section")).toBeNull();
  });

  it("disables the editor while the review is read-only", () => {
    renderInPrDetail(<RailLabels />, { readOnly: true }, { details });

    expect(screen.getByRole("button", { name: "Edit labels" })).toBeDisabled();
  });
});
