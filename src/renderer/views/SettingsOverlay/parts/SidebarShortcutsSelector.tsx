import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Button, Popover } from "@heroui/react";
import { CalendarClock, Check, GitPullRequest, GripVertical, Workflow } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { SidebarShortcutId } from "@/shared/settings";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

interface SidebarShortcutOption {
  id: SidebarShortcutId;
  label: string;
  icon: React.ReactNode;
}

function SortableShortcutRow(props: {
  shortcut: SidebarShortcutOption;
  index: number;
  isVisible: boolean;
  onToggle: () => void;
}) {
  const { t } = useLingui();
  const { shortcut, index, isVisible, onToggle } = props;
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
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
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
      >
        <GripVertical className="size-3.5" />
      </button>
    </div>
  );
}

export function SidebarShortcutsSelector() {
  const { t } = useLingui();
  const hiddenShortcuts = useSharedSettings((state) => state.sidebarHiddenShortcuts);
  const shortcutOrder = useSharedSettings((state) => state.sidebarShortcutOrder);
  const setShortcutVisible = useSharedSettings((state) => state.setSidebarShortcutVisible);
  const setShortcutOrder = useSharedSettings((state) => state.setSidebarShortcutOrder);

  const shortcutsById = new Map<SidebarShortcutId, SidebarShortcutOption>([
    [
      "pullRequests",
      {
        id: "pullRequests",
        label: t`Pull requests`,
        icon: <GitPullRequest className="size-3.5" />,
      },
    ],
    [
      "githubActions",
      {
        id: "githubActions",
        label: t`GitHub Actions`,
        icon: <Workflow className="size-3.5" />,
      },
    ],
    [
      "schedules",
      {
        id: "schedules",
        label: t`Schedules`,
        icon: <CalendarClock className="size-3.5" />,
      },
    ],
  ]);
  const shortcuts = shortcutOrder
    .map((id) => shortcutsById.get(id))
    .filter((shortcut): shortcut is SidebarShortcutOption => shortcut !== undefined);
  const totalCount = shortcuts.length;
  const visibleCount = shortcuts.filter(
    (shortcut) => !hiddenShortcuts.includes(shortcut.id),
  ).length;

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
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = shortcuts.map((shortcut) => shortcut.id);
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    setShortcutOrder(next);
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
      <Popover.Content placement="bottom end" className="w-64 p-0">
        <Popover.Dialog className="flex flex-col overflow-hidden !p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted/80">
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
          <DragDropProvider onDragEnd={handleDragEnd}>
            <div
              role="listbox"
              aria-label={t`Sidebar shortcuts`}
              aria-multiselectable="true"
              className="poracode-menu py-1.5"
            >
              {shortcuts.map((shortcut, index) => (
                <SortableShortcutRow
                  key={shortcut.id}
                  shortcut={shortcut}
                  index={index}
                  isVisible={!hiddenShortcuts.includes(shortcut.id)}
                  onToggle={() =>
                    setShortcutVisible(shortcut.id, hiddenShortcuts.includes(shortcut.id))
                  }
                />
              ))}
            </div>
          </DragDropProvider>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
