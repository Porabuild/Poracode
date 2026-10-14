import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { createRef, type ComponentProps, type RefObject } from "react";
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

let now = 1_000;
let frames: Map<number, FrameRequestCallback>;
let observers: TestResizeObserver[];

class TestResizeObserver {
  readonly targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe = vi.fn<(element: Element) => void>((element) => {
    this.targets.add(element);
  });
  unobserve = vi.fn<(element: Element) => void>((element) => {
    this.targets.delete(element);
  });
  disconnect = vi.fn<() => void>(() => this.targets.clear());
}

function flushFrame() {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => callbacks.forEach((callback) => callback(now)));
}

function deliverResize(target: Element) {
  const observer = observers.find((candidate) => candidate.targets.has(target));
  expect(observer, "the actual element must be observed").toBeDefined();
  act(() => {
    observer?.callback([{ target } as ResizeObserverEntry], observer as unknown as ResizeObserver);
  });
}

function createScroller() {
  const geometry = { scrollHeight: 1000, clientHeight: 200, scrollTop: 800 };
  const clamp = (value: number) =>
    Math.max(0, Math.min(value, Math.max(0, geometry.scrollHeight - geometry.clientHeight)));
  const scrollHeight = vi.fn<() => number>(() => geometry.scrollHeight);
  const clientHeight = vi.fn<() => number>(() => geometry.clientHeight);
  const write = vi.fn<(value: number) => void>((value) => {
    geometry.scrollTop = clamp(value);
  });
  const element = document.createElement("div");
  Object.defineProperties(element, {
    scrollHeight: { get: scrollHeight },
    clientHeight: { get: clientHeight },
    scrollTop: { get: () => clamp(geometry.scrollTop), set: write },
  });
  return { element, geometry, scrollHeight, clientHeight, write };
}

function mountSettled(
  content: HTMLDivElement | null = document.createElement("div"),
  initialScrollSettled = true,
) {
  const scroller = createScroller();
  const controlsRef = createRef<ChatScrollControlsHandle>();
  const contentRef: RefObject<HTMLDivElement | null> = { current: content };
  const reconcile = vi.fn<() => void>();
  const props: ComponentProps<typeof ChatScrollControls> = {
    ref: controlsRef,
    scrollRef: { current: scroller.element },
    contentRef,
    virtualScrollToBottomRef: { current: reconcile },
    layoutChangeToken: null,
    tailEntryId: "entry-1",
    tailLoaderVisible: false,
    threadId: "thread-1",
    initialScrollSettled,
    initialScrollRevealDelayMs: 0,
    onInitialScrollSettled: () => undefined,
  };
  const view = renderWithI18n(<ChatScrollControls {...props} />);
  for (let i = 0; frames.size > 0 && i < 10; i += 1) flushFrame();
  expect(frames.size).toBe(0);
  now += 1_000;
  const clearReadsAndWrites = () => {
    scroller.scrollHeight.mockClear();
    scroller.clientHeight.mockClear();
    scroller.write.mockClear();
    reconcile.mockClear();
  };
  clearReadsAndWrites();
  return {
    ...scroller,
    controlsRef,
    contentRef,
    reconcile,
    clearReadsAndWrites,
    rerender: (changes: Partial<typeof props> = {}) => {
      Object.assign(props, changes);
      view.rerender(<ChatScrollControls {...props} />);
    },
    unmount: view.unmount,
    getByRole: view.getByRole,
  };
}

describe("ChatScrollControls settled streaming", () => {
  beforeEach(() => {
    scrollToBottomToken = 0;
    now = 1_000;
    frames = new Map();
    observers = [];
    let nextFrame = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => frames.delete(handle));
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses settled props after an initially unsettled mount", () => {
    const pane = mountSettled(document.createElement("div"), false);
    pane.rerender({ initialScrollSettled: true });
    for (let i = 0; frames.size > 0 && i < 10; i += 1) flushFrame();
    expect(frames.size).toBe(0);
    pane.clearReadsAndWrites();

    pane.rerender({ tailEntryId: "entry-after-reveal" });
    expect(pane.scrollHeight).not.toHaveBeenCalled();
    expect(pane.clientHeight).not.toHaveBeenCalled();
    expect(pane.reconcile).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);

    pane.geometry.scrollHeight = 1100;
    flushFrame();
    expect(pane.element.scrollTop).toBe(900);
    expect(pane.reconcile).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it.each([800, 775])(
    "coalesces a tail/loader burst and checks the final position %s without eager reads",
    (scrollTop) => {
      const pane = mountSettled();
      pane.rerender({ tailEntryId: "entry-2" });
      pane.rerender({ tailLoaderVisible: true });
      pane.rerender({ tailEntryId: "entry-3", tailLoaderVisible: false });

      expect(pane.scrollHeight).not.toHaveBeenCalled();
      expect(pane.clientHeight).not.toHaveBeenCalled();
      expect(pane.write).not.toHaveBeenCalled();
      expect(pane.reconcile).not.toHaveBeenCalled();
      expect(frames.size).toBe(1);

      // A same-size structural change can move the virtualizer's anchor without
      // a resize notification. An unchanged position needs no redundant write.
      pane.geometry.scrollTop = scrollTop;
      flushFrame();
      expect(pane.scrollHeight).toHaveBeenCalledOnce();
      expect(pane.clientHeight).toHaveBeenCalledOnce();
      expect(pane.write).toHaveBeenCalledTimes(scrollTop === 800 ? 0 : 1);
      expect(pane.element.scrollTop).toBe(800);
      expect(pane.reconcile).not.toHaveBeenCalled();
      expect(frames.size).toBe(0);
    },
  );

  it("pins observed content growth twice before paint using one fresh snapshot per pass", () => {
    const pane = mountSettled();
    pane.rerender({ tailEntryId: "entry-2" });
    // No new provider delta is needed for smoothing, image load or completion.
    for (const height of [1025, 1050]) {
      pane.geometry.scrollHeight = height;
      pane.clearReadsAndWrites();
      deliverResize(pane.contentRef.current!);
      expect(pane.element.scrollTop).toBe(height - 200);
      expect(pane.scrollHeight).toHaveBeenCalledOnce();
      expect(pane.clientHeight).toHaveBeenCalledOnce();
      expect(pane.write).toHaveBeenCalledOnce();
      expect(pane.reconcile).not.toHaveBeenCalled();
    }
    pane.clearReadsAndWrites();
    flushFrame();
    expect(pane.write).not.toHaveBeenCalled();
    expect(pane.reconcile).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("follows a late optimistic row and starts observing the content attached in the fallback", () => {
    const pane = mountSettled(null);
    act(() => {
      pane.controlsRef.current?.markUserScrollIntent();
      pane.controlsRef.current?.disableStickToBottom();
      pane.geometry.scrollTop = 400;
    });
    scrollToBottomToken += 1;
    pane.rerender();
    expect(pane.reconcile).toHaveBeenCalledOnce();
    expect(pane.element.scrollTop).toBe(800);

    pane.clearReadsAndWrites();
    pane.rerender({ tailEntryId: "optimistic-entry" });
    const content = document.createElement("div");
    pane.contentRef.current = content;
    pane.geometry.scrollHeight = 1200;
    flushFrame();
    expect(pane.element.scrollTop).toBe(1000);
    expect(pane.reconcile).not.toHaveBeenCalled();

    pane.geometry.scrollHeight = 1300;
    deliverResize(content);
    expect(pane.element.scrollTop).toBe(1100);
  });

  it("keeps the structural fallback and height notifications usable without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const pane = mountSettled(null);
    pane.geometry.scrollHeight = 1200;
    pane.rerender({ tailLoaderVisible: true });
    flushFrame();
    expect(pane.element.scrollTop).toBe(1000);
    pane.geometry.scrollHeight = 1250;
    act(() => pane.controlsRef.current?.onContentHeightChange());
    expect(pane.element.scrollTop).toBe(1050);
    expect(pane.reconcile).not.toHaveBeenCalled();
  });

  it.each([400, 798])(
    "honors intent arriving after queueing, even at scrollTop %s",
    (scrollTop) => {
      const pane = mountSettled();
      pane.rerender({ tailLoaderVisible: true });
      act(() => pane.controlsRef.current?.markUserScrollIntent());
      pane.geometry.scrollTop = scrollTop;
      // No scroll event/disable has run yet: the queued callback must read intent.
      flushFrame();
      expect(pane.write).not.toHaveBeenCalled();
      expect(pane.reconcile).not.toHaveBeenCalled();
      expect(pane.element.scrollTop).toBe(scrollTop);
    },
  );

  it("does not pin after scroll-away even if an already queued callback runs after cancellation", () => {
    const pane = mountSettled();
    pane.rerender({ tailEntryId: "entry-2" });
    const callbacks = [...frames.values()];
    act(() => {
      pane.controlsRef.current?.markUserScrollIntent();
      pane.controlsRef.current?.disableStickToBottom();
      pane.geometry.scrollTop = 400;
      fireEvent.scroll(pane.element);
    });
    pane.geometry.scrollHeight = 1200;
    deliverResize(pane.contentRef.current!);
    now += 1_000; // Sticky state must still guard after the intent window expires.
    act(() => callbacks.forEach((callback) => callback(now)));
    flushFrame();
    flushFrame();
    expect(pane.element.scrollTop).toBe(400);
    expect(pane.write).not.toHaveBeenCalled();
    expect(pane.controlsRef.current?.isStickToBottom()).toBe(false);
  });

  it("preserves native-thumb holdoff during a layout window and releases on stable-height continuation", () => {
    const pane = mountSettled();
    act(() => pane.controlsRef.current?.beginVirtualizerLayoutChange());
    pane.rerender({ tailEntryId: "entry-2" });
    pane.geometry.scrollTop = 600;
    fireEvent.scroll(pane.element);
    pane.geometry.scrollHeight = 1200;
    deliverResize(pane.contentRef.current!);
    flushFrame();
    expect(pane.element.scrollTop).toBe(600);
    expect(pane.write).not.toHaveBeenCalled();

    now += 300;
    pane.geometry.scrollTop = 500;
    fireEvent.scroll(pane.element); // Records the growth before a stable-height event.
    pane.geometry.scrollTop = 400;
    fireEvent.scroll(pane.element);
    expect(pane.controlsRef.current?.isStickToBottom()).toBe(false);
    pane.rerender({ tailLoaderVisible: true });
    flushFrame();
    expect(pane.element.scrollTop).toBe(400);
    expect(pane.write).not.toHaveBeenCalled();
  });

  it("reads fresh geometry after explicit reconciliation and the first button press resumes sticky", () => {
    const pane = mountSettled();
    act(() => {
      pane.controlsRef.current?.markUserScrollIntent();
      pane.controlsRef.current?.disableStickToBottom();
      pane.geometry.scrollTop = 400;
      fireEvent.scroll(pane.element);
    });
    pane.reconcile.mockImplementation(() => {
      pane.geometry.scrollHeight = 1500;
      pane.geometry.clientHeight = 250;
    });
    fireEvent.click(pane.getByRole("button", { name: "Scroll to bottom" }));
    expect(pane.reconcile).toHaveBeenCalledOnce();
    expect(pane.element.scrollTop).toBe(1250);
    expect(pane.controlsRef.current?.isStickToBottom()).toBe(true);
    pane.clearReadsAndWrites();
    deliverResize(pane.contentRef.current!);
    // The pin history must use post-reconcile heights too, avoiding a false growth.
    expect(pane.write).not.toHaveBeenCalled();
  });

  it("tags the clamped pin destination through an intervening anchor move, then releases on user scroll", () => {
    const pane = mountSettled();
    pane.geometry.scrollHeight = 1200;
    deliverResize(pane.contentRef.current!); // Writes 1200, actually lands at 1000.
    pane.geometry.scrollHeight = 1300;
    pane.geometry.scrollTop = 1100;
    fireEvent.scroll(pane.element);
    pane.geometry.scrollTop = 1000;
    fireEvent.scroll(pane.element);
    expect(pane.controlsRef.current?.isStickToBottom()).toBe(true);
    pane.geometry.scrollTop = 900;
    fireEvent.scroll(pane.element);
    expect(pane.controlsRef.current?.isStickToBottom()).toBe(false);
  });

  it("invalidates pin history for same-frame shrink, regrowth and viewport resize", () => {
    const pane = mountSettled();
    for (const [scrollHeight, clientHeight] of [
      [700, 200],
      [1000, 200],
      [1000, 160],
      [1000, 200],
    ]) {
      Object.assign(pane.geometry, { scrollHeight, clientHeight });
      deliverResize(pane.element);
      expect(pane.element.scrollTop).toBe(scrollHeight! - clientHeight!);
    }
    expect(pane.reconcile).not.toHaveBeenCalled();
  });

  it("re-pins a same-size dock change even while the at-bottom cache is warm", () => {
    const pane = mountSettled();
    act(() => pane.controlsRef.current?.onContentHeightChange());
    pane.geometry.scrollTop = 760;
    pane.rerender({ layoutChangeToken: "dock-expanded" });
    expect(pane.element.scrollTop).toBe(800);
    expect(pane.reconcile).not.toHaveBeenCalled();
  });

  it("replaces observed content and cancels a pending structural fallback on thread change/unmount", () => {
    const pane = mountSettled();
    const oldContent = pane.contentRef.current!;
    const oldObserver = observers.find((observer) => observer.targets.has(oldContent))!;
    pane.contentRef.current = document.createElement("div");
    pane.rerender({ tailEntryId: "entry-2" });
    expect(oldObserver.targets.has(oldContent)).toBe(false);
    expect(oldObserver.targets.has(pane.contentRef.current)).toBe(true);
    const pendingFrame = [...frames.keys()][0]!;

    pane.rerender({ threadId: "thread-2" });
    expect(frames.has(pendingFrame)).toBe(false);
    expect(oldObserver.disconnect).toHaveBeenCalledOnce();
    expect(pane.reconcile).toHaveBeenCalledOnce();
    pane.unmount();
    expect(frames.size).toBe(0);
    expect(observers.every((observer) => observer.targets.size === 0)).toBe(true);
  });
});
