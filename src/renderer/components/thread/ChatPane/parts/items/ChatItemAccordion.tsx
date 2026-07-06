import { Disclosure, Tooltip } from "@heroui/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { ChatFilePath } from "./ChatFilePath";
import {
  ChatRowMeta,
  chatRowBodyClass,
  chatRowClass,
  chatRowHoverClass,
  chatRowShellClass,
} from "./chatRow";

export interface ChatItemAccordionProps {
  /** Leading icon (sized 12px to match the command row icon). */
  icon: ReactNode;
  /** Single-line title; truncated with ellipsis when too long. */
  title: ReactNode;
  /**
   * Optional structured title. When provided the row renders `prefix` (kept
   * fully visible) followed by `path` truncated from the START — the ellipsis
   * appears at the beginning of the path so the tail (filename) stays
   * readable. When `filePath` is true the path renders as `<basename> <muted
   * dir>` with head-ellipsis on the directory. `title` is still used as the
   * tooltip / accessible label.
   */
  titleParts?: { prefix: string; path: string; filePath?: boolean };
  /** Optional muted/danger label rendered on the right of the trigger row. */
  rightLabel?: ReactNode;
  /** Tailwind class applied to `rightLabel` (e.g. `"text-danger"`). */
  rightLabelClassName?: string;
  /** When false the row renders without a trigger / chevron (no body to toggle). */
  hasBody?: boolean;
  /** Controlled expand state. Required when `hasBody`. */
  isExpanded?: boolean;
  /** Toggle handler. Required when `hasBody`. */
  onExpandedChange?: (next: boolean) => void;
  /** Body markup; only rendered when expanded. */
  children?: ReactNode;
}

/**
 * Shared accordion shell for chat tool/command rows.
 *
 * All rows that hide their detail behind a disclosure (tool_call, web_search,
 * file_change, command_execution) share this layout: bordered tile, single-row
 * trigger with `[icon, title, …, right label, chevron]`, and a body separated
 * by a top border. Keeping one component prevents the four item renderers from
 * drifting apart visually.
 *
 * Disclosure transitions are globally disabled in `styles.css` for perf — the
 * panel snaps open/closed.
 */
// ChatItemAccordion's variant of the shared quiet-row recipe (see `chatRow`):
// dense `gap-1.5`, plus a `<code>`-muting override for the title's mono text.
// `rowClass` is the static form (rows with no body to expand); `triggerClass`
// adds the hover affordance for clickable (has-body) rows.
const rowClass = `${chatRowClass} gap-1.5 [&>code]:!text-[color:var(--muted)]`;

const triggerClass = `${rowClass} ${chatRowHoverClass}`;

// `w-full` is load-bearing: HeroUI's `Tooltip.Trigger` computes to
// `display: inline-flex`, so this `<code>` is a flex item. Without an explicit
// width it shrink-wraps to its content instead of filling the trigger, which
// starves the nested PathDisplay's width measurement and collapses the muted
// directory to a lone "…". Filling the trigger gives PathDisplay the real row
// width to lay the directory out against.
const codeClass = "block w-full truncate font-mono !text-[color:var(--muted)]";

export function ChatItemAccordion({
  icon,
  title,
  titleParts,
  rightLabel,
  rightLabelClassName = "!text-[color:var(--muted)]",
  hasBody = true,
  isExpanded,
  onExpandedChange,
  children,
}: ChatItemAccordionProps) {
  const actions = useChatPaneActions();
  const titleString =
    typeof title === "string"
      ? title
      : titleParts
        ? `${titleParts.prefix}${titleParts.path}`
        : undefined;
  const codeRef = useRef<HTMLElement | null>(null);
  const pathRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // PathDisplay handles its own truncation (basename always visible, head-
  // ellipsis on the dir), so the wrapping `<code>` never overflows in that
  // mode — skip the overflow-tooltip dance.
  const usesPathDisplay = !!titleParts?.filePath;

  useLayoutEffect(() => {
    if (usesPathDisplay) {
      setIsOverflowing(false);
      return;
    }
    const el = titleParts ? pathRef.current : codeRef.current;
    if (!el) return;
    const check = () => setIsOverflowing(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [titleString, titleParts, usesPathDisplay]);

  const titleContent = titleParts ? (
    <code className={`${codeClass} flex items-baseline overflow-hidden`}>
      <span className="shrink-0 whitespace-pre">{titleParts.prefix}</span>
      {titleParts.filePath ? (
        <ChatFilePath
          className="flex-1"
          path={titleParts.path}
          basenameClassName="!text-[color:var(--foreground)]"
          dirClassName="!text-[color:var(--muted)]"
        />
      ) : (
        <span ref={pathRef} className="lc-truncate-start flex-1">
          {titleParts.path}
        </span>
      )}
    </code>
  ) : (
    <code ref={codeRef} className={codeClass}>
      {title}
    </code>
  );

  const titleNode = (
    <span className="min-w-0">
      <Tooltip delay={300} isDisabled={!isOverflowing || !titleString}>
        <Tooltip.Trigger className="block min-w-0 w-full">{titleContent}</Tooltip.Trigger>
        <Tooltip.Content placement="top" className="max-w-[80vw] break-all">
          {titleString}
        </Tooltip.Content>
      </Tooltip>
    </span>
  );

  if (!hasBody) {
    return (
      <div className={chatRowShellClass}>
        <div className={`${rowClass} text-[length:var(--lc-chat-font-size-command)] leading-tight`}>
          <span className="size-3 shrink-0 text-[color:var(--muted)]">{icon}</span>
          {titleNode}
          <ChatRowMeta label={rightLabel} className={rightLabelClassName} />
        </div>
      </div>
    );
  }

  return (
    <div className={chatRowShellClass}>
      <Disclosure
        className="text-[length:var(--lc-chat-font-size-command)] leading-tight"
        isExpanded={isExpanded ?? false}
        onExpandedChange={(next) => {
          onExpandedChange?.(next);
          actions?.onContentHeightChange();
        }}
      >
        <Disclosure.Heading>
          <Disclosure.Trigger className={triggerClass}>
            <span className="size-3 shrink-0 text-[color:var(--muted)]">{icon}</span>
            {titleNode}
            <ChatRowMeta label={rightLabel} className={rightLabelClassName} />
            <Disclosure.Indicator className="size-3.5 shrink-0 text-[color:var(--muted)]" />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <div className="min-h-0 overflow-hidden">
            <Disclosure.Body className={`${chatRowBodyClass} pt-2.5`}>
              {isExpanded ? children : null}
            </Disclosure.Body>
          </div>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}
