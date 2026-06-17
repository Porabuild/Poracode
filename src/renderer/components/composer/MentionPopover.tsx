import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Globe } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import type { FileEntry } from "@/shared/contracts";
import { getEntryIconUrl } from "@/renderer/components/common/fileIcons";

export type BrowserMentionEntry = {
  type: "browser";
  path: "browser";
  name: "Browser";
};

export type MentionEntry = FileEntry | BrowserMentionEntry;

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
          const isBrowser = entry.type === "browser";
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
              {isBrowser ? (
                <Globe className="lightcode-mention-popover__icon text-muted" aria-hidden="true" />
              ) : (
                <img
                  className="lightcode-mention-popover__icon"
                  src={getEntryIconUrl(entry.name, entry.type === "directory")}
                  alt=""
                  draggable={false}
                />
              )}
              <span className="lightcode-mention-popover__label truncate">{entry.name}</span>
              {isBrowser ? (
                <span className="lightcode-mention-popover__detail ml-auto shrink-0 text-xs text-[var(--muted)]">
                  <Trans>Browser MCP</Trans>
                </span>
              ) : dir ? (
                <span className="lightcode-mention-popover__detail ml-auto shrink-0 text-xs text-[var(--muted)]">
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
