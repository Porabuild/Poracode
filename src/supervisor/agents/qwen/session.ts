const INVALID_SESSION_RE = /(?:No session found with ID|Failed to resume session)/iu;

export function detectQwenInvalidSessionRef(output: string): boolean {
  return INVALID_SESSION_RE.test(output);
}
