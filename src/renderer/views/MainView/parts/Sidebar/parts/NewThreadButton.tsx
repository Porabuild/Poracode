import { useRef, type ReactNode } from "react";
import { Columns2, Plus } from "lucide-react";
import { useDraggable } from "@dnd-kit/react";
import { useLingui } from "@lingui/react/macro";
import { ContextMenu, type ContextMenuEntry } from "@/renderer/components/common/ContextMenu";
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
  projectOptions?: readonly {
    id: string;
    name: string;
    icon?: ReactNode;
    description?: string;
  }[];
  onSelectProject?: (projectId: string) => void;
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
    handle: newThreadRef,
    element: newThreadRef,
  });

  const projectMenuItems: ContextMenuEntry[] =
    props.projectOptions && props.onSelectProject
      ? props.projectOptions.map((project) => ({
          id: `new-thread-project:${project.id}`,
          label: project.name,
          ...(project.icon ? { icon: project.icon } : {}),
          ...(project.description ? { description: project.description } : {}),
          // Same payload as dragging the button itself, so a row can be dropped
          // straight onto a pane target to open that project's draft there.
          dragSource: {
            id: `new-thread-menu:${project.id}`,
            type: "new-thread",
            data: { type: "new-thread", projectId: project.id } satisfies DragSourceData,
          },
        }))
      : [];
  const contextMenuItems: ContextMenuEntry[] = [
    ...projectMenuItems,
    ...(projectMenuItems.length > 0 ? [{ type: "separator" as const }] : []),
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
    if (key.startsWith("new-thread-project:")) {
      props.onSelectProject?.(key.slice("new-thread-project:".length));
      return;
    }
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
            className={`poracode-flat-new-thread-full flex h-8 shrink-0 cursor-grab items-center gap-1.5 rounded-3xl px-2 text-xs outline-none transition-colors active:cursor-grabbing focus-visible:focus-ring ${stateClass}`}
            onClick={props.onPress}
          >
            <Plus className="size-3.5" />
            <span className="whitespace-nowrap">{t`New thread`}</span>
            {props.hasDraft ? <DraftIndicator /> : null}
          </button>
          <SidebarButton
            iconOnly
            className="poracode-flat-new-thread-icon cursor-grab active:cursor-grabbing"
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
