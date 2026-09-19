import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REMOTE_AUDIT_LOG_VERSION,
  RemoteAuditLog,
  createRemoteAuditLog,
  remoteAuditLogPath,
} from "./auditLog";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createAuditDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-audit-unit-"));
  tempDirs.push(dir);
  return dir;
}

describe("RemoteAuditLog", () => {
  it("appends one JSON line per event under the host root", () => {
    const dir = createAuditDir();
    const audit = createRemoteAuditLog(dir);

    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "pair",
      detail: { label: "Startup pairing", scopes: "session:read" },
    });
    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:01.000Z",
      kind: "token_exchange",
      sessionId: "session-1",
    });

    const lines = readFileSync(remoteAuditLogPath(dir), "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      {
        v: REMOTE_AUDIT_LOG_VERSION,
        at: "2026-09-18T00:00:00.000Z",
        kind: "pair",
        detail: { label: "Startup pairing", scopes: "session:read" },
      },
      {
        v: REMOTE_AUDIT_LOG_VERSION,
        at: "2026-09-18T00:00:01.000Z",
        kind: "token_exchange",
        sessionId: "session-1",
      },
    ]);
  });

  it("creates the file inside an existing host root", () => {
    const dir = createAuditDir();
    const audit = createRemoteAuditLog(dir);
    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "revoke",
      detail: { sessionId: "s" },
    });

    expect(existsSync(remoteAuditLogPath(dir))).toBe(true);
  });

  // POSIX-only: Windows does not honor the 0o600 mode bits (stat reports 0o666).
  it.skipIf(process.platform === "win32")("creates the audit file owner-only", () => {
    const dir = createAuditDir();
    const audit = createRemoteAuditLog(dir);
    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "revoke",
      detail: { sessionId: "s" },
    });

    expect(statSync(remoteAuditLogPath(dir)).mode & 0o777).toBe(0o600);
  });

  it("creates missing parent directories and contains write failures", () => {
    const dir = createAuditDir();
    // A file where a directory would be created: appendFileSync must fail, and
    // the sink must swallow the failure instead of throwing into the request
    // path.
    const blocked = join(dir, "blocked");
    const audit = new RemoteAuditLog(join(blocked, "remote-audit.jsonl"));
    expect(() =>
      audit.record({
        v: REMOTE_AUDIT_LOG_VERSION,
        at: "2026-09-18T00:00:00.000Z",
        kind: "file_read",
        detail: { path: "/x" },
      }),
    ).not.toThrow();

    // Nested roots are created on demand (a real host root always exists, but
    // the sink stays tolerant).
    const nested = createRemoteAuditLog(join(dir, "nested", "deeper"));
    nested.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "thread_send",
      detail: { threadId: "t" },
    });
    expect(existsSync(join(dir, "nested", "deeper", "remote-audit.jsonl"))).toBe(true);
  });

  it("keeps rotate() a no-op seam for plan item 4.9", () => {
    const dir = createAuditDir();
    const audit = new RemoteAuditLog(remoteAuditLogPath(dir));
    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "forward_open",
      detail: { targetPort: 3000 },
    });
    audit.rotate();
    expect(readFileSync(remoteAuditLogPath(dir), "utf8").split("\n")).toHaveLength(2);
  });
});
