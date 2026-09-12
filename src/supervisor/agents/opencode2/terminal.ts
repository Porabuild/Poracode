import type { OscNotification } from "@/shared/osc";
import {
  brailleSpinnerOscTitleHint,
  findBestHint,
  getOscNotificationText,
  iterm2ProgressOscHint,
  type HintEntry,
  type TerminalStatusHint,
} from "../base";

export const opencode2OscTitleHint = brailleSpinnerOscTitleHint;

function notifyOscHint(notification: OscNotification): TerminalStatusHint | null {
  const text = getOscNotificationText(notification);
  if (text.includes("approval") || text.includes("permission")) {
    return { status: "needs_approval", attention: "needs_approval", corroborated: true };
  }
  return null;
}

export function opencode2OscHint(notification: OscNotification): TerminalStatusHint | null {
  return iterm2ProgressOscHint(notification) ?? notifyOscHint(notification);
}

interface OpenCode2HintEntry extends HintEntry {
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
}

// L2 heuristics only: OpenCode 2 has no L1 hook plugin yet (the V2 plugin API
// is still beta), so terminal status is derived from screen text and OSC
// alone. Validated against the live 0.0.0-beta-19500 TUI: while a turn runs
// the status bar shows "esc interrupt" (no "to" — unlike the V1 TUI's
// "esc to interrupt"), and the idle footer keeps the "ctrl+p commands"
// keybind cluster. The approval-prompt patterns are still unverified against
// a live V2 prompt (the TUI never asked in observation) and follow the V1
// wording.
const OPENCODE2_HINTS: OpenCode2HintEntry[] = [
  {
    re: /\[y\/n\]|\(y\/N\)|\(Y\/n\)|Allow\s+.*\?|Approve\s+.*\?/i,
    status: "needs_approval",
    attention: "needs_approval",
    strong: true,
  },
  {
    re: /esc\s*(?:to\s+)?(?:interrupt|cancel|stop)/i,
    status: "working",
    attention: "working",
    strong: true,
  },
  {
    // Completion summary printed by current betas; sidebar repaint can follow it.
    re: /·\s*\d+(?:\.\d+)?(?:ms|s|m)\s*·\s*\d+(?:\.\d+)?\s*tok\/s/i,
    status: "idle",
    attention: "none",
    strong: true,
  },
  // Idle: keybind footer is only painted when the TUI accepts input. The two
  // glyph clusters render side-by-side without a separator (`tab agentsctrl+p
  // commands`) because of cursor positioning, so match each independently and
  // skip the trailing word boundary — `agents` butts directly against `ctrl`
  // and `commands` against the cursor reset, so `\b` would refuse to match.
  // The latest matching cue wins when a repaint includes multiple states.
  {
    re: /\btab\s*agents|\bctrl\+p\s*commands/i,
    status: "idle",
    attention: "none",
    strong: true,
  },
  // Backstop for releases that still paint the placeholder text. Weak: counts
  // only when no strong cue is closer to the tail.
  { re: /Type a message|Type your message|Send a message/i, status: "idle", attention: "none" },
];

export function detectOpenCode2TerminalStatus(text: string): TerminalStatusHint | null {
  // The caller supplies only the latest stripped PTY chunk, not scrollback.
  // Keep the whole chunk: a sidebar redraw can follow the completed footer.
  const best = findBestHint(text, OPENCODE2_HINTS);
  if (!best) return null;
  return { status: best.status, attention: best.attention, corroborated: Boolean(best.strong) };
}
