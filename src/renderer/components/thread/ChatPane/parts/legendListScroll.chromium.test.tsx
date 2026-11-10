import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LegendList,
  type AnchoredEndSpaceConfig,
  type LegendListProps,
} from "@legendapp/list/react";

// Real-layout regression tests for the transcript's scroll contract, run in
// Chromium (vitest.browser.config.ts) because jsdom has no layout engine. The
// props mirror MessageList's LegendList configuration.

type Row = { id: string; height: number };

const VIEWPORT = 400;

function makeRows(count: number, start = 0): Row[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return { id: `row-${index}`, height: 40 + ((index * 37) % 120) };
  });
}

function makeOlderRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `older-${index}`,
    height: 40 + ((index * 53) % 120),
  }));
}

function Transcript({
  rows,
  onStartReached,
  anchoredEndSpace,
  footerHeight,
  hidden,
  estimatedItemSize = 59,
}: {
  rows: readonly Row[];
  onStartReached?: NonNullable<LegendListProps<Row>["onStartReached"]>;
  anchoredEndSpace?: AnchoredEndSpaceConfig;
  footerHeight?: number;
  hidden?: boolean;
  estimatedItemSize?: number;
}) {
  return (
    <div style={{ display: hidden ? "none" : "block" }}>
      <LegendList
        data={rows}
        estimatedItemSize={estimatedItemSize}
        initialScrollAtEnd
        keyExtractor={(row) => row.id}
        {...(anchoredEndSpace ? { anchoredEndSpace } : {})}
        maintainScrollAtEnd={
          anchoredEndSpace
            ? false
            : {
                animated: false,
                on: { dataChange: true, footerLayout: true, itemLayout: true, layout: true },
              }
        }
        maintainScrollAtEndThreshold={0}
        maintainVisibleContentPosition={{ data: true, size: true }}
        {...(onStartReached ? { onStartReached, onStartReachedThreshold: 0.75 } : {})}
        recycleItems={false}
        renderItem={({ item }) => (
          <div data-row={item.id} style={{ height: item.height, boxSizing: "border-box" }}>
            {item.id}
          </div>
        )}
        {...(footerHeight !== undefined
          ? { ListFooterComponent: <div data-footer style={{ height: footerHeight }} /> }
          : {})}
        style={{ height: VIEWPORT, width: 600 }}
      />
    </div>
  );
}

function scroller(container: HTMLElement): HTMLElement {
  const candidates = [container, ...container.querySelectorAll<HTMLElement>("*")];
  const element = candidates.find((node) => {
    const overflow = getComputedStyle(node).overflowY;
    return (overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight;
  });
  if (!element) throw new Error("no scrollable transcript element");
  return element;
}

function grownTail(rows: readonly Row[], growth: number): Row[] {
  return rows.map((row, index) =>
    index === rows.length - 1 ? { ...row, height: row.height + growth } : row,
  );
}

function distanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.clientHeight - element.scrollTop;
}

function firstVisibleRow(container: HTMLElement, element: HTMLElement): HTMLElement {
  const top = element.getBoundingClientRect().top;
  let best: HTMLElement | undefined;
  let bestOffset = Number.POSITIVE_INFINITY;
  for (const node of container.querySelectorAll<HTMLElement>("[data-row]")) {
    const offset = node.getBoundingClientRect().top - top;
    if (offset >= 0 && offset < bestOffset) {
      best = node;
      bestOffset = offset;
    }
  }
  if (!best) throw new Error("no visible row");
  return best;
}

function rowById(container: HTMLElement, id: string): HTMLElement {
  const row = container.querySelector<HTMLElement>(`[data-row="${id}"]`);
  if (!row) throw new Error(`row ${id} is not rendered`);
  return row;
}

function rowOffset(row: HTMLElement, element: HTMLElement): number {
  return row.getBoundingClientRect().top - element.getBoundingClientRect().top;
}

async function scrollReader(element: HTMLElement, top: number) {
  await act(async () => {
    element.scrollTop = top;
    element.dispatchEvent(new Event("scroll"));
  });
}

async function frames(count = 6) {
  for (let index = 0; index < count; index += 1) {
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

afterEach(() => {
  cleanup();
});

describe("transcript scroll contract (real layout)", () => {
  it("opens a long transcript at the bottom", async () => {
    const { container } = render(<Transcript rows={makeRows(200)} />);
    await vi.waitFor(() => expect(distanceFromBottom(scroller(container))).toBeLessThanOrEqual(1));
  });

  it("stays pinned to the bottom while rows arrive", async () => {
    const rows = makeRows(200);
    const { container, rerender } = render(<Transcript rows={rows} />);
    await vi.waitFor(() => expect(distanceFromBottom(scroller(container))).toBeLessThanOrEqual(1));

    rerender(<Transcript rows={[...rows, ...makeRows(5, 200)]} />);
    await frames();
    await vi.waitFor(() => expect(distanceFromBottom(scroller(container))).toBeLessThanOrEqual(1));
  });

  it("stays pinned to the bottom while the live tail grows", async () => {
    const rows = makeRows(200);
    const { container, rerender } = render(<Transcript rows={rows} />);
    await vi.waitFor(() => expect(distanceFromBottom(scroller(container))).toBeLessThanOrEqual(1));

    rerender(<Transcript rows={grownTail(rows, 600)} />);
    await frames(10);
    await vi.waitFor(() => expect(distanceFromBottom(scroller(container))).toBeLessThanOrEqual(1));
  });

  // Characterization of the patched library, not a product contract: after an
  // append, a tail that then grows through a data change keeps its top
  // anchored, so bare LegendList ends `growth` px above the bottom. MessageList
  // must re-pin in this case (the "long replies detach from the bottom" class,
  // #1089). If this flips after a library update or patch edit, revisit that
  // compensation instead of deleting the test.
  it("detaches by the growth when the tail grows right after an append", async () => {
    const rows = makeRows(200);
    const { container, rerender } = render(<Transcript rows={rows} estimatedItemSize={72} />);
    await vi.waitFor(() => expect(distanceFromBottom(scroller(container))).toBeLessThanOrEqual(1));

    const appended = [...rows, ...makeRows(5, 200)];
    rerender(<Transcript rows={appended} estimatedItemSize={72} />);
    await frames();
    await vi.waitFor(() => expect(distanceFromBottom(scroller(container))).toBeLessThanOrEqual(1));

    const growth = 600;
    rerender(<Transcript rows={grownTail(appended, growth)} estimatedItemSize={72} />);
    await frames(10);
    await vi.waitFor(() =>
      expect(Math.abs(distanceFromBottom(scroller(container)) - growth)).toBeLessThanOrEqual(1),
    );
  });

  it("does not move a reader who scrolled up when new rows arrive", async () => {
    const rows = makeRows(200);
    const { container, rerender } = render(<Transcript rows={rows} />);
    const element = await vi.waitFor(() => {
      const found = scroller(container);
      expect(distanceFromBottom(found)).toBeLessThanOrEqual(1);
      return found;
    });

    await scrollReader(element, Math.floor(element.scrollHeight / 3));
    await frames();
    const readerTop = element.scrollTop;
    const anchor = firstVisibleRow(container, element);
    const anchorId = anchor.dataset.row!;
    const anchorOffset = rowOffset(anchor, element);

    rerender(<Transcript rows={[...rows, ...makeRows(10, 200)]} />);
    await frames(10);

    expect(distanceFromBottom(element)).toBeGreaterThan(VIEWPORT);
    expect(Math.abs(element.scrollTop - readerTop)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(rowOffset(rowById(container, anchorId), element) - anchorOffset),
    ).toBeLessThanOrEqual(1);
  });
});

describe("transcript history paging, reply space and hidden panes", () => {
  it("keeps a reader's row anchored when older history is prepended", async () => {
    const rows = makeRows(200);
    const { container, rerender } = render(<Transcript rows={rows} />);
    const element = await vi.waitFor(() => {
      const found = scroller(container);
      expect(distanceFromBottom(found)).toBeLessThanOrEqual(1);
      return found;
    });

    await scrollReader(element, Math.floor(element.scrollHeight / 3));
    await frames();
    const reader = firstVisibleRow(container, element);
    const readerId = reader.dataset.row!;
    const readerOffset = rowOffset(reader, element);

    rerender(<Transcript rows={[...makeOlderRows(50), ...rows]} />);
    await frames(10);

    expect(
      Math.abs(rowOffset(rowById(container, readerId), element) - readerOffset),
    ).toBeLessThanOrEqual(1);
    expect(distanceFromBottom(element)).toBeGreaterThan(VIEWPORT);
  });

  it("stays pinned to the bottom when older history is prepended", async () => {
    const rows = makeRows(200);
    const { container, rerender } = render(<Transcript rows={rows} />);
    const element = await vi.waitFor(() => {
      const found = scroller(container);
      expect(distanceFromBottom(found)).toBeLessThanOrEqual(1);
      return found;
    });

    rerender(<Transcript rows={[...makeOlderRows(50), ...rows]} />);
    await vi.waitFor(() => expect(distanceFromBottom(element)).toBeLessThanOrEqual(1));
  });

  it("does not request older history while pinned, then requests it at the top", async () => {
    const onStartReached = vi.fn<NonNullable<LegendListProps<Row>["onStartReached"]>>();
    const rows = makeRows(200);
    const { container } = render(<Transcript rows={rows} onStartReached={onStartReached} />);
    const element = await vi.waitFor(() => {
      const found = scroller(container);
      expect(distanceFromBottom(found)).toBeLessThanOrEqual(1);
      return found;
    });

    onStartReached.mockClear();
    await frames(6);
    expect(onStartReached).not.toHaveBeenCalled();

    await scrollReader(element, 0);
    await vi.waitFor(() => expect(onStartReached).toHaveBeenCalled());
  });

  it("keeps the reader's row when history prepends after reaching the start", async () => {
    const onStartReached = vi.fn<NonNullable<LegendListProps<Row>["onStartReached"]>>();
    const rows = makeRows(200);
    const { container, rerender } = render(
      <Transcript rows={rows} onStartReached={onStartReached} />,
    );
    const element = await vi.waitFor(() => {
      const found = scroller(container);
      expect(distanceFromBottom(found)).toBeLessThanOrEqual(1);
      return found;
    });

    onStartReached.mockClear();
    await frames(6);
    expect(onStartReached).not.toHaveBeenCalled();
    await scrollReader(element, 0);
    await vi.waitFor(() => expect(onStartReached).toHaveBeenCalled());
    await frames();

    const reader = firstVisibleRow(container, element);
    const readerId = reader.dataset.row!;
    expect(readerId).toBe("row-0");
    const readerOffset = rowOffset(reader, element);

    rerender(<Transcript rows={[...makeOlderRows(50), ...rows]} onStartReached={onStartReached} />);
    await frames(10);

    expect(
      Math.abs(rowOffset(rowById(container, readerId), element) - readerOffset),
    ).toBeLessThanOrEqual(1);
    expect(element.scrollTop).toBeGreaterThan(0);
  });

  it("parks the anchored prompt at the top when scrolled to the end", async () => {
    const onReady = vi.fn<NonNullable<AnchoredEndSpaceConfig["onReady"]>>();
    const onSizeChanged = vi.fn<NonNullable<AnchoredEndSpaceConfig["onSizeChanged"]>>();
    const anchoredEndSpace: AnchoredEndSpaceConfig = {
      anchorIndex: 198,
      anchorOffset: 0,
      onReady,
      onSizeChanged,
    };
    const rows = makeRows(200);
    const { container } = render(<Transcript rows={rows} anchoredEndSpace={anchoredEndSpace} />);
    const element = await vi.waitFor(() => scroller(container));
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    const ready = onReady.mock.lastCall?.[0];
    expect(ready?.anchorKey).toBe("row-198");
    expect(ready?.size).toBeGreaterThan(0);
    await frames();

    await scrollReader(element, element.scrollHeight);
    await frames();

    expect(Math.abs(rowOffset(rowById(container, "row-198"), element))).toBeLessThanOrEqual(1);
  });

  it("keeps the prompt parked while the reply still fits its reserved space", async () => {
    const onReady = vi.fn<NonNullable<AnchoredEndSpaceConfig["onReady"]>>();
    const onSizeChanged = vi.fn<NonNullable<AnchoredEndSpaceConfig["onSizeChanged"]>>();
    const anchoredEndSpace: AnchoredEndSpaceConfig = {
      anchorIndex: 198,
      anchorOffset: 0,
      onReady,
      onSizeChanged,
    };
    const currentSize = (): number | undefined =>
      onSizeChanged.mock.lastCall?.[0] ?? onReady.mock.lastCall?.[0]?.size;
    const rows = makeRows(200);
    const { container, rerender } = render(
      <Transcript rows={rows} anchoredEndSpace={anchoredEndSpace} />,
    );
    const element = await vi.waitFor(() => scroller(container));
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await frames();
    await scrollReader(element, element.scrollHeight);
    await frames();
    const parkedOffset = rowOffset(rowById(container, "row-198"), element);

    rerender(<Transcript rows={grownTail(rows, 100)} anchoredEndSpace={anchoredEndSpace} />);
    await vi.waitFor(() => {
      const size = currentSize();
      expect(size).toBeDefined();
      expect(Math.abs(size! - 171)).toBeLessThanOrEqual(1);
    });
    await frames(10);

    expect(
      Math.abs(rowOffset(rowById(container, "row-198"), element) - parkedOffset),
    ).toBeLessThanOrEqual(1);
  });

  it("follows the reply's tail once it outgrows the reserved space", async () => {
    const onReady = vi.fn<NonNullable<AnchoredEndSpaceConfig["onReady"]>>();
    const onSizeChanged = vi.fn<NonNullable<AnchoredEndSpaceConfig["onSizeChanged"]>>();
    const anchoredEndSpace: AnchoredEndSpaceConfig = {
      anchorIndex: 198,
      anchorOffset: 0,
      onReady,
      onSizeChanged,
    };
    const rows = makeRows(200);
    const { container, rerender } = render(
      <Transcript rows={rows} anchoredEndSpace={anchoredEndSpace} />,
    );
    const element = await vi.waitFor(() => scroller(container));
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await frames();
    await scrollReader(element, element.scrollHeight);
    await frames();

    rerender(<Transcript rows={grownTail(rows, 600)} anchoredEndSpace={anchoredEndSpace} />);
    await vi.waitFor(() => expect(onSizeChanged).toHaveBeenLastCalledWith(0));
    await frames(10);
    await vi.waitFor(() => expect(distanceFromBottom(element)).toBeLessThanOrEqual(1));
  });

  it("recomputes the anchored end space when the footer resizes", async () => {
    const onReady = vi.fn<NonNullable<AnchoredEndSpaceConfig["onReady"]>>();
    const onSizeChanged = vi.fn<NonNullable<AnchoredEndSpaceConfig["onSizeChanged"]>>();
    const anchoredEndSpace: AnchoredEndSpaceConfig = {
      anchorIndex: 198,
      anchorOffset: 0,
      onReady,
      onSizeChanged,
    };
    const currentSize = (): number | undefined =>
      onSizeChanged.mock.lastCall?.[0] ?? onReady.mock.lastCall?.[0]?.size;
    const rows = makeRows(200);
    const { container, rerender } = render(
      <Transcript rows={rows} anchoredEndSpace={anchoredEndSpace} footerHeight={20} />,
    );
    await vi.waitFor(() => scroller(container));
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    await frames();
    await vi.waitFor(() => expect(currentSize()).toBeGreaterThan(0));
    const expected = currentSize()! - 100;

    rerender(<Transcript rows={rows} anchoredEndSpace={anchoredEndSpace} footerHeight={120} />);
    await vi.waitFor(() => {
      const sizeAfter = currentSize();
      expect(sizeAfter).toBeDefined();
      expect(Math.abs(sizeAfter! - expected)).toBeLessThanOrEqual(1);
    });
  });

  it("restores a reader's row after the pane is hidden and shown", async () => {
    const rows = makeRows(200);
    const { container, rerender } = render(<Transcript rows={rows} />);
    const element = await vi.waitFor(() => {
      const found = scroller(container);
      expect(distanceFromBottom(found)).toBeLessThanOrEqual(1);
      return found;
    });

    await scrollReader(element, Math.floor(element.scrollHeight / 3));
    await frames();
    const reader = firstVisibleRow(container, element);
    const readerId = reader.dataset.row!;
    const readerOffset = rowOffset(reader, element);
    const appended = [...rows, ...makeRows(10, 200)];

    rerender(<Transcript rows={appended} hidden />);
    await frames(4);
    rerender(<Transcript rows={appended} />);
    await frames(10);

    const elementAfter = element.isConnected ? element : scroller(container);
    expect(
      Math.abs(rowOffset(rowById(container, readerId), elementAfter) - readerOffset),
    ).toBeLessThanOrEqual(1);
    expect(distanceFromBottom(elementAfter)).toBeGreaterThan(VIEWPORT);
  });

  it("stays pinned to the bottom across hide and show with appended rows", async () => {
    const rows = makeRows(200);
    const { container, rerender } = render(<Transcript rows={rows} />);
    const element = await vi.waitFor(() => {
      const found = scroller(container);
      expect(distanceFromBottom(found)).toBeLessThanOrEqual(1);
      return found;
    });
    const appended = [...rows, ...makeRows(10, 200)];

    rerender(<Transcript rows={appended} hidden />);
    await frames(4);
    rerender(<Transcript rows={appended} />);
    await vi.waitFor(() => expect(distanceFromBottom(element)).toBeLessThanOrEqual(1));
  });
});
