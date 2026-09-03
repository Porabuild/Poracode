import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PANEL_HEADER_CONTROL_PITCH_PX,
  resolvePanelHeaderOverflow,
  type PanelHeaderControlId,
  usePanelHeaderAvailableWidth,
} from "./panelHeaderOverflow";

const controls: PanelHeaderControlId[] = [
  "docks",
  "terminal",
  "files",
  "git",
  "usage",
  "notes",
  "browser",
  "lock",
  "close",
];

/** Width in which exactly `count` controls fit (the last one gives its gap back). */
function widthFor(count: number): number {
  return count * PANEL_HEADER_CONTROL_PITCH_PX - 6;
}

describe("resolvePanelHeaderOverflow", () => {
  it("shows everything while unmeasured", () => {
    expect(resolvePanelHeaderOverflow(controls, null)).toEqual({
      visible: controls,
      overflowed: [],
      showTrigger: false,
    });
  });

  it("shows everything when the row is wide enough", () => {
    expect(resolvePanelHeaderOverflow(controls, widthFor(controls.length))).toEqual({
      visible: controls,
      overflowed: [],
      showTrigger: false,
    });
  });

  it("folds the lock first and reserves a slot for the trigger", () => {
    // One control short of fitting: the trigger takes a slot, so two go.
    const result = resolvePanelHeaderOverflow(controls, widthFor(controls.length - 1));
    expect(result.overflowed).toEqual(["browser", "lock"]);
    expect(result.showTrigger).toBe(true);
    expect(result.visible).toEqual([
      "docks",
      "terminal",
      "files",
      "git",
      "usage",
      "notes",
      "close",
    ]);
  });

  it("hides controls one by one in the documented order, keeping row order", () => {
    // Five slots: close and the trigger are fixed, so three tabs remain.
    const result = resolvePanelHeaderOverflow(controls, widthFor(5));
    expect(result.visible).toEqual(["docks", "files", "git", "close"]);
    expect(result.overflowed).toEqual(["terminal", "usage", "notes", "browser", "lock"]);
    expect(result.showTrigger).toBe(true);
  });

  it("keeps the pinned close button even when nothing else fits", () => {
    const result = resolvePanelHeaderOverflow(controls, widthFor(1));
    expect(result.visible).toEqual(["close"]);
    expect(result.overflowed).toEqual(controls.filter((id) => id !== "close"));
    expect(result.showTrigger).toBe(false);
  });

  it("does not fold contextual tabs before the generic ones", () => {
    // Three slots: close is pinned, the trigger takes one, so one tab stays.
    const result = resolvePanelHeaderOverflow(["subagent", "docks", "git", "close"], widthFor(3));
    expect(result.visible).toEqual(["docks", "close"]);
    expect(result.overflowed).toEqual(["subagent", "git"]);
    expect(result.showTrigger).toBe(true);
  });
});

describe("usePanelHeaderAvailableWidth", () => {
  it("remeasures tab-specific leading content and reserves a detached accessory", () => {
    const row = document.createElement("div");
    const leading = document.createElement("div");
    const accessory = document.createElement("div");
    let leadingWidth = 80;

    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ width: 320 } as DOMRect);
    vi.spyOn(leading, "getBoundingClientRect").mockImplementation(
      () => ({ width: leadingWidth }) as DOMRect,
    );
    vi.spyOn(accessory, "getBoundingClientRect").mockReturnValue({ width: 18 } as DOMRect);

    const { result, rerender } = renderHook(
      ({ layoutKey }) =>
        usePanelHeaderAvailableWidth(
          { current: row },
          { current: leading },
          { current: accessory },
          layoutKey,
        ),
      { initialProps: { layoutKey: "docks" } },
    );

    expect(result.current).toBe(177);
    leadingWidth = 104;
    rerender({ layoutKey: "usage" });
    expect(result.current).toBe(153);
  });
});
