import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { LOCKED_USE_AUDIT_FILE_NAME } from "./constants";

/**
 * One host-side audit record per unlock attempt and per session end. Only
 * timing, thread id, and outcome tokens: never window content, typed text, or
 * anything from the lock screen.
 */
export interface LockedUseAuditEntry {
  at: string;
  threadId: string;
  event: "begin" | "end";
  outcome: string;
  stage?: string;
  reason?: string;
}

export type LockedUseAuditWriter = (entry: LockedUseAuditEntry) => void;

/** Rotate once the log passes this size, keeping one previous file. */
const MAX_AUDIT_BYTES = 1024 * 1024;

/**
 * Appends JSONL to `<stateDir>/locked-use-audit.jsonl` (mode 0600). Writes are
 * serialized so lines never interleave; a failed write is reported and the
 * next one still runs, because auditing must not block relocking.
 */
export function createLockedUseAuditWriter(
  stateDir: string,
  onError: (error: unknown) => void = (error) =>
    console.warn("[poracode] locked computer use audit write failed:", error),
): LockedUseAuditWriter {
  const path = join(stateDir, LOCKED_USE_AUDIT_FILE_NAME);
  let queue: Promise<void> = Promise.resolve();
  return (entry) => {
    const line = `${JSON.stringify(entry)}\n`;
    queue = queue
      .then(async () => {
        await mkdir(stateDir, { recursive: true, mode: 0o700 });
        const size = await stat(path).then(
          (info) => info.size,
          () => 0,
        );
        if (size > MAX_AUDIT_BYTES) await rename(path, `${path}.1`);
        await appendFile(path, line, { encoding: "utf8", mode: 0o600 });
      })
      .catch(onError);
  };
}
