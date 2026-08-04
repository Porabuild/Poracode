import type { TerminalStatusHint } from "../base";

export function detectPiTerminalStatus(text: string): TerminalStatusHint | null {
  const tail = text.slice(-8_000);
  if (/\b(aborted|cancelled)\b/i.test(tail)) {
    return { status: "idle", attention: "none", corroborated: true };
  }
  if (/\b(error|failed)\b[^\n]*$/i.test(tail)) {
    return { status: "idle", attention: "none" };
  }
  if (/esc\s+to\s+(?:abort|cancel)|ctrl-c\s+to\s+(?:abort|cancel)/i.test(tail)) {
    return { status: "working", attention: "none" };
  }
  if (/\b(?:tokens?|cost)\b[^\n]*(?:\/|\||\$)[^\n]*$/i.test(tail)) {
    return { status: "idle", attention: "none" };
  }
  return null;
}
