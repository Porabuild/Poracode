import { findBestHint, type HintEntry, type TerminalStatusHint } from "../base";

interface CommandCodeHintEntry extends HintEntry {
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
}

// Best-effort heuristics for the `command-code` TUI. These mirror the shape of
// other terminal providers and should be tuned against a live install — the
// CLI was not available to capture exact output when this was written.
const COMMANDCODE_STRONG: CommandCodeHintEntry[] = [
  { re: /Enter to select|Choose an option/i, status: "needs_reply", attention: "needs_reply" },
  {
    re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Do you want to proceed|Continue\?|Approve\??|Trust this folder/i,
    status: "needs_approval",
    attention: "needs_approval",
  },
  { re: /^[^\S\r\n]*[⣷⣯⣟⡿⢿⣻⣽⣾](?:\s|$)/m, status: "working", attention: "working" },
  { re: /\besc to (?:cancel|interrupt)\b/i, status: "working", attention: "working" },
  { re: /✦\s+Working|⚙\s+Working|Thinking…|Generating…/i, status: "working", attention: "working" },
];

const COMMANDCODE_FALLBACK_IDLE: CommandCodeHintEntry[] = [
  { re: /^\s*>\s*$/m, status: "idle", attention: "none" },
  { re: /\?\s+for shortcuts|\/\s+for commands/i, status: "idle", attention: "none" },
];

export function detectCommandCodeTerminalStatus(text: string): TerminalStatusHint | null {
  const tail = text.slice(-1200);

  const strong = findBestHint(tail, COMMANDCODE_STRONG);
  if (strong) {
    return { status: strong.status, attention: strong.attention, corroborated: true };
  }

  const fallback = findBestHint(tail, COMMANDCODE_FALLBACK_IDLE);
  if (!fallback) return null;
  const bothPresent = COMMANDCODE_FALLBACK_IDLE.every((entry) => entry.re.test(tail));
  return { status: fallback.status, attention: fallback.attention, corroborated: bothPresent };
}
