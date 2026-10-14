export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Normalizes an unknown caught value into a real Error without losing
 * identity: an Error passes through unchanged, anything else is wrapped with
 * its message. Use when a value will be stored and rethrown — the thrown
 * value is always an Error and the original reference is preserved.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(toErrorMessage(error));
}
