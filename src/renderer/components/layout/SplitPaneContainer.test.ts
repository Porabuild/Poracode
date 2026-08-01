import React from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneLayout } from "@/shared/paneLayout";
import {
  computeLayout,
  resolvePaneDomKey,
  SplitPaneContainer,
  type Rect,
} from "./SplitPaneContainer";
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

  it("does not render outer drop zones as resize handles or reserve space for them", () => {
    const renderPane = (paneId: string) => React.createElement("div", { "data-pane-id": paneId });
    const { container, rerender } = render(
      React.createElement(SplitPaneContainer, {
        layout: {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: "first" },
            { kind: "leaf", paneId: "second" },
          ],
        },
        renderPane,
      }),
    );
    expect(
      container.querySelectorAll('[class*="cursor-row-resize"], [class*="cursor-col-resize"]'),
    ).toHaveLength(0);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
    const secondPane =
      container.querySelector<HTMLElement>("[data-pane-id='second']")?.parentElement;
    expect(secondPane?.style.top).toBe("0px");
    expect(secondPane?.style.height).toBe("600px");
    expect(Number(secondPane?.style.left.replace("px", ""))).toBe(504);
    expect(
      Number(secondPane?.style.left.replace("px", "")) +
        Number(secondPane?.style.width.replace("px", "")),
    ).toBe(1000);

    rerender(
      React.createElement(SplitPaneContainer, {
        layout: { kind: "leaf", paneId: "only" },
        renderPane,
      }),
    );

    expect(
      container.querySelectorAll('[class*="cursor-row-resize"], [class*="cursor-col-resize"]'),
    ).toHaveLength(0);
    const pane = container.querySelector<HTMLElement>("[data-pane-id='only']")?.parentElement;
    expect(pane?.style.left).toBe("0px");
    expect(pane?.style.top).toBe("0px");
    expect(pane?.style.width).toBe("1000px");
    expect(pane?.style.height).toBe("600px");
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
    expect(parseFloat(divider!.style.left)).toBeCloseTo(496);

    rerender(React.createElement(SplitPaneContainer, { layout: threePanes, renderPane }));

    expect(container.querySelector<HTMLElement>('[role="separator"]')).toBe(divider);
    expect(parseFloat(divider!.style.left)).toBeCloseTo(984 / 3);
  });

  it("keeps a pane shell mounted when its caller-provided DOM key stays stable", () => {
    let mountCount = 0;
    function PaneShell({ paneId }: { paneId: string }) {
      const instance = React.useRef<number | null>(null);
      if (instance.current === null) instance.current = ++mountCount;
      return React.createElement("div", {
        "data-pane-id": paneId,
        "data-pane-instance": instance.current,
      });
    }
    const renderPane = (paneId: string) => React.createElement(PaneShell, { paneId });
    const getPaneDomKey = () => "primary-gui";
    const { container, rerender } = render(
      React.createElement(SplitPaneContainer, {
        layout: { kind: "leaf", paneId: "thread-a" },
        renderPane,
        getPaneDomKey,
      }),
    );
    const firstShell = container.querySelector<HTMLElement>("[data-pane-id='thread-a']");

    rerender(
      React.createElement(SplitPaneContainer, {
        layout: { kind: "leaf", paneId: "thread-b" },
        renderPane,
        getPaneDomKey,
      }),
    );

    const secondShell = container.querySelector<HTMLElement>("[data-pane-id='thread-b']");
    expect(secondShell).toBe(firstShell);
    expect(secondShell?.dataset.paneInstance).toBe("1");
    expect(mountCount).toBe(1);
  });

  it("uses each GUI pane's stable slot key", () => {
    const guiKey = resolvePaneDomKey({
      paneId: "thread-a",
      paneSlotId: "slot-a",
      presentationMode: "gui",
    });
    expect(
      resolvePaneDomKey({
        paneId: "thread-a-replacement",
        paneSlotId: "slot-a",
        presentationMode: "gui",
      }),
    ).toBe(guiKey);
    expect(
      resolvePaneDomKey({
        paneId: "thread-a",
        paneSlotId: "slot-a",
        presentationMode: "terminal",
      }),
    ).toBe("thread-a");
    expect(
      resolvePaneDomKey({
        paneId: "thread-b",
        paneSlotId: "slot-b",
        presentationMode: "gui",
      }),
    ).not.toBe(guiKey);
  });

  it("renders hidden keep-alive panes invisible and keeps them mounted", () => {
    const renderPane = (paneId: string, _rect: Rect, hidden = false) =>
      React.createElement("div", {
        [hidden ? "data-hidden-pane-id" : "data-pane-id"]: paneId,
      });
    const { container, rerender } = render(
      React.createElement(SplitPaneContainer, {
        layout: { kind: "leaf", paneId: "visible" },
        renderPane,
        hiddenPaneIds: ["hidden-a", "hidden-b"],
      }),
    );

    const visible = container.querySelector("[data-pane-id='visible']");
    expect(visible).not.toBeNull();
    const hiddenA = container.querySelector("[data-hidden-pane-id='hidden-a']");
    const hiddenB = container.querySelector("[data-hidden-pane-id='hidden-b']");
    expect(hiddenA).not.toBeNull();
    expect(hiddenB).not.toBeNull();
    // Hidden panes are inside an invisible, aria-hidden wrapper.
    const hiddenWrapperA = hiddenA!.closest(".invisible");
    expect(hiddenWrapperA).not.toBeNull();
    expect(hiddenWrapperA?.getAttribute("aria-hidden")).toBe("true");

    // Re-render with the same hidden ids: the same DOM nodes stay (keep-alive).
    const firstHiddenA = hiddenA;
    rerender(
      React.createElement(SplitPaneContainer, {
        layout: { kind: "leaf", paneId: "visible" },
        renderPane,
        hiddenPaneIds: ["hidden-a", "hidden-b"],
      }),
    );
    expect(container.querySelector("[data-hidden-pane-id='hidden-a']")).toBe(firstHiddenA);

    // Removing a hidden id unmounts it.
    rerender(
      React.createElement(SplitPaneContainer, {
        layout: { kind: "leaf", paneId: "visible" },
        renderPane,
        hiddenPaneIds: ["hidden-b"],
      }),
    );
    expect(container.querySelector("[data-hidden-pane-id='hidden-a']")).toBeNull();
    expect(container.querySelector("[data-hidden-pane-id='hidden-b']")).not.toBeNull();
  });

  it("reuses the same DOM node when a hidden pane becomes visible (keep-alive)", () => {
    // Same render fn for visible and hidden so the mounted content is
    // identical; the wrapper must keep the node alive across the transition.
    const renderPane = (paneId: string) =>
      React.createElement("div", { "data-pane-id": paneId, "data-mounted": "true" });
    const { container, rerender } = render(
      React.createElement(SplitPaneContainer, {
        layout: { kind: "leaf", paneId: "visible" },
        renderPane,
        hiddenPaneIds: ["hidden-a"],
      }),
    );
    const hiddenA = container.querySelector("[data-pane-id='hidden-a']");
    expect(hiddenA).not.toBeNull();

    // hidden-a becomes visible: it leaves hiddenPaneIds and enters the layout.
    rerender(
      React.createElement(SplitPaneContainer, {
        layout: { kind: "leaf", paneId: "hidden-a" },
        renderPane,
        hiddenPaneIds: [],
      }),
    );
    const visibleA = container.querySelector("[data-pane-id='hidden-a']");
    expect(visibleA).not.toBeNull();
    // Same DOM node — the component did NOT unmount/remount.
    expect(visibleA).toBe(hiddenA);
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
    expect(parseFloat(divider!.style.left)).toBeCloseTo(496);

    rerender(React.createElement(SplitPaneContainer, { layout: twoPanes, renderPane }));
    writeStoredSizes(splitStorageKey(fourPanes, "vertical"), [35, 65]);

    rerender(React.createElement(SplitPaneContainer, { layout: fourPanes, renderPane }));

    expect(parseFloat(divider!.style.left)).toBeCloseTo(347.2);
  });
});
