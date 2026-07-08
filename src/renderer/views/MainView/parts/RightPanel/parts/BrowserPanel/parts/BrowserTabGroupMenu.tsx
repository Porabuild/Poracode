import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLingui } from "@lingui/react/macro";
import { ChevronsDownUp, ChevronsUpDown, Plus, Ungroup, X } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import type { BrowserTabGroupColor, BrowserTabGroupInfo } from "@/shared/ipc";
import { GROUP_COLOR_ORDER, groupColor } from "./groupColors";

const MENU_WIDTH = 208;
const MENU_HEIGHT = 260;
const VIEWPORT_PADDING = 8;

/** Chrome-style right-click menu for a tab group: rename, recolor, and the
 *  common group actions. Positioned at the click point via a body portal. */
export function BrowserTabGroupMenu(props: {
  group: BrowserTabGroupInfo;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { group, onClose } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState(group.title);

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== group.title) {
      readBridge()
        .browserRenameGroup({ groupId: group.id, title: next })
        .catch(() => {});
    }
  };

  const act = (fn: () => Promise<unknown>) => {
    fn().catch(() => {});
    onClose();
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    // Focus + select the name for a Chrome-like rename-on-open (avoids the
    // autoFocus attribute the a11y lint rejects).
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - MENU_HEIGHT - VIEWPORT_PADDING);
  const left = Math.min(Math.max(props.x, VIEWPORT_PADDING), maxLeft);
  const top = Math.min(Math.max(props.y, VIEWPORT_PADDING), maxTop);

  const item =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-[var(--surface-secondary)]";

  return createPortal(
    <div
      ref={ref}
      role="menu"
      // Focus lands on the natively-focusable input/buttons inside (see the
      // focus-on-open effect above); the menu container itself is never the
      // direct focus target, so it stays out of the tab order.
      tabIndex={-1}
      className="fixed z-[200] w-52 rounded-lg border border-border bg-[var(--content-background)] p-1.5 shadow-xl"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <input
        ref={inputRef}
        aria-label={t`Group name`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commitTitle();
            onClose();
          }
        }}
        onBlur={commitTitle}
        placeholder={t`Group name`}
        className="mb-1.5 w-full rounded-md border border-border bg-transparent px-2 py-1 text-[12px] text-foreground outline-none focus:border-accent"
      />
      <div className="mb-1.5 flex items-center justify-between px-1 py-1">
        {GROUP_COLOR_ORDER.map((c: BrowserTabGroupColor) => (
          <button
            key={c}
            type="button"
            aria-label={t`Set group color`}
            className={`size-4 rounded-full ring-offset-1 ring-offset-[var(--content-background)] ${
              group.color === c
                ? "ring-2 ring-foreground/60"
                : "hover:ring-2 hover:ring-foreground/25"
            }`}
            style={{ backgroundColor: groupColor(c) }}
            onClick={() =>
              act(() => readBridge().browserSetGroupColor({ groupId: group.id, color: c }))
            }
          />
        ))}
      </div>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        className={item}
        onClick={() => act(() => readBridge().browserNewTabInGroup({ groupId: group.id }))}
      >
        <Plus className="size-3.5 shrink-0" />
        {t`New tab in group`}
      </button>
      <button
        type="button"
        className={item}
        onClick={() =>
          act(() =>
            readBridge().browserSetGroupCollapsed({
              groupId: group.id,
              collapsed: !group.collapsed,
            }),
          )
        }
      >
        {group.collapsed ? (
          <ChevronsUpDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronsDownUp className="size-3.5 shrink-0" />
        )}
        {group.collapsed ? t`Expand group` : t`Collapse group`}
      </button>
      <button
        type="button"
        className={item}
        onClick={() => act(() => readBridge().browserUngroupGroup({ groupId: group.id }))}
      >
        <Ungroup className="size-3.5 shrink-0" />
        {t`Ungroup`}
      </button>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        className={`${item} text-danger hover:bg-danger/10`}
        onClick={() => act(() => readBridge().browserCloseGroup({ groupId: group.id }))}
      >
        <X className="size-3.5 shrink-0" />
        {t`Close group`}
      </button>
    </div>,
    document.body,
  );
}
