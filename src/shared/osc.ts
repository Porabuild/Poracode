/**
 * OSC (Operating System Command) escape sequence parser.
 *
 * Extracts structured notifications from raw PTY data before ANSI stripping.
 * Agents (or their hook scripts) can emit these standard terminal escape
 * sequences to signal state changes without relying on fragile TUI output parsing.
 *
 * Supported protocols:
 * - OSC 9   — simple notification: \x1b]9;<text>\x07
 * - OSC 777 — RXVT notify:         \x1b]777;notify;<title>;<body>\x07
 * - OSC 99  — Kitty notify:         \x1b]99;...;p=<key>:<value>\x1b\\
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

export interface OscExtractionResult {
  /** The raw data with OSC notification sequences removed. */
  cleaned: string;
  /** Extracted notifications (empty array if none found). */
  notifications: OscNotification[];
}

// OSC 9: \x1b]9;<text>ST
// OSC 777: \x1b]777;notify;<title>;<body>ST
// OSC 99: \x1b]99;<params>ST  (Kitty notification protocol)
//
// Combined regex to extract all three in a single pass.
// Each branch is a named group for easy identification.
const OSC_NOTIFY_RE = new RegExp(
  // eslint-disable-next-line no-control-regex
  `\\x1b\\](?:` +
    `9;([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 9: group 1 = text
    `|` +
    `777;notify;([^;\\x07\\x1b]*);([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 777: group 2 = title, group 3 = body
    `|` +
    `99;([^\\x07\\x1b]*)(?:\\x07|\\x1b\\\\)` + // OSC 99: group 4 = params
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
 * Extract OSC notification sequences from raw PTY data.
 *
 * Returns the cleaned data (with notification sequences removed) and
 * an array of parsed notifications. The cleaned data can then be passed
 * to `stripAnsiPreservingLayout` for normal status detection.
 */
export function extractOscNotifications(data: string): OscExtractionResult {
  const notifications: OscNotification[] = [];

  // Reset lastIndex for global regex reuse across calls
  OSC_NOTIFY_RE.lastIndex = 0;

  const cleaned = data.replace(OSC_NOTIFY_RE, (_match, g1, g2, g3, g4) => {
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
    }
    // Remove the sequence from the output
    return "";
  });

  return { cleaned, notifications };
}
