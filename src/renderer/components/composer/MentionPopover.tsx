import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trans } from "@lingui/react/macro";
import { MessagesSquare, type LucideIcon } from "lucide-react";
import type { AgentSlashCommand, FileEntry } from "@/shared/contracts";
import { getEntryIconUrl } from "@/renderer/components/common/fileIcons";
import { PluginIcon } from "@/renderer/components/plugins/PluginIcon";

/**
 * A composer MCP server (Browser, Crossagents, Computer Use, …) surfaced as an
 * `@`-mention. `path` doubles as the MCP id passed back on select; `icon` and
 * `detail` are supplied already-resolved by the composer so the popover stays
 * registry-agnostic. `detail` is optional: the section header already names the
 * entry kind, so callers only pass it when it adds information.
 */
export type McpMentionEntry = {
  type: "mcp";
  path: string;
  name: string;
  icon: LucideIcon;
  detail?: string;
  enabled: boolean;
};

export type PluginMentionEntry = {
  type: "plugin";
  path: string;
  name: string;
  detail?: string;
  command: AgentSlashCommand;
  /** MCP mention ids the plugin replaces in this list; enabled on select. */
  enablesMcpServerIds?: readonly string[];
};

export type ThreadMentionEntry = {
  type: "thread";
  path: string;
  name: string;
  detail?: string;
};

export type MentionEntry = FileEntry | McpMentionEntry | PluginMentionEntry | ThreadMentionEntry;

/** Section a mention entry belongs to; files and directories share one section. */
type MentionSectionKey = "plugin" | "mcp" | "thread" | "file";

interface MentionSection {
  key: MentionSectionKey;
  /** Entries paired with their index in the flat result list (keyboard nav truth). */
  items: { entry: MentionEntry; index: number }[];
}

function getSectionKey(entry: MentionEntry): MentionSectionKey {
  return entry.type === "plugin" || entry.type === "mcp" || entry.type === "thread"
    ? entry.type
    : "file";
}

/**
 * Split the flat result list into contiguous sections while preserving each
 * entry's flat index, so arrow-key selection stays index-based.
 */
export function groupMentionResults(results: MentionEntry[]): MentionSection[] {
  const sections: MentionSection[] = [];
  results.forEach((entry, index) => {
    const key = getSectionKey(entry);
    const last = sections.at(-1);
    if (last?.key === key) {
      last.items.push({ entry, index });
    } else {
      sections.push({ key, items: [{ entry, index }] });
    }
  });
  return sections;
}

function SectionLabel(props: { sectionKey: MentionSectionKey }) {
  switch (props.sectionKey) {
    case "plugin":
      return <Trans>Plugins</Trans>;
    case "mcp":
      return <Trans>MCP servers</Trans>;
    case "thread":
      return <Trans>Threads</Trans>;
    default:
      return <Trans>Files</Trans>;
  }
}

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
  /**
   * Portal target; defaults to document.body. Hosts rendered inside a React
   * Aria modal must pass a node inside the modal's DOM — anything portaled to
   * body gets `inert` from ariaHideOutside, which blocks scrolling and lets
   * clicks fall through to the backdrop, dismissing the modal.
   */
  portalContainer?: Element | null;
}) {
  const { results, activeIndex, editorEl, mentionRange, onSelect, onActiveIndexChange } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => resolvePopoverPosition(mentionRange));

  useLayoutEffect(() => {
    if (!editorEl) return;
    const update = () => {
      const next = resolvePopoverPosition(mentionRange);
      setPosition((previous) =>
        previous.left === next.left &&
        previous.top === next.top &&
        previous.placement === next.placement &&
        previous.maxHeight === next.maxHeight
          ? previous
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(editorEl);
    const animatedContainer = editorEl.closest(".modal__container");
    animatedContainer?.addEventListener("animationend", update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      animatedContainer?.removeEventListener("animationend", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editorEl, mentionRange]);

  // Auto-scroll active item into view
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!editorEl || results.length === 0) {
    return null;
  }

  // Position in viewport coordinates. The modal portal root sits outside the
  // clipped dialog, so it can use the same fixed coordinate space as body.
  const sections = groupMentionResults(results);

  return createPortal(
    <div
      className="poracode-mention-popover pointer-events-auto"
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        transform: position.placement === "above" ? "translateY(-100%)" : undefined,
        maxHeight: position.maxHeight,
        zIndex: 9999,
      }}
    >
      <div
        ref={listRef}
        className="poracode-mention-popover__list"
        role="listbox"
        style={{ maxHeight: position.maxHeight }}
      >
        {sections.map((section) => {
          const labelId = `mention-section-${section.key}-${section.items[0]?.index ?? 0}`;
          return (
            <div
              key={labelId}
              role="group"
              aria-labelledby={labelId}
              className="poracode-mention-popover__section"
            >
              <div id={labelId} className="poracode-mention-popover__section-label">
                <SectionLabel sectionKey={section.key} />
              </div>
              {section.items.map(({ entry, index }) => {
                const isActive = index === activeIndex;
                const isMcp = entry.type === "mcp";
                const isPlugin = entry.type === "plugin";
                const isThread = entry.type === "thread";
                const McpIcon = isMcp ? entry.icon : null;
                const detail =
                  isMcp || isPlugin || isThread ? entry.detail : getParentDir(entry.path);
                return (
                  <div
                    key={`${entry.type}:${entry.path}`}
                    role="option"
                    aria-selected={isActive}
                    data-index={index}
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
                    {isPlugin ? (
                      <PluginIcon
                        pluginId={entry.path}
                        className="poracode-mention-popover__icon"
                      />
                    ) : isThread ? (
                      <MessagesSquare
                        className="poracode-mention-popover__icon text-muted"
                        aria-hidden="true"
                      />
                    ) : McpIcon ? (
                      <McpIcon
                        className="poracode-mention-popover__icon text-muted"
                        aria-hidden="true"
                      />
                    ) : (
                      <img
                        className="poracode-mention-popover__icon"
                        src={getEntryIconUrl(entry.name, entry.type === "directory")}
                        alt=""
                        draggable={false}
                      />
                    )}
                    <span className="poracode-mention-popover__label truncate">{entry.name}</span>
                    {detail ? (
                      <span className="poracode-mention-popover__detail ml-auto shrink-0 text-xs text-[var(--muted)]">
                        {detail}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>,
    props.portalContainer ?? document.body,
  );
}

function resolvePopoverPosition(range: Range) {
  const rangeRect = range.getBoundingClientRect();
  const popoverWidth = Math.min(480, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rangeRect.left, window.innerWidth - popoverWidth - 8));
  const spaceAbove = rangeRect.top - 8;
  const spaceBelow = window.innerHeight - rangeRect.bottom - 8;
  const placement = spaceAbove >= 160 || spaceAbove >= spaceBelow ? "above" : "below";
  return {
    left,
    placement,
    top: placement === "above" ? rangeRect.top - 6 : rangeRect.bottom + 6,
    maxHeight: Math.max(48, Math.min(320, placement === "above" ? spaceAbove : spaceBelow)),
  } as const;
}
