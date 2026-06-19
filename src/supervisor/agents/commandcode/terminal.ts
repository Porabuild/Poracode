import { detectTerminalStatusFromHints, type TerminalStatusHint } from "../base";

// Heuristics tuned against captured `command-code` v0.37 TUI output.
//
// Working: the spinner row reads `· <Gerund>  esc to interrupt • <n>s • ↑ <n>`,
// where <Gerund> is a RANDOM verb ("Cogitating", "Processing", "Conjuring", …),
// so we anchor on the invariant `esc to interrupt` and never the label or the
// `·` spinner glyph (too generic on its own).
// Idle: the composer placeholder `❯ Ask your question...` plus the
// `? for shortcuts` / `/ for commands` hint row.
//
// The authoritative working→idle edge is owned by the L1 `Stop` hook (see
// `plugin/`). This L2 detection is the full fallback when the hook plugin is
// NOT installed, and — gated by `shouldApplyTerminalStatusWhileHookActive` in
// `index.ts` — supplies the `working` edge for follow-up text turns plus the
// `needs_approval` / `needs_reply` interactive states, which have no hook event.
// (Command Code emits no OSC, so there is no OSC-based signal to fall back to.)
const COMMANDCODE_STRONG = [
  {
    re: /Enter to select|Choose an option/i,
    status: "needs_reply" as const,
    attention: "needs_reply" as const,
  },
  {
    re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Do you want to proceed|Continue\?|Approve\??|Trust this folder/i,
    status: "needs_approval" as const,
    attention: "needs_approval" as const,
  },
  { re: /\besc to interrupt\b/i, status: "working" as const, attention: "working" as const },
];

const COMMANDCODE_FALLBACK_IDLE = [
  { re: /Ask your question/i, status: "idle" as const, attention: "none" as const },
  {
    re: /\?\s+for shortcuts|\/\s+for commands/i,
    status: "idle" as const,
    attention: "none" as const,
  },
];

export function detectCommandCodeTerminalStatus(text: string): TerminalStatusHint | null {
  return detectTerminalStatusFromHints(text, COMMANDCODE_STRONG, COMMANDCODE_FALLBACK_IDLE);
}
