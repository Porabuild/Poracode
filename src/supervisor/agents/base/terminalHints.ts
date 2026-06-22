import type { ThreadConfig } from "@/shared/contracts";
import type { OscNotification, OscShellEvent, OscTitle } from "@/shared/osc";
import type {
  FindBestHintOptions,
  HintEntry,
  SyncConfigFromTerminalStateInput,
  TerminalStatusHint,
} from "./types";

const OSC_NOTIFICATION_PAYLOAD_KEYS = [
  "event",
  "type",
  "kind",
  "name",
  "notification",
  "id",
] as const;

/**
 * Concatenate the searchable text of an OSC notification, lowercased. Pulls
 * the title, body, the JSON-stringified payload (catches keywords in nested
 * fields like `{ details: { reason: "permission_requested" } }`), and any
 * string fields under common payload keys. Used by codex/opencode for
 * keyword scans like `text.includes("approval")`.
 */
export function getOscNotificationText(notification: OscNotification): string {
  const parts: string[] = [];
  if (notification.title) parts.push(notification.title);
  if (notification.body) parts.push(notification.body);
  const p = notification.payload;
  if (p && typeof p === "object") {
    parts.push(JSON.stringify(p));
    for (const key of OSC_NOTIFICATION_PAYLOAD_KEYS) {
      const value = (p as Record<string, unknown>)[key];
      if (typeof value === "string") parts.push(value);
    }
  }
  return parts.length === 0 ? "" : parts.join("\n").toLowerCase();
}

const ITERM2_PROGRESS_RE = /^4;(\d+)/;

export function iterm2ProgressOscHint(notification: OscNotification): TerminalStatusHint | null {
  if (notification.code !== 9) return null;
  const match = ITERM2_PROGRESS_RE.exec(notification.body);
  if (!match) return null;
  const state = Number(match[1]);
  if (state === 0) return { status: "idle", attention: "none", corroborated: true };
  if (state === 1 || state === 3) {
    return { status: "working", attention: "working", corroborated: true };
  }
  return null;
}

const BRAILLE_OSC_TITLE_PREFIX_RE = /^[⠀-⣿]/;

export function brailleSpinnerOscTitleHint(title: OscTitle): TerminalStatusHint | null {
  if (!BRAILLE_OSC_TITLE_PREFIX_RE.test(title.text)) return null;
  return { status: "working", attention: "working", corroborated: true };
}

export function shellExecOscHint(event: OscShellEvent): TerminalStatusHint | null {
  if (event.kind === "command-pre-exec") {
    return { status: "working", attention: "working", corroborated: true };
  }
  if (event.kind === "command-finished") {
    return { status: "idle", attention: "none", corroborated: true };
  }
  return null;
}

/**
 * Sweep a list of hint entries across the text and return the entry whose
 * last match has the highest index, i.e. the pattern closest to the tail.
 */
export function findBestHint<T extends HintEntry>(
  text: string,
  entries: readonly T[],
  opts?: FindBestHintOptions,
): T | null {
  const weakWindow = opts?.weakTailWindow;
  const weakStart =
    weakWindow !== undefined && text.length > weakWindow ? text.length - weakWindow : 0;

  let best: { index: number; entry: T } | null = null;
  for (const entry of entries) {
    const globalRe = new RegExp(
      entry.re.source,
      entry.re.flags.includes("g") ? entry.re.flags : entry.re.flags + "g",
    );
    let last: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = globalRe.exec(text)) !== null) {
      if (entry.strong || match.index >= weakStart) {
        last = match;
      }
    }
    if (last && (best === null || last.index > best.index)) {
      best = { index: last.index, entry };
    }
  }
  return best?.entry ?? null;
}

interface StatusHintEntry extends HintEntry {
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
}

/**
 * Detect terminal status from strong + fallback-idle hint entries. Shared by
 * agents whose TUI uses the same pattern: try strong hints first, then
 * fallback-idle hints with corroboration when all fallback entries match.
 */
export function detectTerminalStatusFromHints(
  text: string,
  strongHints: readonly StatusHintEntry[],
  fallbackIdleHints: readonly StatusHintEntry[],
): TerminalStatusHint | null {
  const tail = text.slice(-1200);

  const strong = findBestHint(tail, strongHints);
  if (strong) {
    return { status: strong.status, attention: strong.attention, corroborated: true };
  }

  const fallback = findBestHint(tail, fallbackIdleHints);
  if (!fallback) return null;
  const bothPresent = fallbackIdleHints.every((entry) => entry.re.test(tail));
  return { status: fallback.status, attention: fallback.attention, corroborated: bothPresent };
}

export function applyTerminalHintToConfig(
  input: SyncConfigFromTerminalStateInput,
): ThreadConfig | undefined {
  let next: ThreadConfig | undefined;

  if (input.hint.planMode && input.config.mode !== "plan") {
    next = { ...(next ?? input.config), mode: "plan" };
  } else if (
    !input.hint.planMode &&
    input.config.mode === "plan" &&
    (input.hint.status === "idle" ||
      (input.hint.status === "working" &&
        (input.previousStatus === "needs_reply" || input.previousStatus === "needs_approval")))
  ) {
    next = { ...(next ?? input.config), mode: undefined };
  }

  if (input.hint.approvalPolicy !== undefined) {
    const currentPolicy = input.config.approvalPolicy ?? "default";
    if (input.hint.approvalPolicy !== currentPolicy) {
      next = { ...(next ?? input.config), approvalPolicy: input.hint.approvalPolicy };
    }
  }

  if (input.hint.model !== undefined && input.hint.model !== input.config.model) {
    next = { ...(next ?? input.config), model: input.hint.model };
  }

  if (input.hint.effort !== undefined && input.hint.effort !== input.config.effort) {
    next = { ...(next ?? input.config), effort: input.hint.effort };
  }

  return next;
}
