import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { createRef, useRef } from "react";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { ChatScrollControls, type ChatScrollControlsHandle } from "./ChatScrollControls";

let scrollToBottomToken = 0;

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (s: { chatScrollToBottomTokens: Record<string, number> }) => unknown) =>
    selector({ chatScrollToBottomTokens: { "thread-1": scrollToBottomToken } }),
}));

vi.mock("@/renderer/state/panelResizeSignal", () => ({
  isPanelResizing: () => false,
  subscribePanelResize: () => () => undefined,
}));

function Harness(props: {
  scrollEl: HTMLDivElement;
  controlsRef: React.RefObject<ChatScrollControlsHandle | null>;
  virtualScrollToBottom: () => void;
  initialScrollSettled?: boolean;
  initialScrollRevealDelayMs?: number;
  tailEntryId?: string | null;
  onInitialScrollSettled?: () => void;
}) {
  const scrollRef = useRef(props.scrollEl);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const virtualScrollToBottomRef = useRef(props.virtualScrollToBottom);
  return (
    <ChatScrollControls
      ref={props.controlsRef}
      scrollRef={scrollRef}
      contentRef={contentRef}
      layoutChangeToken={null}
      tailEntryId={props.tailEntryId ?? "entry-1"}
      threadId="thread-1"
      tailLoaderVisible={false}
      initialScrollSettled={props.initialScrollSettled ?? true}
      initialScrollRevealDelayMs={props.initialScrollRevealDelayMs ?? 0}
      virtualScrollToBottomRef={virtualScrollToBottomRef}
      onInitialScrollSettled={props.onInitialScrollSettled ?? (() => undefined)}
    />
  );
}

describe("ChatScrollControls", () => {
  beforeEach(() => {
    scrollToBottomToken = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("skips scrollTop writes and virtualizer reconcile when already at bottom", () => {
    const scrollEl = document.createElement("div");
    const scrollTopSetter = vi.fn<(value: number) => void>();
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => 1000 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => 800,
        set: scrollTopSetter,
      },
    });
    const virtualScrollToBottom = vi.fn<() => void>();
    const controlsRef = createRef<ChatScrollControlsHandle>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
      />,
    );

    scrollTopSetter.mockClear();
    virtualScrollToBottom.mockClear();

    act(() => {
      controlsRef.current?.onContentHeightChange();
    });

    expect(scrollTopSetter).not.toHaveBeenCalled();
    expect(virtualScrollToBottom).not.toHaveBeenCalled();
  });

  it("reports thread-open settling until a user scroll-away ends the window", () => {
    let scrollTop = 100;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => 1000 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const controlsRef = createRef<ChatScrollControlsHandle>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={() => undefined}
      />,
    );

    // The [threadId] open effect just armed the coalesce window.
    expect(controlsRef.current?.isThreadOpenSettling()).toBe(true);

    act(() => {
      controlsRef.current?.disableStickToBottom();
    });

    // A scroll-away zeroes the window so consumers stop suppressing work.
    expect(controlsRef.current?.isThreadOpenSettling()).toBe(false);
  });

  it("reveals the initial transcript only after a post-reconcile animation frame", () => {
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextAnimationFrameHandle = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextAnimationFrameHandle += 1;
      animationFrames.set(nextAnimationFrameHandle, callback);
      return nextAnimationFrameHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      animationFrames.delete(handle);
    });
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => 1000 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: { configurable: true, writable: true, value: 800 },
    });
    const onInitialScrollSettled = vi.fn<() => void>();
    const virtualScrollToBottom = vi.fn<() => void>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={createRef<ChatScrollControlsHandle>()}
        virtualScrollToBottom={virtualScrollToBottom}
        initialScrollSettled={false}
        onInitialScrollSettled={onInitialScrollSettled}
      />,
    );

    // Flush only the callbacks that were already queued at each paint. The
    // reveal callback scheduled by the second settle must wait for the next
    // paint instead of exposing LegendList's estimated offset.
    const flushPaint = () => {
      const callbacks = [...animationFrames.values()];
      animationFrames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    };
    flushPaint();
    expect(onInitialScrollSettled).not.toHaveBeenCalled();
    flushPaint();
    expect(onInitialScrollSettled).not.toHaveBeenCalled();
    flushPaint();
    expect(onInitialScrollSettled).not.toHaveBeenCalled();
    const reconcilesBeforeReveal = virtualScrollToBottom.mock.calls.length;
    flushPaint();
    expect(onInitialScrollSettled).toHaveBeenCalledOnce();
    expect(virtualScrollToBottom).toHaveBeenCalledTimes(reconcilesBeforeReveal);
  });

  it("waits for an opt-in delay after virtualizer settle before revealing", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextAnimationFrameHandle = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextAnimationFrameHandle += 1;
      animationFrames.set(nextAnimationFrameHandle, callback);
      return nextAnimationFrameHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      animationFrames.delete(handle);
    });
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => 1000 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const onInitialScrollSettled = vi.fn<() => void>();
    const controlsRef = createRef<ChatScrollControlsHandle>();
    const virtualScrollToBottom = vi.fn<() => void>();

    const view = renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
        initialScrollSettled={false}
        initialScrollRevealDelayMs={50}
        onInitialScrollSettled={onInitialScrollSettled}
      />,
    );

    const flushPaint = () => {
      const callbacks = [...animationFrames.values()];
      animationFrames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    };
    flushPaint();
    flushPaint();
    flushPaint();
    flushPaint();

    // A late LegendList anchor adjustment moves upward while the transcript
    // is hidden. The mobile reveal must not mistake its anti-drag holdoff for
    // real user intent and strand the viewport here.
    scrollTop = 400;
    fireEvent.scroll(scrollEl);

    // Another measurement 100ms later extends the virtualizer deadline. The
    // original timeout must wake without revealing and follow the new one.
    now = 1_100;
    act(() => controlsRef.current?.beginVirtualizerLayoutChange());

    expect(onInitialScrollSettled).not.toHaveBeenCalled();
    now = 1_299;
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onInitialScrollSettled).not.toHaveBeenCalled();
    expect(scrollTop).toBe(400);
    now = 1_300;
    act(() => {
      vi.advanceTimersByTime(1);
    });
    // The late measurement moved settle+50ms to t=1400.
    expect(onInitialScrollSettled).not.toHaveBeenCalled();
    now = 1_399;
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(onInitialScrollSettled).not.toHaveBeenCalled();
    now = 1_400;
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onInitialScrollSettled).toHaveBeenCalledOnce();
    expect(scrollTop).toBe(1000);

    virtualScrollToBottom.mockClear();
    view.rerender(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
        initialScrollSettled
        initialScrollRevealDelayMs={50}
        onInitialScrollSettled={onInitialScrollSettled}
      />,
    );
    expect(virtualScrollToBottom).not.toHaveBeenCalled();
  });

  it("does not extend the initial reveal wait for live layout changes", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextAnimationFrameHandle = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextAnimationFrameHandle += 1;
      animationFrames.set(nextAnimationFrameHandle, callback);
      return nextAnimationFrameHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      animationFrames.delete(handle);
    });
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => 1000 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const onInitialScrollSettled = vi.fn<() => void>();
    const controlsRef = createRef<ChatScrollControlsHandle>();
    const virtualScrollToBottom = vi.fn<() => void>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
        initialScrollSettled={false}
        initialScrollRevealDelayMs={50}
        onInitialScrollSettled={onInitialScrollSettled}
      />,
    );

    const flushPaint = () => {
      const callbacks = [...animationFrames.values()];
      animationFrames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    };
    flushPaint();
    flushPaint();
    flushPaint();
    flushPaint();

    // A streaming row grows before the initial settle completes. It still arms
    // the general layout guard, but the original t=1300 reveal remains fixed.
    now = 1_100;
    act(() => {
      controlsRef.current?.beginLiveVirtualizerLayoutChange();
    });

    now = 1_299;
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onInitialScrollSettled).not.toHaveBeenCalled();

    now = 1_300;
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onInitialScrollSettled).toHaveBeenCalledOnce();
    expect(scrollTop).toBe(1000);
  });

  it("pins streaming content growth synchronously without waiting for LegendList", () => {
    let scrollHeight = 1000;
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const virtualScrollToBottom = vi.fn<() => void>();
    const controlsRef = createRef<ChatScrollControlsHandle>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
      />,
    );

    // Opening/reconciling the virtualized list still delegates to LegendList.
    expect(virtualScrollToBottom).toHaveBeenCalled();
    virtualScrollToBottom.mockClear();

    // The live row grows before LegendList's async scrollToEnd can settle.
    scrollHeight = 1025;
    act(() => {
      controlsRef.current?.onContentHeightChange();
    });

    expect(virtualScrollToBottom).not.toHaveBeenCalled();
    expect(scrollTop).toBe(1025);
  });

  it("keeps following the tail when composer edits resize the viewport", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let resizeCallback: ResizeObserverCallback | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    // Finish the normal open settle before exercising the synchronous resize
    // path; a pending settle pin would mask this regression.
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextAnimationFrameHandle = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextAnimationFrameHandle += 1;
      animationFrames.set(nextAnimationFrameHandle, callback);
      return nextAnimationFrameHandle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      animationFrames.delete(handle);
    });

    const scrollHeight = 1000;
    let clientHeight = 200;
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => clientHeight },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = Math.min(value, scrollHeight - clientHeight);
        },
      },
    });

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={createRef<ChatScrollControlsHandle>()}
        virtualScrollToBottom={() => undefined}
      />,
    );

    while (animationFrames.size > 0) {
      const callbacks = [...animationFrames.values()];
      animationFrames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    }
    now = 1000;

    act(() => {
      // Chromium/LegendList can adjust scrollTop before ResizeObserver reports
      // the viewport shrink caused by a taller composer.
      clientHeight = 160;
      scrollTop = 760;
      scrollEl.dispatchEvent(new Event("scroll"));
      const callback = resizeCallback as ResizeObserverCallback | null;
      callback?.([{ target: scrollEl } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    });

    expect(scrollTop).toBe(840);

    while (animationFrames.size > 0) {
      const callbacks = [...animationFrames.values()];
      animationFrames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    }

    act(() => {
      // Removing a line grows the chat viewport. LegendList can adjust its
      // visible-content anchor before ResizeObserver reports that inverse
      // composer resize, so the previous at-bottom cache must not suppress
      // the corrective pin.
      clientHeight = 200;
      scrollTop = 760;
      scrollEl.dispatchEvent(new Event("scroll"));
      const callback = resizeCallback as ResizeObserverCallback | null;
      callback?.([{ target: scrollEl } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    });

    while (animationFrames.size > 0) {
      const callbacks = [...animationFrames.values()];
      animationFrames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    }

    expect(scrollTop).toBe(800);
  });

  it("keeps sticky while LegendList adjusts its anchor before scrollHeight changes", async () => {
    let scrollHeight = 1000;
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const controlsRef = createRef<ChatScrollControlsHandle>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={() => undefined}
      />,
    );

    act(() => {
      controlsRef.current?.beginVirtualizerLayoutChange();
      // Visible-content anchoring moves first; the matching height update is
      // not observable until LegendList completes its measurement pass.
      scrollTop = 500;
      fireEvent.scroll(scrollEl);
    });

    expect(controlsRef.current?.isStickToBottom()).toBe(true);

    // The untagged upward move could equally be a native scrollbar-thumb drag
    // (no pointer events), so pins pause for a short holdoff before the next
    // content-growth pin reattaches the transcript.
    scrollHeight = 1200;
    act(() => controlsRef.current?.onContentHeightChange());
    expect(scrollTop).toBe(500);

    await new Promise((resolve) => setTimeout(resolve, 200));
    act(() => controlsRef.current?.onContentHeightChange());
    expect(scrollTop).toBe(1200);
  });

  it("re-pins an automatic tool-group collapse immediately on touch-first devices", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: query === "(hover: none) and (pointer: coarse)",
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    let scrollHeight = 1400;
    let scrollTop = 1200;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = Math.min(value, scrollHeight - 200);
        },
      },
    });
    const controlsRef = createRef<ChatScrollControlsHandle>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={() => undefined}
      />,
    );

    act(() => {
      // When the next assistant item arrives, the live tool group automatically
      // collapses. Its row shrinks before the post-commit height notification,
      // and LegendList's visible-content compensation rewrites scrollTop.
      scrollHeight = 1000;
      scrollTop = 500;
      fireEvent.scroll(scrollEl);
    });

    expect(scrollTop).toBe(800);
    expect(controlsRef.current?.isStickToBottom()).toBe(true);
  });

  it("re-pins after the submitted message is appended", () => {
    let scrollHeight = 1000;
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const controlsRef = createRef<ChatScrollControlsHandle>();
    const virtualScrollToBottom = vi.fn<() => void>();
    let tailEntryId = "entry-1";
    const renderHarness = () => (
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
        tailEntryId={tailEntryId}
      />
    );
    const { rerender } = renderWithI18n(renderHarness());

    act(() => {
      controlsRef.current?.markUserScrollIntent();
      controlsRef.current?.disableStickToBottom();
      scrollTop = 400;
    });

    scrollToBottomToken += 1;
    rerender(renderHarness());

    expect(virtualScrollToBottom).toHaveBeenCalled();
    expect(scrollTop).toBe(1000);
    expect(controlsRef.current?.isStickToBottom()).toBe(true);

    scrollHeight = 1200;
    tailEntryId = "submitted-entry";
    rerender(renderHarness());

    expect(scrollTop).toBe(1200);
    expect(controlsRef.current?.isStickToBottom()).toBe(true);
  });

  it("preserves manual scrollback when the tail changes without a submission", () => {
    let scrollHeight = 1000;
    let scrollTop = 800;
    let tailEntryId = "entry-1";
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const controlsRef = createRef<ChatScrollControlsHandle>();
    const renderHarness = () => (
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={() => undefined}
        tailEntryId={tailEntryId}
      />
    );
    const { rerender } = renderWithI18n(renderHarness());

    act(() => {
      controlsRef.current?.markUserScrollIntent();
      controlsRef.current?.disableStickToBottom();
      scrollTop = 400;
    });

    scrollHeight = 1200;
    tailEntryId = "new-agent-entry";
    rerender(renderHarness());

    expect(scrollTop).toBe(400);
    expect(controlsRef.current?.isStickToBottom()).toBe(false);
  });

  it("scrolls on the first button press during the scroll-away intent window", () => {
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => 1000 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const controlsRef = createRef<ChatScrollControlsHandle>();
    const virtualScrollToBottom = vi.fn<() => void>();
    const { getByRole } = renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
      />,
    );

    virtualScrollToBottom.mockClear();
    act(() => {
      controlsRef.current?.markUserScrollIntent();
      controlsRef.current?.disableStickToBottom();
      scrollTop = 400;
    });

    fireEvent.click(getByRole("button", { name: "Scroll to bottom" }));

    expect(virtualScrollToBottom).toHaveBeenCalledOnce();
    expect(scrollTop).toBe(1000);
    expect(controlsRef.current?.isStickToBottom()).toBe(true);
  });

  it("reasserts an explicit bottom pin after the virtualizer settles short", async () => {
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => 1000 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const controlsRef = createRef<ChatScrollControlsHandle>();
    const virtualScrollToBottom = vi.fn<() => void>(() => {
      requestAnimationFrame(() => {
        // LegendList's measured end excludes its trailing row gap, so its
        // deferred update can overwrite the direct scrollHeight pin.
        scrollTop = 775;
        fireEvent.scroll(scrollEl);
      });
    });
    const { getByRole } = renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
      />,
    );

    virtualScrollToBottom.mockClear();
    act(() => {
      controlsRef.current?.markUserScrollIntent();
      controlsRef.current?.disableStickToBottom();
      scrollTop = 400;
    });

    fireEvent.click(getByRole("button", { name: "Scroll to bottom" }));

    expect(virtualScrollToBottom).toHaveBeenCalledOnce();
    expect(scrollTop).toBe(1000);

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });

    expect(scrollTop).toBe(1000);
    expect(controlsRef.current?.isStickToBottom()).toBe(true);
  });

  it("re-pins when content grows after an open pin even if the at-bottom cache is warm", async () => {
    // Regression: the open-storm at-bottom time cache used to short-circuit even
    // when scrollHeight grew, so newly opened chats stayed mid-transcript.
    let scrollHeight = 400;
    let scrollTop = 200;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const virtualScrollToBottom = vi.fn<() => void>();
    const controlsRef = createRef<ChatScrollControlsHandle>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
      />,
    );

    // Mount open path delegates the short estimated-height pin to LegendList.
    expect(virtualScrollToBottom).toHaveBeenCalled();
    virtualScrollToBottom.mockClear();

    // Virtualizer measures taller rows; leave scrollTop where the short pin left it.
    scrollHeight = 1200;
    scrollTop = 200;

    // Open-storm layout sync is coalesced onto rAF — flush it.
    act(() => {
      controlsRef.current?.onContentHeightChange();
    });
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });

    expect(virtualScrollToBottom).toHaveBeenCalled();
    expect(scrollTop).toBe(1200);
  });

  it("re-pins when content shrinks while sticky (tool collapse)", async () => {
    // Regression: collapsing a tool while at the bottom shrank scrollHeight;
    // shouldSkip treated the transient geometry as still-at-bottom and skipped
    // the pin write, leaving the transcript above the bottom.
    let scrollHeight = 1000;
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    Object.defineProperties(scrollEl, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => 200 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    const virtualScrollToBottom = vi.fn<() => void>();
    const controlsRef = createRef<ChatScrollControlsHandle>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
      />,
    );

    // Mount delegates the tall-content pin to LegendList.
    expect(virtualScrollToBottom).toHaveBeenCalled();
    virtualScrollToBottom.mockClear();

    // Tool collapse: content shrinks; scrollTop left where it was (or partially
    // compensated), so we are no longer at the new bottom without a pin write.
    scrollHeight = 700;
    scrollTop = 600;

    act(() => {
      controlsRef.current?.onContentHeightChange();
    });
    // Layout sync may still be coalesced inside the open-storm window.
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });

    expect(virtualScrollToBottom).toHaveBeenCalled();
    expect(scrollTop).toBe(700);
  });
});
