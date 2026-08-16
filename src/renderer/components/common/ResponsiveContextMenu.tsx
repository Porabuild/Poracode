import { type ReactNode, useState } from "react";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { ResponsiveContextMenuSurface } from "./ResponsiveContextMenuSurface";

interface ResponsiveContextMenuProps {
  items: ContextMenuEntry[];
  onAction: (key: string) => void;
  label: string;
  children: ReactNode;
}

/**
 * Desktop keeps the canonical right-click popover. Compact/coarse surfaces
 * attach a touch long-press to the same trigger and render the same actions in
 * the responsive bottom drawer.
 */
export function ResponsiveContextMenu(props: ResponsiveContextMenuProps) {
  const mobile = useCompactLayout();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const longPressHandlers = useLongPress(
    mobile
      ? () => {
          setPosition({ x: 0, y: 0 });
        }
      : null,
  );

  if (!mobile) {
    return (
      <ContextMenu items={props.items} onAction={props.onAction}>
        {props.children}
      </ContextMenu>
    );
  }

  return (
    <>
      {/* `contents` preserves the canonical row DOM/layout while giving touch
          events from either a DOM row or a composite header one shared host. */}
      <div className="contents" {...longPressHandlers}>
        {props.children}
      </div>
      <ResponsiveContextMenuSurface
        position={position}
        label={props.label}
        items={props.items}
        onAction={props.onAction}
        onClose={() => setPosition(null)}
      />
    </>
  );
}
