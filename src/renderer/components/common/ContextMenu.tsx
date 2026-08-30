import React, { type MouseEventHandler, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Description, Dropdown, Label, Separator } from "@heroui/react";
import { useDraggable } from "@dnd-kit/react";

// Context menus can stack (e.g. the flat-list filter stacks a project menu
// over its own), so dismissal tracks a stack of closers: a new surface pushes
// its closer, an outside press dismisses the top, and closing a surface pops
// its own entry — an older menu underneath stays dismissible instead of being
// orphaned when the top surface's cleanup runs.
const menuCloseStack: Array<() => void> = [];

function closeTopMenu(): void {
  menuCloseStack.at(-1)?.();
}

function closeAllMenus(): void {
  // Copy: closing surfaces may re-enter and mutate the stack while we walk it.
  for (const close of [...menuCloseStack]) close();
}

/**
 * Marks a {@link ContextMenuSurface} backdrop. Hosts that run their own
 * outside-press dismissal can look for this to recognise a press that the menu
 * on top already handled.
 */
export const MENU_BACKDROP_ATTR = "data-poracode-menu-backdrop";

/**
 * Registers a menu row as a drag source in the app's drag-and-drop provider, so
 * an entry can be dragged out of the menu onto a target elsewhere (e.g. a
 * thread pane). `type` is matched against each drop zone's `accept` list and
 * `data` is the payload the drop handler receives.
 */
export interface ContextMenuDragSource {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  /**
   * Makes the row draggable. The menu hides itself while the drag is in flight
   * instead of closing: unmounting the dragged row would cancel the operation.
   * It closes once the drag ends.
   */
  dragSource?: ContextMenuDragSource;
  endAction?: {
    id: string;
    label: string;
    icon: ReactNode;
    isDisabled?: boolean;
  };
  variant?: "default" | "danger" | "warning";
  isDisabled?: boolean;
  disabledReason?: string;
}

export interface ContextMenuSubmenu {
  type: "submenu";
  id: string;
  label: string;
  icon?: ReactNode;
  items: ContextMenuItem[];
}

export interface ContextMenuSeparator {
  type: "separator";
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSubmenu | ContextMenuSeparator;

export interface ContextMenuProps {
  items: ContextMenuEntry[];
  onAction: (
    key: string,
    anchorPosition?: { x: number; y: number },
    returnFocusElement?: HTMLElement,
  ) => void;
  children: ReactNode;
}

function isSubmenu(entry: ContextMenuEntry): entry is ContextMenuSubmenu {
  return "type" in entry && entry.type === "submenu";
}

function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return "type" in entry && entry.type === "separator";
}

function collectAllItems(entries: ContextMenuEntry[]): ContextMenuItem[] {
  return entries.flatMap((e) => (isSubmenu(e) ? e.items : isSeparator(e) ? [] : [e]));
}

/** Split entries at separator boundaries into groups. */
function splitSections(entries: ContextMenuEntry[]): (ContextMenuItem | ContextMenuSubmenu)[][] {
  const sections: (ContextMenuItem | ContextMenuSubmenu)[][] = [[]];
  for (const entry of entries) {
    if (isSeparator(entry)) {
      sections.push([]);
    } else {
      sections[sections.length - 1]!.push(entry);
    }
  }
  return sections.filter((s) => s.length > 0);
}

/** Reports a row's drag state up to the surface, keyed by item id. */
type ItemDragChangeHandler = (itemId: string, isDragging: boolean) => void;

function renderDropdownItem(
  item: ContextMenuItem,
  close: () => void,
  onAction: (key: string) => void,
  onItemDragChange?: ItemDragChangeHandler,
) {
  if (item.dragSource) {
    return (
      <DraggableDropdownItem
        key={item.id}
        item={item}
        dragSource={item.dragSource}
        close={close}
        onAction={onAction}
        {...(onItemDragChange ? { onItemDragChange } : {})}
      />
    );
  }
  return renderDropdownItemRow(item, close, onAction);
}

/**
 * A draggable row. The draggable is registered on the menu item's own element,
 * so dnd-kit's drag feedback moves the row the user grabbed — the item keeps its
 * normal layout, unlike wrapping its content in an extra element.
 */
function DraggableDropdownItem(props: {
  item: ContextMenuItem;
  dragSource: ContextMenuDragSource;
  close: () => void;
  onAction: (key: string) => void;
  onItemDragChange?: ItemDragChangeHandler;
}) {
  const { item, dragSource, onItemDragChange } = props;
  const { isDragging, ref } = useDraggable({
    id: dragSource.id,
    type: dragSource.type,
    data: dragSource.data,
  });
  const wasDraggingRef = useRef(false);
  useEffect(() => {
    // Report only real transitions: menus re-render on hover, and the surface
    // closes itself on the dragging → idle edge.
    if (wasDraggingRef.current === isDragging) return;
    wasDraggingRef.current = isDragging;
    onItemDragChange?.(item.id, isDragging);
  }, [isDragging, item.id, onItemDragChange]);

  return renderDropdownItemRow(props.item, props.close, props.onAction, ref);
}

function renderDropdownItemRow(
  item: ContextMenuItem,
  close: () => void,
  onAction: (key: string) => void,
  dragRef?: (element: Element | null) => void,
) {
  return (
    <Dropdown.Item
      key={item.id}
      id={item.id}
      aria-label={item.label}
      textValue={item.label}
      variant={item.variant === "danger" ? "danger" : undefined}
      {...(dragRef ? { ref: dragRef, className: "cursor-grab active:cursor-grabbing" } : {})}
    >
      {item.icon && (
        <span
          className={`size-4 shrink-0 ${item.variant === "danger" ? "text-danger" : item.variant === "warning" ? "text-warning" : "text-muted"}`}
        >
          {item.icon}
        </span>
      )}
      {item.description ? (
        <>
          <Label className={item.variant === "warning" ? "text-warning" : undefined}>
            {item.label}
          </Label>
          <Description>{item.description}</Description>
        </>
      ) : (
        <Label className={`flex-1 ${item.variant === "warning" ? "text-warning" : ""}`}>
          {item.label}
        </Label>
      )}
      {item.endAction ? (
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={item.endAction.label}
          className="ml-auto size-5 min-w-0 text-muted hover:text-foreground [--button-bg-hover:var(--row-hover)]"
          {...(item.endAction.isDisabled ? { isDisabled: true } : {})}
          onPressStart={(event) => event.continuePropagation()}
          onPress={() => {
            close();
            onAction(item.endAction!.id);
          }}
        >
          {item.endAction.icon}
        </Button>
      ) : null}
    </Dropdown.Item>
  );
}

function renderEntry(
  entry: ContextMenuItem | ContextMenuSubmenu,
  close: () => void,
  onAction: (key: string) => void,
  onItemDragChange?: ItemDragChangeHandler,
) {
  if (isSubmenu(entry)) {
    return (
      <Dropdown.SubmenuTrigger key={entry.id}>
        <Dropdown.Item id={entry.id} textValue={entry.label}>
          {entry.icon && <span className="size-4 shrink-0 text-muted">{entry.icon}</span>}
          <Label>{entry.label}</Label>
          <Dropdown.SubmenuIndicator />
        </Dropdown.Item>
        <Dropdown.Popover>
          <Dropdown.Menu
            onAction={(key) => {
              close();
              onAction(String(key));
            }}
          >
            {entry.items.map((item) => renderDropdownItem(item, close, onAction))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.SubmenuTrigger>
    );
  }
  return renderDropdownItem(entry, close, onAction, onItemDragChange);
}

/**
 * The anchored menu itself, opened programmatically at fixed viewport
 * coordinates. `ContextMenu` drives it from a right-click; other surfaces
 * (e.g. an overflow button inside another menu) can drive it from any event.
 */
export function ContextMenuSurface(props: {
  /** Anchor coordinates; null keeps the menu closed. */
  position: { x: number; y: number } | null;
  items: ContextMenuEntry[];
  onAction: (key: string) => void;
  onClose: () => void;
  /**
   * React Aria popovers close on blur by default (shouldCloseOnBlur is
   * hardcoded in usePopover). When this menu stacks over another open menu —
   * whose items take DOM focus on hover — pass a predicate that keeps the
   * menu open while the interaction target lives inside any menu.
   */
  shouldCloseOnInteractOutside?: (element: Element) => boolean;
  /**
   * Render a full-viewport backdrop beneath the menu, so a press anywhere else
   * dismisses it and does not reach whatever sits underneath. Opt-in: right-click
   * menus dismiss through the global press listener above and let the press
   * through, which is the behaviour their surfaces expect.
   */
  withBackdrop?: boolean;
}) {
  const { position, items, onAction, onClose } = props;
  // A row being dragged out of the menu: the menu hides but stays mounted —
  // unmounting the dragged element cancels the dnd-kit operation — and closes
  // once the drag ends. dnd-kit promotes its drag feedback into the top layer,
  // so the row the user grabbed keeps following the pointer while the surface
  // around it is transparent.
  const [isRowDragging, setIsRowDragging] = useState(false);
  const draggingRowIdRef = useRef<string | null>(null);

  function handleItemDragChange(itemId: string, isDragging: boolean) {
    if (isDragging) {
      draggingRowIdRef.current = itemId;
      setIsRowDragging(true);
      return;
    }
    if (draggingRowIdRef.current !== itemId) return;
    draggingRowIdRef.current = null;
    setIsRowDragging(false);
    onClose();
  }

  const hiddenWhileDraggingClass = isRowDragging ? "pointer-events-none opacity-0" : "";

  useEffect(() => {
    if (!position) return;

    const close = () => onClose();
    menuCloseStack.push(close);

    // Close on left-click anywhere. We use a capture listener to ensure we can catch it
    // but the dropdown components might also handle it.
    const onGlobalMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        const target = e.target as Element;
        // If clicking inside a menu, menu item, or dropdown trigger/popover, don't close manually.
        // HeroUI components use these roles and attributes.
        if (target.closest('[role="menu"], [role="menuitem"], [data-heroui-overlay]')) {
          return;
        }

        // If it's a left click outside, close the topmost menu.
        // We wait a tick to allow onAction to fire first if clicking an item that isn't caught by the roles above.
        setTimeout(closeTopMenu, 0);
      }
    };

    window.addEventListener("mousedown", onGlobalMouseDown, true);

    return () => {
      const index = menuCloseStack.lastIndexOf(close);
      if (index >= 0) menuCloseStack.splice(index, 1);
      window.removeEventListener("mousedown", onGlobalMouseDown, true);
    };
  }, [position, onClose]);

  return position
    ? createPortal(
        <>
          {props.withBackdrop ? (
            // Shares the popover layer (see .poracode-menu-backdrop), so it
            // covers the surface this menu was opened from — it comes later in
            // the portal order — while the menu itself, portaled after it,
            // still paints above. Marked so a host's own outside-press watcher
            // can tell this apart from a press outside every menu.
            <div
              {...{ [MENU_BACKDROP_ATTR]: true }}
              className={`poracode-menu-backdrop fixed inset-0 ${hiddenWhileDraggingClass}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onClose();
              }}
            />
          ) : null}
          <Dropdown
            isOpen
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
          >
            {/* Invisible anchor positioned at the opening coordinates */}
            <Dropdown.Trigger className="fixed" style={{ left: position.x, top: position.y }}>
              <div className="size-0" />
            </Dropdown.Trigger>
            <Dropdown.Popover
              placement="bottom start"
              isNonModal
              className={hiddenWhileDraggingClass}
              {...(props.shouldCloseOnInteractOutside
                ? { shouldCloseOnInteractOutside: props.shouldCloseOnInteractOutside }
                : {})}
            >
              <Dropdown.Menu
                autoFocus="first" // eslint-disable-line jsx-a11y/no-autofocus -- React Aria Menu prop, not HTML autofocus
                disabledKeys={collectAllItems(items)
                  .filter((item) => item.isDisabled)
                  .map((item) => item.id)}
                onAction={(key) => {
                  onClose();
                  onAction(String(key));
                }}
              >
                {(() => {
                  const sections = splitSections(items);
                  if (sections.length <= 1) {
                    return (sections[0] ?? []).map((entry) =>
                      renderEntry(entry, onClose, onAction, handleItemDragChange),
                    );
                  }
                  return sections.flatMap((section, sIdx) => {
                    const sectionEl = (
                      <Dropdown.Section key={`section-${sIdx}`}>
                        {section.map((entry) =>
                          renderEntry(entry, onClose, onAction, handleItemDragChange),
                        )}
                      </Dropdown.Section>
                    );
                    return sIdx > 0 ? [<Separator key={`sep-${sIdx}`} />, sectionEl] : [sectionEl];
                  });
                })()}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </>,
        document.body,
      )
    : null;
}

export function ContextMenu(props: ContextMenuProps) {
  const { items, onAction, children } = props;
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [returnFocusElement, setReturnFocusElement] = useState<HTMLElement | null>(null);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    // A new right-click menu takes over: dismiss every already-open context
    // menu (the filter surface below one of them is not a context menu and
    // handles itself).
    closeAllMenus();
    setPosition({ x: e.clientX, y: e.clientY });
    setReturnFocusElement(e.currentTarget instanceof HTMLElement ? e.currentTarget : null);
  }

  const trigger = React.isValidElement<{ onContextMenu?: MouseEventHandler }>(children) ? (
    React.cloneElement(children, {
      onContextMenu: (event) => {
        children.props.onContextMenu?.(event);
        if (!event.defaultPrevented) {
          handleContextMenu(event);
        }
      },
    })
  ) : (
    <div onContextMenu={handleContextMenu}>{children}</div>
  );

  return (
    <>
      {trigger}
      <ContextMenuSurface
        position={position}
        items={items}
        onAction={(key) => onAction(key, position ?? undefined, returnFocusElement ?? undefined)}
        onClose={() => setPosition(null)}
      />
    </>
  );
}
