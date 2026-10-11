import { describe, expect, it, vi } from "vitest";
import { mount, rows, state } from "./legendListMeasurementFixtures";

describe("actual LegendList paging edges", () => {
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
});
