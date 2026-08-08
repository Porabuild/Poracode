import { useId, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { useDraggable } from "@dnd-kit/react";
import { useLingui } from "@lingui/react/macro";
import { panelHeaderIconButtonClass } from "@/renderer/components/layout/sidebarChrome";
import type { DragSourceData } from "@/renderer/dnd";
import type { RightPanelTab } from "@/renderer/state/panelStore";

/**
 * Title row of a docked panel section (right-panel split half or bottom dock
 * slot). The label area is a drag handle carrying the same `panel-tab` source
 * as the toolbar icons, so an already-placed section can be moved between dock
 * zones. The close button stays outside the draggable element so a click on it
 * never starts a drag.
 */
export function PanelSectionHeader(props: {
  tab: RightPanelTab;
  label: string;
  icon: LucideIcon;
  onClose?: () => void;
}) {
  const { t } = useLingui();
  const elementRef = useRef<HTMLDivElement>(null);
  const dragId = useId();
  useDraggable({
    id: `panel-section:${props.tab}:${dragId}`,
    type: "panel-tab",
    data: { type: "panel-tab", tab: props.tab } satisfies DragSourceData,
    element: elementRef,
  });
  const Icon = props.icon;

  return (
    <div className="flex h-6 shrink-0 items-center gap-1.5 border-b border-[color:var(--border)] px-2">
      <div
        ref={elementRef}
        role="button"
        tabIndex={0}
        aria-label={t`Move panel`}
        title={props.label}
        className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 active:cursor-grabbing"
      >
        <Icon className="size-3 shrink-0 text-muted" />
        <span className="min-w-0 truncate text-xs text-muted">{props.label}</span>
      </div>
      {props.onClose ? (
        <button
          type="button"
          className={panelHeaderIconButtonClass}
          title={t`Close Split`}
          onClick={props.onClose}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
