import { detectTerminalStatusFromHints, type TerminalStatusHint } from "../base";

const ANTIGRAVITY_STRONG = [
  {
    re: /✋\s+Action Required/i,
    status: "needs_reply" as const,
    attention: "needs_reply" as const,
  },
  { re: /Enter to select/i, status: "needs_reply" as const, attention: "needs_reply" as const },
  {
    re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Do you want to proceed|Continue\?/i,
    status: "needs_approval" as const,
    attention: "needs_approval" as const,
  },
  {
    re: /^[^\S\r\n]*[⣷⣯⣟⡿⢿⣻⣽⣾](?:\s|$)/m,
    status: "working" as const,
    attention: "working" as const,
  },
  { re: /✦\s+Working|⚙\s+Working/i, status: "working" as const, attention: "working" as const },
  { re: /\(esc to cancel/i, status: "working" as const, attention: "working" as const },
  { re: /◇\s+Ready/i, status: "idle" as const, attention: "none" as const },
];

const ANTIGRAVITY_FALLBACK_IDLE = [
  { re: /^\s*>\s*$/m, status: "idle" as const, attention: "none" as const },
  { re: /\?\s+for shortcuts/i, status: "idle" as const, attention: "none" as const },
];

export function detectAntigravityTerminalStatus(text: string): TerminalStatusHint | null {
  return detectTerminalStatusFromHints(text, ANTIGRAVITY_STRONG, ANTIGRAVITY_FALLBACK_IDLE);
}
