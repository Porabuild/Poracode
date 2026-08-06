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

/**
 * Kimi 0.34's cache-expiry dialog (v2 engine): after a long-idle session is
 * resumed — or a message is submitted after a long idle stretch — a modal
 * list asks whether to compact, start a new session, or continue as-is. It
 * is a real modal: keystrokes go to the dialog's list, not the composer, and
 * Enter picks the default "Compact and continue", so both the status
 * detector and the prompt gate must recognize it. Its footer ("Enter
 * select") deliberately does not match the generic "Enter to select" pattern
 * above. Strings verified against the released 0.34.0 bundle (dialog title
 * and body line).
 */
export const KIMI_CACHE_HINT_PATTERN = /Cache expired|This session has been idle for/i;

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
  // Same for the cache-expiry dialog: the thread is parked on a modal choice.
  {
    re: KIMI_CACHE_HINT_PATTERN,
    status: "needs_reply" as const,
    attention: "needs_reply" as const,
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
