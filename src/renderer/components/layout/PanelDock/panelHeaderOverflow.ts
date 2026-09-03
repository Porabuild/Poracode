import { useLayoutEffect, useState, type RefObject } from "react";
import { isPanelResizing } from "@/renderer/state/panelResizeSignal";
import type { RightPanelTab } from "@/renderer/state/panelStore";

/**
 * Trailing controls of the right-panel header: every tab icon, the thread
 * lock, and the close button. Anything not in {@link PANEL_HEADER_HIDE_ORDER}
 * is pinned and never moves into the overflow menu.
 */
export type PanelHeaderControlId = RightPanelTab | "lock" | "close";

/**
 * Which controls leave the row first when the panel gets narrow. Least-needed
 * first: the lock, then rarely used tabs, and the contextual tabs (subagent,
 * docks) last because they are the reason the panel is open.
 */
export const PANEL_HEADER_HIDE_ORDER: readonly PanelHeaderControlId[] = [
  "lock",
  "browser",
  "notes",
  "ports",
  "usage",
  "terminal",
  "files",
  "git",
  "subagent",
  "docks",
];

/**
 * Header row geometry (see `panelHeaderRowClass`): each icon button is a 14px
 * glyph with 2px padding on a 6px gap, so a control claims 24px of pitch and
 * the last one gives its gap back.
 */
export const PANEL_HEADER_CONTROL_PITCH_PX = 24;
const PANEL_HEADER_CONTROL_GAP_PX = 6;
/** `px-2` on the row. */
const PANEL_HEADER_ROW_PADDING_X_PX = 16;
/** Flex gaps around the spacer/divider plus the divider's width and margins. */
const PANEL_HEADER_DIVIDER_FOOTPRINT_PX = 23;

export interface PanelHeaderOverflow {
  /** Controls painted in the row, in the caller's order. */
  visible: readonly PanelHeaderControlId[];
  /** Controls folded into the "More" menu, in the caller's order. */
  overflowed: readonly PanelHeaderControlId[];
  /** Whether the row has room for the overflow trigger beside pinned controls. */
  showTrigger: boolean;
}

/**
 * Splits the trailing controls into the ones that fit and the ones that move
 * into a "More" trigger. `availableWidth` is the room right of the leading
 * content; `null` means unmeasured (jsdom, first paint) and shows everything.
 * The trigger itself takes one slot whenever anything overflows, and pinned
 * controls always stay, so a very narrow row still shows just the close icon.
 */
export function resolvePanelHeaderOverflow(
  controls: readonly PanelHeaderControlId[],
  availableWidth: number | null,
): PanelHeaderOverflow {
  if (availableWidth === null) return { visible: controls, overflowed: [], showTrigger: false };
  const capacity = Math.max(
    0,
    Math.floor((availableWidth + PANEL_HEADER_CONTROL_GAP_PX) / PANEL_HEADER_CONTROL_PITCH_PX),
  );
  if (controls.length <= capacity) {
    return { visible: controls, overflowed: [], showTrigger: false };
  }

  const hideable = PANEL_HEADER_HIDE_ORDER.filter((id) => controls.includes(id));
  const pinnedCount = controls.length - hideable.length;
  const showTrigger = capacity > pinnedCount;
  const roomForHideable = Math.max(0, capacity - pinnedCount - (showTrigger ? 1 : 0));
  const hidden = new Set(hideable.slice(0, hideable.length - roomForHideable));
  return {
    visible: controls.filter((id) => !hidden.has(id)),
    overflowed: controls.filter((id) => hidden.has(id)),
    showTrigger,
  };
}

/**
 * Measures how much of a panel header row is left for the trailing controls
 * once the leading content and any detached header accessory have taken their
 * share. A divider drag applies live; other size changes (window resize, panel
 * animation) are debounced so the row reshuffles once the width settles.
 * `layoutKey` forces an immediate remeasure when a tab swaps the leading
 * content without resizing the row. Zero widths read as unmeasured so jsdom
 * and collapsed columns show everything.
 */
export function usePanelHeaderAvailableWidth(
  rowRef: RefObject<HTMLElement | null>,
  leadingRef: RefObject<HTMLElement | null>,
  accessoryRef?: RefObject<HTMLElement | null>,
  layoutKey?: string,
): number | null {
  const [available, setAvailable] = useState<number | null>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const read = (): number | null => {
      const rowWidth = row.getBoundingClientRect().width;
      if (rowWidth <= 0) return null;
      const leadingWidth = leadingRef.current?.getBoundingClientRect().width ?? 0;
      const accessoryWidth = accessoryRef?.current?.getBoundingClientRect().width ?? 0;
      const accessoryPitch = accessoryWidth > 0 ? accessoryWidth + PANEL_HEADER_CONTROL_GAP_PX : 0;
      return Math.max(
        0,
        rowWidth -
          PANEL_HEADER_ROW_PADDING_X_PX -
          leadingWidth -
          accessoryPitch -
          PANEL_HEADER_DIVIDER_FOOTPRINT_PX,
      );
    };
    const apply = () => {
      const next = read();
      if (next === null) return;
      setAvailable((current) => (current === next ? current : next));
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      if (isPanelResizing()) {
        apply();
      } else {
        timer = window.setTimeout(apply, 150);
      }
    });
    observer.observe(row);
    const leading = leadingRef.current;
    if (leading) observer.observe(leading);
    const accessory = accessoryRef?.current;
    if (accessory) observer.observe(accessory);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [accessoryRef, layoutKey, leadingRef, rowRef]);

  return available;
}
