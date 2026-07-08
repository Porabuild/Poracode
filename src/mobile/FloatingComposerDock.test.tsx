// @vitest-environment jsdom
import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingComposerDock } from "./FloatingComposerDock";
import { resetComposerKeyboardMemoryForTests } from "./useComposerKeyboard";

const keyboardMock = vi.hoisted(() => ({ offset: 0 }));
const scrollLockMock = vi.hoisted(() => ({
  focusWithoutScroll: vi.fn<(element: HTMLElement | null | undefined) => void>((element) =>
    element?.focus(),
  ),
  lockComposeScroll: vi.fn<(source?: HTMLElement | null) => void>(),
  unlockComposeScroll: vi.fn<() => void>(),
}));

vi.mock("./useKeyboardOffset", () => ({
  useKeyboardOffset: () => keyboardMock.offset,
}));

vi.mock("./composeScrollLock", () => scrollLockMock);

function installVisualViewport(): () => void {
  const original = window.visualViewport;
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: {
      height: 500,
      offsetTop: 0,
      pageTop: 0,
      scale: 1,
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

function ControlledDockHarness() {
  const [expanded, setExpanded] = useState(false);

  return (
    <FloatingComposerDock
      keyboardKey="thread-1"
      expanded={expanded}
      focusOnExpand
      scrimLabel="Close composer"
      collapsedTapLabel="Open composer"
      onExpandedChange={setExpanded}
    >
      <div data-composer-input-anchor="">
        <div
          role="textbox"
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          aria-label="Composer input"
        />
      </div>
    </FloatingComposerDock>
  );
}

function FocusLossHarness(props: { collapseOnFocusLoss?: boolean }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <FloatingComposerDock
      keyboardKey="thread-1"
      expanded={expanded}
      scrimLabel="Close composer"
      onExpandedChange={setExpanded}
      {...(props.collapseOnFocusLoss ? { collapseOnFocusLoss: true } : {})}
    >
      <div data-composer-input-anchor="">
        <div
          role="textbox"
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          aria-label="Composer input"
        />
      </div>
    </FloatingComposerDock>
  );
}

describe("FloatingComposerDock", () => {
  beforeEach(() => {
    keyboardMock.offset = 0;
    window.localStorage.clear();
    resetComposerKeyboardMemoryForTests();
    scrollLockMock.focusWithoutScroll.mockClear();
    scrollLockMock.lockComposeScroll.mockClear();
    scrollLockMock.unlockComposeScroll.mockClear();
  });

  it("reports composer focus before focusing the editor on guarded first focus", () => {
    const order: string[] = [];
    scrollLockMock.focusWithoutScroll.mockImplementation((element) => {
      order.push(element?.hasAttribute("data-composer-focus-sentinel") ? "sentinel" : "input");
      element?.focus();
    });

    render(
      <FloatingComposerDock
        keyboardKey="thread-1"
        scrimLabel="Close composer"
        onComposerFocusChange={(focused) => order.push(`focus:${String(focused)}`)}
      >
        <div data-composer-input-anchor="">
          <div
            role="textbox"
            tabIndex={0}
            contentEditable
            suppressContentEditableWarning
            aria-label="Composer input"
          />
        </div>
      </FloatingComposerDock>,
    );
    order.length = 0;

    const input = screen.getByRole("textbox");
    const pointerDown = createEvent.pointerDown(input, {
      cancelable: true,
      pointerType: "touch",
    });
    fireEvent(input, pointerDown);

    expect(order.indexOf("focus:true")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("focus:true")).toBeLessThan(order.indexOf("sentinel"));
    expect(order.indexOf("sentinel")).toBeLessThan(order.indexOf("input"));
  });

  it("uses the keyboard primer before expanding from the compact composer on cold first focus", async () => {
    const restoreVisualViewport = installVisualViewport();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onExpandedChange = vi.fn<(expanded: boolean) => void>();

    try {
      const { rerender } = render(
        <FloatingComposerDock
          keyboardKey="thread-1"
          scrimLabel="Close composer"
          collapsedTapLabel="Open composer"
          onExpandedChange={onExpandedChange}
        >
          <div data-composer-input-anchor="">
            <div
              role="textbox"
              tabIndex={0}
              contentEditable
              suppressContentEditableWarning
              aria-label="Composer input"
            />
          </div>
        </FloatingComposerDock>,
      );
      const input = screen.getByRole("textbox");
      const compactTapTarget = screen.getByLabelText("Open composer");

      const pointerDown = createEvent.pointerDown(compactTapTarget, {
        cancelable: true,
        pointerType: "touch",
      });
      fireEvent(compactTapTarget, pointerDown);

      expect(pointerDown.defaultPrevented).toBe(true);
      expect(onExpandedChange).not.toHaveBeenCalled();
      expect(document.activeElement).toHaveAttribute("data-composer-keyboard-primer");
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dataset: expect.objectContaining({ composerKeyboardPrimer: "" }),
        }),
      );

      keyboardMock.offset = 320;
      rerender(
        <FloatingComposerDock
          keyboardKey="thread-1"
          scrimLabel="Close composer"
          collapsedTapLabel="Open composer"
          onExpandedChange={onExpandedChange}
        >
          <div data-composer-input-anchor="">
            <div
              role="textbox"
              tabIndex={0}
              contentEditable
              suppressContentEditableWarning
              aria-label="Composer input"
            />
          </div>
        </FloatingComposerDock>,
      );

      act(() => {
        vi.runOnlyPendingTimers();
      });
      await act(async () => {
        await waitForTwoFrames();
      });

      expect(onExpandedChange).toHaveBeenCalledWith(true);
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

  it("snaps the dock with data-instant-expand on the warm guarded-focus path", () => {
    keyboardMock.offset = 320;

    render(
      <FloatingComposerDock keyboardKey="thread-1" scrimLabel="Close composer">
        <div data-composer-input-anchor="">
          <div
            role="textbox"
            tabIndex={0}
            contentEditable
            suppressContentEditableWarning
            aria-label="Composer input"
          />
        </div>
      </FloatingComposerDock>,
    );

    const input = screen.getByRole("textbox");
    const pointerDown = createEvent.pointerDown(input, { cancelable: true, pointerType: "touch" });
    fireEvent(input, pointerDown);

    const dock = document.querySelector(".m-compose-dock");
    expect(dock).toHaveAttribute("data-expanded");
    // Warm path (keyboard already up, focus inside the gesture) must sit at
    // final geometry before focus() — the expansion snaps, no transitions.
    expect(dock).toHaveAttribute("data-instant-expand");
  });

  it("animates the probe expansion (no data-instant-expand) with a remembered keyboard height", () => {
    const restoreVisualViewport = installVisualViewport();
    // A remembered per-device height lets the dock expand at probe start; during
    // the probe the primer holds focus, so the expansion can animate.
    window.localStorage.setItem("lightcode-mobile-keyboard-height", "320");
    resetComposerKeyboardMemoryForTests();

    try {
      render(
        <FloatingComposerDock
          keyboardKey="thread-1"
          scrimLabel="Close composer"
          collapsedTapLabel="Open composer"
        >
          <div data-composer-input-anchor="">
            <div
              role="textbox"
              tabIndex={0}
              contentEditable
              suppressContentEditableWarning
              aria-label="Composer input"
            />
          </div>
        </FloatingComposerDock>,
      );

      const tapTarget = screen.getByLabelText("Open composer");
      const pointerDown = createEvent.pointerDown(tapTarget, {
        cancelable: true,
        pointerType: "touch",
      });
      fireEvent(tapTarget, pointerDown);

      const dock = document.querySelector(".m-compose-dock");
      expect(dock).toHaveAttribute("data-expanded");
      expect(dock).not.toHaveAttribute("data-instant-expand");
    } finally {
      restoreVisualViewport();
    }
  });

  it("collapses on input focus loss when collapseOnFocusLoss is set", async () => {
    render(<FocusLossHarness collapseOnFocusLoss />);
    const input = screen.getByRole("textbox");
    const dock = document.querySelector(".m-compose-dock");
    expect(dock).toHaveAttribute("data-expanded");

    fireEvent.focusIn(input);
    fireEvent.focusOut(input);

    await waitFor(() => expect(dock).not.toHaveAttribute("data-expanded"));
  });

  it("stays expanded on input focus loss without collapseOnFocusLoss", async () => {
    render(<FocusLossHarness />);
    const input = screen.getByRole("textbox");
    const dock = document.querySelector(".m-compose-dock");
    expect(dock).toHaveAttribute("data-expanded");

    fireEvent.focusIn(input);
    fireEvent.focusOut(input);

    await waitFor(() => expect(dock).toHaveAttribute("data-expanded"));
  });

  it("does not run focusOnExpand again after compact tap expands a controlled dock", async () => {
    const restoreVisualViewport = installVisualViewport();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const { rerender } = render(<ControlledDockHarness />);
      const input = screen.getByRole("textbox");

      const pointerDown = createEvent.pointerDown(screen.getByLabelText("Open composer"), {
        cancelable: true,
        pointerType: "touch",
      });
      fireEvent(screen.getByLabelText("Open composer"), pointerDown);

      expect(document.activeElement).toHaveAttribute("data-composer-keyboard-primer");

      keyboardMock.offset = 320;
      rerender(<ControlledDockHarness />);

      act(() => {
        vi.runOnlyPendingTimers();
      });
      await act(async () => {
        await waitForTwoFrames();
      });

      expect(document.activeElement).toBe(input);
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenCalledTimes(3);
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          dataset: expect.objectContaining({ composerKeyboardPrimer: "" }),
        }),
      );
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          dataset: expect.objectContaining({ composerFocusSentinel: "" }),
        }),
      );
      expect(scrollLockMock.focusWithoutScroll).toHaveBeenNthCalledWith(3, input);
      expect(
        logSpy.mock.calls.some(
          ([, event, data]) =>
            event === "programmatic-focus-request" &&
            typeof data === "object" &&
            data !== null &&
            "source" in data &&
            data.source === "focus-on-expand",
        ),
      ).toBe(false);
    } finally {
      logSpy.mockRestore();
      vi.useRealTimers();
      restoreVisualViewport();
    }
  });
});
