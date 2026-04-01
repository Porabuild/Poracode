import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { FileEntry } from "../../../shared/contracts";
import { getEntryIconUrl } from "../common/fileIcons";

function getParentDir(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash >= 0 ? path.slice(0, lastSlash) : "";
}

export function MentionPopover(props: {
  results: FileEntry[];
  activeIndex: number;
  editorEl: HTMLDivElement | null;
  mentionRange: Range;
  onSelect: (entry: FileEntry) => void;
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
      className="lightcode-mention-popover"
      style={{
        position: "fixed",
        left,
        top,
        transform: "translateY(-100%)",
        zIndex: 9999,
      }}
    >
      <div ref={listRef} className="lightcode-mention-popover__list" role="listbox">
        {results.map((entry, index) => {
          const dir = getParentDir(entry.path);
          const isActive = index === activeIndex;
          return (
            <div
              key={`${entry.type}:${entry.path}`}
              role="option"
              aria-selected={isActive}
              className={`lightcode-mention-popover__item ${isActive ? "lightcode-mention-popover__item--active" : ""}`}
              onMouseEnter={() => onActiveIndexChange(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(entry);
              }}
            >
              <img
                className="lightcode-mention-popover__icon"
                src={getEntryIconUrl(entry.name, entry.type === "directory")}
                alt=""
                draggable={false}
              />
              <span className="truncate">{entry.name}</span>
              {dir && <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">{dir}</span>}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
