import type { TerminalStatusHint } from "../base";

type HintEntry = {
  re: RegExp;
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
  signal?: "primary" | "fallbackIdle";
};

/** Strong signals — checked first, always authoritative. */
const GEMINI_STRONG: HintEntry[] = [
  // Title bar: action required — plan approval, tool approval, numbered selection
  { re: /✋\s+Action Required/i, status: "needs_reply", attention: "needs_reply" },
  // Selection prompt footer (secondary, less reliable in stripped buffer)
  { re: /Enter to select/i, status: "needs_reply", attention: "needs_reply" },
  // Approval / consent prompt — y/n style tool-call confirmation
  {
    re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Do you want to proceed|Continue\?/i,
    status: "needs_approval",
    attention: "needs_approval",
  },
  // Title bar: working indicator (✦ sparkle + "Working…")
  { re: /✦\s+Working|⚙\s+Working/i, status: "working", attention: "working" },
  // Active generation — spinner line always contains "(esc to cancel".
  // This is the definitive working indicator; standalone braille characters
  // are NOT matched because they persist as stale data in the rolling buffer
  // after "Resuming session…" and similar loading screens.
  { re: /\(esc to cancel/i, status: "working", attention: "working" },
  // Title bar: ready/idle indicator (◇ diamond + "Ready")
  { re: /◇\s+Ready/i, status: "idle", attention: "none" },
];

/** Fallback idle — used only when no strong signal exists. */
const GEMINI_FALLBACK_IDLE: HintEntry[] = [
  // TUI input prompt — "Type your message" or "* Type your message"
  { re: /Type your message/i, status: "idle", attention: "none", signal: "fallbackIdle" },
  // TUI shortcuts hint — "? for shortcuts"
  { re: /\?\s+for shortcuts/i, status: "idle", attention: "none", signal: "fallbackIdle" },
];

/**
 * Scans the visible terminal buffer for the Gemini CLI's status
 * indicators and returns the match closest to the end of the buffer
 * (the most recent state).
 */
function findBestMatch(
  text: string,
  entries: readonly HintEntry[],
): { index: number; entry: HintEntry } | null {
  let best: { index: number; entry: HintEntry } | null = null;

  for (const entry of entries) {
    const globalRe = new RegExp(
      entry.re.source,
      entry.re.flags.includes("g") ? entry.re.flags : entry.re.flags + "g",
    );
    let last: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = globalRe.exec(text)) !== null) {
      last = m;
    }
    if (last && (best === null || last.index > best.index)) {
      best = { index: last.index, entry };
    }
  }

  return best;
}

export function detectGeminiTerminalStatus(text: string): TerminalStatusHint | null {
  // Two-tier priority:
  //   1. Strong signals — title-bar indicators, "(esc to cancel" working
  //      prompt, approval prompts, "◇ Ready".  Always authoritative.
  //   2. Fallback idle — "Type your message", "? for shortcuts".
  //      Used only when no strong signal exists.

  const strongBest = findBestMatch(text, GEMINI_STRONG);
  if (strongBest) {
    return { status: strongBest.entry.status, attention: strongBest.entry.attention };
  }

  const fallbackBest = findBestMatch(text, GEMINI_FALLBACK_IDLE);
  if (fallbackBest) {
    return { status: fallbackBest.entry.status, attention: fallbackBest.entry.attention };
  }

  return null;
}
