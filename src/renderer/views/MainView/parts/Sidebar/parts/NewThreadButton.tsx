import { useRef } from "react";
import { Columns2, Plus } from "lucide-react";
import { useDraggable } from "@dnd-kit/react";
import { useLingui } from "@lingui/react/macro";
import { ContextMenu, SidebarButton } from "@/renderer/components/common";
import type { DragSourceData } from "@/renderer/dnd";

export function NewThreadButton(props: {
  projectId: string;
  hasDraft: boolean;
  isActive: boolean;
  isDraggingAnything: boolean;
  canOpenAsPanel: boolean;
  onPress: () => void;
  onOpenAsPanel: () => void;
}) {
  const { t } = useLingui();
  const newThreadRef = useRef<HTMLDivElement>(null);
  useDraggable({
    id: `new-thread:${props.projectId}`,
    type: "new-thread",
    data: { type: "new-thread", projectId: props.projectId } satisfies DragSourceData,
    element: newThreadRef,
  });

  return (
    <ContextMenu
      items={[
        {
          id: "open-as-panel",
          label: t({
            message: "Open as Panel",
            comment: "Context menu action: open the new thread in a side-by-side panel",
          }),
          icon: <Columns2 className="size-3.5" />,
          isDisabled: !props.canOpenAsPanel,
        },
      ]}
      onAction={(key) => {
        if (key === "open-as-panel") props.onOpenAsPanel();
      }}
    >
      <SidebarButton
        size="xs"
        liveText
        ref={newThreadRef}
        icon={<Plus className="size-4" />}
        label={props.hasDraft ? t`New thread (draft)` : t`New thread`}
        isActive={props.isActive}
        isDraggingAnything={props.isDraggingAnything}
        onPress={props.onPress}
        suffix={
          props.hasDraft ? <span className="size-1.5 shrink-0 rounded-full bg-accent" /> : undefined
        }
      />
    </ContextMenu>
  );
}
