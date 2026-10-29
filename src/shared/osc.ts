/**
 * OSC (Operating System Command) escape sequence parser.
 *
 * Extracts structured notifications from raw PTY data before ANSI stripping.
 * Agents (or their hook scripts) can emit these standard terminal escape
 * sequences to signal state changes without relying on fragile TUI output parsing.
 *
 * Supported protocols:
 * - OSC 0/1/2 — window/icon title: \x1b]0;<text>\x07 (also 1, 2 same shape)
 * - OSC 9   — simple notification: \x1b]9;<text>\x07
 * - OSC 777 — RXVT notify:         \x1b]777;notify;<title>;<body>\x07
 * - OSC 99  — Kitty notify:         \x1b]99;...;p=<key>:<value>\x1b\\
 * - OSC 133 — FinalTerm/iTerm2 shell integration: \x1b]133;<marker>[;<args>]\x07
 * - OSC 633 — VS Code shell integration: \x1b]633;<marker>[;<args>]\x07
 * - OSC 7501 — Program Status Protocol: \x1b]7501;<key>=<value>[:...]\x1b\\
 */

export interface OscNotification {
  /** Which OSC code was used. */
  code: 9 | 777 | 99;
  /** Notification title (empty string for OSC 9). */
  title: string;
  /** Notification body text. */
  body: string;
  /** Parsed JSON body when the body is valid JSON, undefined otherwise. */
  payload: Record<string, unknown> | undefined;
}

export interface OscTitle {
  /** 0 = icon + window title, 1 = icon, 2 = window title. */
  code: 0 | 1 | 2;
  /** The title text (everything after `<code>;` up to the terminator). */
  text: string;
}

/**
 * Shell integration event. Two protocols share the same A/B/C/D marker
 * vocabulary:
 *
 * - OSC 633 — VS Code shell integration. Adds E (command-line) + P (property).
 *   Spec: https://code.visualstudio.com/docs/terminal/shell-integration
 * - OSC 133 — FinalTerm / iTerm2 shell integration. A/B/C/D only. Used by
 *   GitHub Copilot CLI to mark agent execution boundaries (`;C` start of
 *   turn, `;D` end of turn). Spec:
 *   https://iterm2.com/documentation-shell-integration.html
 *
 * Markers: A=prompt-start, B=prompt-end, C=command-pre-exec, D=command-finished.
 */
export type OscShellEvent =
  | { code: 133 | 633; kind: "prompt-start" }
  | { code: 133 | 633; kind: "prompt-end" }
  | { code: 133 | 633; kind: "command-pre-exec" }
  | { code: 133 | 633; kind: "command-finished"; exitCode: number | undefined }
  | { code: 633; kind: "command-line"; command: string; nonce: string | undefined }
  | { code: 633; kind: "property"; key: string; value: string };

export interface OscExtractionResult {
  /** The raw data with all extracted OSC sequences removed. */
  cleaned: string;
  /** Extracted notifications (empty array if none found). */
  notifications: OscNotification[];
  /** Extracted window/icon titles (empty array if none found). */
  titles: OscTitle[];
  /** Extracted OSC 633 shell-integration events (empty array if none found). */
  shell: OscShellEvent[];
  /** Extracted OSC 7501 program-status updates (empty array if none found). */
  programStatus: OscProgramStatus[];
}

/** Program state reported by an OSC 7501 status update. */
export type OscProgramState = "idle" | "working" | "blocked" | "done" | "error" | "clear";

export interface OscProgramStatus {
  /** OSC code; always 7501. */
  code: 7501;
  /** Declared program state. */
  state: OscProgramState;
  /** Blocked reason (`permission` / `question`); only meaningful for `blocked`. */
  kind: string | undefined;
  /** Emitting application identifier, if provided. */
  app: string | undefined;
}

// Combined regex to extract notifications (9 / 777 / 99), titles (0 / 1 / 2),
// shell-integration events (133 / 633), and program status (7501) in a single
// pass. Leftmost alternative wins; `9;` vs `99;` / `777;` don't conflict (they
// diverge after the first digit) and neither does `(0|1|2);` with anything else
// (single digit followed by `;`, so `133`/`1337`/`11` all skip it). `133;` and
// `633;` don't share a leading digit with any other handled code, and `7501;`
// is appended last so it cannot shadow their group numbers.
const OSC_EVENT_RE = new RegExp(
  // eslint-disable-next-line no-control-regex
  `\\x1b\\](?:` +
    `9;([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 9: group 1 = text
    `|` +
    `777;notify;([^;\\x07\\x1b]*);([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 777: group 2 = title, group 3 = body
    `|` +
    `99;([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 99: group 4 = params
    `|` +
    `(0|1|2);([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 0/1/2: group 5 = code, group 6 = title text
    `|` +
    `633;([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 633: group 7 = body
    `|` +
    `133;([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 133: group 8 = body
    `|` +
    `7501;([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 7501: group 9 = body
    `)`,
  "g",
);

function tryParseJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON — skip.
  }
  return undefined;
}

/**
 * Parse a Kitty OSC 99 parameter string into key-value pairs.
 * Format: `i=<id>;e=<end>;d=<done>;p=<type>:<value>`
 * The `p=` parameter contains the payload (title, subtitle, or body).
 */
function parseKittyParams(raw: string): { title: string; body: string } | null {
  const parts = raw.split(";");
  let payloadType = "";
  let payloadValue = "";

  for (const part of parts) {
    if (part.startsWith("p=")) {
      const colonIdx = part.indexOf(":", 2);
      if (colonIdx >= 0) {
        payloadType = part.slice(2, colonIdx);
        payloadValue = part.slice(colonIdx + 1);
      } else {
        payloadValue = part.slice(2);
      }
    }
  }

  if (!payloadValue) {
    return null;
  }

  // Kitty sends title/body/subtitle as separate OSC 99 sequences.
  // We expose whatever we got in this single sequence.
  if (payloadType === "title") {
    return { title: payloadValue, body: "" };
  }
  if (payloadType === "body") {
    return { title: "", body: payloadValue };
  }
  // subtitle or untyped — treat as body
  return { title: "", body: payloadValue };
}

/**
 * Decode a VS Code OSC 633 argument. Per spec, arguments are escaped with:
 * - `\\` → literal backslash
 * - `\xHH` → byte with hex code HH
 * Unrecognized escape sequences pass through as-is.
 */
function decodeOsc633Argument(s: string): string {
  if (!s.includes("\\")) return s;
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\" && i + 1 < s.length) {
      const next = s[i + 1]!;
      if (next === "\\") {
        out += "\\";
        i += 2;
        continue;
      }
      if (next === "x" && i + 3 < s.length) {
        const hex = s.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 4;
          continue;
        }
      }
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Parse the body of an OSC 133 sequence (everything after `133;`) into a
 * structured event. OSC 133 supports A/B/C/D markers only — E/P are 633-only.
 */
function parseOsc133Body(body: string): OscShellEvent | null {
  if (body.length === 0) return null;
  const semi = body.indexOf(";");
  const marker = semi < 0 ? body : body.slice(0, semi);
  const rest = semi < 0 ? "" : body.slice(semi + 1);
  if (marker.length !== 1) return null;
  switch (marker) {
    case "A":
      return { code: 133, kind: "prompt-start" };
    case "B":
      return { code: 133, kind: "prompt-end" };
    case "C":
      return { code: 133, kind: "command-pre-exec" };
    case "D": {
      if (rest.length === 0) {
        return { code: 133, kind: "command-finished", exitCode: undefined };
      }
      const code = Number.parseInt(rest, 10);
      return {
        code: 133,
        kind: "command-finished",
        exitCode: Number.isNaN(code) ? undefined : code,
      };
    }
    default:
      return null;
  }
}

/**
 * Parse the body of an OSC 633 sequence (everything after `633;`) into a
 * structured event. Returns null for unknown markers and malformed bodies.
 */
function parseOsc633Body(body: string): OscShellEvent | null {
  if (body.length === 0) return null;
  const semi = body.indexOf(";");
  const marker = semi < 0 ? body : body.slice(0, semi);
  const rest = semi < 0 ? "" : body.slice(semi + 1);
  if (marker.length !== 1) return null;
  switch (marker) {
    case "A":
      return { code: 633, kind: "prompt-start" };
    case "B":
      return { code: 633, kind: "prompt-end" };
    case "C":
      return { code: 633, kind: "command-pre-exec" };
    case "D": {
      if (rest.length === 0) {
        return { code: 633, kind: "command-finished", exitCode: undefined };
      }
      const code = Number.parseInt(rest, 10);
      return {
        code: 633,
        kind: "command-finished",
        exitCode: Number.isNaN(code) ? undefined : code,
      };
    }
    case "E": {
      const sepIdx = rest.indexOf(";");
      const cmdRaw = sepIdx < 0 ? rest : rest.slice(0, sepIdx);
      const nonceRaw = sepIdx < 0 ? "" : rest.slice(sepIdx + 1);
      return {
        code: 633,
        kind: "command-line",
        command: decodeOsc633Argument(cmdRaw),
        nonce: nonceRaw === "" ? undefined : nonceRaw,
      };
    }
    case "P": {
      const eq = rest.indexOf("=");
      if (eq <= 0) return null;
      return {
        code: 633,
        kind: "property",
        key: rest.slice(0, eq),
        value: decodeOsc633Argument(rest.slice(eq + 1)),
      };
    }
    default:
      return null;
  }
}

const OSC_7501_STATES: ReadonlySet<string> = new Set<OscProgramState>([
  "idle",
  "working",
  "blocked",
  "done",
  "error",
  "clear",
]);

/**
 * Parse the body of an OSC 7501 Program Status sequence (everything after
 * `7501;`) into a structured event. The body is `:`-separated `key=value`
 * fields, each split at its first `=`; unknown keys are ignored. Returns null
 * when `state` is missing or unrecognized. Spec:
 * https://www.superlogical.com/rex/docs/build/program-status
 */
export function parseOsc7501Body(body: string): OscProgramStatus | null {
  const fields = new Map<string, string>();
  for (const field of body.split(":")) {
    const eq = field.indexOf("=");
    if (eq <= 0) continue;
    fields.set(field.slice(0, eq), field.slice(eq + 1));
  }

  const state = fields.get("state");
  if (state === undefined || !OSC_7501_STATES.has(state)) return null;
  const kind = fields.get("kind");
  const app = fields.get("app");
  return {
    code: 7501,
    state: state as OscProgramState,
    kind: kind === "" ? undefined : kind,
    app: app === "" ? undefined : app,
  };
}

/**
 * Extract OSC notification and title sequences from raw PTY data.
 *
 * Returns the cleaned data (with extracted sequences removed) and
 * arrays of parsed notifications and titles. The cleaned data can then be
 * passed to `stripAnsiPreservingLayout` for normal status detection.
 */
export function extractOscEvents(data: string): OscExtractionResult {
  const notifications: OscNotification[] = [];
  const titles: OscTitle[] = [];
  const shell: OscShellEvent[] = [];
  const programStatus: OscProgramStatus[] = [];

  // Reset lastIndex for global regex reuse across calls
  OSC_EVENT_RE.lastIndex = 0;

  const cleaned = data.replace(OSC_EVENT_RE, (_match, g1, g2, g3, g4, g5, g6, g7, g8, g9) => {
    if (g1 !== undefined) {
      // OSC 9 — simple notification
      const body = g1 as string;
      notifications.push({
        code: 9,
        title: "",
        body,
        payload: tryParseJson(body),
      });
    } else if (g2 !== undefined) {
      // OSC 777 — RXVT notify
      const title = g2 as string;
      const body = (g3 as string | undefined) ?? "";
      notifications.push({
        code: 777,
        title,
        body,
        payload: tryParseJson(body),
      });
    } else if (g4 !== undefined) {
      // OSC 99 — Kitty notification
      const parsed = parseKittyParams(g4 as string);
      if (parsed) {
        notifications.push({
          code: 99,
          title: parsed.title,
          body: parsed.body,
          payload: tryParseJson(parsed.body),
        });
      }
    } else if (g5 !== undefined) {
      // OSC 0/1/2 — window/icon title
      const code = Number(g5) as 0 | 1 | 2;
      const text = (g6 as string | undefined) ?? "";
      titles.push({ code, text });
    } else if (g7 !== undefined) {
      // OSC 633 — VS Code shell integration
      const event = parseOsc633Body(g7 as string);
      if (event) shell.push(event);
    } else if (g8 !== undefined) {
      // OSC 133 — FinalTerm/iTerm2 shell integration (Copilot CLI uses this)
      const event = parseOsc133Body(g8 as string);
      if (event) shell.push(event);
    } else if (g9 !== undefined) {
      // OSC 7501 — Program Status Protocol
      const status = parseOsc7501Body(g9 as string);
      if (status) programStatus.push(status);
    }
    // Remove the sequence from the output
    return "";
  });

  return { cleaned, notifications, titles, shell, programStatus };
}

/** Defensive cap so a pathological PTY line cannot grow memory without bound. */
const MAX_PTY_OSC_CARRY = 64 * 1024;

/**
 * If `cleaned` ends with a handled OSC (0 / 1 / 2 / 9 / 777 / 99 / 133 / 633 /
 * 7501) that has no ST/BEL terminator yet, split it off for the next PTY read —
 * sequences are often split across `node-pty` chunks (notably on Windows /
 * ConPTY).
 */
function takeTrailingIncompleteOsc(s: string): { head: string; carry: string } {
  const last = s.lastIndexOf("\x1b]");
  if (last < 0) return { head: s, carry: "" };
  const tail = s.slice(last);
  const afterIntroducer = tail.slice(2); // drop the leading ESC + ']'
  if (!/^(?:0;|1;|2;|9;|777;notify;|99;|133;|633;|7501;)/.test(afterIntroducer)) {
    return { head: s, carry: "" };
  }
  if (tail.includes("\x07") || tail.includes("\x1b\\")) return { head: s, carry: "" };
  return { head: s.slice(0, last), carry: tail };
}

/**
 * Reassemble split OSC sequences across multiple PTY reads, then extract the
 * same event lists as {@link extractOscEvents}. Pass the previous return's
 * `carryOut` as the next `carryIn`.
 */
export function extractOscEventsFromPtyStream(
  carryIn: string | undefined,
  chunk: string,
): {
  carryOut: string;
  notifications: OscNotification[];
  titles: OscTitle[];
  shell: OscShellEvent[];
  programStatus: OscProgramStatus[];
  cleaned: string;
} {
  let carry = carryIn ?? "";
  if (carry.length > MAX_PTY_OSC_CARRY) {
    carry = "";
  }
  const combined = carry + chunk;
  const { cleaned, notifications, titles, shell, programStatus } = extractOscEvents(combined);
  const { head, carry: tailCarry } = takeTrailingIncompleteOsc(cleaned);
  return { carryOut: tailCarry, notifications, titles, shell, programStatus, cleaned: head };
}
