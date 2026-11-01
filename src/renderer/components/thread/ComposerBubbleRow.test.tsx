import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
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

/**
 * A children change mounts fresh child nodes (single element -> array shifts
 * their implicit keys), so rect mocks must go on keyed children rendered as an
 * array from the start. Child changes then reach the row's measure through its
 * MutationObserver, which fires on a microtask after the rerender commit.
 */
function rowChildren(extra?: ReactNode) {
  return [<button key="bubble" type="button" aria-label="Bubble" />, ...(extra ? [extra] : [])];
}

describe("ComposerBubbleRow", () => {
  afterEach(() => {
    useComposerBubbleSlotStore.getState().setSlot("control", "t1", null);
    useComposerBubbleSlotStore.getState().setSlot("status", "t1", null);
  });

  it("publishes its slots for the thread and clears them on unmount", () => {
    const { container, unmount } = render(
      <ComposerBubbleRow threadId="t1">{null}</ComposerBubbleRow>,
    );
    const state = useComposerBubbleSlotStore.getState();
    const control = state.control["t1"];
    expect(control).toBeInstanceOf(HTMLElement);
    expect(control).toHaveClass("absolute", "left-1/2");
    const status = state.status["t1"];
    expect(status).toBeInstanceOf(HTMLElement);
    const row = container.querySelector(".flex-wrap")!;
    expect(row.firstElementChild).toBe(status);
    expect(status).toHaveClass("mr-auto", "empty:hidden");
    // The status pill sits flush with the composer's left edge.
    expect(row).toHaveClass("pr-3");
    expect(row).not.toHaveClass("px-3");
    unmount();
    expect(useComposerBubbleSlotStore.getState().control["t1"]).toBeUndefined();
    expect(useComposerBubbleSlotStore.getState().status["t1"]).toBeUndefined();
  });

  it("moves the slot onto its own centered row when bubbles reach the center", async () => {
    const rowWidth = 400;
    const { container, rerender } = render(
      <ComposerBubbleRow threadId="t1">{rowChildren()}</ComposerBubbleRow>,
    );
    const row = container.querySelector(".flex-wrap") as HTMLElement;
    const bubble = row.querySelector("[aria-label='Bubble']") as HTMLElement;
    row.getBoundingClientRect = () => rect(0, rowWidth);
    // Wide bubble reaching past the row center: displaced.
    bubble.getBoundingClientRect = () => rect(150, 250);
    await act(async () => {
      rerender(
        <ComposerBubbleRow threadId="t1">{rowChildren(<span key="extra" />)}</ComposerBubbleRow>,
      );
      await Promise.resolve();
    });
    const slot = useComposerBubbleSlotStore.getState().control["t1"]!;
    expect(slot).toHaveAttribute("data-displaced");
    expect(slot).toHaveClass("flex", "justify-center");
    expect(slot).not.toHaveClass("absolute");
  });

  it("keeps the control centered while the status pill stays clear of it", async () => {
    const { container, rerender } = render(
      <ComposerBubbleRow threadId="t1">{rowChildren()}</ComposerBubbleRow>,
    );
    const row = container.querySelector(".flex-wrap") as HTMLElement;
    const statusSlot = row.querySelector("[data-composer-bubble-slot='status']") as HTMLElement;
    const bubble = row.querySelector("[aria-label='Bubble']") as HTMLElement;
    row.getBoundingClientRect = () => rect(0, 400);
    // Pill ends at 150, short of the control's 186..214 span; the trailing
    // bubble starts at 300, past the control's right edge plus gap.
    statusSlot.getBoundingClientRect = () => rect(0, 150);
    bubble.getBoundingClientRect = () => rect(300, 50);
    await act(async () => {
      rerender(
        <ComposerBubbleRow threadId="t1">{rowChildren(<span key="extra" />)}</ComposerBubbleRow>,
      );
      await Promise.resolve();
    });
    const control = useComposerBubbleSlotStore.getState().control["t1"]!;
    expect(control).not.toHaveAttribute("data-displaced");
    expect(control).toHaveClass("absolute", "left-1/2");
  });

  it("moves the slot onto its own row when the status pill reaches the center", async () => {
    const { container, rerender } = render(
      <ComposerBubbleRow threadId="t1">{rowChildren()}</ComposerBubbleRow>,
    );
    const row = container.querySelector(".flex-wrap") as HTMLElement;
    const statusSlot = row.querySelector("[data-composer-bubble-slot='status']") as HTMLElement;
    const bubble = row.querySelector("[aria-label='Bubble']") as HTMLElement;
    row.getBoundingClientRect = () => rect(0, 400);
    // Pill ends at 250, past the control's 186 left edge; the trailing bubble
    // stays clear so only the leading pill displaces the control.
    statusSlot.getBoundingClientRect = () => rect(0, 250);
    bubble.getBoundingClientRect = () => rect(300, 50);
    await act(async () => {
      rerender(
        <ComposerBubbleRow threadId="t1">{rowChildren(<span key="extra" />)}</ComposerBubbleRow>,
      );
      await Promise.resolve();
    });
    const control = useComposerBubbleSlotStore.getState().control["t1"]!;
    expect(control).toHaveAttribute("data-displaced");
    expect(control).toHaveClass("flex", "justify-center");
  });
});
