import { rotateServerLogFilesAsync } from "@/server/serverLogFile";
import { appendFile, mkdir } from "node:fs/promises";
import { appendFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RemoteAuditEventKind } from "@/shared/remote/auditKinds";

export type { RemoteAuditEventKind } from "@/shared/remote/auditKinds";

/**
 * Gate 6 item 4.7 (S7): the remote trust surface's structured audit log.
 *
 * One JSON object per line (JSONL), appended to a single file under the host
 * data root. Lines are self-describing (`v` + `at` + `kind` + optional
 * `sessionId`/`detail`) and never carry credentials: tokens, pairing
 * credentials, and ticket values are recorded only as their server-side ids or
 * scope names.
 *
 * V6 A.8: `record` enqueues; a single async writer drains the queue so audited
 * requests (including image reads) never `appendFileSync`/`statSync` on the
 * event loop. Rotation is byte-counted, seeded from the live file's size at
 * construction so a restart cannot silently write past the cap. `flush`/`stop`
 * drain the queue for SIGTERM and tests. The queue is bounded (drop-oldest);
 * drops are counted and re-audited on the next flush under their own
 * `audit_queue_dropped` kind.
 */

export const REMOTE_AUDIT_LOG_VERSION = 1 as const;
export const REMOTE_AUDIT_QUEUE_LIMIT = 20_000;

/**
 * Bounded string/number/boolean/null detail values only — the audit file is
 * line-oriented JSON and detail content must stay greppable. Callers must not
 * put credentials, raw tokens, or file content here.
 */
export type RemoteAuditEventDetail = Record<string, string | number | boolean | null>;

export interface RemoteAuditEvent {
  readonly v: typeof REMOTE_AUDIT_LOG_VERSION;
  /** ISO-8601 UTC timestamp of the moment the event was recorded. */
  readonly at: string;
  readonly kind: RemoteAuditEventKind;
  /** Authenticated remote session that performed the event, when one exists. */
  readonly sessionId?: string;
  readonly detail?: RemoteAuditEventDetail;
}

/** Where the remote server sends audit events. Injection point for tests. */
export interface RemoteAuditSink {
  record(event: RemoteAuditEvent): void;
  /**
   * Rotation seam. File-backed sinks rotate by a running byte counter once the
   * live file exceeds `maxBytes`; test sinks may no-op.
   */
  rotate(): void;
  /** Drain queued lines to disk. Optional on test fakes. */
  flush?(): Promise<void>;
  /** Flush and refuse further records. Optional on test fakes. */
  stop?(): Promise<void>;
  /** Last-resort sync drain for process-fatal handlers. Optional on test fakes. */
  flushSync?(): void;
}

/** The audit file lives at the host data root, next to the other owned markers. */
export function remoteAuditLogPath(hostRoot: string): string {
  return join(hostRoot, "remote-audit.jsonl");
}

/** Writer seam for the file-backed sink. Production resolves to `appendFile`. */
export type RemoteAuditLogWrite = (path: string, chunk: string) => Promise<void>;

export interface RemoteAuditLogOptions {
  /** Replace the file writer (tests inject a throttled drain). */
  readonly write?: RemoteAuditLogWrite;
}

/**
 * File-backed audit sink. `record` never blocks the caller: lines are queued
 * and written by one async drain. Write failures are contained so the audit
 * trail never takes the remote server's request path down.
 */
export class RemoteAuditLog implements RemoteAuditSink {
  private queue: string[] = [];
  private writing: Promise<void> = Promise.resolve();
  private bytesWritten = 0;
  private stopped = false;
  private dirReady = false;
  private dropped = 0;
  private readonly writeChunk: RemoteAuditLogWrite;

  constructor(
    private readonly path: string,
    private readonly rotation: { readonly maxBytes: number; readonly maxFiles: number } = {
      maxBytes: 10 * 1024 * 1024,
      maxFiles: 5,
    },
    options: RemoteAuditLogOptions = {},
  ) {
    this.writeChunk =
      options.write ??
      ((target, chunk) => appendFile(target, chunk, { encoding: "utf8", mode: 0o600 }));
    // Rotation must account for a log that already exists after a restart: a
    // fresh sink inherits the live file's size (one stat at construction, off
    // the write path) so the threshold reflects bytes actually on disk.
    try {
      const stats = statSync(this.path);
      if (stats.isFile()) this.bytesWritten = stats.size;
    } catch {
      // No pre-existing log; the counter starts from zero.
    }
  }

  /** Lines dropped because the bounded queue was full (audited on flush). */
  droppedCount(): number {
    return this.dropped;
  }

  /** Lines currently buffered awaiting the writer (introspection seam). */
  queuedCount(): number {
    return this.queue.length;
  }

  record(event: RemoteAuditEvent): void {
    if (this.stopped) return;
    if (this.queue.length >= REMOTE_AUDIT_QUEUE_LIMIT) {
      this.queue.shift();
      this.dropped += 1;
    }
    this.queue.push(`${JSON.stringify(event)}\n`);
    this.writing = this.writing.then(() => this.drain());
  }

  rotate(): void {
    // Rotation is driven by the async writer via the byte counter.
  }

  flush(): Promise<void> {
    this.enqueueDroppedCounter();
    return this.writing.then(() => this.drain());
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.flush();
  }

  /** Last-resort drain for process-fatal handlers that cannot await. */
  flushSync(): void {
    this.enqueueDroppedCounter();
    const leftover = this.queue.splice(0);
    if (leftover.length === 0) return;
    try {
      appendFileSync(this.path, leftover.join(""), { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      console.warn("[poracode] failed to flush remote audit entry:", error);
    }
  }

  private enqueueDroppedCounter(): void {
    if (this.dropped === 0) return;
    const count = this.dropped;
    this.dropped = 0;
    this.queue.push(
      `${JSON.stringify({
        v: REMOTE_AUDIT_LOG_VERSION,
        at: new Date().toISOString(),
        kind: "audit_queue_dropped",
        detail: { dropped: count },
      })}\n`,
    );
  }

  private async drain(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    const chunk = batch.join("");
    try {
      if (!this.dirReady) {
        await mkdir(dirname(this.path), { recursive: true });
        this.dirReady = true;
      }
      await this.writeChunk(this.path, chunk);
      this.bytesWritten += Buffer.byteLength(chunk);
      if (this.bytesWritten > this.rotation.maxBytes) {
        await rotateServerLogFilesAsync(this.path, this.rotation.maxFiles);
        this.bytesWritten = 0;
        await appendFile(this.path, "", { encoding: "utf8", mode: 0o600 });
      }
    } catch (error) {
      console.warn("[poracode] failed to append remote audit entry:", error);
    }
  }
}

/** Creates the file-backed sink at the host data root. */
export function createRemoteAuditLog(
  hostRoot: string,
  options: RemoteAuditLogOptions = {},
): RemoteAuditLog {
  return new RemoteAuditLog(remoteAuditLogPath(hostRoot), undefined, options);
}
