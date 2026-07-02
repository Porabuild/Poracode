// @vitest-environment jsdom
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useComposerKeyboard } from "./useComposerKeyboard";

const keyboardMock = vi.hoisted(() => ({ offset: 0 }));
const scrollLockMock = vi.hoisted(() => ({
  lockComposeScroll: vi.fn<(source?: HTMLElement | null) => void>(),
  unlockComposeScroll: vi.fn<() => void>(),
  focusWithoutScroll: vi.fn<(element: HTMLElement | null | undefined) => void>((element) =>
    element?.focus(),
  ),
}));

vi.mock("./useKeyboardOffset", () => ({
  useKeyboardOffset: () => keyboardMock.offset,
}));

vi.mock("./composeScrollLock", () => scrollLockMock);

function ComposerKeyboardHarness(props: { readonly onBeforeGuardedFocus?: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useComposerKeyboard(
    ref,
    "test-composer",
    props.onBeforeGuardedFocus ? { onBeforeGuardedFocus: props.onBeforeGuardedFocus } : {},
  );

  return (
    <div ref={ref}>
      <div data-composer-input-anchor="">
        <div role="textbox" tabIndex={0} contentEditable suppressContentEditableWarning />
      </div>
    </div>
  );
}

describe("useComposerKeyboard", () => {
  beforeEach(() => {
    keyboardMock.offset = 0;
    scrollLockMock.lockComposeScroll.mockClear();
    scrollLockMock.unlockComposeScroll.mockClear();
    scrollLockMock.focusWithoutScroll.mockClear();
  });

  it("refocuses a stale-focused editor when the keyboard is hidden", () => {
    render(<ComposerKeyboardHarness />);
    const input = screen.getByRole("textbox");

    input.focus();
    expect(document.activeElement).toBe(input);

    const pointerDown = createEvent.pointerDown(input, {
      pointerType: "touch",
      cancelable: true,
    });
    fireEvent(input, pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(scrollLockMock.unlockComposeScroll).not.toHaveBeenCalled();
    expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ dataset: expect.objectContaining({ composerFocusSentinel: "" }) }),
    );
    expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(2, input);
    expect(document.activeElement).toBe(input);
  });

  it("runs the guarded focus preparation before moving focus through the sentinel", () => {
    const focusOrder: string[] = [];
    scrollLockMock.focusWithoutScroll.mockImplementation((element) => {
      if (element?.hasAttribute("data-composer-focus-sentinel")) {
        focusOrder.push("sentinel");
      } else if (element) {
        focusOrder.push("input");
      }
      element?.focus();
    });
    render(<ComposerKeyboardHarness onBeforeGuardedFocus={() => focusOrder.push("expand")} />);
    const input = screen.getByRole("textbox");

    const pointerDown = createEvent.pointerDown(input, {
      pointerType: "touch",
      cancelable: true,
    });
    fireEvent(input, pointerDown);

    expect(focusOrder).toEqual(["expand", "sentinel", "input"]);
  });

  it("uses the guarded focus path when the unfocused input shield is tapped", () => {
    render(<ComposerKeyboardHarness />);
    const input = screen.getByRole("textbox");
    const anchor = input.closest("[data-composer-input-anchor]");
    expect(anchor).toBeInstanceOf(HTMLElement);

    const pointerDown = createEvent.pointerDown(anchor as HTMLElement, {
      pointerType: "touch",
      cancelable: true,
    });
    fireEvent(anchor as HTMLElement, pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(scrollLockMock.lockComposeScroll).toHaveBeenCalled();
    expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ dataset: expect.objectContaining({ composerFocusSentinel: "" }) }),
    );
    expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(2, input);
  });

  it("keeps the stale active editor focused when the keyboard offset disappears", () => {
    keyboardMock.offset = 320;
    const { rerender } = render(<ComposerKeyboardHarness />);
    const input = screen.getByRole("textbox");

    input.focus();
    fireEvent.focusIn(input);
    scrollLockMock.unlockComposeScroll.mockClear();

    keyboardMock.offset = 0;
    rerender(<ComposerKeyboardHarness />);

    expect(scrollLockMock.unlockComposeScroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
  });

  it("recovers transient blur during the guarded touch-focus settle window", () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const frameCallbacks: FrameRequestCallback[] = [];
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return 1;
      },
    });
    render(<ComposerKeyboardHarness />);
    const input = screen.getByRole("textbox");
    const outside = document.createElement("button");
    document.body.append(outside);

    try {
      const pointerDown = createEvent.pointerDown(input, {
        pointerType: "touch",
        cancelable: true,
      });
      fireEvent(input, pointerDown);
      scrollLockMock.unlockComposeScroll.mockClear();
      scrollLockMock.focusWithoutScroll.mockClear();

      outside.focus();
      for (const callback of frameCallbacks) callback(0);

      expect(scrollLockMock.unlockComposeScroll).not.toHaveBeenCalled();
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          dataset: expect.objectContaining({ composerFocusSentinel: "" }),
        }),
      );
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(2, input);
      expect(document.activeElement).toBe(input);
    } finally {
      outside.remove();
      Object.defineProperty(window, "requestAnimationFrame", {
        configurable: true,
        value: originalRequestAnimationFrame,
      });
    }
  });

  it("allows native caret placement while the keyboard is visible", () => {
    keyboardMock.offset = 320;
    render(<ComposerKeyboardHarness />);
    const input = screen.getByRole("textbox");

    input.focus();
    const pointerDown = createEvent.pointerDown(input, {
      pointerType: "touch",
      cancelable: true,
    });
    fireEvent(input, pointerDown);

    expect(pointerDown.defaultPrevented).toBe(false);
  });
});
