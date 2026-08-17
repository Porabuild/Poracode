import { detectTerminalStatusFromHints, type TerminalStatusHint } from "../base";

// Heuristics verified against captured Muse Code 0.1.0 TUI output
// (`muse --provider echo --no-session-log --trust-workspace "say hello"` under
// a PTY that answers CSI 6n / DA). Scratch capture: tmp/muse-tui-echo-clean.txt.
//
// Working: status strip reads `◆ Working (0s · esc to interrupt)` and later
// `◆ Finishing … · esc to interrupt`. Anchor on the invariant
// `esc to interrupt` / `Working` / `Finishing` labels.
// Idle / ready: header `Muse Code 0.1.0`, composer footer
// `Voice input (⌥ + v to start)`, and the `⟩` prompt glyph.
// Approval: echo provider never surfaces tool-approval UI; keep generic,
// high-confidence interactive patterns only (conservative).

const MUSE_STRONG = [
  {
    re: /Enter to select|Choose an option/i,
    status: "needs_reply" as const,
    attention: "needs_reply" as const,
  },
  {
    re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Do you want to proceed|Continue\?|Approve\??/i,
    status: "needs_approval" as const,
    attention: "needs_approval" as const,
  },
  {
    re: /\besc\s+to\s+interrupt\b/i,
    status: "working" as const,
    attention: "working" as const,
  },
  {
    re: /◆\s*(?:Working|Finishing)\b/i,
    status: "working" as const,
    attention: "working" as const,
  },
];

const MUSE_FALLBACK_IDLE = [
  {
    re: /Voice\s+input/i,
    status: "idle" as const,
    attention: "none" as const,
  },
  {
    re: /\bMuse\s+Code\b/i,
    status: "idle" as const,
    attention: "none" as const,
  },
];

export function detectMuseTerminalStatus(text: string): TerminalStatusHint | null {
  return detectTerminalStatusFromHints(text, MUSE_STRONG, MUSE_FALLBACK_IDLE);
}

/**
 * True once the interactive TUI has painted enough chrome that typing the
 * first prompt is safe. Anchors from the captured startup frame.
 */
export function isMuseReadyForInitialPrompt(text: string): boolean {
  if (/\bMuse\s+Code\b/i.test(text)) return true;
  if (/Voice\s+input/i.test(text)) return true;
  // Composer glyph from the captured TUI (U+27E9).
  if (text.includes("⟩")) return true;
  return false;
}
