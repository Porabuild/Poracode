import type { TerminalStatusHint } from "../base";

type HintEntry = {
  re: RegExp;
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
};

// Gemini's OSC window title carries exactly one status marker, so the first
// matching entry wins — highest priority first.
const GEMINI_OSC_TITLE_HINTS: HintEntry[] = [
  { re: /✋\s+Action Required/i, status: "needs_reply", attention: "needs_reply" },
  { re: /✦\s+Working|⚙\s+Working/i, status: "working", attention: "working" },
  { re: /◇\s+Ready/i, status: "idle", attention: "none" },
];

export function detectGeminiOscTitleStatus(text: string): TerminalStatusHint | null {
  const title = text.trim();
  for (const hint of GEMINI_OSC_TITLE_HINTS) {
    if (hint.re.test(title)) {
      return { status: hint.status, attention: hint.attention, corroborated: true };
    }
  }
  return null;
}
