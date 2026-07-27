import React, { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { useDroppable } from "@dnd-kit/react";
import { msg } from "@lingui/core/macro";
import type { ThreadPresentationMode } from "@/shared/contracts";
import { type PaneLayout, type PaneLayoutAxis } from "@/shared/paneLayout";
import { useIsInsertSplitHighlighted, useIsRootInsertHighlighted } from "@/renderer/dnd";
import { i18n } from "@/renderer/i18n/i18n";
import { beginPanelResize, endPanelResize } from "@/renderer/state/panelResizeSignal";
import {
  MIN_PANE_PERCENT,
  readStoredSizes,
  samePath,
  splitStorageKey,
  writeStoredSizes,
} from "./paneSizeStorage";

const DIVIDER_SIZE = 8;
const ROOT_INSERT_ZONE_SIZE = DIVIDER_SIZE / 2;
// Step (in percent of the split's available space) used when a divider is
// nudged via arrow keys instead of dragged.
const KEY_RESIZE_STEP_PERCENT = 2;

export type Rect = { left: number; top: number; width: number; height: number };
type ContainerSize = { width: number; height: number };

export function resolvePaneDomKey(input: {
  paneId: string;
  paneSlotId: string;
  presentationMode: ThreadPresentationMode | undefined;
}): string {
  return input.presentationMode === "gui" ? `pane-slot:${input.paneSlotId}` : input.paneId;
}

type ComputedPane = { paneId: string; rect: Rect };

type ComputedDivider = {
  zoneId: string;
  path: number[];
  parentAxis: PaneLayoutAxis;
  insertIndex: number;
  rect: Rect;
  storageKey: string;
  dividerIndex: number;
  parentDim: number;
  childCount: number;
};

type ComputedLayout = { panes: ComputedPane[]; dividers: ComputedDivider[] };
type RenderedDivider = Pick<ComputedDivider, "zoneId" | "path" | "parentAxis" | "insertIndex">;

function sameContainerSize(a: ContainerSize, b: ContainerSize): boolean {
  return a.width === b.width && a.height === b.height;
}

function getContainerRect(size: ContainerSize): Rect {
  return {
    left: 0,
    top: 0,
    width: Math.max(0, size.width),
    height: Math.max(0, size.height),
  };
}

export function computeLayout(
  layout: PaneLayout,
  containerRect: Rect,
  resolveSizes: (storageKey: string, count: number) => number[],
): ComputedLayout {
  const panes: ComputedPane[] = [];
  const dividers: ComputedDivider[] = [];

  function walk(node: PaneLayout, rect: Rect, path: number[]) {
    if (node.kind === "leaf") {
      panes.push({ paneId: node.paneId, rect });
      return;
    }

    const storageKey = splitStorageKey(node, node.axis);
    const sizes = resolveSizes(storageKey, node.children.length);
    const isVertical = node.axis === "vertical";
    const totalDim = isVertical ? rect.width : rect.height;
    const dividerCount = node.children.length - 1;
    const availableDim = Math.max(0, totalDim - DIVIDER_SIZE * dividerCount);

    let offset = 0;
    for (let i = 0; i < node.children.length; i++) {
      const childDim = (sizes[i]! / 100) * availableDim;
      const childRect: Rect = isVertical
        ? { left: rect.left + offset, top: rect.top, width: childDim, height: rect.height }
        : { left: rect.left, top: rect.top + offset, width: rect.width, height: childDim };
      walk(node.children[i]!, childRect, [...path, i]);
      offset += childDim;

      if (i < dividerCount) {
        const dividerRect: Rect = isVertical
          ? {
              left: rect.left + offset,
              top: rect.top,
              width: DIVIDER_SIZE,
              height: rect.height,
            }
          : {
              left: rect.left,
              top: rect.top + offset,
              width: rect.width,
              height: DIVIDER_SIZE,
            };
        dividers.push({
          zoneId: `pane-insert:${node.axis}:${path.join("-")}:${i + 1}`,
          path,
          parentAxis: node.axis,
          insertIndex: i + 1,
          rect: dividerRect,
          storageKey,
          dividerIndex: i + 1,
          parentDim: totalDim,
          childCount: node.children.length,
        });
        offset += DIVIDER_SIZE;
      }
    }
  }

  walk(layout, containerRect, []);
  return { panes, dividers };
}

function setRectStyle(element: HTMLElement | null, rect: Rect) {
  if (!element) return;
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function layoutSignature(layout: PaneLayout): string {
  if (layout.kind === "leaf") return `leaf:${layout.paneId}`;
  return `${layout.axis}(${layout.children.map(layoutSignature).join(",")})`;
}

function sameRenderedDivider(a: RenderedDivider, b: RenderedDivider): boolean {
  return (
    a.zoneId === b.zoneId &&
    a.parentAxis === b.parentAxis &&
    a.insertIndex === b.insertIndex &&
    samePath(a.path, b.path)
  );
}

const Divider = React.memo(
  function Divider(props: {
    divider: RenderedDivider;
    registerRef: (zoneId: string, element: HTMLDivElement | null) => void;
    onResizeStart: (event: React.MouseEvent, zoneId: string) => void;
    onResizeKeyDown: (event: React.KeyboardEvent, zoneId: string) => void;
  }) {
    const { divider } = props;

    return (
      <div
        ref={(element) => {
          props.registerRef(divider.zoneId, element);
        }}
        className={`${
          divider.parentAxis === "vertical"
            ? "poracode-pane-divider"
            : "poracode-pane-divider-horizontal"
        }`}
        style={{
          position: "absolute",
        }}
        onMouseDown={(event) => props.onResizeStart(event, divider.zoneId)}
        onKeyDown={(event) => props.onResizeKeyDown(event, divider.zoneId)}
        role="separator"
        tabIndex={0}
        aria-orientation={divider.parentAxis === "vertical" ? "vertical" : "horizontal"}
        aria-label={
          divider.parentAxis === "vertical" ? i18n._(msg`Resize column`) : i18n._(msg`Resize row`)
        }
      >
        <DividerDropZone divider={divider} />
      </div>
    );
  },
  (prev, next) => sameRenderedDivider(prev.divider, next.divider),
);

const DividerDropZone = React.memo(
  function DividerDropZone(props: { divider: RenderedDivider }) {
    const { divider } = props;
    const elementRef = useRef<HTMLDivElement>(null);
    useDroppable({
      id: divider.zoneId,
      accept: ["pane", "thread", "new-thread"],
      data: {
        type: "pane-insert-zone",
        path: divider.path,
        axis: divider.parentAxis,
        index: divider.insertIndex,
        zoneId: divider.zoneId,
      },
      element: elementRef,
    });
    const isHighlighted = useIsInsertSplitHighlighted(divider.zoneId);

    return (
      <div
        ref={elementRef}
        aria-hidden="true"
        className={`poracode-pane-divider-drop-zone ${
          divider.parentAxis === "vertical"
            ? "poracode-pane-divider-drop-zone--vertical"
            : "poracode-pane-divider-drop-zone--horizontal"
        } ${isHighlighted ? "is-highlighted" : ""}`}
      />
    );
  },
  (prev, next) => sameRenderedDivider(prev.divider, next.divider),
);

const RootInsertZone = React.memo(function RootInsertZone(props: {
  axis: PaneLayoutAxis;
  index: number;
  side: "top" | "right" | "bottom" | "left";
}) {
  const zoneId = `root-insert:${props.side}`;
  const elementRef = useRef<HTMLDivElement>(null);
  useDroppable({
    id: `pane-root-insert:${props.side}`,
    accept: ["pane", "thread", "new-thread"],
    data: {
      type: "pane-insert-zone",
      path: [],
      axis: props.axis,
      index: props.index,
      zoneId,
    },
    element: elementRef,
  });
  const isHighlighted = useIsRootInsertHighlighted(zoneId);

  const edgeClass =
    props.side === "top"
      ? "top-0 right-0 left-0"
      : props.side === "bottom"
        ? "right-0 bottom-0 left-0"
        : props.side === "left"
          ? "top-0 bottom-0 left-0"
          : "top-0 right-0 bottom-0";

  const edgeStyle =
    props.side === "top" || props.side === "bottom"
      ? { height: `${ROOT_INSERT_ZONE_SIZE}px` }
      : { width: `${ROOT_INSERT_ZONE_SIZE}px` };

  const lineClass =
    props.side === "top"
      ? "top-0 right-0 left-0 h-0.5"
      : props.side === "bottom"
        ? "right-0 bottom-0 left-0 h-0.5"
        : props.side === "left"
          ? "top-0 bottom-0 left-0 w-0.5"
          : "top-0 right-0 bottom-0 w-0.5";

  return (
    <div ref={elementRef} className={`absolute z-10 ${edgeClass}`} style={edgeStyle}>
      {isHighlighted ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-full bg-accent ${lineClass}`}
        />
      ) : null}
    </div>
  );
});

export function SplitPaneContainer(props: {
  layout: PaneLayout;
  renderPane: (paneId: string, rect: Rect) => React.ReactNode;
  getPaneDomKey?: (paneId: string) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const paneElementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const dividerElementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const latestDividersRef = useRef<Map<string, ComputedDivider>>(new Map());
  const containerSizeRef = useRef<ContainerSize>({ width: 0, height: 0 });
  const layoutRef = useRef(props.layout);
  layoutRef.current = props.layout;

  // Committed sizes per split, normalized lazily on first read.
  const committedSizesRef = useRef<Map<string, number[]>>(new Map());
  // Transient sizes during a drag — applied imperatively, not stored.
  const transientSizesRef = useRef<Map<string, number[]>>(new Map());
  const layoutSignatureRef = useRef<string | null>(null);
  // Forces a re-render after an imperative layout commit so React's pane styles
  // converge with the DOM positions. Read isn't needed; dispatching is the side effect.
  const [, bumpLayoutTick] = useReducer((tick: number) => tick + 1, 0);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let resizeFrame: number | null = null;
    function cancelPendingResizeWork() {
      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = null;
      }
    }

    function commitSize(next: ContainerSize) {
      cancelPendingResizeWork();
      if (sameContainerSize(containerSizeRef.current, next)) return;
      containerSizeRef.current = next;
      bumpLayoutTick();
    }

    function scheduleLiveLayout() {
      if (resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        applyLayoutForSize(containerSizeRef.current);
      });
    }

    function applyObservedSize(next: ContainerSize) {
      if (sameContainerSize(containerSizeRef.current, next)) return;
      containerSizeRef.current = next;
      if (paneElementRefs.current.size === 0) {
        bumpLayoutTick();
        return;
      }
      scheduleLiveLayout();
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        applyObservedSize({ width, height });
      }
    });
    observer.observe(element);
    const rect = element.getBoundingClientRect();
    commitSize({ width: rect.width, height: rect.height });
    return () => {
      observer.disconnect();
      cancelPendingResizeWork();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- observer lifetime is fixed; resize work reads latest layout from refs
  }, []);

  const resolveSizes = useCallback((storageKey: string, count: number): number[] => {
    const transient = transientSizesRef.current.get(storageKey);
    if (transient && transient.length === count) return transient;
    const committed = committedSizesRef.current.get(storageKey);
    if (committed && committed.length === count) return committed;
    const restored = readStoredSizes(storageKey, count);
    committedSizesRef.current.set(storageKey, restored);
    return restored;
  }, []);

  const currentLayoutSignature = layoutSignature(props.layout);
  if (layoutSignatureRef.current !== currentLayoutSignature) {
    layoutSignatureRef.current = currentLayoutSignature;
    committedSizesRef.current.clear();
    transientSizesRef.current.clear();
  }

  const containerRect = getContainerRect(containerSizeRef.current);

  const computed =
    containerRect.width > 0 && containerRect.height > 0
      ? computeLayout(props.layout, containerRect, resolveSizes)
      : { panes: [], dividers: [] };
  latestDividersRef.current = new Map(
    computed.dividers.map((divider) => [divider.zoneId, divider]),
  );

  const applyLayoutForSize = useCallback(
    (size: ContainerSize) => {
      const rect = getContainerRect(size);
      if (rect.width <= 0 || rect.height <= 0) return;
      const layoutNow = computeLayout(layoutRef.current, rect, resolveSizes);
      latestDividersRef.current = new Map(
        layoutNow.dividers.map((divider) => [divider.zoneId, divider]),
      );
      for (const pane of layoutNow.panes) {
        setRectStyle(paneElementRefs.current.get(pane.paneId) ?? null, pane.rect);
      }
      for (const divider of layoutNow.dividers) {
        setRectStyle(dividerElementRefs.current.get(divider.zoneId) ?? null, divider.rect);
      }
    },
    [resolveSizes],
  );

  const applyTransientLayout = useCallback(() => {
    applyLayoutForSize(containerSizeRef.current);
  }, [applyLayoutForSize]);

  useLayoutEffect(() => {
    for (const divider of computed.dividers) {
      setRectStyle(dividerElementRefs.current.get(divider.zoneId) ?? null, divider.rect);
    }
  }, [computed.dividers]);

  const registerDividerRef = useCallback((zoneId: string, element: HTMLDivElement | null) => {
    if (element) {
      dividerElementRefs.current.set(zoneId, element);
      const rect = latestDividersRef.current.get(zoneId)?.rect;
      if (rect) setRectStyle(element, rect);
    } else {
      dividerElementRefs.current.delete(zoneId);
    }
  }, []);

  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent, zoneId: string) => {
      event.preventDefault();
      cleanupRef.current?.();

      const divider = latestDividersRef.current.get(zoneId);
      if (!divider) return;

      const storageKey = divider.storageKey;
      const isVertical = divider.parentAxis === "vertical";
      const startPos = isVertical ? event.clientX : event.clientY;
      const initialSizes =
        committedSizesRef.current.get(storageKey) ??
        readStoredSizes(storageKey, divider.childCount);
      const beforeIndex = divider.dividerIndex - 1;
      const afterIndex = divider.dividerIndex;
      const beforeStart = initialSizes[beforeIndex]!;
      const afterStart = initialSizes[afterIndex]!;
      const dividerSpace = DIVIDER_SIZE * (divider.childCount - 1);
      const availableDim = Math.max(1, divider.parentDim - dividerSpace);

      const overlay = overlayRef.current;
      if (overlay) {
        overlay.style.display = "block";
        overlay.style.cursor = isVertical ? "col-resize" : "row-resize";
      }

      beginPanelResize();

      let lastSizes = initialSizes;

      function onMouseMove(ev: MouseEvent) {
        const deltaPx = (isVertical ? ev.clientX : ev.clientY) - startPos;
        const deltaPercent = (deltaPx / availableDim) * 100;
        const newBefore = beforeStart + deltaPercent;
        const newAfter = afterStart - deltaPercent;
        if (newBefore < MIN_PANE_PERCENT || newAfter < MIN_PANE_PERCENT) return;
        const next = [...initialSizes];
        next[beforeIndex] = newBefore;
        next[afterIndex] = newAfter;
        lastSizes = next;
        transientSizesRef.current.set(storageKey, next);
        applyTransientLayout();
      }

      function teardown() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (overlay) {
          overlay.style.display = "none";
          overlay.style.cursor = "";
        }
        endPanelResize();
        cleanupRef.current = null;
      }

      function onMouseUp() {
        teardown();
        transientSizesRef.current.delete(storageKey);
        committedSizesRef.current.set(storageKey, lastSizes);
        writeStoredSizes(storageKey, lastSizes);
        bumpLayoutTick();
      }

      cleanupRef.current = teardown;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [applyTransientLayout, bumpLayoutTick],
  );

  // Keyboard equivalent of dragging a divider: nudges the adjacent panes'
  // sizes by a fixed percent step and persists immediately, since there's no
  // drag "end" event to persist on.
  const nudgeDivider = useCallback(
    (zoneId: string, deltaPercent: number) => {
      const divider = latestDividersRef.current.get(zoneId);
      if (!divider) return;

      const storageKey = divider.storageKey;
      const initialSizes =
        committedSizesRef.current.get(storageKey) ??
        readStoredSizes(storageKey, divider.childCount);
      const beforeIndex = divider.dividerIndex - 1;
      const afterIndex = divider.dividerIndex;
      const beforeStart = initialSizes[beforeIndex]!;
      const afterStart = initialSizes[afterIndex]!;
      const newBefore = beforeStart + deltaPercent;
      const newAfter = afterStart - deltaPercent;
      if (newBefore < MIN_PANE_PERCENT || newAfter < MIN_PANE_PERCENT) return;

      const next = [...initialSizes];
      next[beforeIndex] = newBefore;
      next[afterIndex] = newAfter;
      committedSizesRef.current.set(storageKey, next);
      writeStoredSizes(storageKey, next);
      bumpLayoutTick();
    },
    [bumpLayoutTick],
  );

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent, zoneId: string) => {
      const divider = latestDividersRef.current.get(zoneId);
      if (!divider) return;
      const isVertical = divider.parentAxis === "vertical";
      const decreaseKey = isVertical ? "ArrowLeft" : "ArrowUp";
      const increaseKey = isVertical ? "ArrowRight" : "ArrowDown";
      if (event.key !== decreaseKey && event.key !== increaseKey) return;
      event.preventDefault();
      nudgeDivider(
        zoneId,
        event.key === increaseKey ? KEY_RESIZE_STEP_PERCENT : -KEY_RESIZE_STEP_PERCENT,
      );
    },
    [nudgeDivider],
  );

  // Root-insert-zone indices: when the root is a split aligned with the edge,
  // the index appends/prepends within that split; otherwise it wraps the layout.
  const rootSplit = props.layout.kind === "split" ? props.layout : null;
  const rightIndex = rootSplit && rootSplit.axis === "vertical" ? rootSplit.children.length : 1;
  const bottomIndex = rootSplit && rootSplit.axis === "horizontal" ? rootSplit.children.length : 1;

  return (
    <div ref={containerRef} className="relative h-full min-h-0 w-full overflow-hidden">
      <RootInsertZone axis="horizontal" index={0} side="top" />
      <RootInsertZone axis="horizontal" index={bottomIndex} side="bottom" />
      <RootInsertZone axis="vertical" index={0} side="left" />
      <RootInsertZone axis="vertical" index={rightIndex} side="right" />
      <div
        className="absolute"
        style={{
          inset: 0,
        }}
      >
        {/* Sort by DOM key so React keeps the same DOM slot per pane across
            layout swaps; reparenting an absolutely-positioned pane resets
            `scrollTop` on the nested chat scroller. */}
        {computed.panes
          .map((pane) => ({
            pane,
            domKey: props.getPaneDomKey?.(pane.paneId) ?? pane.paneId,
          }))
          .sort((a, b) => a.domKey.localeCompare(b.domKey))
          .map(({ pane, domKey }) => (
            <div
              key={domKey}
              ref={(element) => {
                if (element) paneElementRefs.current.set(pane.paneId, element);
                else paneElementRefs.current.delete(pane.paneId);
              }}
              className="absolute overflow-hidden"
              style={{
                left: pane.rect.left,
                top: pane.rect.top,
                width: pane.rect.width,
                height: pane.rect.height,
              }}
            >
              {props.renderPane(pane.paneId, pane.rect)}
            </div>
          ))}
        {computed.dividers.map((divider) => (
          <Divider
            key={divider.zoneId}
            divider={divider}
            registerRef={registerDividerRef}
            onResizeStart={handleResizeStart}
            onResizeKeyDown={handleResizeKeyDown}
          />
        ))}
      </div>
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="fixed inset-0 z-50"
        style={{ display: "none" }}
      />
    </div>
  );
}
