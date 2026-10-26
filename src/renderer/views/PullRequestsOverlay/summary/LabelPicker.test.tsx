// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ForgeListPrLabelCandidatesPayload,
  ForgePrLabelCandidatesResult,
} from "@/shared/contracts";
import { renderInPrDetail } from "../testing/prDetailTestScope";
import { LabelPicker } from "./LabelPicker";

const mocks = vi.hoisted(() => ({
  candidates:
    vi.fn<(payload: ForgeListPrLabelCandidatesPayload) => Promise<ForgePrLabelCandidatesResult>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ forgeListPrLabelCandidates: mocks.candidates }),
  isRemoteSession: () => false,
}));

const current = [{ name: "bug" }, { name: "docs" }];

/** A picker whose review becomes busy on demand, as when a reload starts. */
function Harness(props: { onApply: (change: { add: string[]; remove: string[] }) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBusy((value) => !value)}>
        toggle busy
      </button>
      <LabelPicker current={current} disabled={busy} onApply={props.onApply} />
    </>
  );
}

describe("LabelPicker", () => {
  beforeEach(() => {
    mocks.candidates.mockReset();
    mocks.candidates.mockResolvedValue({
      labels: [{ name: "bug" }, { name: "docs" }, { name: "feature" }],
      truncated: false,
    });
  });

  async function openAndPickFeature() {
    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "feature" }));
  }

  function close() {
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Edit labels" }), { key: "Escape" });
  }

  it("keeps the popover open with the draft when the review is busy at close, then applies it", async () => {
    const onApply = vi.fn<(change: { add: string[]; remove: string[] }) => void>();
    renderInPrDetail(<Harness onApply={onApply} />);

    await openAndPickFeature();
    fireEvent.click(screen.getByRole("button", { name: "toggle busy", hidden: true }));
    close();

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Labels cannot be saved");
    expect(screen.getByRole("checkbox", { name: "feature" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "toggle busy", hidden: true }));
    close();

    await waitFor(() =>
      expect(onApply).toHaveBeenCalledExactlyOnceWith({
        add: ["feature"],
        remove: [],
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lets the viewer discard a draft that cannot be saved", async () => {
    const onApply = vi.fn<(change: { add: string[]; remove: string[] }) => void>();
    renderInPrDetail(<Harness onApply={onApply} />);

    await openAndPickFeature();
    fireEvent.click(screen.getByRole("button", { name: "toggle busy", hidden: true }));
    close();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onApply).not.toHaveBeenCalled();
  });

  it("closes without a notice when nothing was changed, even if the review is busy", async () => {
    const onApply = vi.fn<(change: { add: string[]; remove: string[] }) => void>();
    renderInPrDetail(<Harness onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit labels" }));
    await screen.findByRole("checkbox", { name: "feature" });
    fireEvent.click(screen.getByRole("button", { name: "toggle busy", hidden: true }));
    close();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onApply).not.toHaveBeenCalled();
  });
});
