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
