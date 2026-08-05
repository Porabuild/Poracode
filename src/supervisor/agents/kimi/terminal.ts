import { detectTerminalStatusFromHints, type TerminalStatusHint } from "../base";

// Kimi's docs do not publish TUI status markers, so these heuristics stay
// conservative — only generic, high-confidence interactive/working/idle
// signals shared across CLI agents. Kimi emits no OSC, so there is no
// OSC-based signal to corroborate against.
/**
 * Kimi 0.33's first-launch workspace-trust dialog. Launches pre-write the
 * trust marker (kimiTrust.ts), so every consumer of this pattern is handling
 * the rare miss: the status detector surfaces it, and the prompt gate refuses
 * to type into it.
 */
export const KIMI_TRUST_PROMPT_PATTERN = /Trust this folder\?/i;

const KIMI_STRONG = [
  {
    re: /Enter to select|Choose an option/i,
    status: "needs_reply" as const,
    attention: "needs_reply" as const,
  },
  // Surface the trust dialog so the user can answer it instead of staring at
  // a hung thread.
  {
    re: KIMI_TRUST_PROMPT_PATTERN,
    status: "needs_reply" as const,
    attention: "needs_approval" as const,
  },
  {
    re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Do you want to proceed|Continue\?|Approve\??/i,
    status: "needs_approval" as const,
    attention: "needs_approval" as const,
  },
  {
    re: /\besc to interrupt\b|\besc to cancel\b/i,
    status: "working" as const,
    attention: "working" as const,
  },
  {
    re: /\b(?:thinking|working)\.{3}/i,
    status: "working" as const,
    attention: "working" as const,
  },
];

const KIMI_FALLBACK_IDLE = [
  {
    re: /\?\s+for shortcuts|\/\s+for commands/i,
    status: "idle" as const,
    attention: "none" as const,
  },
  {
    re: /\bcontext:\s*\d+(?:\.\d+)?%\s*\(/i,
    status: "idle" as const,
    attention: "none" as const,
  },
];

export function detectKimiTerminalStatus(text: string): TerminalStatusHint | null {
  return detectTerminalStatusFromHints(text, KIMI_STRONG, KIMI_FALLBACK_IDLE);
}
