import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
      // Right-click: always close so a new context menu can open
      if (e.button === 2) {
        close();
        return;
      }
      // Left/middle click: close only if outside the menu
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

  function handleItemClick(id: string, isDisabled?: boolean) {
    if (isDisabled) return;
    setPosition(null);
    onAction(id);
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
              className="fixed z-50 min-w-40 rounded-xl border border-white/10 bg-[color:var(--overlay)] p-1 shadow-xl"
              style={{ left: position.x, top: position.y }}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  aria-disabled={item.isDisabled || undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                    item.isDisabled
                      ? "cursor-not-allowed opacity-40"
                      : item.variant === "danger"
                        ? "text-danger hover:bg-danger/10"
                        : "text-foreground hover:bg-white/[0.06]"
                  }`}
                  onClick={() => handleItemClick(item.id, item.isDisabled)}
                  type="button"
                >
                  {item.icon ? (
                    <span
                      className={`size-4 shrink-0 ${item.variant === "danger" ? "text-danger" : "text-muted"}`}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
