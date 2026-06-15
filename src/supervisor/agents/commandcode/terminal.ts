import { findBestHint, type HintEntry, type TerminalStatusHint } from "../base";

interface CommandCodeHintEntry extends HintEntry {
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
}

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
const COMMANDCODE_STRONG: CommandCodeHintEntry[] = [
  { re: /Enter to select|Choose an option/i, status: "needs_reply", attention: "needs_reply" },
  {
    re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Do you want to proceed|Continue\?|Approve\??|Trust this folder/i,
    status: "needs_approval",
    attention: "needs_approval",
  },
  { re: /\besc to interrupt\b/i, status: "working", attention: "working" },
];

const COMMANDCODE_FALLBACK_IDLE: CommandCodeHintEntry[] = [
  { re: /Ask your question/i, status: "idle", attention: "none" },
  { re: /\?\s+for shortcuts|\/\s+for commands/i, status: "idle", attention: "none" },
];

export function detectCommandCodeTerminalStatus(text: string): TerminalStatusHint | null {
  const tail = text.slice(-1200);

  const strong = findBestHint(tail, COMMANDCODE_STRONG);
  if (strong) {
    return { status: strong.status, attention: strong.attention, corroborated: true };
  }

  const fallback = findBestHint(tail, COMMANDCODE_FALLBACK_IDLE);
  if (!fallback) return null;
  const bothPresent = COMMANDCODE_FALLBACK_IDLE.every((entry) => entry.re.test(tail));
  return { status: fallback.status, attention: fallback.attention, corroborated: bothPresent };
}
