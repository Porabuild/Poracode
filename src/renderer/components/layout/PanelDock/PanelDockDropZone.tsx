import { type ReactNode, useEffect, useId, useRef } from "react";
import { useDroppable } from "@dnd-kit/react";
import { setPanelDockZoneElement, usePanelDockPlacement } from "@/renderer/dnd";
import type { PanelDockZone } from "@/renderer/state/panelStore";

const HIGHLIGHT_INSET = {
  top: "inset-x-0 top-0 h-1/2",
  bottom: "inset-x-0 bottom-0 h-1/2",
  left: "inset-y-0 left-0 w-1/2",
  right: "inset-y-0 right-0 w-1/2",
} as const;

/**
 * Drop target for dragged panel-tab icons. Highlights the half of the zone the
 * tab would occupy. The dnd-kit registration only keeps the drag from
 * cancelling as "no valid target"; hit-testing runs in the dnd module against
 * the element registered below (see `setPanelDockZoneElement`).
 */
export function PanelDockDropZone(props: {
  zone: PanelDockZone;
  /** Must establish a positioning context — the default already does. */
  className?: string;
  /** Set false when the zone paints its own target affordance (see `BottomDockDropStrip`). */
  highlight?: boolean;
  children?: ReactNode;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  useDroppable({
    id: `panel-dock-zone:${props.zone}:${instanceId}`,
    accept: "panel-tab",
    data: { type: "panel-dock-zone", zone: props.zone },
    element: elementRef,
  });
  const placement = usePanelDockPlacement(props.zone);

  useEffect(() => {
    setPanelDockZoneElement(instanceId, props.zone, elementRef.current);
    return () => setPanelDockZoneElement(instanceId, props.zone, null);
  }, [instanceId, props.zone]);

  return (
    <div ref={elementRef} className={props.className ?? "relative h-full min-h-0"}>
      {props.children}
      {placement && props.highlight !== false ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-20 rounded border border-accent/70 bg-accent/10 ${HIGHLIGHT_INSET[placement]}`}
        />
      ) : null}
    </div>
  );
}
