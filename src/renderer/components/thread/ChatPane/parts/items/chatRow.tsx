import type { ReactNode } from "react";

/**
 * Shared styling + atoms for the "quiet nested row" treatment used by every
 * chat tool-call / agent-activity item (ChatItemAccordion, ToolCallGroup,
 * WorkflowResultGroup, SubAgentToolCall).
 *
 * Tool rows read as secondary lines beneath the assistant prose: no card
 * surface or border at rest, nested slightly inward, hugging their content so
 * the trailing meta label (duration / diff summary) sits directly after the
 * title. Owning the recipe here — rather than re-typing the class strings in
 * each renderer — keeps the four item components from drifting apart.
 */

// Nest the whole block inward so tool activity sits under the narration instead
// of sharing its left edge.
export const chatRowShellClass = "w-full pl-4";

// Base row layout. Hugs its content (`w-fit max-w-full`) so the row is only as
// wide as icon + title + meta, truncating once it reaches the column width.
// Callers append the gap (`gap-1.5` for dense rows, `gap-2` for group headers)
// plus any per-row extras, and add `chatRowHoverClass` for clickable rows.
export const chatRowClass =
  "flex w-fit max-w-full min-w-0 items-center rounded-lg px-2 py-1 text-left";

// Hover affordance for rows that expand a body on click. Matches the
// Thinking/Thought toggle: the row's muted text lights up to foreground
// (all row content is colored via `var(--muted)`) instead of a background
// tint.
export const chatRowHoverClass = "transition-colors hover:[--muted:var(--foreground)]";

// Hairline rule above an expanded row's body. Callers append the top padding
// (`pt-1` dense, `pt-2.5` roomier).
export const chatRowBodyClass = "mt-1 border-t border-[var(--hairline)] px-2";

// Dashed left rail marking a group's nested children as belonging to it (the
// chat tool-call group body, and the sidebar's worktree/thread groups). Only
// the rail treatment lives here — callers add their own indent (`ml-*`/`pl-*`)
// so a dense list can hug tighter than the roomier chat body.
export const chatRowRailClass = "border-l border-dashed border-[color:var(--border)]";

// Disclosure trigger for a dense inline row inside a tool-call group
// (ToolCallInline, ReasoningInline): icon + title + trailing meta hugging
// their content, with the shared hover treatment.
export const inlineRowTriggerClass = `group flex w-fit max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md py-0.5 text-left ${chatRowHoverClass}`;

// Disclosure chevrons stay visible on touch devices, but remain quiet until
// the row is hovered or keyboard-focused on pointer-capable desktops.
export const chatRowIndicatorClass =
  "size-3.5 shrink-0 text-[color:var(--muted)] opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-visible:opacity-100";

export function normalizeCallTitleSeparator(title: string): string {
  return title.replace(/: /u, " · ");
}

// Thin dot between a row's title and its trailing meta label so the two read as
// distinct once they sit side by side.
export function ChatRowMetaSeparator() {
  return (
    <span aria-hidden className="shrink-0 select-none text-[color:var(--muted)] opacity-40">
      ·
    </span>
  );
}

// Separator + trailing meta label. Renders nothing when there's no label, so
// call sites don't need their own `label ? … : null` guard.
export function ChatRowMeta({ label, className }: { label: ReactNode; className?: string }) {
  if (!label) return null;
  return (
    <>
      <ChatRowMetaSeparator />
      <span className={`shrink-0 tabular-nums font-medium ${className ?? ""}`}>{label}</span>
    </>
  );
}
