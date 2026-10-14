import { describe, expect, it, vi } from "vitest";
import { context, mount, rows, settle, state } from "./legendListMeasurementFixtures";

describe("actual LegendList paging edges", () => {
  it.each([false, true])("uses the actual DOM range for horizontal: %s", (horizontal) => {
    const view = mount(rows(), { horizontal });
    const { refScroller } = context().state as ReturnType<typeof context>["state"] & {
      refScroller: { current: { getMaxScrollOffset(): number } };
    };
    expect(refScroller.current.getMaxScrollOffset()).toBe(
      horizontal
        ? view.scrollElement.scrollWidth - view.scrollElement.clientWidth
        : view.scrollElement.scrollHeight - view.scrollElement.clientHeight,
    );
  });

  it("requests older history after a direct bottom-to-top jump when no end callback exists", () => {
    const onStartReached = vi.fn<() => void>();
    const view = mount(rows(), {
      initialScrollAtEnd: true,
      onStartReached,
      onStartReachedThreshold: 0.75,
    });
    expect(state().scroll).toBeGreaterThan(state().scrollLength);
    expect(onStartReached).not.toHaveBeenCalled();
    view.scroll(0);
    expect(onStartReached).toHaveBeenCalledOnce();
    view.scroll(0);
    expect(onStartReached).toHaveBeenCalledOnce();
  });

  it("requests the end after a direct top-to-bottom jump when no start callback exists", () => {
    const onEndReached = vi.fn<() => void>();
    const view = mount(rows(), { onEndReached });
    expect(onEndReached).not.toHaveBeenCalled();
    view.scroll(state().contentLength - state().scrollLength);
    expect(onEndReached).toHaveBeenCalledOnce();
    view.scroll(state().contentLength - state().scrollLength);
    expect(onEndReached).toHaveBeenCalledOnce();
  });
  it("requests the next older page after a prepend and reader return to the start", () => {
    const onStartReached = vi.fn<() => void>();
    const view = mount(rows(40, 80), {
      initialScrollAtEnd: true,
      onStartReached,
      onStartReachedThreshold: 0.75,
    });
    view.scroll(0);
    expect(onStartReached).toHaveBeenCalledOnce();
    view.update(rows(20, 80));
    settle();
    expect(state().scroll).toBeGreaterThan(state().scrollLength);
    view.scroll(0);
    expect(onStartReached).toHaveBeenCalledTimes(2);
    view.update(rows(0, 80));
    settle();
    view.scroll(0);
    expect(onStartReached).toHaveBeenCalledTimes(3);
    expect(state().data).toHaveLength(80);
  });
});
