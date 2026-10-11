import { act, cleanup, render } from "@testing-library/react";
import { useLayoutEffect } from "react";
import type { LegendListState } from "@legendapp/list/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVirtualRowMeasurement, type RemeasureVirtualRow } from "./useVirtualRowMeasurement";

const observers: ControlledResizeObserver[] = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let observeFails = false;
let rejectBorderBox = false;
class ControlledResizeObserver {
  target: Element | null = null;
  options: ResizeObserverOptions | undefined;
  disconnected = false;
  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe(target: Element, options?: ResizeObserverOptions) {
    this.target = target;
    this.options = options;
    if (observeFails || (rejectBorderBox && options?.box === "border-box"))
      throw new Error("observe failed");
  }
  disconnect() {
    this.disconnected = true;
  }
  deliver(height: number, width = 500, borderBox = true) {
    act(() =>
      this.callback(
        [
          {
            target: this.target,
            ...(borderBox ? { borderBoxSize: [{ blockSize: height, inlineSize: width }] } : {}),
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      ),
    );
  }
}

beforeEach(() => {
  observers.length = 0;
  frames.clear();
  nextFrame = 0;
  observeFails = false;
  rejectBorderBox = false;
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    nextFrame += 1;
    frames.set(nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => frames.delete(handle));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fixture({ signal = true, cached = 100, tail = false } = {}) {
  let height = cached;
  let width = 500;
  let libraryHeight = cached;
  let measurementAvailable = true;
  const structuralSignal = vi.fn<() => void>();
  let explicitSignal = structuralSignal as (() => void) | undefined;
  const readHeight = vi.fn<() => number>(() => height);
  const readWidth = vi.fn<() => number>(() => width);
  const layout = {
    positionAtIndex: () => 0,
    sizeAtIndex: (index: number) => (index === 0 ? libraryHeight : 80),
  } as unknown as LegendListState;
  const remeasure = vi.fn<RemeasureVirtualRow>((_key, element, live = false, suppliedSize) => {
    if (!element) return null;
    libraryHeight = suppliedSize?.height ?? element.offsetHeight;
    void (suppliedSize?.width ?? element.offsetWidth);
    if (!live) structuralSignal();
    return measurementAvailable ? layout : null;
  });
  let controls: ReturnType<typeof useVirtualRowMeasurement>;
  type Props = { id: string; isLast: boolean; rowKey: string; signalVersion: number };
  const props: Props = { id: "row", isLast: tail, rowKey: "node", signalVersion: 0 };
  function Harness({ id, isLast, rowKey, signalVersion }: Props) {
    const { rowElementRef, remeasureRow, scheduleLiveMeasure } = useVirtualRowMeasurement(
      { kind: "item", id },
      isLast,
      remeasure,
      () => libraryHeight,
      signal ? explicitSignal : undefined,
    );
    useLayoutEffect(() => {
      controls = { rowElementRef, remeasureRow, scheduleLiveMeasure };
      Object.defineProperty(rowElementRef.current, "offsetHeight", {
        configurable: true,
        get: readHeight,
      });
      Object.defineProperty(rowElementRef.current, "offsetWidth", {
        configurable: true,
        get: readWidth,
      });
    });
    // Models an automatic disclosure/collapse commit: no user-handler signal.
    useLayoutEffect(() => {
      if (signalVersion > 0) remeasureRow();
    }, [remeasureRow, signalVersion]);
    return (
      <div>
        <div style={{ top: 0 }}>
          <div key={rowKey} ref={rowElementRef} data-index="0" data-testid="row" />
        </div>
        <div data-testid="following" style={{ top: cached }}>
          <div data-chat-virtual-row="true" data-index="1" />
        </div>
      </div>
    );
  }
  const view = render(<Harness {...props} />);
  return {
    view,
    remeasure,
    structuralSignal,
    readHeight,
    readWidth,
    row: () => view.getByTestId("row"),
    following: () => Number.parseFloat(view.getByTestId("following").style.top),
    explicit: () => act(() => controls.remeasureRow()),
    inlineTurn: () => act(() => controls.scheduleLiveMeasure()),
    resize: (nextHeight: number, nextWidth = 500) => {
      height = nextHeight;
      width = nextWidth;
    },
    unavailableMeasurement: () => {
      measurementAvailable = false;
    },
    replaceExplicitSignal: (callback: (() => void) | undefined) => {
      explicitSignal = callback;
      view.rerender(<Harness {...props} />);
    },
    update: (next: Partial<Props>) => {
      Object.assign(props, next);
      view.rerender(<Harness {...props} />);
    },
  };
}

describe("virtual row observation ownership", () => {
  it("keeps unknown mount geometry on the explicit fallback, then defers to fresh observer sizes", () => {
    const f = fixture();
    expect(f.readHeight).not.toHaveBeenCalled();
    expect(observers[0]!.options).toEqual({ box: "border-box" });
    f.explicit();
    expect(f.readHeight).toHaveBeenCalledOnce();
    expect(f.readWidth).toHaveBeenCalledOnce();
    observers[0]!.deliver(100.4, 499.6);
    f.readHeight.mockClear();
    f.readWidth.mockClear();
    f.remeasure.mockClear();
    f.structuralSignal.mockClear();
    f.explicit();
    expect(f.structuralSignal).toHaveBeenCalledOnce();
    expect(f.remeasure).not.toHaveBeenCalled();
    expect(f.readHeight).not.toHaveBeenCalled();
    f.resize(180);
    observers[0]!.deliver(180);
    expect(f.remeasure).toHaveBeenCalledExactlyOnceWith("row", f.row(), true, {
      height: 180,
      width: 500,
    });
    expect(f.following()).toBe(180);
    expect(f.readHeight).not.toHaveBeenCalled();
    expect(f.readWidth).not.toHaveBeenCalled();
  });

  it("preserves automatic structural signals even when geometry stays the same", () => {
    const f = fixture();
    observers[0]!.deliver(100);
    f.remeasure.mockClear();
    f.update({ signalVersion: 1 });
    expect(f.structuralSignal).toHaveBeenCalledOnce();
    expect(f.remeasure).not.toHaveBeenCalled();
    expect(f.readHeight).not.toHaveBeenCalled();
    observers[0]!.deliver(100);
    expect(f.remeasure).not.toHaveBeenCalled();
    expect(f.structuralSignal).toHaveBeenCalledOnce();
    f.explicit();
    expect(f.structuralSignal).toHaveBeenCalledTimes(2);
    expect(f.readHeight).not.toHaveBeenCalled();
  });

  it("uses the latest structural capability without restarting observation", () => {
    const f = fixture();
    observers[0]!.deliver(100);
    const nextSignal = vi.fn<() => void>();
    f.replaceExplicitSignal(nextSignal);
    expect(observers).toHaveLength(1);
    f.explicit();
    expect(nextSignal).toHaveBeenCalledOnce();
    expect(f.structuralSignal).not.toHaveBeenCalled();
    expect(f.readHeight).not.toHaveBeenCalled();
    f.replaceExplicitSignal(undefined);
    f.explicit();
    expect(f.readHeight).toHaveBeenCalledOnce();
    expect(f.structuralSignal).toHaveBeenCalledOnce();
  });

  it("retains explicit callback semantics when no separate structural capability is supplied", () => {
    const f = fixture({ signal: false });
    observers[0]!.deliver(100);
    f.remeasure.mockClear();
    f.explicit();
    expect(f.remeasure).toHaveBeenCalledExactlyOnceWith("row", f.row());
    expect(f.structuralSignal).toHaveBeenCalledOnce();
    expect(f.readHeight).toHaveBeenCalledOnce();
    expect(f.readWidth).toHaveBeenCalledOnce();
  });

  it.each(["missing", "constructor", "observe"] as const)(
    "falls back when observation is %s",
    (failure) => {
      if (failure === "missing") vi.stubGlobal("ResizeObserver", undefined);
      else if (failure === "constructor")
        vi.stubGlobal(
          "ResizeObserver",
          class {
            constructor() {
              throw new Error("constructor failed");
            }
          },
        );
      else observeFails = true;
      const f = fixture();
      f.explicit();
      expect(f.readHeight).toHaveBeenCalledOnce();
      expect(f.readWidth).toHaveBeenCalledOnce();
      expect(f.structuralSignal).toHaveBeenCalledOnce();
      expect(observers.map((observer) => observer.disconnected)).toEqual(
        failure === "observe" ? [true] : [],
      );
      observers[0]?.deliver(180);
      expect(f.remeasure).toHaveBeenCalledOnce();
    },
  );

  it("keeps the border-box-missing observer fallback and does not authorize explicit deferral", () => {
    const f = fixture();
    f.resize(125);
    observers[0]!.deliver(125, 500, false);
    expect(f.remeasure).toHaveBeenCalledExactlyOnceWith("row", f.row(), true, {
      height: 125,
      width: 500,
    });
    expect(f.readHeight).toHaveBeenCalledOnce();
    f.explicit();
    expect(f.readHeight).toHaveBeenCalledTimes(2);
    expect(f.readWidth).toHaveBeenCalledTimes(2);
  });

  it("retains legacy live growth delivery when border-box observation is rejected", () => {
    rejectBorderBox = true;
    const f = fixture();
    const observer = observers[0]!;
    expect(observer.options).toBeUndefined();
    expect(observer.disconnected).toBe(false);
    observer.deliver(100);
    f.resize(180);
    observer.deliver(180);
    expect(f.following()).toBe(180);
    expect(f.remeasure).toHaveBeenLastCalledWith("row", f.row(), true, { height: 180, width: 500 });
    f.explicit();
    expect(f.readHeight).toHaveBeenCalledOnce();
    expect(f.readWidth).toHaveBeenCalledOnce();
    expect(f.structuralSignal).toHaveBeenCalledOnce();
  });

  it("requires a successful virtualizer measurement before deferring explicit reads", () => {
    const f = fixture();
    f.unavailableMeasurement();
    observers[0]!.deliver(100);
    f.explicit();
    expect(f.readHeight).toHaveBeenCalledOnce();
    expect(f.remeasure).toHaveBeenCalledTimes(2);
  });

  it("keeps explicit fallback after a failed observer measurement", () => {
    const f = fixture();
    observers[0]!.deliver(100);
    f.resize(180);
    f.remeasure.mockImplementationOnce(() => {
      throw new Error("measurement failed");
    });
    expect(() => observers[0]!.deliver(180)).toThrow("measurement failed");
    f.explicit();
    expect(f.readHeight).toHaveBeenCalledOnce();
    expect(f.readWidth).toHaveBeenCalledOnce();
  });

  it("invalidates explicit deferral before a failing offset fallback read", () => {
    const f = fixture();
    observers[0]!.deliver(100);
    f.readHeight.mockImplementationOnce(() => {
      throw new Error("height read failed");
    });
    expect(() => observers[0]!.deliver(100, 500, false)).toThrow("height read failed");
    f.explicit();
    expect(f.readHeight).toHaveBeenCalledTimes(2);
    expect(f.readWidth).toHaveBeenCalledOnce();
  });

  it("falls back for disconnected nodes and ignores their queued delivery", () => {
    const f = fixture();
    observers[0]!.deliver(100);
    f.row().remove();
    f.explicit();
    expect(f.readHeight).toHaveBeenCalledOnce();
    observers[0]!.deliver(180);
    expect(f.remeasure).toHaveBeenCalledTimes(2);
  });

  it("falls back for a replacement node and rejects the previous node's observation", () => {
    const f = fixture();
    observers[0]!.deliver(100);
    const original = f.row();
    f.update({ rowKey: "replacement" });
    expect(f.row()).not.toBe(original);
    f.explicit();
    expect(f.readHeight).toHaveBeenCalledOnce();
    observers[0]!.deliver(180);
    expect(f.remeasure).toHaveBeenCalledTimes(2);
  });

  it("fences old deliveries after the same node is assigned to another item", () => {
    const f = fixture();
    observers[0]!.deliver(100);
    f.update({ id: "replacement-item" });
    expect(observers[0]!.disconnected).toBe(true);
    expect(observers).toHaveLength(2);
    f.remeasure.mockClear();
    observers[0]!.deliver(180);
    expect(f.remeasure).not.toHaveBeenCalled();
    f.explicit();
    expect(f.remeasure).toHaveBeenCalledExactlyOnceWith("replacement-item", f.row());
    observers[1]!.deliver(180);
    f.readHeight.mockClear();
    f.explicit();
    expect(f.readHeight).not.toHaveBeenCalled();
  });

  it("retains the baseline across tail-to-midlist changes and leaves shrink positioning library-owned", () => {
    const f = fixture({ tail: true });
    observers[0]!.deliver(100);
    f.update({ isLast: false });
    expect(observers).toHaveLength(1);
    observers[0]!.deliver(180);
    expect(f.following()).toBe(180);
    observers[0]!.deliver(80);
    expect(f.following()).toBe(180);
    expect(f.remeasure).toHaveBeenLastCalledWith("row", f.row(), true, { height: 80, width: 500 });
  });

  it.each([
    { cached: 200, delivered: 100, following: 200 },
    { cached: 100, delivered: 180, following: 180 },
  ])(
    "uses the initial library baseline ($cached -> $delivered)",
    ({ cached, delivered, following }) => {
      const f = fixture({ cached });
      observers[0]!.deliver(delivered);
      expect(f.following()).toBe(following);
    },
  );

  it("keeps inline-turn measurements coalesced and cancels their frame on cleanup", () => {
    const f = fixture();
    observers[0]!.deliver(100);
    f.remeasure.mockClear();
    f.inlineTurn();
    f.inlineTurn();
    expect(frames.size).toBe(1);
    act(() => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    });
    expect(f.remeasure).toHaveBeenCalledExactlyOnceWith("row", f.row(), true);
    expect(f.readHeight).toHaveBeenCalledOnce();
    f.inlineTurn();
    f.view.unmount();
    expect(frames.size).toBe(0);
    expect(observers[0]!.disconnected).toBe(true);
    f.remeasure.mockClear();
    observers[0]!.deliver(180);
    expect(f.remeasure).not.toHaveBeenCalled();
  });
});
