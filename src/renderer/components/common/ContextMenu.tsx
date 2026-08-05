import React, { type MouseEventHandler, type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dropdown, Label, Separator } from "@heroui/react";

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

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
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
  onAction: (key: string) => void;
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

function renderDropdownItem(item: ContextMenuItem) {
  return (
    <Dropdown.Item
      key={item.id}
      id={item.id}
      textValue={item.label}
      variant={item.variant === "danger" ? "danger" : undefined}
    >
      {item.icon && (
        <span
          className={`size-4 shrink-0 ${item.variant === "danger" ? "text-danger" : item.variant === "warning" ? "text-warning" : "text-muted"}`}
        >
          {item.icon}
        </span>
      )}
      <Label className={item.variant === "warning" ? "text-warning" : undefined}>
        {item.label}
      </Label>
    </Dropdown.Item>
  );
}

function renderEntry(
  entry: ContextMenuItem | ContextMenuSubmenu,
  close: () => void,
  onAction: (key: string) => void,
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
            {entry.items.map((item) => renderDropdownItem(item))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.SubmenuTrigger>
    );
  }
  return renderDropdownItem(entry);
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
              className="poracode-menu-backdrop fixed inset-0"
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
                      renderEntry(entry, onClose, onAction),
                    );
                  }
                  return sections.flatMap((section, sIdx) => {
                    const sectionEl = (
                      <Dropdown.Section key={`section-${sIdx}`}>
                        {section.map((entry) => renderEntry(entry, onClose, onAction))}
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

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    // A new right-click menu takes over: dismiss every already-open context
    // menu (the filter surface below one of them is not a context menu and
    // handles itself).
    closeAllMenus();
    setPosition({ x: e.clientX, y: e.clientY });
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
        onAction={onAction}
        onClose={() => setPosition(null)}
      />
    </>
  );
}
