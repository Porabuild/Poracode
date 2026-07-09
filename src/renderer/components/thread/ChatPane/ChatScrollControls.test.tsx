import { describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { createRef, useRef } from "react";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { ChatScrollControls, type ChatScrollControlsHandle } from "./ChatScrollControls";

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: Object.assign(
    (selector: (s: { chatScrollToBottomTokens: Record<string, number> }) => unknown) =>
      selector({ chatScrollToBottomTokens: {} }),
    {
      subscribe: () => () => undefined,
      getState: () => ({ chatScrollToBottomTokens: {} }),
    },
  ),
}));

vi.mock("@/renderer/state/panelResizeSignal", () => ({
  isPanelResizing: () => false,
  subscribePanelResize: () => () => undefined,
}));

function Harness(props: {
  scrollEl: HTMLDivElement;
  contentEl: HTMLDivElement;
  controlsRef: React.RefObject<ChatScrollControlsHandle | null>;
  virtualScrollToBottom: () => void;
  initialScrollSettled?: boolean;
}) {
  const scrollRef = useRef(props.scrollEl);
  const contentRef = useRef(props.contentEl);
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
      onInitialScrollSettled={() => undefined}
    />
  );
}

describe("ChatScrollControls", () => {
  it("skips scrollTop writes and virtualizer reconcile when already at bottom", () => {
    const scrollEl = document.createElement("div");
    const contentEl = document.createElement("div");
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
        contentEl={contentEl}
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
    const contentEl = document.createElement("div");
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
        contentEl={contentEl}
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

  it("writes scrollTop when content grows past the bottom pin", () => {
    let scrollTop = 100;
    const scrollEl = document.createElement("div");
    const contentEl = document.createElement("div");
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
    const virtualScrollToBottom = vi.fn<() => void>();
    const controlsRef = createRef<ChatScrollControlsHandle>();

    renderWithI18n(
      <Harness
        scrollEl={scrollEl}
        contentEl={contentEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
      />,
    );

    act(() => {
      controlsRef.current?.onContentHeightChange();
    });

    expect(scrollTop).toBe(1000);
  });

  it("re-pins when content grows after an open pin even if the at-bottom cache is warm", async () => {
    // Regression: the open-storm at-bottom time cache used to short-circuit even
    // when scrollHeight grew, so newly opened chats stayed mid-transcript.
    let scrollHeight = 400;
    let scrollTop = 200;
    const scrollEl = document.createElement("div");
    const contentEl = document.createElement("div");
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
        contentEl={contentEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
      />,
    );

    // Mount open path pins at the short estimated height (scrollTop -> 400).
    expect(scrollTop).toBe(400);

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

    expect(scrollTop).toBe(1200);
  });

  it("re-pins when content shrinks while sticky (tool collapse)", async () => {
    // Regression: collapsing a tool while at the bottom shrank scrollHeight;
    // shouldSkip treated the transient geometry as still-at-bottom and skipped
    // the pin write, leaving the transcript above the bottom.
    let scrollHeight = 1000;
    let scrollTop = 800;
    const scrollEl = document.createElement("div");
    const contentEl = document.createElement("div");
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
        contentEl={contentEl}
        controlsRef={controlsRef}
        virtualScrollToBottom={virtualScrollToBottom}
      />,
    );

    // Mount pins at bottom of the tall content.
    expect(scrollTop).toBe(1000);

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

    expect(scrollTop).toBe(700);
  });
});
