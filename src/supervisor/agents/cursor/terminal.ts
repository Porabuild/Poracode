import { detectTerminalStatusFromHints, type TerminalStatusHint } from "../base";

export const CURSOR_ATTENTION_RE = /Run this command\?|Suggested Plan|Waiting for approval/i;
export const CURSOR_WORKING_RE = /ctrl\+c to stop|\b(?:Generating|Reading|Globbing|Thinking)\b/i;
export const CURSOR_IDLE_RE = /Add a follow-up/i;

const CURSOR_HINTS = [
  {
    re: CURSOR_ATTENTION_RE,
    status: "needs_approval" as const,
    attention: "needs_approval" as const,
  },
  { re: CURSOR_WORKING_RE, status: "working" as const, attention: "working" as const },
  { re: CURSOR_IDLE_RE, status: "idle" as const, attention: "none" as const },
];

export function detectCursorTerminalStatus(text: string): TerminalStatusHint | null {
  // Cursor's three hints are all equal-priority (highest-index-wins), so they
  // all ride as strong hints with no fallback — reusing the shared
  // findBestHint sweep the other terminal detectors consume.
  return detectTerminalStatusFromHints(text, CURSOR_HINTS, []);
}
