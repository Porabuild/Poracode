import { createRef, useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import * as LegendPackage from "@legendapp/list/react";
import { LegendList, type LegendListProps, type LegendListRef } from "@legendapp/list/react";
import { useVirtualRowMeasurement } from "./useVirtualRowMeasurement";

// This suite renders the real library bundle pinned by the dependency patch.
// It deliberately has no vi.mock for
// LegendList. jsdom supplies no layout or ResizeObserver, so model only those
// browser facilities, keeping data reconciliation/virtualization/scrolling real.
// 3.3.3 exports `internal` at runtime (omitted from its .d.ts). Reading the actual
// context is necessary: the public getState().sizes exposes only sizesKnown.
type Context = {
  state: {
    sizes: Map<string, number>;
    sizesKnown: Map<string, number>;
    averageSizes: Record<string, { avg: number; num: number }>;
    containerItemKeys: Map<string, number>;
    containerItemGenerations: number[];
    idsInView: string[];
    mvcpAnchorLock?: { id: string };
    queuedMVCPRecalculate?: number;
  };
};
const { internal } = LegendPackage as unknown as {
  internal: { useStateContext(): Context };
};
export type Row = { id: string };
type Entry = { target: Element; height: number; width: number };
const observers = new Set<ControlledResizeObserver>();
class ControlledResizeObserver {
  targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    observers.add(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
}
export const fixture = {
  heights: new Map<string, number>(),
  width: 600,
  height: 240,
  listRef: createRef<LegendListRef>(),
  contentGeometryFromDom: false,
};
let currentContext: Context | undefined;

export function rectangle(element: HTMLElement): DOMRect {
  let height = 0;
  let width = fixture.width;
  if (element.dataset.testid === "scroller") {
    height = fixture.height;
  } else if (element.classList.contains("legend-list-content-container")) {
    height = fixture.contentGeometryFromDom
      ? committedContentSize()
      : (fixture.listRef.current?.getState().contentLength ?? 0);
    if (fixture.contentGeometryFromDom && findContentSizer()?.style.width)
      width = committedContentSize(true);
  } else {
    const rowElements = element.matches("[data-row]")
      ? [element]
      : element.querySelectorAll<HTMLElement>("[data-row]");
    if (rowElements.length === 1) height = fixture.heights.get(rowElements[0]!.dataset.row!) ?? 40;
  }
  return new DOMRect(0, 0, width, height);
}
export function useCaptureContext() {
  const ctx = internal.useStateContext();
  useLayoutEffect(() => {
    currentContext = ctx;
  }, [ctx]);
}
export function ProbeRow({ item }: { item: Row }) {
  useCaptureContext();
  return <div data-row={item.id} />;
}
export function ObservedProbeRow({ item, isLastEntry }: { item: Row; isLastEntry: boolean }) {
  useCaptureContext();
  const { rowElementRef } = useVirtualRowMeasurement(
    { kind: "item", id: item.id },
    isLastEntry,
    (key, element, _live, observedSize) => {
      const list = fixture.listRef.current;
      if (!list || !element) return null;
      const height = observedSize?.height ?? element.offsetHeight;
      if (list.getState().sizes.get(key) !== height) {
        list.setItemSize(key, {
          height,
          width: observedSize?.width ?? element.offsetWidth,
        });
      }
      return list.getState();
    },
    (key) => fixture.listRef.current?.getState().sizes.get(key),
  );
  return <div ref={rowElementRef} data-row={item.id} />;
}
// Inspect the actual DOM sizer, never the model's already-published contentLength.
function findContentSizer(): HTMLElement | undefined {
  const content = document.querySelector("[data-testid='scroller'] .legend-list-content-container");
  return Array.from(content?.children ?? []).find(
    (element) =>
      element instanceof HTMLElement &&
      element.style.position === "relative" &&
      (element.style.height !== "" || element.style.width !== ""),
  ) as HTMLElement | undefined;
}
export function contentSizer(): HTMLElement {
  const sizer = findContentSizer();
  expect(sizer, "actual LegendList DOM content sizer is mounted").toBeInstanceOf(HTMLElement);
  return sizer as HTMLElement;
}
export function committedContentSize(horizontal = false): number {
  return Number.parseFloat(findContentSizer()?.style[horizontal ? "width" : "height"] ?? "0") || 0;
}
export function rows(start = 0, end = 80): Row[] {
  return Array.from({ length: end - start }, (_, index) => ({ id: `row-${start + index}` }));
}
export function context() {
  expect(currentContext, "actual LegendList context was observed in a rendered row").toBeDefined();
  return currentContext!;
}
export function state() {
  return fixture.listRef.current!.getState();
}
export function settle(frames = 12) {
  for (let i = 0; i < frames; i += 1)
    act(() => {
      vi.advanceTimersByTime(16);
    });
}
export function snapshotEntry(target: Element, height?: number): Entry {
  const rect = target.getBoundingClientRect();
  return { target, height: height ?? rect.height, width: rect.width };
}
// Snapshot observer membership at queue time, just as a queued browser delivery
// may outlive unobserve/reobserve or a container assignment.
export function queuedDelivery(entries: Entry[], reverse = false, firstTarget?: Element) {
  const deliveries = [...observers]
    .map((observer) => ({
      observer,
      entries: entries.filter((entry) => observer.targets.has(entry.target)),
    }))
    .filter((delivery) => delivery.entries.length > 0);
  if (reverse) deliveries.reverse();
  // Select the ordering explicitly; the library's singleton observer can have
  // been created before or after the app row observer in an earlier test.
  if (firstTarget)
    deliveries.sort(
      (left, right) =>
        Number(right.observer.targets.has(firstTarget)) -
        Number(left.observer.targets.has(firstTarget)),
    );
  return () =>
    act(() => {
      for (const { observer, entries: selected } of deliveries) {
        const records = selected.map(({ target, height, width }) => ({
          target,
          contentRect: new DOMRect(0, 0, width, height),
          borderBoxSize: [{ blockSize: height, inlineSize: width }],
          contentBoxSize: [{ blockSize: height, inlineSize: width }],
          devicePixelContentBoxSize: [],
        })) as unknown as ResizeObserverEntry[];
        observer.callback(records, observer as unknown as ResizeObserver);
      }
    });
}
export function elementFor(id: string): HTMLElement {
  const index = state().data.findIndex((item: Row) => item.id === id);
  const element = state().elementAtIndex(index);
  expect(element, `${id} has a real mounted measurement container`).toBeTruthy();
  return element as HTMLElement;
}
export function measure(id: string, height: number) {
  fixture.heights.set(id, height);
  queuedDelivery([snapshotEntry(elementFor(id))])();
}
export function assertOnlyCurrent(data: Row[]) {
  const keys = new Set(data.map((item) => item.id));
  for (const map of [context().state.sizes, context().state.sizesKnown]) {
    expect(
      [...map.keys()].filter((key) => !keys.has(key)),
      "absent IDs in a size map",
    ).toEqual([]);
    expect(map.size).toBeLessThanOrEqual(keys.size);
  }
}
export function mount(data: Row[], options: Partial<LegendListProps<Row>> = {}) {
  const props = {
    data,
    keyExtractor: (item: Row) => item.id,
    renderItem: ({ item }: { item: Row }) => <ProbeRow item={item} />,
    estimatedItemSize: 40,
    estimatedListSize: { height: fixture.height, width: fixture.width },
    drawDistance: 80,
    recycleItems: false,
    maintainVisibleContentPosition: { data: true, size: true },
    maintainScrollAtEnd: false,
    ...options,
  } satisfies LegendListProps<Row>;
  const view = render(<LegendList {...props} ref={fixture.listRef} data-testid="scroller" />);
  settle();
  const scrollElement = view.getByTestId("scroller");
  expect(state().scrollLength).toBe(props.horizontal ? fixture.width : fixture.height);
  expect(context().state.sizesKnown.size).toBeGreaterThan(0);
  function update(next: Row[]) {
    props.data = next;
    view.rerender(<LegendList {...props} ref={fixture.listRef} data-testid="scroller" />);
  }
  function replaceCommitCallback(callback: LegendListProps<Row>["onContentSizeCommit"]) {
    if (callback) props.onContentSizeCommit = callback;
    else delete props.onContentSizeCommit;
    view.rerender(<LegendList {...props} ref={fixture.listRef} data-testid="scroller" />);
  }
  function scroll(scrollOffset: number) {
    act(() => {
      scrollElement.scrollTop = scrollOffset;
      fireEvent.scroll(scrollElement);
    });
    settle();
    expect(state().scroll).toBeCloseTo(scrollOffset, 1);
  }
  function offset(id: string) {
    return state().positionByKey(id)! - scrollElement.scrollTop;
  }
  return { ...view, update, replaceCommitCallback, scroll, offset, scrollElement };
}

beforeEach(() => {
  vi.useFakeTimers();
  fixture.heights = new Map();
  fixture.width = 600;
  fixture.height = 240;
  fixture.contentGeometryFromDom = false;
  currentContext = undefined;
  fixture.listRef = createRef<LegendListRef>();
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return rectangle(this);
    },
  );
  for (const name of ["clientHeight", "offsetHeight", "scrollHeight"] as const) {
    vi.spyOn(HTMLElement.prototype, name, "get").mockImplementation(function (this: HTMLElement) {
      if (name === "scrollHeight" && this.dataset.testid === "scroller")
        return fixture.contentGeometryFromDom ? committedContentSize() : state().contentLength;
      return rectangle(this).height;
    });
  }
  for (const name of ["clientWidth", "offsetWidth", "scrollWidth"] as const) {
    vi.spyOn(HTMLElement.prototype, name, "get").mockImplementation(function (this: HTMLElement) {
      if (
        name === "scrollWidth" &&
        this.dataset.testid === "scroller" &&
        fixture.contentGeometryFromDom
      )
        return committedContentSize(true);
      return fixture.width;
    });
  }
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
  // jsdom omits scrollTo. Browser clamping remains in the real library's code.
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? this.scrollTop;
      this.scrollLeft = options.left ?? this.scrollLeft;
      // Browsers dispatch scroll events after the synchronous DOM mutation.
      setTimeout(() => {
        if (this.isConnected) this.dispatchEvent(new Event("scroll"));
      }, 0);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollBy", {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      this.scrollTo({
        top: this.scrollTop + (options.top ?? 0),
        left: this.scrollLeft + (options.left ?? 0),
      });
    },
  });
});
afterEach(() => {
  cleanup();
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
  delete (HTMLElement.prototype as unknown as { scrollBy?: unknown }).scrollBy;
});

export function setViewportWidth(width: number): void {
  fixture.width = width;
}
export function setViewportHeight(height: number): void {
  fixture.height = height;
}
