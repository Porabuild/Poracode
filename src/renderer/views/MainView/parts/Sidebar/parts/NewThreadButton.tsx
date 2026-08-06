import { useRef } from "react";
import { Columns2, Plus } from "lucide-react";
import { useDraggable } from "@dnd-kit/react";
import { useLingui } from "@lingui/react/macro";
import { ContextMenu } from "@/renderer/components/common/ContextMenu";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import type { DragSourceData } from "@/renderer/dnd";
import { DraftIndicator } from "./DraftIndicator";

export function NewThreadButton(props: {
  projectId: string;
  hasDraft: boolean;
  isActive: boolean;
  isDraggingAnything: boolean;
  canOpenAsPanel: boolean;
  onPress: () => void;
  onOpenAsPanel: () => void;
  /**
   * Docked into the flat list's head row next to the project filter instead
   * of taking a full-width row. Renders both a labelled button and an
   * icon-only button; the `.poracode-flat-list-head` container query keeps
   * exactly one visible — label when the row is wide, icon (tooltip carries
   * the name) when it is tight.
   */
  inline?: boolean;
}) {
  const { t } = useLingui();
  const newThreadRef = useRef<HTMLDivElement>(null);
  useDraggable({
    id: `new-thread:${props.projectId}`,
    type: "new-thread",
    data: { type: "new-thread", projectId: props.projectId } satisfies DragSourceData,
    element: newThreadRef,
  });

  const contextMenuItems = [
    {
      id: "open-as-panel",
      label: t({
        message: "Open as Panel",
        comment: "Context menu action: open the new thread in a side-by-side panel",
      }),
      icon: <Columns2 className="size-3.5" />,
      isDisabled: !props.canOpenAsPanel,
    },
  ];
  const handleContextMenuAction = (key: string) => {
    if (key === "open-as-panel") props.onOpenAsPanel();
  };

  if (props.inline) {
    const stateClass =
      props.isActive && !props.isDraggingAnything
        ? "bg-[var(--row-active)] text-foreground"
        : `text-foreground/85 ${props.isDraggingAnything ? "" : "hover:bg-[var(--row-hover)] hover:text-foreground"}`;
    return (
      <ContextMenu items={contextMenuItems} onAction={handleContextMenuAction}>
        <div ref={newThreadRef} className="flex shrink-0 items-center">
          <button
            type="button"
            className={`poracode-flat-new-thread-full flex h-8 shrink-0 cursor-default items-center gap-1.5 rounded-3xl px-2 text-xs outline-none transition-colors focus-visible:focus-ring ${stateClass}`}
            onClick={props.onPress}
          >
            <Plus className="size-3.5" />
            <span className="whitespace-nowrap">{t`New thread`}</span>
            {props.hasDraft ? <DraftIndicator /> : null}
          </button>
          <SidebarButton
            iconOnly
            className="poracode-flat-new-thread-icon"
            icon={<Plus className="size-4" />}
            label={t`New thread`}
            isActive={props.isActive}
            isDraggingAnything={props.isDraggingAnything}
            onPress={props.onPress}
          />
        </div>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu items={contextMenuItems} onAction={handleContextMenuAction}>
      <SidebarButton
        size="xs"
        liveText
        ref={newThreadRef}
        icon={<Plus className="size-4" />}
        label={
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate">{t`New thread`}</span>
            {props.hasDraft && <DraftIndicator />}
          </span>
        }
        isActive={props.isActive}
        isDraggingAnything={props.isDraggingAnything}
        onPress={props.onPress}
      />
    </ContextMenu>
  );
}
