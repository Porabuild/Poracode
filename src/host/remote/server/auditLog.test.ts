import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REMOTE_AUDIT_LOG_VERSION,
  REMOTE_AUDIT_QUEUE_LIMIT,
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
  it("appends one JSON line per event under the host root", async () => {
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
    await audit.flush();

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

  it("creates the file inside an existing host root", async () => {
    const dir = createAuditDir();
    const audit = createRemoteAuditLog(dir);
    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "revoke",
      detail: { sessionId: "s" },
    });
    await audit.flush();

    expect(existsSync(remoteAuditLogPath(dir))).toBe(true);
  });

  // POSIX-only: Windows does not honor the 0o600 mode bits (stat reports 0o666).
  it.skipIf(process.platform === "win32")("creates the audit file owner-only", async () => {
    const dir = createAuditDir();
    const audit = createRemoteAuditLog(dir);
    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "revoke",
      detail: { sessionId: "s" },
    });
    await audit.flush();

    expect(statSync(remoteAuditLogPath(dir)).mode & 0o777).toBe(0o600);
  });

  it("creates missing parent directories and contains write failures", async () => {
    const dir = createAuditDir();
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
    await audit.flush();

    const nested = createRemoteAuditLog(join(dir, "nested", "deeper"));
    nested.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "thread_send",
      detail: { threadId: "t" },
    });
    await nested.flush();
    expect(existsSync(join(dir, "nested", "deeper", "remote-audit.jsonl"))).toBe(true);
  });

  it("rotates the live file once the byte counter exceeds the cap", async () => {
    const dir = createAuditDir();
    const audit = new RemoteAuditLog(remoteAuditLogPath(dir), { maxBytes: 80, maxFiles: 2 });
    for (let index = 0; index < 8; index += 1) {
      audit.record({
        v: REMOTE_AUDIT_LOG_VERSION,
        at: "2026-09-18T00:00:00.000Z",
        kind: "forward_open",
        detail: { targetPort: 3000 + index },
      });
    }
    await audit.flush();
    expect(existsSync(remoteAuditLogPath(dir))).toBe(true);
  });

  it("seeds the byte counter from a pre-existing log so a restart still rotates", async () => {
    const dir = createAuditDir();
    // First lifetime writes a few lines under a cap it never crosses.
    const first = new RemoteAuditLog(remoteAuditLogPath(dir), {
      maxBytes: 1024 * 1024,
      maxFiles: 2,
    });
    for (let index = 0; index < 3; index += 1) {
      first.record({
        v: REMOTE_AUDIT_LOG_VERSION,
        at: "2026-09-18T00:00:00.000Z",
        kind: "pair",
        detail: { n: index },
      });
    }
    await first.flush();
    const seededSize = statSync(remoteAuditLogPath(dir)).size;
    expect(seededSize).toBeGreaterThan(0);

    // After a restart the live file already holds `seededSize` bytes. The new
    // sink must inherit that size: with the cap below it, the very next chunk
    // rotates instead of quietly growing an oversized live file.
    const restarted = new RemoteAuditLog(remoteAuditLogPath(dir), { maxBytes: 80, maxFiles: 2 });
    restarted.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:01.000Z",
      kind: "pair",
      detail: { n: 99 },
    });
    await restarted.flush();

    expect(existsSync(`${remoteAuditLogPath(dir)}.1`)).toBe(true);
    expect(statSync(remoteAuditLogPath(dir)).size).toBe(0);
  });

  it("enqueues 10k records without blocking a concurrent tick beyond 500ms", async () => {
    const dir = createAuditDir();
    const audit = createRemoteAuditLog(dir);
    const started = Date.now();
    for (let index = 0; index < 10_000; index += 1) {
      audit.record({
        v: REMOTE_AUDIT_LOG_VERSION,
        at: "2026-09-18T00:00:00.000Z",
        kind: "file_read",
        detail: { n: index },
      });
    }
    expect(Date.now() - started).toBeLessThan(500);
    await audit.stop();
    const lines = readFileSync(remoteAuditLogPath(dir), "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(10_000);
  });

  it("drops oldest lines when the queue exceeds the bound and audits the drop count", async () => {
    const dir = createAuditDir();
    const audit = new RemoteAuditLog(remoteAuditLogPath(dir), {
      maxBytes: 50 * 1024 * 1024,
      maxFiles: 2,
    });
    const limit = REMOTE_AUDIT_QUEUE_LIMIT;
    for (let index = 0; index < limit + 25; index += 1) {
      audit.record({
        v: REMOTE_AUDIT_LOG_VERSION,
        at: "2026-09-18T00:00:00.000Z",
        kind: "file_read",
        detail: { n: index },
      });
    }
    expect(audit.droppedCount()).toBe(25);
    await audit.flush();
    expect(audit.droppedCount()).toBe(0);
    const lines = readFileSync(remoteAuditLogPath(dir), "utf8").trimEnd().split("\n");
    const parsed = lines.map(
      (line) => JSON.parse(line) as { kind: string; detail?: { dropped?: number } },
    );
    // The drop counter rides its own audit kind, exactly once per flush.
    expect(
      parsed.filter(
        (event) => event.kind === "audit_queue_dropped" && event.detail?.dropped === 25,
      ),
    ).toHaveLength(1);
  });

  it("drains buffered lines synchronously for the fatal-handler path", async () => {
    const dir = createAuditDir();
    const audit = createRemoteAuditLog(dir);
    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "pair",
      detail: { n: 1 },
    });
    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:01.000Z",
      kind: "revoke",
      detail: { n: 2 },
    });
    // The last-resort drain installFatalErrorHandlers calls before exit:
    // buffered lines must be complete on disk when it returns.
    audit.flushSync();
    const lines = readFileSync(remoteAuditLogPath(dir), "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!)).toMatchObject({ kind: "revoke" });

    // The async writer rejoins cleanly with nothing left to write.
    await audit.flush();
    expect(readFileSync(remoteAuditLogPath(dir), "utf8").trimEnd().split("\n")).toHaveLength(2);
  });

  // V6 A.8 concurrency gate: the queue must absorb a real burst while the
  // writer is genuinely slow (a controllable deferred drain), and macrotask
  // timers — not microtasks — must stay responsive mid-drain. The end-to-end
  // counterpart (real HTTP requests against a live RemoteAccessServer while
  // its sink is throttled) lives in RemoteAccessServer.hostAudit.test.ts.
  it("keeps timers responsive while a blocked writer holds ~10k queued lines", async () => {
    const dir = createAuditDir();
    let releaseWriter: () => void = () => {};
    const firstChunkGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    let writes = 0;
    const audit = new RemoteAuditLog(
      remoteAuditLogPath(dir),
      { maxBytes: 512 * 1024 * 1024, maxFiles: 2 },
      {
        write: async (path, chunk) => {
          writes += 1;
          if (writes === 1) await firstChunkGate; // park the drain mid-write
          await appendFile(path, chunk, { encoding: "utf8", mode: 0o600 });
        },
      },
    );

    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: "2026-09-18T00:00:00.000Z",
      kind: "pair",
      detail: { n: 0 },
    });
    // Let the async writer pick the first chunk up and block on the gate
    // (the first drain also creates the directory, so wait on real I/O).
    await waitForCondition(() => writes === 1);
    expect(writes).toBe(1);

    // A synchronous burst enqueues while the writer is parked: `record` never
    // awaits the write, and the queue genuinely holds every buffered line.
    const started = Date.now();
    for (let index = 1; index <= 10_000; index += 1) {
      audit.record({
        v: REMOTE_AUDIT_LOG_VERSION,
        at: "2026-09-18T00:00:00.000Z",
        kind: "file_read",
        detail: { n: index },
      });
    }
    expect(Date.now() - started).toBeLessThan(500);
    expect(audit.queuedCount()).toBe(10_000);

    // Real timer ticks (event-loop turns a request path would need) stay far
    // below the 200ms latency ceiling while the drain is stuck.
    for (let index = 0; index < 5; index += 1) {
      const tickStarted = Date.now();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(Date.now() - tickStarted).toBeLessThan(200);
    }

    releaseWriter();
    await audit.flush();
    const lines = readFileSync(remoteAuditLogPath(dir), "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(10_001);
  });
});

/** Waits for real I/O-driven state, then times out loudly (1s cap). */
async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 1000 && !condition(); attempt += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 1);
    });
  }
}
