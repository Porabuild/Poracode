import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, dbGetProjectNotes, dbUpsertProject, initDatabase } from "@/host/db";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import { REMOTE_HTTP_ROUTES } from "@/shared/remote/contract";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";
import type { RemoteAuditEvent, RemoteAuditSink } from "./auditLog";

const servers: RemoteAccessServer[] = [];

async function exchangePairingUrl(
  pairingUrl: string,
  scopes = ["session:read", "session:operate"],
): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes,
      client: { label: "Writer admission test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

/** Raw HTTP/1.1 over a socket: the only way to send truly duplicate header lines. */
function rawRequest(
  httpBaseUrl: string,
  bearer: string,
  headers: string[],
  body: string,
): Promise<{ status: number; text: string }> {
  const url = new URL(httpBaseUrl);
  const port = Number(url.port);
  const request =
    `POST /api/projects/project-1/notes HTTP/1.1\r\n` +
    `Host: ${url.host}\r\n` +
    `Authorization: Bearer ${bearer}\r\n` +
    headers.join("\r\n") +
    `\r\n` +
    `Content-Type: application/json\r\n` +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    `Connection: close\r\n\r\n` +
    body;
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => socket.write(request));
    let text = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      text += chunk;
    });
    socket.on("close", () => {
      resolve({ status: Number(/HTTP\/1\.[01] (\d{3})/.exec(text)?.[1] ?? 0), text });
    });
    socket.on("error", reject);
  });
}

const VALID_NOTES = { doc: null, todos: [], updatedAt: "2026-10-09T00:00:00.000Z" };

/**
 * Fence 1 (remote 13): per-request writer-generation admission on the real
 * HTTP dispatcher. Direct declared routes and non-read generic procedures
 * refuse any missing/old/future/malformed/duplicate generation AFTER bearer
 * authentication and scope authorization but BEFORE payload parsing, audit,
 * or any mutation effect; auth-free and read-class POSTs stay usable to old
 * clients; a raw (non-TS-client) request is never synthesized into a current
 * one by the host.
 */
describe.skipIf(!sqliteAvailable)("remote13 writer-generation admission", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;
  let auditEvents: RemoteAuditEvent[];
  /** Audit lines the pairing exchange itself already wrote (token mints). */
  let auditBaseline = 0;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-writer-admission-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Repo",
        location: { kind: "posix", path: dir },
        createdAt: "2026-01-01",
      },
      0,
    );
    auditEvents = [];
    const audit: RemoteAuditSink = {
      record: (event: RemoteAuditEvent) => auditEvents.push(event),
      rotate: () => {},
    };
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => undefined);
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      audit,
      callSupervisor,
    });
    servers.push(server);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
    auditBaseline = auditEvents.length;
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
    accessToken = token,
  ) =>
    fetch(new URL(path, info.httpBaseUrl), {
      method: "POST",
      headers: {
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        "content-type": "application/json",
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  const procedure = (payload: unknown, headers: Record<string, string> = {}) =>
    post("/api/git/call", { procedure: "pauseThreadFollowUps", payload }, headers);

  /** Dispatch attribution lines only (`detail.procedure`), not route ingress lines. */
  const procedureAuditLines = () =>
    auditEvents.filter((event) => event.detail !== undefined && "procedure" in event.detail);

  it("refuses a valid bearer without the generation before any effect", async () => {
    const response = await post("/api/projects/project-1/notes", VALID_NOTES);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "protocol_version_mismatch" },
    });
    // Refusal-before-effect: no audit line (the dispatcher gate precedes the
    // route audit), and the notes are untouched.
    expect(auditEvents).toHaveLength(auditBaseline);
    expect(dbGetProjectNotes("project-1")).toBeNull();
  });

  it("refuses old, future, and malformed generations with the same typed 409", async () => {
    // A trailing-space value never reaches the fence: the HTTP parser strips
    // surrounding whitespace, so "13 " is exactly "13" on the wire.
    for (const version of ["12", "14", "abc", "013", "13.0"]) {
      const response = await post("/api/projects/project-1/notes", VALID_NOTES, {
        [REMOTE_PROTOCOL_VERSION_HEADER]: version,
      });
      expect(response.status, `generation ${JSON.stringify(version)}`).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "protocol_version_mismatch" },
      });
    }
    expect(dbGetProjectNotes("project-1")).toBeNull();
  });

  it("rejects exact duplicate generation header lines", async () => {
    const { status, text } = await rawRequest(
      info.httpBaseUrl,
      token,
      [
        `${REMOTE_PROTOCOL_VERSION_HEADER}: ${REMOTE_PROTOCOL_VERSION_HEADER_VALUE}`,
        `${REMOTE_PROTOCOL_VERSION_HEADER}: ${REMOTE_PROTOCOL_VERSION_HEADER_VALUE}`,
      ],
      JSON.stringify(VALID_NOTES),
    );
    expect(status).toBe(409);
    expect(text).toContain("protocol_version_mismatch");
    expect(dbGetProjectNotes("project-1")).toBeNull();
  });

  it("admits a raw request that itself carries the exact generation (no client synthesis involved)", async () => {
    const { status } = await rawRequest(
      info.httpBaseUrl,
      token,
      [`${REMOTE_PROTOCOL_VERSION_HEADER}: ${REMOTE_PROTOCOL_VERSION_HEADER_VALUE}`],
      JSON.stringify(VALID_NOTES),
    );
    expect(status).toBe(200);
    expect(dbGetProjectNotes("project-1")?.updatedAt).toBe(VALID_NOTES.updatedAt);
  });

  it("keeps unauthorized requests at 401/403 before the generation check", async () => {
    const unauthenticated = await post(
      "/api/projects/project-1/notes",
      VALID_NOTES,
      { [REMOTE_PROTOCOL_VERSION_HEADER]: "garbage" },
      "",
    );
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({
      error: { code: "missing_access_token" },
    });
    const wrongScope = await exchangePairingUrl(servers[servers.length - 1]!.issuePairingUrl(), [
      "session:read",
    ]);
    const forbidden = await post(
      "/api/projects/project-1/notes",
      VALID_NOTES,
      { [REMOTE_PROTOCOL_VERSION_HEADER]: "garbage" },
      wrongScope,
    );
    expect(forbidden.status).toBe(403);
  });

  it("checks the generation before payload parsing on a declared route", async () => {
    // Old generation + invalid payload: the generation gate fires first.
    const stale = await post(
      "/api/projects/project-1/notes",
      { doc: null },
      {
        [REMOTE_PROTOCOL_VERSION_HEADER]: "12",
      },
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "protocol_version_mismatch" },
    });
    // Current generation + invalid payload: the handler's own parse runs.
    const current = await post(
      "/api/projects/project-1/notes",
      { doc: null },
      {
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
    );
    expect(current.status).toBe(400);
    await expect(current.json()).resolves.toMatchObject({ error: { code: "invalid_request" } });
  });

  it("keeps read-class ticket POSTs and the auth-free exchange usable without the generation", async () => {
    const ticket = await post("/api/auth/websocket-ticket", undefined);
    expect(ticket.status).toBe(200);
    await expect(ticket.json()).resolves.toMatchObject({ ticket: expect.any(String) });
    // The pairing exchange itself (auth-free POST) runs without the header:
    // a wrong credential surfaces the route's own 401, never the 409 gate.
    const exchange = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: "not-a-credential",
        scopes: ["session:read"],
        client: { label: "Writer admission test", deviceType: "mobile" },
      }),
    });
    expect(exchange.status).toBe(401);
    await expect(exchange.json()).resolves.toMatchObject({
      error: { code: "invalid_pairing_token" },
    });
  });

  it("admits read-scoped procedures without the generation", async () => {
    callSupervisor.mockResolvedValueOnce([] as never);
    const response = await post("/api/git/call", {
      procedure: "readThreadBackgroundTasks",
      payload: { threadId: "t1" },
    });
    expect(response.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith("readThreadBackgroundTasks", { threadId: "t1" });
  });

  it("refuses a non-read procedure without the generation before audit, parse, or dispatch", async () => {
    const response = await procedure({ threadId: "t1", id: "f1" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "protocol_version_mismatch" },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
    // The gate precedes the dispatch's own procedure-attribution audit line
    // (`detail.procedure`); the route-level ingress line for the shared
    // dispatch is pre-existing behavior for every call, refused or not.
    expect(procedureAuditLines()).toHaveLength(0);
  });

  it("checks the non-read procedure generation before its payload schema parse", async () => {
    const stale = await procedure({}, { [REMOTE_PROTOCOL_VERSION_HEADER]: "12" });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "protocol_version_mismatch" },
    });
    const current = await procedure(
      {},
      {
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
    );
    expect(current.status).toBe(400);
    await expect(current.json()).resolves.toMatchObject({ error: { code: "invalid_request" } });
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("dispatches a non-read procedure carrying the exact generation", async () => {
    const response = await procedure(
      { threadId: "t1", id: "f1" },
      { [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE },
    );
    expect(response.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith("pauseThreadFollowUps", {
      threadId: "t1",
      id: "f1",
    });
    // The audit line records the admitted dispatch exactly once.
    expect(procedureAuditLines()).toHaveLength(1);
  });

  it("declares the generation flag only on bearer-gated non-procedure routes", () => {
    const declared = REMOTE_HTTP_ROUTES.filter((route) => route.requiresCurrentProtocol === true);
    // Registry-classification completeness guard: the frozen contract pins 47
    // direct writer routes (46 POST + 1 DELETE), all bearer-gated with
    // dispatcher-owned scope resolution, so the dispatcher's post-auth check
    // ordering holds for every declared route.
    expect(declared).toHaveLength(47);
    expect(declared.filter((route) => route.method === "DELETE")).toHaveLength(1);
    for (const route of declared) {
      expect(route.auth).toBe("bearer");
      expect(route.scopeResolution).not.toBe("procedure-defined");
    }
    // The shared dispatch hosts reads and writes; its admission is per
    // resolved procedure scope, never a route-level flag.
    expect(
      REMOTE_HTTP_ROUTES.find((route) => route.id === "procedure-call")?.requiresCurrentProtocol,
    ).toBeUndefined();
  });
});
