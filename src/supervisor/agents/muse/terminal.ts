import { detectTerminalStatusFromHints, type TerminalStatusHint } from "../base";

// Heuristics verified against captured Muse Code TUI output: the 0.1.0
// echo-provider capture (`muse --provider echo --no-session-log
// --trust-workspace "say hello"` under a PTY that answers CSI 6n / DA), then
// re-captured against real 1.0.2 output with the same provider and prompt
// (repo-local PTY driver: tmp/muse-pty-probe.py).
//
// Working: status strip reads `◆ Working (0s · esc to interrupt)`; 1.0.2 adds
// `◇ Thinking` and `◇ Double checking` states (either may appear without the
// interrupt suffix in a given frame, so the words themselves are matched).
// Anchor on the invariant `esc to interrupt` / strip-state labels.
// Idle / ready: header `Muse Code <version>`, composer hint
// `Type @ to search and insert workspace file paths` (1.0.2; 0.1.0 showed
// `Voice input (⌥ + v to start)`, kept for older builds), and the `⟩` prompt
// glyph.
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
    re: /[◆◇]\s*(?:Working|Finishing|Thinking|Double\s+checking)\b/i,
    status: "working" as const,
    attention: "working" as const,
  },
];

const MUSE_FALLBACK_IDLE = [
  {
    // Composer hint, one entry on purpose: `Voice input (⌥ + v to start)` on
    // 0.1.0, `Type @ to search and insert workspace file paths` on 1.0.2.
    // The shared matcher only marks idle `corroborated` when EVERY fallback
    // entry matches, so version alternatives must stay a single entry —
    // separate entries would leave idle permanently uncorroborated on both.
    re: /Voice\s+input|@\s+to\s+search\s+and\s+insert/i,
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
