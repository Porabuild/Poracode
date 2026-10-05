import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Row } from "./legendListMeasurementFixtures";
import { context, measure, mount, rows, state } from "./legendListMeasurementFixtures";

// Hold host frames after normal mount/scroll settling. The real library still
// creates its own anchor lock, schedules reconciliation and owns the handle.
function holdAnimationFrames() {
  const pending = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  const originalCancel = globalThis.cancelAnimationFrame;
  const request = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    const handle = nextHandle++;
    pending.set(handle, vi.fn(callback));
    return handle;
  });
  const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((handle) => {
    if (!pending.delete(handle)) originalCancel(handle);
  });
  function deliver(handle: number) {
    const callback = pending.get(handle);
    if (!callback) return;
    pending.delete(handle);
    act(() => callback(performance.now()));
  }
  return {
    pending,
    cancel,
    deliver,
    flush() {
      for (const handle of [...pending.keys()]) deliver(handle);
    },
    restore() {
      pending.clear();
      request.mockRestore();
      cancel.mockRestore();
    },
  };
}

function anchoredGrowth(revision: "prefix" | "prepend") {
  const data = rows();
  const view = mount(data);
  view.scroll(900);
  const frames = holdAnimationFrames();
  try {
    view.update(revision === "prefix" ? data.slice(12) : [...rows(-12, 0), ...data]);
    const listState = context().state;
    const anchor = listState.mvcpAnchorLock?.id;
    expect(anchor, "a real structural revision established the reader anchor").toBeDefined();
    if (!anchor) throw new Error("Expected an actual LegendList reader anchor");
    const anchorOffset = view.offset(anchor);
    const anchorIndex = state().data.findIndex((item: Row) => item.id === anchor);
    expect(anchorIndex).toBeGreaterThan(0);
    const preceding = state().data[anchorIndex - 1]!.id;
    const previousHeight = listState.sizesKnown.get(preceding)!;
    expect(previousHeight, "the preceding row has a measured height").toBeGreaterThan(0);
    measure(preceding, previousHeight + 55);
    expect(listState.sizesKnown.get(preceding)).toBe(previousHeight + 55);
    const handle = listState.queuedMVCPRecalculate;
    expect(handle, "observed row growth queued real anchor reconciliation").toBeDefined();
    if (handle === undefined) throw new Error("Expected an actual LegendList reconciliation frame");
    const callback = frames.pending.get(handle);
    expect(callback, "the browser frame queue owns that exact callback").toBeTypeOf("function");
    if (!callback) throw new Error("Expected the queued LegendList callback");
    return { view, frames, listState, anchor, anchorOffset, handle, callback };
  } catch (error) {
    view.unmount();
    frames.restore();
    throw error;
  }
}

describe("actual LegendList anchor-frame destruction", () => {
  it.each(["prefix", "prepend"] as const)(
    "cancels the observed row-growth frame on unmount after a %s revision",
    (revision) => {
      const growth = anchoredGrowth(revision);
      const known = new Map(growth.listState.sizesKnown);
      try {
        growth.view.unmount();
        expect(growth.frames.cancel).toHaveBeenCalledWith(growth.handle);
        expect(growth.listState.queuedMVCPRecalculate).toBeUndefined();
        expect(growth.frames.pending.has(growth.handle)).toBe(false);
        // Attempt to deliver through the host queue, rather than calling a
        // captured callback manually after its owner has cancelled it.
        growth.frames.deliver(growth.handle);
        expect(growth.callback).not.toHaveBeenCalled();
        expect(growth.listState.sizesKnown).toEqual(known);
      } finally {
        growth.view.unmount();
        growth.frames.restore();
      }
    },
  );

  it("runs the same reconciliation and preserves the reader anchor while mounted", () => {
    const growth = anchoredGrowth("prefix");
    try {
      growth.frames.deliver(growth.handle);
      for (let frame = 0; frame < 3; frame++) growth.frames.flush();
      expect(growth.callback).toHaveBeenCalledOnce();
      expect(growth.listState.queuedMVCPRecalculate).toBeUndefined();
      expect(growth.view.offset(growth.anchor)).toBeCloseTo(growth.anchorOffset, 1);
    } finally {
      growth.view.unmount();
      growth.frames.restore();
    }
  });
});
