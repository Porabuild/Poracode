const INVALID_SESSION_RE = /(?:Invalid session identifier|Error resuming session)/iu;

export function detectQoderInvalidSessionRef(output: string): boolean {
  return INVALID_SESSION_RE.test(output);
}
