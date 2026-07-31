import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import type { FileEntry } from "@/shared/contracts";
import { getEntryIconUrl } from "@/renderer/components/common/fileIcons";

/**
 * A composer MCP server (Browser, Crossagents, Computer Use, …) surfaced as an
 * `@`-mention. `path` doubles as the MCP id passed back on select; `icon` and
 * `detail` are supplied already-resolved by the composer so the popover stays
 * registry-agnostic.
 */
export type McpMentionEntry = {
  type: "mcp";
  path: string;
  name: string;
  icon: LucideIcon;
  detail: string;
  enabled: boolean;
};

export type MentionEntry = FileEntry | McpMentionEntry;

function getParentDir(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash >= 0 ? path.slice(0, lastSlash) : "";
}

export function MentionPopover(props: {
  results: MentionEntry[];
  activeIndex: number;
  editorEl: HTMLDivElement | null;
  mentionRange: Range;
  onSelect: (entry: MentionEntry) => void;
  onActiveIndexChange: (index: number) => void;
}) {
  const { results, activeIndex, editorEl, mentionRange, onSelect, onActiveIndexChange } = props;
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!editorEl || results.length === 0) {
    return null;
  }

  // Position in viewport coordinates (portal renders into body)
  const rangeRect = mentionRange.getBoundingClientRect();
  const popoverWidth = 480;
  const left = Math.max(8, Math.min(rangeRect.left, window.innerWidth - popoverWidth - 8));
  const top = rangeRect.top - 6;

  return createPortal(
    <div
      className="poracode-mention-popover"
      style={{
        position: "fixed",
        left,
        top,
        transform: "translateY(-100%)",
        zIndex: 9999,
      }}
    >
      <div ref={listRef} className="poracode-mention-popover__list" role="listbox">
        {results.map((entry, index) => {
          const isActive = index === activeIndex;
          const isMcp = entry.type === "mcp";
          const McpIcon = isMcp ? entry.icon : null;
          const dir = isMcp ? "" : getParentDir(entry.path);
          return (
            <div
              key={`${entry.type}:${entry.path}`}
              role="option"
              aria-selected={isActive}
              // Virtual-focus combobox pattern: the contentEditable textbox in
              // MentionInput keeps real DOM focus and drives selection via
              // arrow keys, so options never enter the tab order themselves.
              tabIndex={-1}
              className={`poracode-mention-popover__item ${isActive ? "poracode-mention-popover__item--active" : ""}`}
              onMouseEnter={() => onActiveIndexChange(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(entry);
              }}
            >
              {McpIcon ? (
                <McpIcon className="poracode-mention-popover__icon text-muted" aria-hidden="true" />
              ) : (
                <img
                  className="poracode-mention-popover__icon"
                  src={getEntryIconUrl(entry.name, entry.type === "directory")}
                  alt=""
                  draggable={false}
                />
              )}
              <span className="poracode-mention-popover__label truncate">{entry.name}</span>
              {isMcp ? (
                <span className="poracode-mention-popover__detail ml-auto shrink-0 text-xs text-[var(--muted)]">
                  {entry.detail}
                </span>
              ) : dir ? (
                <span className="poracode-mention-popover__detail ml-auto shrink-0 text-xs text-[var(--muted)]">
                  {dir}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
