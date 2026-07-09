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
