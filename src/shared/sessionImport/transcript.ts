/**
 * Shared shape every provider transcript parser produces. Import replays text
 * only: a chat pane of half-mapped tool rows reads worse than a clean
 * conversation, and the resumed provider session still has the real history.
 */

export interface ImportedMessage {
  role: "user" | "assistant";
  text: string;
  /** Timestamp recorded by the provider, when the line carries one. */
  at?: string;
}

export interface ImportedTranscript {
  providerSessionId?: string;
  cwd?: string;
  startedAt?: string;
  messages: ImportedMessage[];
}

/** One pasted file should not put megabytes into a single chat row. */
export const MAX_IMPORTED_MESSAGE_CHARS = 100_000;
export const TRUNCATION_MARKER = "\n\n[… truncated on import]";

export function capMessageText(text: string): string {
  if (text.length <= MAX_IMPORTED_MESSAGE_CHARS) return text;
  return text.slice(0, MAX_IMPORTED_MESSAGE_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}
