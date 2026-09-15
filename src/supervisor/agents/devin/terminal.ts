import { detectTerminalStatusFromHints } from "../base";

export function detectDevinTerminalStatus(text: string) {
  return detectTerminalStatusFromHints(
    text,
    [
      {
        re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Approve\?/i,
        status: "needs_approval",
        attention: "needs_approval",
      },
      {
        re: /esc (?:again |twice )?to (?:interrupt|cancel)|(?:thinking|working)\.{3}/i,
        status: "working",
        attention: "working",
      },
    ],
    [
      {
        re: /\?\s+for shortcuts|\/\s+for commands|Ask Devin to build features, fix bugs, or work on your code|Alt\+Enter for multiline prompts|Use \/help to see all available slash commands/i,
        status: "idle",
        attention: "none",
      },
    ],
  );
}
