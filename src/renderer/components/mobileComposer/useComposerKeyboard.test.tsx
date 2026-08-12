// @vitest-environment jsdom
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTouchCapableOverrideForTests } from "./pointerModality";
import { resetComposerKeyboardMemoryForTests, useComposerKeyboard } from "./useComposerKeyboard";

const keyboardMock = vi.hoisted(() => ({
  offset: 0,
  liftOffset: undefined as number | undefined,
  visibilityOffset: undefined as number | undefined,
}));
const scrollLockMock = vi.hoisted(() => ({
  lockComposeScroll: vi.fn<(source?: HTMLElement | null) => void>(),
  unlockComposeScroll: vi.fn<() => void>(),
  focusWithoutScroll: vi.fn<(element: HTMLElement | null | undefined) => void>((element) =>
    element?.focus(),
  ),
}));

vi.mock("./useKeyboardOffset", () => ({
  useKeyboardGeometry: () => ({
    liftOffset: keyboardMock.liftOffset ?? keyboardMock.offset,
    visibilityOffset: keyboardMock.visibilityOffset ?? keyboardMock.offset,
  }),
  useKeyboardOffset: () => keyboardMock.offset,
  useKeyboardVisibilityOffset: () => keyboardMock.offset,
}));

vi.mock("./composeScrollLock", () => scrollLockMock);

function ComposerKeyboardHarness(props: { readonly onBeforeGuardedFocus?: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { liftOffset, measuringKeyboard } = useComposerKeyboard(
    ref,
    "test-composer",
    props.onBeforeGuardedFocus ? { onBeforeGuardedFocus: props.onBeforeGuardedFocus } : {},
  );

  return (
    <div ref={ref}>
      <div data-composer-input-anchor="">
        <div
          role="textbox"
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          aria-label="Composer input"
        />
      </div>
      <output aria-label="lift offset">{liftOffset}</output>
      <output aria-label="measuring keyboard">{String(measuringKeyboard)}</output>
    </div>
  );
}

function installVisualViewport(): () => void {
  const original = window.visualViewport;
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: {
      height: 500,
      offsetTop: 0,
      addEventListener:
        vi.fn<
          (
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | AddEventListenerOptions,
          ) => void
        >(),
      removeEventListener:
        vi.fn<
          (
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | EventListenerOptions,
          ) => void
        >(),
    },
  });
  return () => {
    if (original) {
      Object.defineProperty(window, "visualViewport", { configurable: true, value: original });
    } else {
      Reflect.deleteProperty(window, "visualViewport");
    }
  };
}

async function waitForTwoFrames(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

describe("useComposerKeyboard", () => {
  beforeEach(() => {
    keyboardMock.offset = 0;
    keyboardMock.liftOffset = undefined;
    keyboardMock.visibilityOffset = undefined;
    window.localStorage.clear();
    vi.unstubAllGlobals();
    resetComposerKeyboardMemoryForTests();
    scrollLockMock.lockComposeScroll.mockClear();
    scrollLockMock.unlockComposeScroll.mockClear();
    scrollLockMock.focusWithoutScroll.mockClear();
  });

  it("refocuses a stale-focused editor when the keyboard is hidden", () => {
    render(<ComposerKeyboardHarness />);
    const input = screen.getByRole("textbox");

    act(() => input.focus());
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
    input.innerHTML = "First line<div>Second line</div>";
    Object.defineProperty(input, "scrollHeight", { configurable: true, value: 120 });
    input.scrollTop = 0;

    const pointerDown = createEvent.pointerDown(input, {
      pointerType: "touch",
      cancelable: true,
    });
    fireEvent(input, pointerDown);

    expect(focusOrder).toEqual(["expand", "sentinel", "input"]);
    const selection = window.getSelection();
    expect(selection?.anchorNode).toBe(input);
    expect(selection?.anchorOffset).toBe(input.childNodes.length);
    expect(input.scrollTop).toBe(120);
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

    act(() => input.focus());
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

      act(() => {
        outside.focus();
        for (const callback of frameCallbacks) callback(0);
      });

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

  it("focuses only the keyboard primer until cold first focus has a measured keyboard height", async () => {
    const restoreVisualViewport = installVisualViewport();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    try {
      const { rerender } = render(<ComposerKeyboardHarness />);
      const input = screen.getByRole("textbox");
      expect(screen.getByLabelText("lift offset")).toHaveTextContent("0");
      expect(screen.getByLabelText("measuring keyboard")).toHaveTextContent("false");

      const pointerDown = createEvent.pointerDown(input, {
        pointerType: "touch",
        cancelable: true,
      });
      fireEvent(input, pointerDown);

      expect(screen.getByLabelText("lift offset")).toHaveTextContent("0");
      expect(screen.getByLabelText("measuring keyboard")).toHaveTextContent("true");
      expect(document.activeElement).toHaveAttribute("data-composer-keyboard-primer");
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dataset: expect.objectContaining({ composerKeyboardPrimer: "" }),
        }),
      );

      keyboardMock.offset = 320;
      rerender(<ComposerKeyboardHarness />);

      expect(document.activeElement).toHaveAttribute("data-composer-keyboard-primer");
      expect(screen.getByLabelText("measuring keyboard")).toHaveTextContent("true");

      act(() => {
        vi.runOnlyPendingTimers();
      });
      await act(async () => {
        await waitForTwoFrames();
      });

      expect(screen.getByLabelText("lift offset")).toHaveTextContent("320");
      expect(screen.getByLabelText("measuring keyboard")).toHaveTextContent("false");
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(
        scrollLockMock.focusWithoutScroll.mock.calls.length - 1,
        expect.objectContaining({
          dataset: expect.objectContaining({ composerFocusSentinel: "" }),
        }),
      );
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenLastCalledWith(input);
      expect(document.activeElement).toBe(input);
    } finally {
      vi.useRealTimers();
      restoreVisualViewport();
    }
  });

  it("focuses directly on Android and ignores legacy shared remembered height", () => {
    const restoreVisualViewport = installVisualViewport();
    vi.stubGlobal("Capacitor", { getPlatform: () => "android" });
    window.localStorage.setItem("poracode-mobile-keyboard-height", "480");
    window.localStorage.setItem("poracode-mobile-keyboard-height:android", "336");
    resetComposerKeyboardMemoryForTests();

    try {
      render(<ComposerKeyboardHarness />);
      const input = screen.getByRole("textbox");

      const pointerDown = createEvent.pointerDown(input, {
        pointerType: "touch",
        cancelable: true,
      });
      fireEvent(input, pointerDown);

      expect(document.activeElement).toBe(input);
      expect(document.activeElement).not.toHaveAttribute("data-composer-keyboard-primer");
      expect(screen.getByLabelText("lift offset")).toHaveTextContent("0");
      expect(screen.getByLabelText("measuring keyboard")).toHaveTextContent("false");
      expect(window.localStorage.getItem("poracode-mobile-keyboard-height")).toBe("480");
      expect(window.localStorage.getItem("poracode-mobile-keyboard-height:android")).toBe("336");
    } finally {
      restoreVisualViewport();
    }
  });

  it("pins the lift to the remembered height while the primer probes on first focus", async () => {
    const restoreVisualViewport = installVisualViewport();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    window.localStorage.setItem("poracode-mobile-keyboard-height", "347");

    try {
      const { rerender } = render(<ComposerKeyboardHarness />);
      const input = screen.getByRole("textbox");

      const pointerDown = createEvent.pointerDown(input, {
        pointerType: "touch",
        cancelable: true,
      });
      fireEvent(input, pointerDown);

      // The primer still owns focus (focusing the editable before the
      // keyboard is up makes iOS pan the page), but the dock is already
      // lifted by the remembered height instead of hidden.
      expect(document.activeElement).toHaveAttribute("data-composer-keyboard-primer");
      expect(screen.getByLabelText("measuring keyboard")).toHaveTextContent("true");
      expect(screen.getByLabelText("lift offset")).toHaveTextContent("347");

      // Interim measurements during the keyboard's rise must not move the
      // pinned lift.
      keyboardMock.offset = 209;
      rerender(<ComposerKeyboardHarness />);
      expect(screen.getByLabelText("lift offset")).toHaveTextContent("347");

      keyboardMock.offset = 320;
      rerender(<ComposerKeyboardHarness />);
      expect(screen.getByLabelText("lift offset")).toHaveTextContent("347");

      act(() => {
        vi.runOnlyPendingTimers();
      });
      await act(async () => {
        await waitForTwoFrames();
      });

      // Probe done: the real editor takes focus and the measured offset wins.
      expect(document.activeElement).toBe(input);
      expect(screen.getByLabelText("measuring keyboard")).toHaveTextContent("false");
      expect(screen.getByLabelText("lift offset")).toHaveTextContent("320");
    } finally {
      vi.useRealTimers();
      restoreVisualViewport();
    }
  });

  it("probes through the primer again when refocusing after the keyboard was dismissed", () => {
    const restoreVisualViewport = installVisualViewport();
    window.localStorage.setItem("poracode-mobile-keyboard-height", "347");

    try {
      keyboardMock.offset = 347;
      const { rerender } = render(<ComposerKeyboardHarness />);
      const input = screen.getByRole("textbox");

      act(() => input.focus());
      fireEvent.focusIn(input);

      // The dismiss key hides the keyboard without blurring the editor.
      keyboardMock.offset = 0;
      rerender(<ComposerKeyboardHarness />);

      // Refocusing must raise the keyboard from closed — that goes through
      // the primer (a directly focused editable makes iOS pan the page),
      // with the dock pre-positioned at the remembered lift.
      const pointerDown = createEvent.pointerDown(input, {
        pointerType: "touch",
        cancelable: true,
      });
      fireEvent(input, pointerDown);

      expect(document.activeElement).toHaveAttribute("data-composer-keyboard-primer");
      expect(screen.getByLabelText("measuring keyboard")).toHaveTextContent("true");
      expect(screen.getByLabelText("lift offset")).toHaveTextContent("347");
    } finally {
      restoreVisualViewport();
    }
  });

  it("does not focus the real editor when cold first focus times out without measurement", () => {
    const restoreVisualViewport = installVisualViewport();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    try {
      render(<ComposerKeyboardHarness />);
      const input = screen.getByRole("textbox");

      const pointerDown = createEvent.pointerDown(input, {
        pointerType: "touch",
        cancelable: true,
      });
      fireEvent(input, pointerDown);

      expect(document.activeElement).toHaveAttribute("data-composer-keyboard-primer");

      act(() => {
        vi.advanceTimersByTime(1_200);
      });

      expect(document.activeElement).not.toBe(input);
      expect(screen.getByLabelText("lift offset")).toHaveTextContent("0");
      expect(screen.getByLabelText("measuring keyboard")).toHaveTextContent("false");
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      restoreVisualViewport();
    }
  });

  it("ignores mouse pointerdown on a mouse-only device (native focus path)", () => {
    setTouchCapableOverrideForTests(false);
    try {
      render(<ComposerKeyboardHarness />);
      const input = screen.getByRole("textbox");

      const pointerDown = createEvent.pointerDown(input, {
        pointerType: "mouse",
        cancelable: true,
      });
      fireEvent(input, pointerDown);

      // No guarded choreography: the click keeps its default so the browser
      // focuses the input natively with correct caret placement.
      expect(pointerDown.defaultPrevented).toBe(false);
      expect(scrollLockMock.focusWithoutScroll).not.toHaveBeenCalled();
      expect(scrollLockMock.lockComposeScroll).not.toHaveBeenCalled();

      // The native focus that follows must not engage the scroll lock either.
      act(() => input.focus());
      expect(scrollLockMock.lockComposeScroll).not.toHaveBeenCalled();
    } finally {
      setTouchCapableOverrideForTests(null);
    }
  });

  it("focuses directly without primer or scroll lock for mouse pointerdown on a hybrid device", () => {
    setTouchCapableOverrideForTests(true);
    try {
      const onBeforeGuardedFocus = vi.fn<() => void>();
      render(<ComposerKeyboardHarness onBeforeGuardedFocus={onBeforeGuardedFocus} />);
      const input = screen.getByRole("textbox");

      const pointerDown = createEvent.pointerDown(input, {
        pointerType: "mouse",
        cancelable: true,
      });
      fireEvent(input, pointerDown);

      // Hybrids keep the touch tap shield, so the mouse click is intercepted —
      // but it lands as a plain programmatic focus (no primer probe).
      expect(pointerDown.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(input);
      expect(onBeforeGuardedFocus).toHaveBeenCalledTimes(1);
      expect(scrollLockMock.focusWithoutScroll).not.toHaveBeenCalled();
    } finally {
      setTouchCapableOverrideForTests(null);
    }
  });

  it("allows native caret placement while the keyboard is visible", () => {
    keyboardMock.offset = 320;
    render(<ComposerKeyboardHarness />);
    const input = screen.getByRole("textbox");

    act(() => input.focus());
    const pointerDown = createEvent.pointerDown(input, {
      pointerType: "touch",
      cancelable: true,
    });
    fireEvent(input, pointerDown);

    expect(pointerDown.defaultPrevented).toBe(false);
  });
});
