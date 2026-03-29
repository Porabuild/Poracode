import type { TerminalPrompt } from "../../../shared/contracts";
import type { TerminalStatusHint } from "../base";

type HintEntry = {
  re: RegExp;
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
  hasPrompt: boolean;
  signal?: "primary" | "fallbackIdle";
};

const GEMINI_HINTS: HintEntry[] = [
  // Title bar: action required — plan approval, tool approval, numbered selection
  { re: /✋\s+Action Required/, status: "needs_reply", attention: "needs_reply", hasPrompt: true },
  // Selection prompt footer (secondary, less reliable in stripped buffer)
  { re: /Enter to select/, status: "needs_reply", attention: "needs_reply", hasPrompt: true },
  // Approval / consent prompt — y/n style tool-call confirmation
  {
    re: /\[y\/n\]|\(y\/N\)|Allow\s+.*\?|Do you want to proceed/i,
    status: "needs_approval",
    attention: "needs_approval",
    hasPrompt: false,
  },
  // Title bar: working indicator (✦ sparkle + "Working…")
  { re: /✦\s+Working/, status: "working", attention: "working", hasPrompt: false },
  // Active generation text indicators
  {
    re: /Generating\.\.\.|Thinking\.\.\./,
    status: "working",
    attention: "working",
    hasPrompt: false,
  },
  // Braille spinner characters used by Gemini's TUI
  { re: /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/, status: "working", attention: "working", hasPrompt: false },
  // Title bar: ready/idle indicator (◇ diamond + "Ready")
  { re: /◇\s+Ready/, status: "idle", attention: "none", hasPrompt: false },
  // TUI input prompt — "Type your message" or "* Type your message"
  {
    re: /Type your message/,
    status: "idle",
    attention: "none",
    hasPrompt: false,
    signal: "fallbackIdle",
  },
  // TUI shortcuts hint — "? for shortcuts"
  {
    re: /\?\s+for shortcuts/,
    status: "idle",
    attention: "none",
    hasPrompt: false,
    signal: "fallbackIdle",
  },
];

// Strip box-drawing and TUI decoration chars from a line
function cleanLine(raw: string): string {
  return raw.replace(/[│╭╮╰╯─▀▄●◆◇✦✋]/g, "").trim();
}

// Gemini numbered options: "1.  Label" (2+ spaces after dot).
// The ● bullet, box-drawing, and leading whitespace are stripped before matching.
const OPTION_RE = /^(\d+)\.\s{2,}(.+)/;
const TEXT_INPUT_RE = /enter a custom value|type your|type here/i;

function parseGeminiPrompt(text: string): TerminalPrompt | undefined {
  const lines = text.split("\n");

  // Track contiguous option groups — only the LAST group is returned
  // so stale options from earlier in the rolling buffer are discarded.
  let currentOptions: TerminalPrompt["options"] = [];
  let currentTitle = "";
  let lastOptions: TerminalPrompt["options"] = [];
  let lastTitle = "";

  for (let i = 0; i < lines.length; i++) {
    const line = cleanLine(lines[i]!);
    if (line.length === 0) continue;

    const optMatch = OPTION_RE.exec(line);
    if (optMatch) {
      const label = optMatch[2]!.trim();

      // Collect non-option continuation lines as description
      const descParts: string[] = [];
      while (i + 1 < lines.length) {
        const next = cleanLine(lines[i + 1]!);
        if (next.length === 0 || OPTION_RE.test(next)) break;
        descParts.push(next);
        i++;
      }
      const description = descParts.length > 0 ? descParts.join(" ") : undefined;

      currentOptions.push({
        key: optMatch[1]!,
        label,
        ...(description ? { description } : {}),
        ...(TEXT_INPUT_RE.test(label) ? { isTextInput: true } : {}),
      });
    } else {
      if (currentOptions.length > 0) {
        lastOptions = currentOptions;
        lastTitle = currentTitle;
        currentOptions = [];
      }
      currentTitle = line;
    }
  }

  const options = currentOptions.length > 0 ? currentOptions : lastOptions;
  const title = currentOptions.length > 0 ? currentTitle : lastTitle;

  if (options.length === 0) return undefined;
  return { title, options };
}

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
  const best =
    findBestMatch(
      text,
      GEMINI_HINTS.filter((entry) => entry.signal !== "fallbackIdle"),
    ) ??
    findBestMatch(
      text,
      GEMINI_HINTS.filter((entry) => entry.signal === "fallbackIdle"),
    );

  if (!best) return null;

  const hint: TerminalStatusHint = {
    status: best.entry.status,
    attention: best.entry.attention,
  };

  if (best.entry.hasPrompt) {
    hint.prompt = parseGeminiPrompt(text);
  }

  return hint;
}
