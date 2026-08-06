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
  it("prevents native touch-hold behavior without cancelling mouse starts", () => {
    render(<Pressable />);
    const target = screen.getByRole("button", { name: "Press me" });

    const touchStart = createEvent.pointerDown(target, {
      pointerType: "touch",
      isPrimary: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent(target, touchStart);
    expect(touchStart.defaultPrevented).toBe(true);

    const mouseStart = createEvent.pointerDown(target, {
      pointerType: "mouse",
      isPrimary: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent(target, mouseStart);
    expect(mouseStart.defaultPrevented).toBe(false);
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
