import { useState } from "react";
import { Separator } from "@heroui/react";
import { ChevronRight } from "lucide-react";
import {
  ContextMenuSurface,
  type ContextMenuEntry,
  type ContextMenuItem,
  type ContextMenuSubmenu,
} from "./ContextMenu";
import { ResponsiveMenuSurface, useResponsiveMenu } from "./ResponsiveMenuSurface";

function isSubmenu(entry: ContextMenuEntry): entry is ContextMenuSubmenu {
  return "type" in entry && entry.type === "submenu";
}

function isSeparator(entry: ContextMenuEntry): entry is { type: "separator" } {
  return "type" in entry && entry.type === "separator";
}

function itemTone(item: ContextMenuItem): string {
  if (item.variant === "danger") return "text-danger";
  if (item.variant === "warning") return "text-warning";
  return "";
}

function MobileMenuItem(props: { item: ContextMenuItem; onAction: (key: string) => void }) {
  const tone = itemTone(props.item);
  const content = (
    <>
      {props.item.icon ? (
        <span className={`flex size-4 shrink-0 items-center ${tone || "text-muted"}`}>
          {props.item.icon}
        </span>
      ) : null}
      <span className={`min-w-0 flex-1 truncate ${tone}`}>{props.item.label}</span>
    </>
  );

  if (!props.item.endAction) {
    return (
      <button
        type="button"
        className="m-sheet-action"
        disabled={props.item.isDisabled}
        onClick={() => props.onAction(props.item.id)}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="m-sheet-action p-0">
      <button
        type="button"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left"
        disabled={props.item.isDisabled}
        onClick={() => props.onAction(props.item.id)}
      >
        {content}
      </button>
      <button
        type="button"
        aria-label={props.item.endAction.label}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
        disabled={props.item.endAction.isDisabled}
        onClick={() => props.onAction(props.item.endAction!.id)}
      >
        {props.item.endAction.icon}
      </button>
    </div>
  );
}

function MobileMenuList(props: {
  entries: ContextMenuEntry[];
  onAction: (key: string) => void;
  onOpenSubmenu?: (submenu: ContextMenuSubmenu) => void;
}) {
  return (
    <div className="m-sheet-list">
      {props.entries.map((entry, index) => {
        if (isSeparator(entry)) return <Separator key={`separator-${index}`} />;
        if (isSubmenu(entry)) {
          return (
            <button
              key={entry.id}
              type="button"
              className="m-sheet-action"
              onClick={() => props.onOpenSubmenu?.(entry)}
            >
              {entry.icon ? (
                <span className="flex size-4 shrink-0 items-center text-muted">{entry.icon}</span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
          );
        }
        return <MobileMenuItem key={entry.id} item={entry} onAction={props.onAction} />;
      })}
    </div>
  );
}

export function ResponsiveContextMenuSurface(props: {
  position: { x: number; y: number } | null;
  label: string;
  items: ContextMenuEntry[];
  onAction: (key: string) => void;
  onClose: () => void;
  shouldCloseOnInteractOutside?: (element: Element) => boolean;
  withBackdrop?: boolean;
}) {
  const { mobile } = useResponsiveMenu();
  const [submenu, setSubmenu] = useState<ContextMenuSubmenu | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);

  if (!mobile) {
    return (
      <ContextMenuSurface
        position={props.position}
        items={props.items}
        onAction={props.onAction}
        onClose={props.onClose}
        {...(props.shouldCloseOnInteractOutside
          ? { shouldCloseOnInteractOutside: props.shouldCloseOnInteractOutside }
          : {})}
        {...(props.withBackdrop ? { withBackdrop: true } : {})}
      />
    );
  }

  const runAction = (key: string) => {
    props.onClose();
    props.onAction(key);
  };

  return (
    <>
      <ResponsiveMenuSurface
        isOpen={props.position !== null}
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
        label={props.label}
        trigger={null}
      >
        <MobileMenuList
          entries={props.items}
          onAction={runAction}
          onOpenSubmenu={(next) => {
            setSubmenu(next);
            setSubmenuOpen(true);
          }}
        />
      </ResponsiveMenuSurface>
      {submenu ? (
        <ResponsiveMenuSurface
          isOpen={submenuOpen}
          onOpenChange={setSubmenuOpen}
          label={submenu.label}
          trigger={null}
        >
          <MobileMenuList entries={submenu.items} onAction={runAction} />
        </ResponsiveMenuSurface>
      ) : null}
    </>
  );
}
