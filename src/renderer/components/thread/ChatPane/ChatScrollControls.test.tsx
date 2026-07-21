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
      threadId="thread-1"
      tailLoaderVisible={false}
      initialScrollSettled={props.initialScrollSettled ?? true}
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

  it("resumes sticking to the bottom when a message is submitted", () => {
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
    const renderHarness = () => (
      <Harness
        scrollEl={scrollEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
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
