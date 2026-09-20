import { rotateServerLogFiles } from "@/server/serverLogFile";
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Gate 6 item 4.7 (S7): the remote trust surface's structured audit log.
 *
 * One JSON object per line (JSONL), appended to a single file under the host
 * data root. Lines are self-describing (`v` + `at` + `kind` + optional
 * `sessionId`/`detail`) and never carry credentials: tokens, pairing
 * credentials, and ticket values are recorded only as their server-side ids or
 * scope names.
 */

export const REMOTE_AUDIT_LOG_VERSION = 1 as const;

/** Security-relevant remote events worth an append-only trail. */
export type RemoteAuditEventKind =
  | "pair"
  | "token_exchange"
  | "revoke"
  | "thread_create"
  | "thread_send"
  | "thread_stop"
  | "file_read"
  | "file_write"
  | "forward_open"
  | "procedure";

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
   * Rotation seam for plan item 4.9 (operability: leveled logs with rotation).
   * Deliberately a no-op today: the file grows append-only until that item
   * lands a size-capped rotation policy. Nothing may depend on rotation
   * behavior yet.
   */
  rotate(): void;
}

/** The audit file lives at the host data root, next to the other owned markers. */
export function remoteAuditLogPath(hostRoot: string): string {
  return join(hostRoot, "remote-audit.jsonl");
}

/**
 * File-backed audit sink. Every `record` opens with `O_APPEND` semantics
 * (`appendFileSync` flag `"a"`), so concurrent writers in one process serialize
 * at the OS level and a crash mid-write costs at most one partial trailing
 * line — readers must tolerate and skip a torn final line. Write failures are
 * contained: the audit trail must never take the remote server's request path
 * down, so failures warn and drop the line instead of throwing.
 */
export class RemoteAuditLog implements RemoteAuditSink {
  private ensuredDir = false;

  constructor(
    private readonly path: string,
    private readonly rotation: { readonly maxBytes: number; readonly maxFiles: number } = {
      // Deep-review fix: image reads audit per request, so the trail is
      // high-volume — the same size-capped shape the server log rotates by
      // (rotateServerLogFiles was exported for exactly this adoption).
      maxBytes: 10 * 1024 * 1024,
      maxFiles: 5,
    },
  ) {}

  record(event: RemoteAuditEvent): void {
    try {
      if (!this.ensuredDir) {
        mkdirSync(dirname(this.path), { recursive: true });
        this.ensuredDir = true;
      }
      appendFileSync(this.path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
      this.rotate();
    } catch (error) {
      console.warn("[poracode] failed to append remote audit entry:", error);
    }
  }

  rotate(): void {
    try {
      if (statSync(this.path).size > this.rotation.maxBytes) {
        rotateServerLogFiles(this.path, this.rotation.maxFiles);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[poracode] failed to rotate the remote audit log:", error);
      }
    }
  }
}

/** Creates the file-backed sink at the host data root. */
export function createRemoteAuditLog(hostRoot: string): RemoteAuditLog {
  return new RemoteAuditLog(remoteAuditLogPath(hostRoot));
}
