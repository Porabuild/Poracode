import { readTurnId } from "./canonicalMapping/readers";

const ACTIVE_TURN_MISMATCH = /expected active turn id\s+(\S+)\s+but found\s+(\S+)/iu;

function trimTurnIdToken(value: string): string {
  return value.replace(/[.,;:'")\]]+$/u, "");
}

export function isStaleCodexTurnCompletion(
  params: Record<string, unknown> | undefined,
  activeTurnId: string | undefined,
): boolean {
  const completedTurnId = readTurnId(params);
  return Boolean(completedTurnId && activeTurnId && completedTurnId !== activeTurnId);
}

export function parseCodexActiveTurnMismatch(
  error: unknown,
): { expected: string; found: string } | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = ACTIVE_TURN_MISMATCH.exec(message.trim());
  if (!match?.[1] || !match[2]) return undefined;
  return { expected: trimTurnIdToken(match[1]), found: trimTurnIdToken(match[2]) };
}

/**
 * Codex rejects `turn/interrupt` when the cached id is stale. The error names
 * both ids; retry with whichever one we did not just send.
 */
export function nextCodexInterruptTurnId(
  attemptedTurnId: string,
  error: unknown,
): string | undefined {
  const mismatch = parseCodexActiveTurnMismatch(error);
  if (!mismatch) return undefined;
  if (mismatch.expected && mismatch.expected !== attemptedTurnId) {
    return mismatch.expected;
  }
  if (mismatch.found && mismatch.found !== attemptedTurnId) {
    return mismatch.found;
  }
  return undefined;
}
