import type { PromptSegment } from "@/shared/contracts";
import type { SessionRuntime } from "../sessionTypes";

export function requireThreadMentionTools(
  session: SessionRuntime,
  segments: readonly PromptSegment[] | undefined,
): void {
  if (
    segments?.some((segment) => segment.kind === "thread") &&
    session.threadMentionToolsAvailable !== true
  ) {
    throw new Error(
      "Thread mentions require the Poracode read_thread tool, but it is unavailable for this session.",
    );
  }
}

/** True when the session backs a real terminal-presentation PTY (not GUI/structured-only). */
export function isTerminalPtySession(session: SessionRuntime): boolean {
  if (!session.pty) return false;
  const presentationMode =
    session.presentationMode ?? session.adapter.capabilities.presentationMode;
  return presentationMode === "terminal";
}
