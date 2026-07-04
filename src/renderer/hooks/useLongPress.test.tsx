// @vitest-environment jsdom
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLongPress } from "./useLongPress";

function Pressable(props: { readonly onLongPress?: () => void }) {
  const handlers = useLongPress(props.onLongPress ?? vi.fn<() => void>());
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
});
