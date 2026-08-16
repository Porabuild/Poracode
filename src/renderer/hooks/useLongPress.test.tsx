// @vitest-environment jsdom
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLongPress } from "./useLongPress";

function Pressable(props: { readonly blocked?: boolean; readonly onLongPress?: () => void }) {
  const handlers = useLongPress(() => {
    if (!props.blocked) props.onLongPress?.();
  });
  return (
    <div role="button" tabIndex={0} {...handlers}>
      Press me
    </div>
  );
}

describe("useLongPress", () => {
  it("guards selection for the full touch sequence without cancelling pointer down", () => {
    render(<Pressable />);
    const target = screen.getByRole("button", { name: "Press me" });

    const touchStart = createEvent.pointerDown(target, {
      pointerType: "touch",
      isPrimary: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent(target, touchStart);
    expect(touchStart.defaultPrevented).toBe(false);

    const selectionStart = new Event("selectstart", { bubbles: true, cancelable: true });
    target.dispatchEvent(selectionStart);
    expect(selectionStart.defaultPrevented).toBe(true);

    fireEvent.pointerUp(target, { pointerType: "touch", isPrimary: true });
    const selectionAfterRelease = new Event("selectstart", { bubbles: true, cancelable: true });
    target.dispatchEvent(selectionAfterRelease);
    expect(selectionAfterRelease.defaultPrevented).toBe(false);

    const mouseStart = createEvent.pointerDown(target, {
      pointerType: "mouse",
      isPrimary: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent(target, mouseStart);
    expect(mouseStart.defaultPrevented).toBe(false);

    const mouseSelectionStart = new Event("selectstart", { bubbles: true, cancelable: true });
    target.dispatchEvent(mouseSelectionStart);
    expect(mouseSelectionStart.defaultPrevented).toBe(false);
  });

  it("keeps guarding a drawer mounted beneath the held pointer", () => {
    vi.useFakeTimers();
    try {
      render(<Pressable />);
      const target = screen.getByRole("button", { name: "Press me" });

      fireEvent.pointerDown(target, {
        pointerType: "touch",
        isPrimary: true,
        clientX: 20,
        clientY: 20,
      });
      act(() => vi.advanceTimersByTime(500));

      const drawerSelectionStart = new Event("selectstart", {
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(drawerSelectionStart);
      expect(drawerSelectionStart.defaultPrevented).toBe(true);

      fireEvent.pointerUp(document.body, { pointerType: "touch", isPrimary: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the long-press action from a context menu event", () => {
    const onLongPress = vi.fn<() => void>();
    render(<Pressable onLongPress={onLongPress} />);
    const target = screen.getByRole("button", { name: "Press me" });

    const contextMenu = createEvent.contextMenu(target);
    fireEvent(target, contextMenu);

    expect(contextMenu.defaultPrevented).toBe(true);
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it("does not open an action when the row starts dragging during the hold", () => {
    vi.useFakeTimers();
    try {
      const onLongPress = vi.fn<() => void>();
      const view = render(<Pressable onLongPress={onLongPress} />);
      const target = screen.getByRole("button", { name: "Press me" });

      fireEvent.pointerDown(target, {
        pointerType: "touch",
        isPrimary: true,
        clientX: 0,
        clientY: 0,
      });
      view.rerender(<Pressable blocked onLongPress={onLongPress} />);
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(onLongPress).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
