import { Trans } from "@lingui/react/macro";
import { PanelDockDropZone } from "@/renderer/components/layout/PanelDock/PanelDockDropZone";
import { useDragSource, usePanelDockPlacement } from "@/renderer/dnd";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePanelVisibility } from "../../../AppShell/parts/usePanelVisibility";

/**
 * Landing pad along the bottom edge of the main area, shown only while a panel
 * tab is being dragged and the bottom row is closed. Without it there is no
 * bottom drop target to aim at until a terminal happens to be open.
 *
 * The two halves are painted as real siblings rather than an overlay so each
 * target is exactly the size of the slot it creates.
 */
export function BottomDockDropStrip() {
  const dragSource = useDragSource();
  const isTerminalBottom = useSharedSettings((s) => s.terminalPosition === "bottom");
  const { rightPanelOpen: bottomRowOpen } = usePanelVisibility();
  const placement = usePanelDockPlacement("bottom-panel");

  if (!isTerminalBottom || bottomRowOpen || dragSource?.type !== "panel-tab") return null;

  function halfClass(side: "left" | "right") {
    const active = placement === side;
    return `flex flex-1 items-center justify-center rounded-lg border border-dashed text-xs transition-colors ${
      active
        ? "border-accent bg-accent/10 text-foreground"
        : "border-[color:var(--hairline-strong)] text-muted"
    }`;
  }

  return (
    <PanelDockDropZone
      zone="bottom-panel"
      highlight={false}
      className="absolute inset-x-0 bottom-0 z-30 flex h-32 gap-2 p-2"
    >
      <div className={halfClass("left")}>
        <Trans>Dock left</Trans>
      </div>
      <div className={halfClass("right")}>
        <Trans>Dock right</Trans>
      </div>
    </PanelDockDropZone>
  );
}
