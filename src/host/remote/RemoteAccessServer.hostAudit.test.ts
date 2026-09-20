import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { connect, createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REMOTE_HTTP_ROUTES } from "@/shared/remote/contract";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";
import { RemotePortForwardGateway } from "./RemotePortForwardGateway";
import {
  REMOTE_AUDIT_LOG_VERSION,
  RemoteAuditLog,
  createRemoteAuditLog,
  remoteAuditLogPath,
  type RemoteAuditEvent,
} from "./server/auditLog";

/** Hoisted mock handles the audit test asserts against. */
const dbGetThreadMock = vi.fn<(...args: unknown[]) => unknown>(() => null);

vi.mock("@/host/db", () => {
  const appState = new Map<string, string>();
  return {
    dbGetThread: (...args: unknown[]) => dbGetThreadMock(...args),
    dbGetThreads: vi.fn<() => never[]>(() => []),
    dbGetProject: vi.fn<() => null>(() => null),
    dbGetState: vi.fn<(key: string) => string | null>((key: string) => appState.get(key) ?? null),
    dbSetState: vi.fn<(key: string, value: string) => void>((key: string, value: string) => {
      appState.set(key, value);
    }),
    dbGetThreadRuntimeItem: vi.fn<() => undefined>(() => undefined),
    dbClaimRemoteCommand: vi.fn<() => { state: "claimed" }>(() => ({ state: "claimed" })),
    dbCompleteRemoteCommand: vi.fn<() => void>(),
    dbFailRemoteCommand: vi.fn<() => void>(),
  };
});

const servers: RemoteAccessServer[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createServer(overrides: Partial<RemoteAccessServerOptions> = {}): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-test", label: "Test Desktop" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    ...overrides,
  });
  servers.push(server);
  return server;
}

/** A raw GET to the bound listener (always dialed by 127.0.0.1) with an
 * explicit `Host` header (fetch forbids setting it). Uses HTTP/1.0 so a
 * missing Host passes the parser and reaches our own gate. */
function rawRequest(
  info: { localHttpBaseUrl: string },
  path: string,
  host: string | undefined,
): Promise<{ status: number; body: string }> {
  const base = new URL(info.localHttpBaseUrl);
  return new Promise((resolve, reject) => {
    const req = connect(Number(base.port), "127.0.0.1", () => {
      req.write(
        [`GET ${path} HTTP/1.0`, ...(host === undefined ? [] : [`Host: ${host}`]), "", ""].join(
          "\r\n",
        ),
      );
    });
    let body = "";
    req.setTimeout(5_000, () => {
      req.destroy(new Error("Timed out"));
    });
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    req.on("error", reject);
    req.on("close", () => {
      const status = Number(/^HTTP\/1\.\d (\d{3})/.exec(body)?.[1] ?? 0);
      const jsonStart = body.indexOf("{");
      resolve({ status, body: jsonStart >= 0 ? body.slice(jsonStart) : body });
    });
  });
}

const ENV_PATH = "/.well-known/poracode/environment";

describe("RemoteAccessServer Host-header allowlist (Gate 6 item 4.7)", () => {
  it("refuses a spoofed attacker hostname", async () => {
    const server = createServer();
    const info = await server.start();

    const spoofed = await rawRequest(info, ENV_PATH, "attacker.example.net");
    expect(spoofed.status).toBe(403);
    expect(JSON.parse(spoofed.body)).toMatchObject({
      error: { code: "host_not_allowed" },
    });
  });

  it("refuses requests without a Host header", async () => {
    const server = createServer();
    const info = await server.start();
    const response = await rawRequest(info, ENV_PATH, undefined);
    expect(response.status).toBe(403);
  });

  it("refuses loopback dials that name a different port", async () => {
    const server = createServer();
    const info = await server.start();
    const boundPort = new URL(info.localHttpBaseUrl).port;
    const response = await rawRequest(info, ENV_PATH, `127.0.0.1:${Number(boundPort) + 1}`);
    expect(response.status).toBe(403);
  });

  it("admits the server's own loopback and IP forms", async () => {
    const server = createServer();
    const info = await server.start();
    const boundPort = new URL(info.localHttpBaseUrl).port;

    for (const host of [`localhost:${boundPort}`, `127.0.0.1:${boundPort}`, `[::1]:${boundPort}`]) {
      const response = await rawRequest(info, ENV_PATH, host);
      expect(`${host} status ${response.status}`).toBe(`${host} status 200`);
      expect(JSON.parse(response.body)).toMatchObject({ desktopId: "desktop-test" });
    }
  });

  it("admits the advertised reverse-proxy origin hostname and its default port only", async () => {
    const server = createServer({
      advertisedBaseUrl: "https://mybox.tailnet-example.ts.net",
    });
    const info = await server.start();

    // Hostname forms of the advertised origin are admitted (with or without
    // the scheme's default port spelled out)…
    expect((await rawRequest(info, ENV_PATH, "mybox.tailnet-example.ts.net")).status).toBe(200);
    expect((await rawRequest(info, ENV_PATH, "mybox.tailnet-example.ts.net:443")).status).toBe(200);

    // …but a foreign hostname sharing the port, or an unadvertised port on
    // the right hostname, is refused.
    expect((await rawRequest(info, ENV_PATH, "mybox.tailnet-example.ts.net:8443")).status).toBe(
      403,
    );
    expect((await rawRequest(info, ENV_PATH, "elsewhere.tailnet-example.ts.net:443")).status).toBe(
      403,
    );
  });

  it("admits an explicitly advertised host name", async () => {
    const server = createServer({ advertisedHost: "mybox.local" });
    const info = await server.start();
    const boundPort = new URL(info.localHttpBaseUrl).port;
    expect((await rawRequest(info, ENV_PATH, `mybox.local:${boundPort}`)).status).toBe(200);
    expect((await rawRequest(info, ENV_PATH, `other.local:${boundPort}`)).status).toBe(403);
  });
});

describe("RemoteAccessServer audit log (Gate 6 item 4.7)", () => {
  function createAuditDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "poracode-remote-audit-"));
    tempDirs.push(dir);
    return dir;
  }

  async function readAuditLines(
    dir: string,
    audit?: { flush(): Promise<void> },
  ): Promise<RemoteAuditEvent[]> {
    await audit?.flush();
    return readFileSync(remoteAuditLogPath(dir), "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as RemoteAuditEvent);
  }

  it("writes one structured JSONL line per security-relevant event", async () => {
    const auditDir = createAuditDir();
    const audit = createRemoteAuditLog(auditDir);

    // A real loopback TCP echo server stands in for a forwardable dev server.
    const echo = createNetServer((socket) => socket.pipe(socket));
    await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", resolve));
    const targetPort = (echo.address() as AddressInfo).port;
    try {
      const gateway = new RemotePortForwardGateway({
        bindHost: "127.0.0.1",
        candidatePorts: [targetPort],
      });
      const server = createServer({
        audit,
        portForward: gateway,
        attachments: {
          save: (input: { fileName: string }) => join(auditDir, `saved-${input.fileName}`),
        },
      });
      const info = await server.start();

      // pair: startup pairing + an independent grant.
      const exchangeCredential = () => {
        const pairingUrl = server.issueIndependentPairingUrl("Auditor");
        return new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
      };

      // token_exchange.
      const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grantType: "pairing-token",
          credential: exchangeCredential(),
          client: { label: "Auditor desktop", deviceType: "desktop" },
        }),
      });
      expect(tokenResponse.status).toBe(200);
      const token = ((await tokenResponse.json()) as { accessToken: string }).accessToken;
      const sessionId = server.listAccessSessions()[0]?.id;
      expect(sessionId).toBeTruthy();

      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

      // thread_create (start-existing requires the thread to exist).
      dbGetThreadMock.mockReturnValue({
        id: "thread-1",
        projectId: "project-1",
        title: "Thread",
        agentKind: "codex",
        config: { model: "gpt-5" },
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "terminal",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const startResponse = await fetch(new URL("/api/threads/start", info.httpBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          threadId: "thread-1",
          projectLocation: { kind: "posix", path: "/repo" },
          agentKind: "codex",
          config: { model: "gpt-5" },
          initialSize: { cols: 80, rows: 24 },
        }),
      });
      expect(startResponse.status).toBe(200);

      // thread_send + thread_stop.
      expect(
        (
          await fetch(new URL("/api/threads/thread-1/send", info.httpBaseUrl), {
            method: "POST",
            headers,
            body: JSON.stringify({ prompt: "hello", config: { model: "gpt-5" } }),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fetch(new URL("/api/threads/thread-1/interrupt", info.httpBaseUrl), {
            method: "POST",
            headers,
            body: "{}",
          })
        ).status,
      ).toBe(200);

      // file_write (attachment upload) + file_read (image read).
      const attachmentUrl = new URL("/api/files/attachment", info.httpBaseUrl);
      attachmentUrl.searchParams.set("threadId", "thread-1");
      attachmentUrl.searchParams.set("name", "note.bin");
      const attachment = await fetch(attachmentUrl, {
        method: "POST",
        headers: { ...headers, "content-type": "application/octet-stream" },
        body: new Uint8Array([1, 2, 3]),
      });
      expect(attachment.status).toBe(200);
      const attachmentPath = join(auditDir, "note.png");
      writeFileSync(attachmentPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const image = await fetch(
        new URL(`/api/files/image?path=${encodeURIComponent(attachmentPath)}`, info.httpBaseUrl),
        { headers },
      );
      expect(image.status).toBe(200);

      // forward_open.
      const forward = await fetch(new URL("/api/ports/forward", info.httpBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({ targetPort }),
      });
      expect(forward.status).toBe(200);

      // revoke.
      expect(server.revokeAccessSession(sessionId!)).toBe(true);

      const events = await readAuditLines(auditDir, audit);
      const kinds = events.map((event) => event.kind);
      expect(kinds).toContain("pair");
      expect(kinds).toContain("token_exchange");
      expect(kinds).toContain("thread_create");
      expect(kinds).toContain("thread_send");
      expect(kinds).toContain("thread_stop");
      expect(kinds).toContain("file_write");
      expect(kinds).toContain("file_read");
      expect(kinds).toContain("forward_open");
      expect(kinds).toContain("revoke");

      // Every line is versioned, timestamped, session-attributed where a
      // session existed, and carries no credential material.
      for (const event of events) {
        expect(event.v).toBe(REMOTE_AUDIT_LOG_VERSION);
        expect(Number.isNaN(Date.parse(event.at))).toBe(false);
        expect(JSON.stringify(event)).not.toContain("lc_access");
        expect(JSON.stringify(event)).not.toContain("lc_pair");
      }
      const sendEvent = events.find((event) => event.kind === "thread_send");
      expect(sendEvent?.sessionId).toBe(sessionId);
      expect(sendEvent?.detail).toMatchObject({
        route: "thread-send",
        method: "POST",
        path: "/api/threads/{threadId}/send",
      });
      const exchangeEvent = events.find((event) => event.kind === "token_exchange");
      expect(exchangeEvent?.detail).toMatchObject({ clientLabel: "Auditor desktop" });
      const forwardEvent = events.find((event) => event.kind === "forward_open");
      expect(forwardEvent?.detail).toMatchObject({
        route: "port-forward",
        method: "POST",
        path: "/api/ports/forward",
      });
    } finally {
      echo.close();
    }
  });

  it("flushes queued lines so readers see a complete trail", async () => {
    const auditDir = createAuditDir();
    const audit = createRemoteAuditLog(auditDir);
    audit.record({
      v: REMOTE_AUDIT_LOG_VERSION,
      at: new Date().toISOString(),
      kind: "pair",
      detail: { label: "Startup pairing" },
    });
    expect(() => audit.rotate()).not.toThrow();
    expect(await readAuditLines(auditDir, audit)).toHaveLength(1);
  });

  it("emits a dispatcher audit line for every mutating registry route", async () => {
    const auditDir = createAuditDir();
    const audit = createRemoteAuditLog(auditDir);
    const server = createServer({ audit });
    const info = await server.start();
    const pairingUrl = server.issueIndependentPairingUrl("Auditor");
    const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        client: { label: "Audit matrix", deviceType: "desktop" },
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const token = ((await tokenResponse.json()) as { accessToken: string }).accessToken;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const auditedRoutes = REMOTE_HTTP_ROUTES.filter((route) => route.audit.kind !== false);
    for (const route of auditedRoutes) {
      const path = route.path.replaceAll(/\{[A-Za-z][A-Za-z0-9]*\}/g, "audit-param");
      await fetch(new URL(path, info.httpBaseUrl), {
        method: route.method,
        headers,
        signal: AbortSignal.timeout(8_000),
        ...(route.method === "POST" ? { body: "{}" } : {}),
      }).catch(() => undefined);
    }

    const events = await readAuditLines(auditDir, audit);
    const routed = new Set(
      events
        .map((event) => event.detail?.route)
        .filter((route): route is string => typeof route === "string"),
    );
    const missing = auditedRoutes.map((route) => route.id).filter((id) => !routed.has(id));
    expect(missing).toEqual([]);
  });

  // V6 A.8 concurrency gate: while the sink's async writer is genuinely stuck
  // (a controllable deferred drain) and ~10k lines sit queued, real concurrent
  // HTTP requests against the live listener must stay under the 200ms latency
  // ceiling — the bounded queue may never block the request path.
  it("answers /healthz under 200ms while ~10k audit lines queue behind a blocked writer", async () => {
    const auditDir = createAuditDir();
    let releaseWriter: () => void = () => {};
    const firstChunkGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    let writes = 0;
    const audit = new RemoteAuditLog(
      remoteAuditLogPath(auditDir),
      { maxBytes: 512 * 1024 * 1024, maxFiles: 2 },
      {
        write: async (path, chunk) => {
          writes += 1;
          if (writes === 1) await firstChunkGate; // park the drain mid-write
          await appendFile(path, chunk, { encoding: "utf8", mode: 0o600 });
        },
      },
    );
    const server = createServer({ audit });
    const info = await server.start();
    const healthz = new URL("/healthz", info.httpBaseUrl);

    try {
      // /healthz is the public liveness probe with audit: noAudit — it
      // exercises the request path without re-entering the audit sink. The
      // startup "pair" line recorded by start() drains during this await, so
      // the writer parks holding exactly that first chunk. Poll rather than
      // assume: a saturated full-suite worker can delay the drain past the
      // fetch resolution.
      expect((await fetch(healthz)).status).toBe(200);
      await vi.waitFor(() => expect(writes).toBe(1), { timeout: 5_000, interval: 10 });
      expect(writes).toBe(1);

      audit.record({
        v: REMOTE_AUDIT_LOG_VERSION,
        at: new Date().toISOString(),
        kind: "pair",
        detail: { n: 0 },
      });
      await yieldMacrotask();
      await yieldMacrotask();
      expect(writes).toBe(1); // still parked: nothing further is being written

      const burstStarted = Date.now();
      for (let index = 1; index <= 10_000; index += 1) {
        audit.record({
          v: REMOTE_AUDIT_LOG_VERSION,
          at: new Date().toISOString(),
          kind: "file_read",
          detail: { n: index },
        });
      }
      expect(Date.now() - burstStarted).toBeLessThan(500);
      // The queue genuinely holds the seed + the whole burst behind the
      // parked writer (the startup pair line is already inside that chunk).
      expect(audit.queuedCount()).toBe(10_001);

      const latencies: number[] = [];
      for (let index = 0; index < 8; index += 1) {
        const requestStarted = Date.now();
        const response = await fetch(healthz, { signal: AbortSignal.timeout(5_000) });
        latencies.push(Date.now() - requestStarted);
        expect(response.status).toBe(200);
      }
      // Bound chosen with headroom over the observed single-digit-millisecond
      // loopback probes so CI jitter cannot flake it; the point is that the
      // blocked 10k-line queue does not move the request path at all.
      expect(Math.max(...latencies)).toBeLessThan(200);

      // Every audited line survived the throttle: startup pair + seed + 10k
      // burst, no drops.
      expect(audit.droppedCount()).toBe(0);
    } finally {
      releaseWriter();
      await audit.flush();
    }
    const lines = readFileSync(remoteAuditLogPath(auditDir), "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0);
    expect(lines).toHaveLength(10_002);
  });
});

/** One full event-loop turn (macrotask), so pending microtasks settle first. */
function yieldMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => {
      setImmediate(resolve);
    });
  });
}
