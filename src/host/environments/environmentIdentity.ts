import { randomUUID } from "node:crypto";

/**
 * Host-minted environment identity. The id is a UUIDv4 that never derives from
 * a target, label, or legacy connection id, so the same target may legitimately
 * have separate environments and restarts preserve identity.
 */
export function mintEnvironmentId(mint: () => string = randomUUID): string {
  return mint();
}

/** Revisions are monotonic per environment; every committed mutation advances exactly one. */
export function nextEnvironmentRevision(currentRevision: number): number {
  return currentRevision + 1;
}
