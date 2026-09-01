/**
 * Single source of truth for the text an assistant message *displays*. Every
 * reader of that text — the chat renderer, the timeline visibility filter,
 * find-in-chat, and transcript exports (handoff, experiment) — must derive it
 * here, so what is searched and exported always matches what is on screen.
 *
 * Selection rule: the live stream wins while the item is in flight and for
 * stream-first providers after completion. A completed payload overrides the
 * stream only when the provider marked it `displayAuthoritative` (see
 * `messageItemPayloadSchema`) — including an intentionally empty text block,
 * which suppresses the streamed text entirely. Items persisted before the
 * flag existed carry none and keep the stream, the pre-flag behaviour.
 */

/**
 * Structural subset read by the helpers. Satisfied by both the renderer's
 * `RuntimeChatItem` and the persisted `PersistedRuntimeItem`.
 */
export interface AssistantTextSource {
  state: "started" | "updated" | "completed";
  payload?: unknown;
  streams: { assistant_text?: string };
}

interface AssistantTextPayload {
  /** Text-block contents in payload order, blank ("") blocks included. */
  texts: string[];
  authoritative: boolean;
}

/**
 * Loose read of a message payload's text blocks; null when it has none. A
 * payload without text blocks can never be authoritative — a producer
 * signalling suppression must emit an explicit empty text block; otherwise
 * readers fall back to the stream.
 */
function readAssistantTextPayload(payload: unknown): AssistantTextPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const record = block as { kind?: unknown; text?: unknown };
    if (record.kind === "text" && typeof record.text === "string") texts.push(record.text);
  }
  if (texts.length === 0) return null;
  const authoritative =
    (payload as { displayAuthoritative?: unknown }).displayAuthoritative === true;
  return { texts, authoritative };
}

type AssistantTextSelection =
  | { source: "stream"; stream: string }
  | { source: "payload"; texts: string[]; authoritative: boolean };

function selectAssistantText(item: AssistantTextSource): AssistantTextSelection {
  const stream = item.streams.assistant_text ?? "";
  const payload = readAssistantTextPayload(item.payload);
  if (item.state === "completed" && payload?.authoritative) {
    return { source: "payload", texts: payload.texts, authoritative: true };
  }
  if (stream.length > 0) return { source: "stream", stream };
  return payload
    ? { source: "payload", texts: payload.texts, authoritative: false }
    : { source: "stream", stream: "" };
}

const NON_WHITESPACE = /\S/;

function joinedPayloadText(texts: string[], authoritative: boolean): string {
  const text = texts.filter(Boolean).join("\n");
  // An authoritative payload with no visible character is a suppression: the
  // row hides (hasVisibleAssistantText is false), so readers that bypass the
  // visibility filter — the transcript exports — must see "" too, not a
  // whitespace remnant that formats into a vacuous "Assistant:" entry.
  return authoritative && !NON_WHITESPACE.test(text) ? "" : text;
}

/** The text this assistant message displays (may be "" for suppressed output). */
export function assistantDisplayText(item: AssistantTextSource): string {
  const selection = selectAssistantText(item);
  if (selection.source === "stream") return selection.stream;
  return joinedPayloadText(selection.texts, selection.authoritative);
}

/**
 * The display text of a payload marked `displayAuthoritative`, or null when
 * the payload carries no such marker (or no text blocks). For consumers that
 * see the payload alone — without the owning item — e.g. reconciling an
 * accumulated stream buffer against an authoritative item.updated event.
 */
export function authoritativeAssistantText(payload: unknown): string | null {
  const parsed = readAssistantTextPayload(payload);
  if (!parsed?.authoritative) return null;
  return joinedPayloadText(parsed.texts, true);
}

/**
 * Whether the display text has a non-whitespace character. Answers without
 * joining or trimming so per-item visibility passes over a whole thread do
 * not copy message-sized strings (see `isVisibleRuntimeItem`).
 */
export function hasVisibleAssistantText(item: AssistantTextSource): boolean {
  const selection = selectAssistantText(item);
  return selection.source === "stream"
    ? NON_WHITESPACE.test(selection.stream)
    : selection.texts.some((text) => NON_WHITESPACE.test(text));
}
