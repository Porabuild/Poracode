import { type ReactNode, useId, useRef } from "react";
import { useDraggable } from "@dnd-kit/react";
import type { DragSourceData } from "@/renderer/dnd";
import type { RightPanelTab } from "@/renderer/state/panelStore";

/**
 * Right-panel toolbar icon that both activates its tab on click and can be
 * dragged into a `PanelDockDropZone` to split the right panel or dock beside
 * the bottom terminal. Mirrors `SidebarPanelDragButton` (div + role="button"
 * so dnd-kit's 5px activation distance keeps plain clicks working).
 */
export function PanelTabDragButton(props: {
  tab: RightPanelTab;
  label: string;
  className: string;
  "aria-pressed"?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragId = useId();
  useDraggable({
    id: `panel-tab:${props.tab}:${dragId}`,
    type: "panel-tab",
    data: { type: "panel-tab", tab: props.tab } satisfies DragSourceData,
    element: elementRef,
  });

  return (
    <div
      ref={elementRef}
      role="button"
      tabIndex={0}
      aria-label={props.label}
      {...(props["aria-pressed"] === undefined ? {} : { "aria-pressed": props["aria-pressed"] })}
      title={props.label}
      className={props.className}
      onClick={(event) => {
        event.stopPropagation();
        props.onPress();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          props.onPress();
        }
      }}
    >
      {props.children}
    </div>
  );
}
