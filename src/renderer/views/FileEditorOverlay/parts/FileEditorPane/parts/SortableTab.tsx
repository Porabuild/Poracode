import { X } from "lucide-react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useIsDraggingEditorTab, type DragSourceData } from "@/renderer/dnd";
import {
  useIsTabActive,
  useIsTabDirty,
  useIsTabPreview,
} from "@/renderer/state/fileEditorSelectors";
import { getBasename } from "@/shared/pathUtils";
import { handleKeyActivate } from "@/renderer/utils/a11y";

export function SortableTab(props: {
  path: string;
  index: number;
  onSelect: () => void;
  onClose: () => void;
  onDoubleClick: () => void;
}) {
  const { path, index, onSelect, onClose, onDoubleClick } = props;
  const isActive = useIsTabActive(path);
  const isPreview = useIsTabPreview(path);
  const isDirty = useIsTabDirty(path);

  const { ref } = useSortable({
    id: `editor-tab:${path}`,
    index,
    type: "editor-tab",
    accept: "editor-tab",
    group: "editor-tabs",
    data: { type: "editor-tab", path } satisfies DragSourceData,
  });

  const isDragging = useIsDraggingEditorTab(path);

  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={isActive}
      // Roving tabindex: only the active tab sits in the tab order, matching
      // the sibling tablist container's expectations.
      tabIndex={isActive ? 0 : -1}
      className={`group flex h-6 max-w-[220px] shrink-0 cursor-default items-center gap-1 rounded-md pl-3 pr-1 text-xs transition-colors ${
        isActive
          ? "bg-default/40 text-foreground"
          : "text-muted hover:bg-default/20 hover:text-foreground"
      } ${isDragging ? "opacity-60" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => handleKeyActivate(e, onSelect)}
      onDoubleClick={onDoubleClick}
    >
      <span className={`min-w-0 truncate ${isPreview ? "italic" : ""}`} title={path}>
        {getBasename(path)}
        {isDirty ? " *" : ""}
      </span>
      <button
        className="ml-auto flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition hover:text-danger group-hover:opacity-100"
        tabIndex={-1}
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          onClose();
        }}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
