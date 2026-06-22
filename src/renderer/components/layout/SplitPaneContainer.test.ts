import React from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneLayout } from "@/shared/paneLayout";
import { computeLayout, SplitPaneContainer } from "./SplitPaneContainer";
import { splitStorageKey, writeStoredSizes } from "./paneSizeStorage";

vi.mock("@dnd-kit/react", () => ({
  useDroppable: () => undefined,
}));

vi.mock("@/renderer/dnd", () => ({
  useIsInsertSplitHighlighted: () => false,
  useIsRootInsertHighlighted: () => false,
}));

const containerRect = { left: 0, top: 0, width: 1000, height: 600 };
const equalSizes = (_key: string, count: number) =>
  Array.from({ length: count }, () => 100 / count);
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

function setElementRect(width: number, height: number) {
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("computeLayout", () => {
  it("emits a single full-rect pane for a leaf layout", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "p1" };
    const result = computeLayout(layout, containerRect, equalSizes);
    expect(result.dividers).toEqual([]);
    expect(result.panes).toEqual([{ paneId: "p1", rect: containerRect }]);
  });

  it("splits a vertical layout into adjacent panes separated by dividers", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "p1" },
        { kind: "leaf", paneId: "p2" },
      ],
    };
    const result = computeLayout(layout, containerRect, equalSizes);
    expect(result.panes).toHaveLength(2);
    expect(result.dividers).toHaveLength(1);

    const [p1, p2] = result.panes;
    // Panes share the full container height and split available width.
    expect(p1!.rect.top).toBe(0);
    expect(p1!.rect.height).toBe(600);
    expect(p2!.rect.top).toBe(0);
    expect(p2!.rect.height).toBe(600);

    // Pane widths sum with the divider to the container width.
    const divider = result.dividers[0]!;
    expect(p1!.rect.width + divider.rect.width + p2!.rect.width).toBeCloseTo(1000);

    // Divider sits between the two panes, vertical orientation.
    expect(divider.parentAxis).toBe("vertical");
    expect(divider.rect.left).toBeCloseTo(p1!.rect.width);
    expect(divider.rect.top).toBe(0);
    expect(divider.rect.height).toBe(600);
    expect(divider.dividerIndex).toBe(1);
    expect(divider.childCount).toBe(2);
  });

  it("splits a horizontal layout into stacked panes", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "horizontal",
      children: [
        { kind: "leaf", paneId: "top" },
        { kind: "leaf", paneId: "bottom" },
      ],
    };
    const result = computeLayout(layout, containerRect, equalSizes);
    const [top, bottom] = result.panes;
    const divider = result.dividers[0]!;

    expect(top!.rect.left).toBe(0);
    expect(bottom!.rect.left).toBe(0);
    expect(top!.rect.width).toBe(1000);
    expect(bottom!.rect.width).toBe(1000);
    expect(divider.parentAxis).toBe("horizontal");
    expect(divider.rect.left).toBe(0);
    expect(divider.rect.width).toBe(1000);
    expect(divider.rect.top).toBeCloseTo(top!.rect.height);
    expect(top!.rect.height + divider.rect.height + bottom!.rect.height).toBeCloseTo(600);
  });

  it("uses caller-provided sizes to weight the split", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "p1" },
        { kind: "leaf", paneId: "p2" },
      ],
    };
    const result = computeLayout(layout, containerRect, () => [75, 25]);
    const [p1, p2] = result.panes;
    // Available width = 1000 - DIVIDER_SIZE (8) = 992. 75% / 25% split.
    expect(p1!.rect.width).toBeCloseTo(744, 0);
    expect(p2!.rect.width).toBeCloseTo(248, 0);
  });

  it("recurses through nested splits with paths and zone IDs reflecting depth", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "left" },
        {
          kind: "split",
          axis: "horizontal",
          children: [
            { kind: "leaf", paneId: "right-top" },
            { kind: "leaf", paneId: "right-bottom" },
          ],
        },
      ],
    };
    const result = computeLayout(layout, containerRect, equalSizes);
    expect(result.panes.map((p) => p.paneId)).toEqual(["left", "right-top", "right-bottom"]);

    // Outer divider has empty path, inner divider's path points at the child split.
    const [outer, inner] = result.dividers;
    expect(outer!.parentAxis).toBe("vertical");
    expect(outer!.path).toEqual([]);
    expect(inner!.parentAxis).toBe("horizontal");
    expect(inner!.path).toEqual([1]);
    expect(inner!.zoneId).toContain("horizontal:1:1");
  });

  it("returns an empty layout when the container has zero area is handled by caller", () => {
    // computeLayout itself does not bail; the caller checks `innerWidth > 0`.
    // We exercise the zero-area case to confirm panes still emit with zero
    // dimensions (no exceptions, no NaN).
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "p1" },
        { kind: "leaf", paneId: "p2" },
      ],
    };
    const result = computeLayout(layout, { left: 0, top: 0, width: 0, height: 0 }, equalSizes);
    for (const pane of result.panes) {
      expect(pane.rect.width).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(pane.rect.width)).toBe(true);
      expect(Number.isFinite(pane.rect.height)).toBe(true);
    }
  });
});

describe("SplitPaneContainer", () => {
  beforeEach(() => {
    localStorage.clear();
    setElementRect(1000, 600);
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("updates an existing divider position when panes are added at the same container size", () => {
    const twoPanes: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "p1" },
        { kind: "leaf", paneId: "p2" },
      ],
    };
    const threePanes: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "p1" },
        { kind: "leaf", paneId: "p2" },
        { kind: "leaf", paneId: "p3" },
      ],
    };
    const renderPane = (paneId: string) => React.createElement("div", { "data-pane-id": paneId });

    const { container, rerender } = render(
      React.createElement(SplitPaneContainer, { layout: twoPanes, renderPane }),
    );
    const divider = container.querySelector<HTMLElement>(
      '[role="separator"][aria-orientation="vertical"]',
    );
    expect(divider).not.toBeNull();
    expect(parseFloat(divider!.style.left)).toBeCloseTo(492);

    rerender(React.createElement(SplitPaneContainer, { layout: threePanes, renderPane }));

    expect(container.querySelector<HTMLElement>('[role="separator"]')).toBe(divider);
    expect(parseFloat(divider!.style.left)).toBeCloseTo(976 / 3);
  });

  it("rereads projected sizes when returning to a previously cached layout key", () => {
    const twoPanes: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "left" },
        { kind: "leaf", paneId: "right" },
      ],
    };
    const fourPanes: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        {
          kind: "split",
          axis: "horizontal",
          children: [
            { kind: "leaf", paneId: "left-top" },
            { kind: "leaf", paneId: "left-bottom" },
          ],
        },
        {
          kind: "split",
          axis: "horizontal",
          children: [
            { kind: "leaf", paneId: "right-top" },
            { kind: "leaf", paneId: "right-bottom" },
          ],
        },
      ],
    };
    const renderPane = (paneId: string) => React.createElement("div", { "data-pane-id": paneId });

    writeStoredSizes(splitStorageKey(fourPanes, "vertical"), [50, 50]);
    const { container, rerender } = render(
      React.createElement(SplitPaneContainer, { layout: fourPanes, renderPane }),
    );
    const divider = container.querySelector<HTMLElement>(
      '[role="separator"][aria-orientation="vertical"]',
    );
    expect(divider).not.toBeNull();
    expect(parseFloat(divider!.style.left)).toBeCloseTo(492);

    rerender(React.createElement(SplitPaneContainer, { layout: twoPanes, renderPane }));
    writeStoredSizes(splitStorageKey(fourPanes, "vertical"), [35, 65]);

    rerender(React.createElement(SplitPaneContainer, { layout: fourPanes, renderPane }));

    expect(parseFloat(divider!.style.left)).toBeCloseTo(344.4);
  });
});
