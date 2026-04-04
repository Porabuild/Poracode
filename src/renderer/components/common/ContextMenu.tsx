import React, { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dropdown, Label, Tooltip } from "@heroui/react";

// Only one context menu can be open at a time.
let closeActiveMenu: (() => void) | null = null;

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "default" | "danger";
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

export type ContextMenuEntry = ContextMenuItem | ContextMenuSubmenu;

export interface ContextMenuProps {
  items: ContextMenuEntry[];
  onAction: (key: string) => void;
  children: ReactNode;
}

function isSubmenu(entry: ContextMenuEntry): entry is ContextMenuSubmenu {
  return "type" in entry && entry.type === "submenu";
}

function collectAllItems(entries: ContextMenuEntry[]): ContextMenuItem[] {
  return entries.flatMap((e) => (isSubmenu(e) ? e.items : [e]));
}

function renderDropdownItem(item: ContextMenuItem) {
  const content = (
    <Dropdown.Item
      key={item.id}
      id={item.id}
      textValue={item.label}
      variant={item.variant === "danger" ? "danger" : undefined}
    >
      {item.icon && (
        <span
          className={`size-4 shrink-0 ${item.variant === "danger" ? "text-danger" : "text-muted"}`}
        >
          {item.icon}
        </span>
      )}
      <Label>{item.label}</Label>
    </Dropdown.Item>
  );

  if (item.isDisabled && item.disabledReason) {
    return (
      <Tooltip key={item.id} delay={300}>
        <Tooltip.Trigger>{content}</Tooltip.Trigger>
        <Tooltip.Content placement="right">{item.disabledReason}</Tooltip.Content>
      </Tooltip>
    );
  }

  return content;
}

export function ContextMenu(props: ContextMenuProps) {
  const { items, onAction, children } = props;
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!position) return;

    const close = () => setPosition(null);
    closeActiveMenu = close;

    return () => {
      if (closeActiveMenu === close) closeActiveMenu = null;
    };
  }, [position]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    closeActiveMenu?.();
    setPosition({ x: e.clientX, y: e.clientY });
  }

  return (
    <>
      <div style={{ display: "contents" }} onContextMenu={handleContextMenu}>
        {children}
      </div>
      {position
        ? createPortal(
            <Dropdown
              isOpen
              onOpenChange={(open) => {
                if (!open) setPosition(null);
              }}
            >
              {/* Invisible anchor positioned at the right-click coordinates */}
              <Dropdown.Trigger className="fixed" style={{ left: position.x, top: position.y }}>
                <div className="size-0" />
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom start">
                <Dropdown.Menu
                  autoFocus="first" // eslint-disable-line jsx-a11y/no-autofocus -- React Aria Menu prop, not HTML autofocus
                  disabledKeys={collectAllItems(items)
                    .filter((item) => item.isDisabled)
                    .map((item) => item.id)}
                  onAction={(key) => {
                    setPosition(null);
                    onAction(String(key));
                  }}
                >
                  {items.map((entry) => {
                    if (isSubmenu(entry)) {
                      return (
                        <Dropdown.SubmenuTrigger key={entry.id}>
                          <Dropdown.Item id={entry.id} textValue={entry.label}>
                            {entry.icon && (
                              <span className="size-4 shrink-0 text-muted">{entry.icon}</span>
                            )}
                            <Label>{entry.label}</Label>
                            <Dropdown.SubmenuIndicator />
                          </Dropdown.Item>
                          <Dropdown.Popover>
                            <Dropdown.Menu
                              onAction={(key) => {
                                setPosition(null);
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
                  })}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>,
            document.body,
          )
        : null}
    </>
  );
}
