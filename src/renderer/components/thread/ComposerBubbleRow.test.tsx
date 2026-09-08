import { afterEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { useComposerBubbleSlotStore } from "@/renderer/state/composerBubbleSlotStore";
import { ComposerBubbleRow } from "./ComposerBubbleRow";

function rect(left: number, width: number): DOMRect {
  return {
    left,
    width,
    right: left + width,
    top: 0,
    bottom: 28,
    height: 28,
    x: left,
    y: 0,
  } as DOMRect;
}

describe("ComposerBubbleRow", () => {
  afterEach(() => {
    useComposerBubbleSlotStore.getState().setSlot("t1", null);
  });

  it("publishes its slot for the thread and clears it on unmount", () => {
    const { unmount } = render(<ComposerBubbleRow threadId="t1">{null}</ComposerBubbleRow>);
    const slot = useComposerBubbleSlotStore.getState().byThread["t1"];
    expect(slot).toBeInstanceOf(HTMLElement);
    expect(slot).toHaveClass("absolute", "left-1/2");
    unmount();
    expect(useComposerBubbleSlotStore.getState().byThread["t1"]).toBeUndefined();
  });

  it("moves the slot onto its own centered row when bubbles reach the center", async () => {
    const rowWidth = 400;
    const { container, rerender } = render(
      <ComposerBubbleRow threadId="t1">
        <button type="button" aria-label="Bubble" />
      </ComposerBubbleRow>,
    );
    const row = container.querySelector(".flex-wrap") as HTMLElement;
    const bubble = row.firstElementChild as HTMLElement;
    row.getBoundingClientRect = () => rect(0, rowWidth);
    // Wide bubble reaching past the row center: displaced.
    bubble.getBoundingClientRect = () => rect(150, 250);
    // Child changes reach the row through a MutationObserver (a microtask).
    await act(async () => {
      rerender(
        <ComposerBubbleRow threadId="t1">
          <button type="button" aria-label="Bubble" />
          <span />
        </ComposerBubbleRow>,
      );
      await Promise.resolve();
    });
    const slot = useComposerBubbleSlotStore.getState().byThread["t1"]!;
    expect(slot).toHaveAttribute("data-displaced");
    expect(slot).toHaveClass("flex", "justify-center");
    expect(slot).not.toHaveClass("absolute");
  });
});
