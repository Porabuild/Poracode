import type { TerminalStatusHint } from "../base";

type HintEntry = {
  re: RegExp;
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
  signal?: "primary" | "fallbackIdle" | "weakWorking";
};

const GEMINI_HINTS: HintEntry[] = [
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
  // Active generation text indicators
  {
    re: /Generating(?:\.\.\.|…)|Thinking(?:\.\.\.|…)|Processing/i,
    status: "working",
    attention: "working",
  },
  // Braille spinner characters used by Gemini's TUI — marked weak because single
  // characters persist as stale data in the rolling buffer after screen redraws.
  { re: /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/, status: "working", attention: "working", signal: "weakWorking" },
  // Title bar: ready/idle indicator (◇ diamond + "Ready")
  { re: /◇\s+Ready/i, status: "idle", attention: "none" },
  // TUI input prompt — "Type your message" or "* Type your message"
  {
    re: /Type your message/i,
    status: "idle",
    attention: "none",
    signal: "fallbackIdle",
  },
  // TUI shortcuts hint — "? for shortcuts"
  {
    re: /\?\s+for shortcuts/i,
    status: "idle",
    attention: "none",
    signal: "fallbackIdle",
  },
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
  const primaryBest = findBestMatch(
    text,
    GEMINI_HINTS.filter((entry) => entry.signal !== "fallbackIdle"),
  );
  const fallbackBest = findBestMatch(
    text,
    GEMINI_HINTS.filter((entry) => entry.signal === "fallbackIdle"),
  );

  // If a fallbackIdle match appears AFTER a weak primary match, prefer it —
  // braille spinner characters persist as stale data in the rolling buffer
  // long after the screen redraws to idle.  Stronger working signals
  // (✦ Working, Thinking…, etc.) always take priority.
  const best =
    primaryBest &&
    fallbackBest &&
    fallbackBest.index > primaryBest.index &&
    primaryBest.entry.signal === "weakWorking"
      ? fallbackBest
      : (primaryBest ?? fallbackBest);

  if (!best) return null;

  return {
    status: best.entry.status,
    attention: best.entry.attention,
  };
}
