import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import type { LegendListRef } from "@legendapp/list/react";
import { PROMPT_FLOOR_CSS_VAR, usePromptReserveFloor } from "./usePromptReserveFloor";

type PositionListener = (position: number | undefined) => void;

function makeListRef(positions: Map<string, number>) {
  const listeners = new Map<string, Set<PositionListener>>();
  const state = {
    positionByKey: (key: string) => positions.get(key),
    listenToPosition: (key: string, cb: PositionListener) => {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    },
  };
  const listRef = {
    current: { getState: () => state },
  } as unknown as RefObject<LegendListRef | null>;
  return {
    listRef,
    listeners,
    notify: (key: string, position: number | undefined) =>
      listeners.get(key)?.forEach((cb) => cb(position)),
  };
}

function makeContent() {
  const element = document.createElement("div");
  return { element, ref: { current: element } };
}

function floorValue(element: HTMLElement) {
  return element.style.getPropertyValue(PROMPT_FLOOR_CSS_VAR);
}

describe("usePromptReserveFloor", () => {
  it("writes the floored anchor position as a CSS variable", () => {
    const positions = new Map([["row-1", 1050.6]]);
    const { listRef } = makeListRef(positions);
    const content = makeContent();
    renderHook(() =>
      usePromptReserveFloor({ anchorKey: "row-1", listRef, contentElementRef: content.ref }),
    );
    expect(floorValue(content.element)).toBe("1050px");
  });

  it("updates when LegendList reports a new position", () => {
    const positions = new Map([["row-1", 1050]]);
    const { listRef, notify } = makeListRef(positions);
    const content = makeContent();
    renderHook(() =>
      usePromptReserveFloor({ anchorKey: "row-1", listRef, contentElementRef: content.ref }),
    );
    act(() => notify("row-1", 1100));
    expect(floorValue(content.element)).toBe("1100px");
  });

  it("does not rewrite for a sub-pixel move", () => {
    const positions = new Map([["row-1", 1050]]);
    const { listRef, notify } = makeListRef(positions);
    const content = makeContent();
    renderHook(() =>
      usePromptReserveFloor({ anchorKey: "row-1", listRef, contentElementRef: content.ref }),
    );
    act(() => notify("row-1", 1100.4));
    expect(floorValue(content.element)).toBe("1100px");
    act(() => notify("row-1", 1100.9));
    expect(floorValue(content.element)).toBe("1100px");
  });

  it("unsubscribes the old key and applies the new one on anchor change", () => {
    const positions = new Map([
      ["row-1", 1050],
      ["row-2", 1210],
    ]);
    const { listRef, listeners, notify } = makeListRef(positions);
    const content = makeContent();
    const { rerender } = renderHook(
      ({ anchorKey }) =>
        usePromptReserveFloor({ anchorKey, listRef, contentElementRef: content.ref }),
      { initialProps: { anchorKey: "row-1" as string | null } },
    );
    expect(floorValue(content.element)).toBe("1050px");
    rerender({ anchorKey: "row-2" });
    expect(floorValue(content.element)).toBe("1210px");
    expect(listeners.get("row-1")?.size ?? 0).toBe(0);
    act(() => notify("row-1", 2000));
    expect(floorValue(content.element)).toBe("1210px");
  });

  it("removes the property when the anchor clears and on unmount", () => {
    const positions = new Map([["row-1", 1050]]);
    const { listRef } = makeListRef(positions);
    const content = makeContent();
    const { rerender, unmount } = renderHook(
      ({ anchorKey }) =>
        usePromptReserveFloor({ anchorKey, listRef, contentElementRef: content.ref }),
      { initialProps: { anchorKey: "row-1" as string | null } },
    );
    expect(floorValue(content.element)).toBe("1050px");
    rerender({ anchorKey: null });
    expect(floorValue(content.element)).toBe("");
    rerender({ anchorKey: "row-1" });
    expect(floorValue(content.element)).toBe("1050px");
    unmount();
    expect(floorValue(content.element)).toBe("");
  });

  it("is a no-op without an anchor or a position", () => {
    const positions = new Map<string, number>();
    const { listRef, listeners } = makeListRef(positions);
    const content = makeContent();
    const { rerender } = renderHook(
      ({ anchorKey }) =>
        usePromptReserveFloor({ anchorKey, listRef, contentElementRef: content.ref }),
      { initialProps: { anchorKey: null as string | null } },
    );
    expect(floorValue(content.element)).toBe("");
    expect(listeners.size).toBe(0);
    rerender({ anchorKey: "missing-row" });
    expect(floorValue(content.element)).toBe("");
  });
});
