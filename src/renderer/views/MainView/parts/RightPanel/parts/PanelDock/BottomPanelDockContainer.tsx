import { Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { PanelDockDropZone } from "@/renderer/components/layout/PanelDock/PanelDockDropZone";
import { PanelSectionHeader } from "@/renderer/components/layout/PanelDock/PanelSectionHeader";
import {
  PANEL_TAB_ICONS,
  usePanelTabLabels,
} from "@/renderer/components/layout/PanelDock/panelTabMeta";
import { useSplitPercent } from "@/renderer/components/layout/PanelDock/useSplitPercent";
import { useBottomDockedTabs } from "@/renderer/state/panelDockSelectors";
import {
  usePanelStore,
  type BottomDockPlacement,
  type RightPanelTab,
} from "@/renderer/state/panelStore";

/** Floor for whichever segment absorbs the leftover width (terminal or empty slot). */
const MIN_FLEX_SEGMENT = "15%";

const DeferredBottomDockPanelContent = lazy(() =>
  import("./BottomDockPanelContent").then((module) => ({
    default: module.BottomDockPanelContent,
  })),
);

/**
 * The bottom row: `left slot | terminal | right slot`. Each side holds at most
 * one dropped panel; with the terminal closed the slots own the row on their
 * own. When both slots are occupied, opening the terminal replaces and closes
 * the left slot while the right dock remains visible. A lone dock keeps an
 * empty (resizable) slot opposite rather than swallowing the whole row, so the
 * drop target the user aimed at is the space they get.
 *
 * Also the drop zone for the docking gesture — its left and right halves map
 * onto the two slots.
 */
export function BottomPanelDockContainer(props: {
  /**
   * The terminal stays mounted even while hidden so its xterm surfaces (and
   * their scrollback) survive a dock-only bottom row.
   */
  terminalVisible: boolean;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const labels = usePanelTabLabels();
  const docks = useBottomDockedTabs();
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const previousDocksRef = useRef(docks);
  const flexibleDockRef = useRef<BottomDockPlacement | null>(null);

  const { left: leftTab, right: rightTab } = docks;
  const terminalReplacesLeft = props.terminalVisible && leftTab !== null && rightTab !== null;
  // With the terminal hidden, a lone dock keeps the opposite slot as empty
  // space so the row still reads as left/right.
  const showSpacer = !props.terminalVisible && (leftTab === null) !== (rightTab === null);
  const hasLeftDockSlot = leftTab !== null || (showSpacer && rightTab !== null);
  const hasRightSlot = rightTab !== null || (showSpacer && leftTab !== null);

  useEffect(() => {
    if (!terminalReplacesLeft || leftTab === null || rightTab === null) return;

    const panelStore = usePanelStore.getState();
    panelStore.setBottomPanelDock("left", null);
    if (panelStore.rightPanelTab === leftTab) panelStore.setRightPanelTab(rightTab);

    switch (leftTab) {
      case "git":
        panelStore.setGitOverlayOpen(false);
        panelStore.setGitReviewContext(null);
        break;
      case "files":
        panelStore.setFilesPanelContext(null);
        break;
      case "browser":
        panelStore.setBrowserPanelOpen(false);
        break;
      case "usage":
        panelStore.setUsagePanelOpen(false);
        break;
      case "notes":
        panelStore.setNotesPanelOpen(false);
        break;
    }
  }, [leftTab, rightTab, terminalReplacesLeft]);

  // Keep the existing dock's stored width when a second panel is added. The
  // newly occupied slot absorbs the remaining space beside it (and the
  // terminal, when visible), instead of shrinking the panel already on screen.
  const previousDocks = previousDocksRef.current;
  if (previousDocks.left !== leftTab || previousDocks.right !== rightTab) {
    const addedPlacement =
      leftTab !== null && previousDocks.left === null
        ? "left"
        : rightTab !== null && previousDocks.right === null
          ? "right"
          : null;
    if (addedPlacement !== null) flexibleDockRef.current = addedPlacement;
    previousDocksRef.current = docks;
  }

  const flexibleDock =
    leftTab !== null && rightTab !== null
      ? (flexibleDockRef.current ?? "right")
      : leftTab === null && rightTab !== null
        ? "left"
        : rightTab === null && leftTab !== null
          ? "right"
          : null;
  const effectiveFlexibleDock = terminalReplacesLeft ? "left" : flexibleDock;
  const leftSized = !terminalReplacesLeft && hasLeftDockSlot && effectiveFlexibleDock !== "left";
  const rightSized = hasRightSlot && effectiveFlexibleDock !== "right";

  // Key names carry the meaning of the stored number: the width of the docked
  // panel on that side. Renamed from `poracode-bottom-row-*`, which briefly
  // stored the empty slot's width instead — a stale value under the old name
  // would be read as a dock width and place the panel wrong.
  const leftSplit = useSplitPercent({
    storageKey: "poracode-bottom-slot-left-percent",
    orientation: "row",
    containerRef,
    paneRef: leftSized ? leftPaneRef : { current: null },
    defaultPercent: 50,
    minPercent: 15,
  });
  const rightSplit = useSplitPercent({
    storageKey: "poracode-bottom-slot-right-percent",
    orientation: "row",
    containerRef,
    paneRef: rightSized ? rightPaneRef : { current: null },
    invert: true,
    defaultPercent: 50,
    minPercent: 15,
  });

  function slotStyle(placement: BottomDockPlacement, sized: boolean) {
    const split = placement === "left" ? leftSplit : rightSplit;
    // A stored dock width is authoritative. The other live segment absorbs the
    // divider and remaining width, so panel content cannot resize this dock.
    return sized
      ? { flexBasis: `${split.percent}%`, flexGrow: 0, flexShrink: 0 }
      : { flexBasis: "0%", flexGrow: 1, flexShrink: 1, minWidth: MIN_FLEX_SEGMENT };
  }

  function slot(placement: BottomDockPlacement) {
    const tab: RightPanelTab | null = placement === "left" ? leftTab : rightTab;
    const sized = placement === "left" ? leftSized : rightSized;
    return (
      <div
        ref={sized ? (placement === "left" ? leftPaneRef : rightPaneRef) : undefined}
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        style={slotStyle(placement, sized)}
      >
        {tab ? (
          <>
            <PanelSectionHeader
              tab={tab}
              label={labels[tab]}
              icon={PANEL_TAB_ICONS[tab]}
              onClose={() => usePanelStore.getState().setBottomPanelDock(placement, null)}
            />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Suspense>
                <DeferredBottomDockPanelContent tab={tab} />
              </Suspense>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  function divider(split: typeof leftSplit, key: string) {
    return (
      <div
        key={key}
        className="poracode-pane-divider"
        onPointerDown={split.handleResizeStart}
        onKeyDown={split.handleResizeKeyDown}
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={t`Resize split`}
        aria-valuenow={Math.round(split.percent)}
        aria-valuemin={split.minPercent}
        aria-valuemax={split.maxPercent}
      />
    );
  }

  // A divider always sits between two live segments and drives whichever of the
  // pair is the sized one.
  const showLeftDivider =
    !terminalReplacesLeft && hasLeftDockSlot && (props.terminalVisible || hasRightSlot);
  const showRightDivider = hasRightSlot && props.terminalVisible;

  return (
    <PanelDockDropZone zone="bottom-panel" className="relative h-full min-h-0 overflow-hidden">
      <div ref={containerRef} className="flex h-full min-h-0">
        {!terminalReplacesLeft && hasLeftDockSlot ? slot("left") : null}
        {showLeftDivider ? divider(leftSized ? leftSplit : rightSplit, "left-divider") : null}
        <div
          key="terminal"
          className={props.terminalVisible ? "min-h-0 min-w-0 flex-1 overflow-hidden" : "hidden"}
          style={props.terminalVisible ? { minWidth: MIN_FLEX_SEGMENT } : undefined}
        >
          {props.children}
        </div>
        {showRightDivider ? divider(rightSplit, "right-divider") : null}
        {hasRightSlot ? slot("right") : null}
      </div>
    </PanelDockDropZone>
  );
}
