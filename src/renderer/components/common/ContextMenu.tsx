import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Label, Menu } from "@heroui/react";

// Only one context menu can be open at a time.
let closeActiveMenu: (() => void) | null = null;

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "default" | "danger";
  isDisabled?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  onAction: (key: string) => void;
  children: ReactNode;
}

export function ContextMenu(props: ContextMenuProps) {
  const { items, onAction, children } = props;
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;

    const close = () => setPosition(null);
    closeActiveMenu = close;

    function onMouseDown(e: MouseEvent) {
      if (e.button === 2) {
        close();
        return;
      }
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      if (closeActiveMenu === close) closeActiveMenu = null;
    };
  }, [position]);

  // Clamp to viewport so the menu never overflows off-screen.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu || !position) return;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(4, window.innerWidth - rect.width - 4)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(4, window.innerHeight - rect.height - 4)}px`;
    }
  });

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
            <div
              ref={menuRef}
              className="dropdown__popover fixed z-50"
              style={{ left: position.x, top: position.y }}
            >
              <Menu
                aria-label="Context menu"
                autoFocus="first"
                disabledKeys={items.filter((item) => item.isDisabled).map((item) => item.id)}
                onAction={(key) => {
                  setPosition(null);
                  onAction(String(key));
                }}
              >
                {items.map((item) => (
                  <Menu.Item
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
                  </Menu.Item>
                ))}
              </Menu>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
