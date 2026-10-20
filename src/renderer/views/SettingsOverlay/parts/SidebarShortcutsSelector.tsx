import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Button, Popover } from "@heroui/react";
import { Check, GripVertical } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  useSidebarShortcuts,
  type SidebarShortcutEntry,
} from "@/renderer/views/MainView/parts/Sidebar/parts/sidebarShortcuts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

function SortableShortcutRow(props: {
  shortcut: SidebarShortcutEntry;
  index: number;
  isVisible: boolean;
  onToggle: () => void;
  onMove: (offset: number) => void;
}) {
  const { t } = useLingui();
  const { shortcut, index, isVisible, onToggle, onMove } = props;
  const { ref, handleRef, isDragging } = useSortable({
    id: `sidebar-shortcut:${shortcut.id}`,
    index,
    type: "sidebar-shortcut",
    accept: ["sidebar-shortcut"],
    group: "sidebar-shortcuts",
    data: { shortcutId: shortcut.id },
  });

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isVisible}
      tabIndex={0}
      className={`poracode-menu-item group mx-1.5 flex h-8 cursor-default items-center gap-1.5 text-foreground ${
        isDragging ? "opacity-40" : ""
      }`}
      data-shortcut-id={shortcut.id}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault();
          onMove(event.key === "ArrowUp" ? -1 : 1);
          return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const row =
            event.key === "ArrowUp"
              ? event.currentTarget.previousElementSibling
              : event.currentTarget.nextElementSibling;
          if (row instanceof HTMLElement) row.focus();
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <Check
        className={`size-3 shrink-0 transition-opacity ${isVisible ? "opacity-100" : "opacity-0"}`}
      />
      <span className="size-3.5 shrink-0 text-muted">{shortcut.icon}</span>
      <span className="min-w-0 flex-1 truncate">{shortcut.label}</span>
      <button
        ref={handleRef}
        type="button"
        aria-label={t`Reorder ${shortcut.label}`}
        className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted/50 transition-colors hover:text-foreground active:cursor-grabbing"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            event.stopPropagation();
            onMove(event.key === "ArrowUp" ? -1 : 1);
          }
        }}
      >
        <GripVertical className="size-3.5" />
      </button>
    </div>
  );
}

export function SidebarShortcutsSelector() {
  const { t } = useLingui();
  const shortcutOrder = useSharedSettings((state) => state.sidebarShortcutOrder);
  const setShortcutVisible = useSharedSettings((state) => state.setSidebarShortcutVisible);
  const setShortcutOrder = useSharedSettings((state) => state.setSidebarShortcutOrder);

  const shortcuts = useSidebarShortcuts(true);
  const totalCount = shortcuts.length;
  const visibleCount = shortcuts.filter((shortcut) => shortcut.isVisible).length;

  function moveShortcut(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= shortcuts.length) return;
    const visibleIds = shortcuts.map((shortcut) => shortcut.id);
    const [moved] = visibleIds.splice(fromIndex, 1);
    if (!moved) return;
    visibleIds.splice(toIndex, 0, moved);
    // Keep unavailable destinations in their slots so reconnecting a host or
    // reinstalling a provider restores the user's saved placement.
    let index = 0;
    const known = new Set(visibleIds);
    const next = shortcutOrder.map((id) => (known.has(id) ? visibleIds[index++]! : id));
    next.push(...visibleIds.slice(index));
    setShortcutOrder(next);
  }

  function setAllHidden(hidden: boolean) {
    for (const shortcut of shortcuts) {
      setShortcutVisible(shortcut.id, !hidden);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (event.canceled) return;
    const source = event.operation.source;
    if (!source || !isSortable(source)) return;
    const fromIndex = source.initialIndex;
    const toIndex = source.index;
    if (fromIndex < 0) return;
    moveShortcut(fromIndex, toIndex);
  }

  return (
    <Popover>
      <Popover.Trigger>
        <Button
          variant="secondary"
          size="sm"
          aria-label={t`Sidebar shortcuts`}
          className="min-w-[4.5rem] tabular-nums"
        >
          {visibleCount} / {totalCount}
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-72 max-w-[calc(100vw-2rem)] p-0">
        <Popover.Dialog
          aria-label={t`Sidebar shortcuts`}
          className="flex max-h-[inherit] flex-col overflow-hidden !p-0"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted/80">
            <span className="tabular-nums">
              <Trans>
                {visibleCount} of {totalCount} visible
              </Trans>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-foreground/70 hover:text-foreground"
                onClick={() => setAllHidden(false)}
              >
                <Trans>Show all</Trans>
              </button>
              <span className="text-muted/40">·</span>
              <button
                type="button"
                className="text-foreground/70 hover:text-foreground"
                onClick={() => setAllHidden(true)}
              >
                <Trans>Hide all</Trans>
              </button>
            </div>
          </div>
          <p className="shrink-0 px-3 pt-2 text-xs text-muted">
            <Trans>Select pages to show. Drag or use Alt + ↑ / ↓ to reorder.</Trans>
          </p>
          <DragDropProvider onDragEnd={handleDragEnd}>
            <div
              role="listbox"
              aria-label={t`Sidebar shortcuts`}
              aria-multiselectable="true"
              className="poracode-menu min-h-0 max-h-[min(24rem,55vh)] overflow-y-auto py-1.5"
            >
              {shortcuts.map((shortcut, index) => (
                <SortableShortcutRow
                  key={shortcut.id}
                  shortcut={shortcut}
                  index={index}
                  isVisible={shortcut.isVisible}
                  onToggle={() => setShortcutVisible(shortcut.id, !shortcut.isVisible)}
                  onMove={(offset) => moveShortcut(index, index + offset)}
                />
              ))}
            </div>
          </DragDropProvider>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
