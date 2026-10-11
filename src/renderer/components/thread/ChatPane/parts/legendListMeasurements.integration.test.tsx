import { act, render } from "@testing-library/react";
import { createRequire } from "node:module";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { LegendList } from "@legendapp/list/react";
import type { Row } from "./legendListMeasurementFixtures";
import {
  useCaptureContext,
  ProbeRow,
  ObservedProbeRow,
  rows,
  context,
  state,
  settle,
  snapshotEntry,
  queuedDelivery,
  elementFor,
  measure,
  assertOnlyCurrent,
  mount,
  setViewportWidth,
  setViewportHeight,
  fixture,
  contentSizer,
  committedContentSize,
} from "./legendListMeasurementFixtures";

describe("actual LegendList measurement retirement", () => {
  it("prunes both maps after a prefix revision and preserves an old reader's anchor, offscreen measurements, averages and list identity", () => {
    const data = rows();
    const view = mount(data);
    measure("row-1", 63);
    settle();
    view.scroll(1223);
    const anchor = state().data[state().start]!.id;
    const beforeOffset = view.offset(anchor);
    const originalContext = context();
    // Measure an offscreen survivor through the existing public setter.
    act(() => fixture.listRef.current!.setItemSize("row-70", { height: 73, width: 600 }));
    const known = new Map(context().state.sizesKnown);
    const estimates = new Map(context().state.sizes);
    const averages = structuredClone(context().state.averageSizes);
    for (const prefix of [15, 23, 26]) {
      const next = data.slice(prefix);
      view.update(next);
      settle();
      assertOnlyCurrent(next);
      expect(context()).toBe(originalContext);
      expect(view.offset(anchor)).toBeCloseTo(beforeOffset, 1);
      expect(state().scroll).toBeCloseTo(view.scrollElement.scrollTop, 1);
      const currentIds = new Set(next.map((item) => item.id));
      for (const [id, size] of [...known].filter(([key]) => currentIds.has(key))) {
        expect(context().state.sizesKnown.get(id)).toBe(size);
      }
      for (const [id, size] of [...estimates].filter(([key]) => currentIds.has(key))) {
        expect(context().state.sizes.get(id)).toBe(size);
      }
      expect(context().state.averageSizes).toEqual(averages);
    }
  });

  it("retains current bottom position across repeated prefix retirement and append", () => {
    let data = rows();
    const view = mount(data, {
      initialScrollAtEnd: true,
      maintainScrollAtEnd: {
        on: { dataChange: true, itemLayout: true, layout: true },
        animated: false,
      },
      maintainScrollAtEndThreshold: 0,
    });
    for (let iteration = 0; iteration < 5; iteration += 1) {
      expect(state().contentLength - state().scroll - state().scrollLength).toBeCloseTo(0, 1);
      data = data.slice(8);
      view.update(data);
      settle();
      assertOnlyCurrent(data);
      expect(state().contentLength - view.scrollElement.scrollTop - fixture.height).toBeCloseTo(
        0,
        1,
      );
      data = [...data, ...rows(80 + iteration * 8, 88 + iteration * 8)];
      view.update(data);
      settle();
      assertOnlyCurrent(data);
      expect(state().contentLength - view.scrollElement.scrollTop - fixture.height).toBeCloseTo(
        0,
        1,
      );
    }
    const tail = data.at(-1)!.id;
    for (const height of [90, 25]) {
      measure(tail, height);
      settle();
      expect(context().state.sizesKnown.get(tail)).toBe(height);
      expect(state().contentLength - view.scrollElement.scrollTop - fixture.height).toBeCloseTo(
        0,
        1,
      );
    }
  });

  it("remeasures reinserted IDs after a prepend without disturbing the surviving anchor", () => {
    const data = rows();
    const view = mount(data);
    measure("row-1", 90);
    settle();
    view.scroll(900);
    const anchor = state().data[state().start]!.id;
    const offset = view.offset(anchor);
    const retained = data.slice(12);
    view.update(retained);
    settle();
    assertOnlyCurrent(retained);
    expect(view.offset(anchor)).toBeCloseTo(offset, 1);
    fixture.heights.set("row-1", 25);
    const prepended = [data[1]!, ...retained];
    view.update(prepended);
    settle();
    expect(view.offset(anchor)).toBeCloseTo(offset, 1);
    expect(context().state.sizesKnown.has("row-1")).toBe(false);
    view.scroll(0);
    settle();
    expect(context().state.sizesKnown.get("row-1")).toBe(25);
    assertOnlyCurrent(prepended);
  });

  it("uses a surviving visible anchor when the old anchor itself is removed", () => {
    const data = rows();
    const view = mount(data);
    view.scroll(805);
    view.update(data.slice(2));
    settle();
    const visible = [...context().state.idsInView];
    expect(visible.length).toBeGreaterThan(2);
    const removed = context().state.mvcpAnchorLock!.id;
    expect(visible).toContain(removed);
    const survivor = visible.find((id) => id !== removed)!;
    const before = view.offset(survivor);
    const next = data.filter((item) => item.id !== removed && Number(item.id.slice(4)) >= 8);
    view.update(next);
    settle();
    assertOnlyCurrent(next);
    expect(view.offset(survivor)).toBeCloseTo(before, 1);
  });

  it.each([false, true])(
    "preserves growth, confirmed shrink and width/font remeasurement with reversed observer order=%s",
    (reverse) => {
      const data = rows();
      const view = mount(data);
      view.scroll(800);
      const anchor = state().data[state().start]!.id;
      const before = view.offset(anchor);
      const preceding = `row-${Number(anchor.slice(4)) - 1}`;
      const rowElement = elementFor(preceding);
      fixture.heights.set(preceding, 95);
      setViewportWidth(420);
      queuedDelivery([snapshotEntry(view.scrollElement), snapshotEntry(rowElement)], reverse)();
      settle();
      expect(context().state.sizesKnown.get(preceding)).toBe(95);
      expect(view.offset(anchor)).toBeCloseTo(before, 1);
      fixture.heights.set(preceding, 28);
      queuedDelivery([snapshotEntry(rowElement), snapshotEntry(view.scrollElement)], reverse)();
      settle();
      expect(context().state.sizesKnown.get(preceding)).toBe(28);
      expect(view.offset(anchor)).toBeCloseTo(before, 1);
      assertOnlyCurrent(data);
    },
  );

  it("rejects a public late measurement for an absent ID without changing totals or averages", () => {
    const data = rows();
    const view = mount(data);
    const next = data.slice(10);
    view.update(next);
    settle();
    const length = state().contentLength;
    const averages = structuredClone(context().state.averageSizes);
    act(() => fixture.listRef.current!.setItemSize("row-1", { height: 999, width: 600 }));
    settle();
    expect(state().contentLength).toBe(length);
    expect(context().state.averageSizes).toEqual(averages);
    assertOnlyCurrent(next);
  });

  it("uses valid same-generation border-box resizes without any geometry read", () => {
    const view = mount(rows(), { maintainVisibleContentPosition: false, recycleItems: true });
    const element = elementFor("row-1");
    const container = context().state.containerItemKeys.get("row-1")!;
    const generation = context().state.containerItemGenerations[container];
    const geometry = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    geometry.mockClear();
    for (const height of [60, 75]) {
      fixture.heights.set("row-1", height);
      queuedDelivery([{ target: element, height, width: fixture.width }])();
      settle();
      expect(context().state.sizesKnown.get("row-1")).toBe(height);
      expect(context().state.containerItemGenerations[container]).toBe(generation);
      expect(geometry).not.toHaveBeenCalled();
    }
    view.unmount();
  });

  it("reads geometry only at the existing deferred shrink confirmation", () => {
    const view = mount(rows(), { maintainVisibleContentPosition: false });
    view.scroll(0);
    const element = elementFor("row-1");
    measure("row-1", 95);
    settle();
    const geometry = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    geometry.mockClear();
    fixture.heights.set("row-1", 32);
    queuedDelivery([{ target: element, height: 32, width: fixture.width }])();
    expect(geometry).not.toHaveBeenCalled();
    expect(context().state.sizesKnown.get("row-1")).toBe(95);
    settle();
    expect(context().state.sizesKnown.get("row-1")).toBe(32);
    expect(geometry).toHaveBeenCalledTimes(1);
  });

  it("reads fresh geometry for a recycled assignment once, then restores the border-box fast path", () => {
    const data = rows();
    const view = mount(data, { maintainVisibleContentPosition: false, recycleItems: true });
    const oldElement = elementFor("row-1");
    const late = queuedDelivery([{ target: oldElement, height: 999, width: fixture.width }]);
    view.update(data.slice(12));
    settle();
    const currentId = oldElement.querySelector<HTMLElement>("[data-row]")!.dataset.row!;
    expect(currentId).not.toBe("row-1");
    const geometry = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    geometry.mockClear();
    late();
    settle();
    expect(context().state.sizesKnown.get(currentId)).toBe(fixture.heights.get(currentId) ?? 40);
    expect(geometry).toHaveBeenCalledTimes(1);
    geometry.mockClear();
    fixture.heights.set(currentId, 65);
    queuedDelivery([{ target: oldElement, height: 65, width: fixture.width }])();
    settle();
    expect(context().state.sizesKnown.get(currentId)).toBe(65);
    expect(geometry).not.toHaveBeenCalled();
    assertOnlyCurrent(data.slice(12));
  });

  it.each(["before", "after"])(
    "handles old-node ResizeObserver delivery %s prefix reconciliation",
    (order) => {
      const data = rows();
      const view = mount(data, { maintainVisibleContentPosition: false, recycleItems: true });
      const oldElement = elementFor("row-1");
      const late = queuedDelivery([snapshotEntry(oldElement, 999)]);
      const next = data.slice(12);
      if (order === "before") late();
      view.update(next);
      if (order === "after") late();
      settle();
      const newId = oldElement.querySelector<HTMLElement>("[data-row]")?.dataset.row;
      expect(newId).toBeDefined();
      expect(newId).not.toBe("row-1");
      expect(context().state.sizesKnown.get(newId!)).toBe(fixture.heights.get(newId!) ?? 40);
      expect([...context().state.sizesKnown.values()]).not.toContain(999);
      assertOnlyCurrent(next);
    },
  );

  it("drops deferred shrink ownership after removal/reinsert and still accepts a later current shrink", () => {
    const data = rows();
    const view = mount(data, { maintainVisibleContentPosition: false, recycleItems: true });
    const original = elementFor("row-1");
    view.scroll(0);
    measure("row-1", 95);
    settle();
    measure("row-1", 20);
    expect(context().state.sizesKnown.get("row-1")).toBe(95); // waiting for its RAF
    view.update(data.slice(12));
    // Reuse the same ID before the queued shrink's confirmation frame.
    fixture.heights.set("row-1", 65);
    view.update([data[1]!, ...data.slice(12)]);
    settle();
    expect(context().state.sizesKnown.get("row-1")).toBe(65);
    expect(original.isConnected).toBe(true); // recycling, not remounting the list
    view.scroll(0);
    measure("row-1", 32);
    expect(context().state.sizesKnown.get("row-1")).toBe(65);
    settle();
    expect(context().state.sizesKnown.get("row-1")).toBe(32);
    assertOnlyCurrent([data[1]!, ...data.slice(12)]);
  });

  it("rejects a queued batch measurement if an earlier size callback reassigns its container", () => {
    let onChange: (() => void) | undefined;
    const data = rows();
    const view = mount(data, {
      onItemSizeChanged: () => onChange?.(),
      maintainVisibleContentPosition: false,
      recycleItems: true,
    });
    const first = elementFor("row-0");
    const second = elementFor("row-1");
    fixture.heights.set("row-0", 80);
    fixture.heights.set("row-1", 900);
    onChange = () => {
      onChange = undefined;
      flushSync(() => view.update(data.slice(12)));
    };
    queuedDelivery([snapshotEntry(first), snapshotEntry(second)])();
    settle();
    assertOnlyCurrent(data.slice(12));
    expect([...context().state.sizesKnown.values()]).not.toContain(900);
  });

  it("retires the final rows on an empty revision and measures subsequent data afresh", () => {
    const data = rows(0, 10);
    const view = mount(data);
    measure("row-1", 90);
    settle();
    view.update([]);
    settle();
    assertOnlyCurrent([]);
    expect(state().contentLength).toBe(0);
    fixture.heights.set("row-1", 25);
    view.update([data[1]!]);
    settle();
    expect(context().state.sizesKnown.get("row-1")).toBe(25);
  });

  it.each(["grow", "shrink"])(
    "rejects queued %s after remove/reassign/reinsert of the same ID in the same container",
    (mode) => {
      let onChange: (() => void) | undefined;
      const data = rows();
      const view = mount(data, {
        recycleItems: true,
        maintainVisibleContentPosition: false,
        onItemSizeChanged: () => onChange?.(),
      });
      view.scroll(0);
      if (mode === "shrink") {
        measure("row-0", 95);
        measure("row-1", 95);
        settle();
      }
      const container = context().state.containerItemKeys.get("row-1")!;
      const generation = context().state.containerItemGenerations[container]!;
      const first = elementFor("row-0");
      const second = elementFor("row-1");
      fixture.heights.set("row-0", mode === "grow" ? 80 : 20);
      fixture.heights.set("row-1", mode === "grow" ? 900 : 21);
      let didReassign = false;
      onChange = () => {
        onChange = undefined;
        flushSync(() =>
          view.update(data.map((item) => (item.id === "row-1" ? { id: "replacement" } : item))),
        );
        fixture.heights.set("row-1", 65);
        flushSync(() => view.update([...data]));
        didReassign = true;
        expect(context().state.containerItemKeys.get("row-1")).toBe(container);
        expect(context().state.containerItemGenerations[container]).toBeGreaterThan(generation);
      };
      queuedDelivery([snapshotEntry(first), snapshotEntry(second)])();
      expect({ didReassign, size: context().state.sizesKnown.get("row-1") }).toEqual(
        mode === "shrink" ? { didReassign: false, size: 95 } : { didReassign: true, size: 65 },
      );
      settle();
      expect(didReassign).toBe(true);
      expect(context().state.sizesKnown.get("row-1")).toBe(65);
      assertOnlyCurrent(data);
    },
  );

  it("does not scan retirement maps for nonstructural renders or current font/resize measurements", () => {
    const data = rows();
    const view = mount(data, { itemsAreEqual: (a, b) => a.id === b.id });
    const cached = context().state.sizes;
    const known = context().state.sizesKnown;
    const cachedKeys = vi.spyOn(cached, "keys");
    const knownKeys = vi.spyOn(known, "keys");
    view.update(data.map((item) => ({ ...item })));
    measure("row-1", 60);
    settle();
    expect(cachedKeys).not.toHaveBeenCalled();
    expect(knownKeys).not.toHaveBeenCalled();
    expect(context().state.sizes).toBe(cached);
    expect(context().state.sizesKnown).toBe(known);
    const next = data.slice(3);
    view.update(next);
    settle();
    expect(cachedKeys).toHaveBeenCalledTimes(1);
    expect(knownKeys).toHaveBeenCalledTimes(1);
  });

  it("retires estimates at an accepted zero-viewport revision before initial container allocation", () => {
    setViewportHeight(0);
    const data = rows();
    function ProbeHeader() {
      useCaptureContext();
      return null;
    }
    const props = {
      ref: fixture.listRef,
      keyExtractor: (item: Row) => item.id,
      renderItem: ({ item }: { item: Row }) => <ProbeRow item={item} />,
      estimatedItemSize: 40,
      estimatedListSize: { width: 600, height: 0 },
      recycleItems: false,
      ListHeaderComponent: ProbeHeader,
    };
    const view = render(<LegendList {...props} data={data} data-testid="scroller" />);
    expect(context().state.sizes.size).toBe(80);
    expect(context().state.sizesKnown.size).toBe(0);
    const next = data.slice(30);
    view.rerender(<LegendList {...props} data={next} data-testid="scroller" />);
    assertOnlyCurrent(next);
    expect(context().state.sizes.size).toBe(50);
    setViewportHeight(240);
    queuedDelivery([snapshotEntry(view.getByTestId("scroller"))])();
    settle();
    assertOnlyCurrent(next);
    expect(context().state.sizesKnown.size).toBeGreaterThan(0);
  });
});

describe("actual LegendList content-size commits", () => {
  it.each([false, true])(
    "signals the committed DOM axis size after an earlier model publication: horizontal=%s",
    (horizontal) => {
      fixture.contentGeometryFromDom = true;
      const onCommit = vi.fn<(info: { size: number; horizontal: boolean }) => void>((info) => {
        expect(info.horizontal).toBe(horizontal);
        expect(committedContentSize(horizontal)).toBe(info.size);
        expect(contentSizer().isConnected).toBe(true);
      });
      mount(rows(0, 4), { horizontal, onContentSizeCommit: onCommit });
      onCommit.mockClear();
      const before = committedContentSize(horizontal);
      const publications: { model: number; dom: number }[] = [];
      const unsubscribe = state().listen("totalSize", () => {
        publications.push({ model: state().contentLength, dom: committedContentSize(horizontal) });
        expect(onCommit).not.toHaveBeenCalled();
      });

      act(() => {
        fixture.listRef.current!.setItemSize("row-0", {
          height: 100,
          width: fixture.width + 100,
        });
        // React has scheduled the external-store render; its DOM mutation has
        // not committed merely because the model setter finished.
        expect(committedContentSize(horizontal)).toBe(before);
        expect(onCommit).not.toHaveBeenCalled();
      });
      unsubscribe();

      expect(publications.length).toBeGreaterThan(0);
      expect(publications.every(({ model, dom }) => model > before && dom === before)).toBe(true);
      expect(onCommit).toHaveBeenCalled();
      expect(onCommit.mock.lastCall![0].size).toBeGreaterThan(before);
    },
  );

  it.each(["library-first", "app-first"] as const)(
    "commits current DOM after connected row observation in %s order",
    (order) => {
      fixture.contentGeometryFromDom = true;
      const data = rows(0, 4);
      const onCommit = vi.fn<(info: { size: number; horizontal: boolean }) => void>((info) => {
        expect(committedContentSize()).toBe(info.size);
      });
      mount(data, {
        onContentSizeCommit: onCommit,
        renderItem: ({ item, index }) => (
          <ObservedProbeRow item={item} isLastEntry={index === data.length - 1} />
        ),
      });
      const libraryElement = elementFor("row-3");
      const appElement = libraryElement.querySelector<HTMLElement>("[data-row='row-3']")!;
      expect(appElement).not.toBe(libraryElement);
      const before = committedContentSize();
      onCommit.mockClear();
      const publications: number[] = [];
      const unsubscribe = state().listen("totalSize", () => {
        publications.push(committedContentSize());
        expect(onCommit).not.toHaveBeenCalled();
      });
      fixture.heights.set("row-3", 120);

      queuedDelivery(
        [snapshotEntry(libraryElement), snapshotEntry(appElement)],
        false,
        order === "library-first" ? libraryElement : appElement,
      )();
      unsubscribe();

      expect(publications).toEqual([before]);
      expect(state().sizes.get("row-3")).toBe(120);
      expect(onCommit).toHaveBeenCalled();
      expect(onCommit.mock.lastCall![0].size).toBe(before + 80);
      expect(committedContentSize()).toBe(before + 80);
    },
  );

  it("uses the newest callback at unchanged size and consumes it before DOM forwarding", () => {
    fixture.contentGeometryFromDom = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = vi.fn<(info: { size: number; horizontal: boolean }) => void>();
    const view = mount(rows(0, 4), { onContentSizeCommit: original });
    const size = committedContentSize();
    const sizer = contentSizer();
    original.mockClear();
    const replacement = vi.fn<(info: { size: number; horizontal: boolean }) => void>((info) => {
      expect(info).toEqual({ size, horizontal: false });
      expect(contentSizer()).toBe(sizer);
      expect(committedContentSize()).toBe(size);
    });

    view.replaceCommitCallback(replacement);

    expect(replacement).toHaveBeenCalledOnce();
    expect(original).not.toHaveBeenCalled();
    expect(view.container.querySelector("[oncontentsizecommit]")).toBeNull();
    expect(
      errors.mock.calls.filter((args) =>
        args.some((arg) => String(arg).includes("onContentSizeCommit")),
      ),
    ).toEqual([]);
    view.replaceCommitCallback(undefined);
    act(() => fixture.listRef.current!.setItemSize("row-0", { height: 100, width: fixture.width }));
    expect(replacement).toHaveBeenCalledOnce();
    expect(original).not.toHaveBeenCalled();
  });

  it("keeps the legacy caller's sizing and positions without a commit callback", () => {
    fixture.contentGeometryFromDom = true;
    mount(rows(0, 4));
    const before = committedContentSize();

    act(() => fixture.listRef.current!.setItemSize("row-0", { height: 95, width: fixture.width }));
    settle();

    expect(committedContentSize()).toBe(before + 55);
    expect(state().contentLength).toBe(committedContentSize());
    expect(state().positionByKey("row-1")).toBe(95);
    expect(state().sizes.get("row-0")).toBe(95);
  });

  it("emits from the actual CommonJS React build's committed DOM sizer", () => {
    const { LegendList: CommonJsLegendList } = createRequire(import.meta.url)(
      "@legendapp/list/react",
    ) as { LegendList: typeof LegendList };
    fixture.contentGeometryFromDom = true;
    const onCommit = vi.fn<(info: { size: number; horizontal: boolean }) => void>((info) => {
      expect(committedContentSize()).toBe(info.size);
    });
    render(
      <CommonJsLegendList
        ref={fixture.listRef}
        data={rows(0, 4)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <div data-row={item.id} />}
        estimatedItemSize={40}
        estimatedListSize={{ height: fixture.height, width: fixture.width }}
        maintainVisibleContentPosition={false}
        onContentSizeCommit={onCommit}
        data-testid="scroller"
      />,
    );
    settle();
    const before = committedContentSize();
    onCommit.mockClear();

    act(() => fixture.listRef.current!.setItemSize("row-0", { height: 90, width: fixture.width }));

    expect(onCommit).toHaveBeenCalled();
    expect(onCommit.mock.lastCall![0].size).toBe(before + 50);
  });
});
