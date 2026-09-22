import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, RemoteThreadCommand } from "@/shared/contracts";
import { closeDatabase, dbUpsertProject, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import { remoteProjectSchema } from "@/shared/remote";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";
import type { BufferedSupervisorEvent } from "./context";

/**
 * Bounded catalog-change notifications (D1-D6) over the REAL HTTP server +
 * REAL SQLite + REAL WebSocket: exact declaration gating, declared signal vs
 * undeclared truthful full list, per-socket resync for oversize catalogs
 * without a global resync, bounded replay retention, replay crossing a signal,
 * and read avoidance for bounded-only mutations.
 */

const servers: RemoteAccessServer[] = [];

/** Fully-populated, wire-legal row (~1 KiB serialized). */
function representativeProject(index: number): Project {
  return {
    id: `project-${index}`,
    name: `Acme Platform Service ${index} (integration workspace)`,
    icon: "lucide:boxes",
    location: { kind: "posix", path: `/Users/operator/Development/acme/platform-service-${index}` },
    lastDraftConfig: {
      agentKind: "claude",
      model: "claude-sonnet-4-5",
      effort: "high",
      fast: false,
    },
    scripts: {
      setupScript: "pnpm install --frozen-lockfile && pnpm run build",
      cleanupScript: "pnpm run clean",
      worktreeCopyPatterns: [".env.local", ".envrc", "config/local.*"],
      actions: [
        { id: "test", name: "Run tests", command: "pnpm run test", icon: "beaker" },
        { id: "lint", name: "Lint", command: "pnpm run lint", icon: "check" },
        { id: "migrate", name: "Migrate DB", command: "pnpm run db:migrate" },
      ],
    },
    searchSettings: {
      useIgnoreFiles: true,
      exclude: {
        "**/node_modules/**": true,
        "**/dist/**": true,
        "**/coverage/**": true,
        "**/.next/**": true,
        "**/build/**": false,
      },
    },
    worktreeLocation: { mode: "project-relative", basePath: ".poracode/worktrees" },
    ghAccount: { host: "github.com", login: "acme-operator" },
    workspaceId: `workspace-${index % 24}`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

async function exchangePairingUrl(pairingUrl: string, scopes: readonly string[]): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes,
      client: { label: "Bounded catalog changes test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

function createWsReader(ws: WebSocket): () => Promise<Record<string, unknown>> {
  const queue: Array<Record<string, unknown>> = [];
  const waiters: Array<(value: Record<string, unknown>) => void> = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return () =>
    new Promise((resolve, reject) => {
      const queued = queue.shift();
      if (queued) {
        resolve(queued);
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for websocket message")),
        10_000,
      );
      waiters.push((value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
}

interface OpenSocket {
  readonly ws: WebSocket;
  readonly read: () => Promise<Record<string, unknown>>;
}

async function openSocket(
  info: RemoteAccessServerInfo,
  token: string,
  options: { readonly declaration?: string; readonly lastSeenSeq?: number } = {},
): Promise<OpenSocket> {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(ticketResponse.status).toBe(200);
  const ticket = (await ticketResponse.json()) as { ticket: string };
  const wsUrl = new URL("/ws", info.wsBaseUrl);
  wsUrl.searchParams.set("ticket", ticket.ticket);
  if (options.declaration !== undefined) {
    wsUrl.searchParams.set("catalogChanges", options.declaration);
  }
  if (options.lastSeenSeq !== undefined) {
    wsUrl.searchParams.set("lastSeenSeq", String(options.lastSeenSeq));
  }
  const ws = new WebSocket(wsUrl);
  const read = createWsReader(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  expect(await read()).toMatchObject({ type: "ready" });
  return { ws, read };
}

async function postCommand(
  info: RemoteAccessServerInfo,
  token: string,
  body: unknown,
  commandId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL("/api/projects/command", info.httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-poracode-command-id": commandId,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function readFrameType(
  read: () => Promise<Record<string, unknown>>,
  type: string,
): Promise<Record<string, unknown>> {
  for (let index = 0; index < 20; index += 1) {
    const frame = await read();
    const event = frame.event as { type?: string } | undefined;
    if (frame.type === type || event?.type === type) return frame;
  }
  throw new Error(`Never received websocket frame ${type}`);
}

function retainedBuffer(server: RemoteAccessServer): BufferedSupervisorEvent[] {
  return (server as unknown as { eventBuffer: BufferedSupervisorEvent[] }).eventBuffer;
}

function declaredClients(server: RemoteAccessServer): Set<WebSocket> {
  return (server as unknown as { boundedCatalogChangeClients: Set<WebSocket> })
    .boundedCatalogChangeClients;
}

async function waitForSocketClose(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => ws.once("close", () => resolve()));
}

describe.skipIf(!sqliteAvailable)("bounded catalog-change notifications over real HTTP/WS", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let server: RemoteAccessServer;
  let token: string;

  async function startServer(options: Partial<RemoteAccessServerOptions> = {}): Promise<void> {
    server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-bounded-catalog", label: "Bounded catalog desktop" },
      host: "127.0.0.1",
      port: 0,
      dispatchThreadCommand: vi.fn<(command: RemoteThreadCommand) => boolean>(() => false),
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      ...options,
    });
    servers.push(server);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl, ["session:read", "projects:manage"]);
  }

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-bounded-catalog-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((instance) => instance.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("advertises boundedCatalogChanges v1 and keeps the legacy full form for undeclared sockets", async () => {
    dbUpsertProject(representativeProject(1), 0);
    dbUpsertProject(representativeProject(2), 1);
    await startServer();
    const descriptorResponse = await fetch(
      new URL("/.well-known/poracode/environment", info.httpBaseUrl),
    );
    const descriptor = (await descriptorResponse.json()) as {
      capabilities?: { boundedCatalogChanges?: { versions?: number[] } };
    };
    expect(descriptor.capabilities?.boundedCatalogChanges?.versions).toEqual([1]);

    const declared = await openSocket(info, token, { declaration: "bounded-v1" });
    const undeclared = await openSocket(info, token);
    const response = await postCommand(
      info,
      token,
      {
        kind: "reorder",
        projectId: "project-2",
        targetProjectId: "project-1",
        placement: "before",
      },
      "bounded-small-1",
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const signalFrame = await readFrameType(declared.read, "remote-projects-changed");
    expect(signalFrame).toMatchObject({
      type: "event",
      event: { type: "remote-projects-changed", mode: "signal" },
    });
    expect(Object.hasOwn(signalFrame.event as Record<string, unknown>, "projects")).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(signalFrame.event), "utf8")).toBeLessThan(200);

    const fullFrame = await readFrameType(undeclared.read, "remote-projects-changed");
    const fullEvent = fullFrame.event as { type: string; mode?: string; projects: Project[] };
    expect(fullEvent.type).toBe("remote-projects-changed");
    expect(fullEvent.mode).toBeUndefined();
    expect(fullEvent.projects.map((project) => project.id)).toEqual(["project-2", "project-1"]);
    // Same mutation, same sequence for every client.
    expect(signalFrame.seq).toBe(fullFrame.seq);
    declared.ws.close();
    undeclared.ws.close();
  });

  it("gates the declaration on the exact value and on session:read, and cleans up on close", async () => {
    dbUpsertProject(representativeProject(1), 0);
    await startServer();
    const malformed = await openSocket(info, token, { declaration: "bounded-v2" });
    const wrongCase = await openSocket(info, token, { declaration: "BOUNDED-V1" });
    const declared = await openSocket(info, token, { declaration: "bounded-v1" });
    expect(declaredClients(server).size).toBe(1);

    // A session:read client without the declaration is an ordinary legacy
    // consumer; the read-scope preset alone never counts as a declaration.
    const sessionReadToken = await exchangePairingUrl(
      server.issuePairingUrl("bounded-catalog-read-scope"),
      ["session:read"],
    );
    const sessionRead = await openSocket(info, sessionReadToken);
    // A declaration on a connection that cannot establish a read-scoped event
    // socket never reaches the event stream at all: the ticket gate refuses the
    // scope-less token (fail closed), so the declaration cannot create a
    // classified socket without `session:read`.
    const scopeLessToken = await exchangePairingUrl(
      server.issuePairingUrl("bounded-catalog-no-read-scope"),
      ["terminal:read"],
    );
    const scopeLessTicket = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${scopeLessToken}` },
    });
    expect(scopeLessTicket.status).toBe(403);
    expect(declaredClients(server).size).toBe(1);

    const response = await postCommand(
      info,
      token,
      { kind: "set-workspace", projectId: "project-1", workspaceId: "w1" },
      "bounded-gate-1",
    );
    expect(response.status).toBe(200);
    expect((await readFrameType(declared.read, "remote-projects-changed")).event).toMatchObject({
      mode: "signal",
    });
    for (const socket of [malformed, wrongCase, sessionRead]) {
      expect((await readFrameType(socket.read, "remote-projects-changed")).event).toMatchObject({
        projects: [expect.objectContaining({ id: "project-1" })],
      });
    }

    const all = [malformed, wrongCase, sessionRead, declared];
    for (const socket of all) socket.ws.close();
    await Promise.all(all.map((socket) => waitForSocketClose(socket.ws)));
    await vi.waitFor(() => expect(declaredClients(server).size).toBe(0));
  });

  it("keeps a 2k-catalog mutation bounded: declared signal, undeclared per-socket resync, no global resync", async () => {
    const onOversizedEventDropped = vi.fn<(info: { type: string; bytes: number }) => void>();
    const rows = Array.from({ length: 2_000 }, (_, index) => representativeProject(index));
    rows.forEach((row, index) => {
      dbUpsertProject(remoteProjectSchema.parse(row) as Project, index);
    });
    await startServer({ onOversizedEventDropped });

    const declared = await openSocket(info, token, { declaration: "bounded-v1" });
    const undeclared = await openSocket(info, token);
    const response = await postCommand(
      info,
      token,
      {
        kind: "reorder",
        projectId: "project-1999",
        targetProjectId: "project-0",
        placement: "before",
      },
      "bounded-2k-1",
    );
    expect(response.status).toBe(200);

    const signalFrame = await readFrameType(declared.read, "remote-projects-changed");
    expect(signalFrame.event).toMatchObject({ mode: "signal" });
    // The undeclared socket gets ONE per-socket resync at the mutation seq, and
    // must never receive the over-cap full frame.
    const resync = await readFrameType(undeclared.read, "resync-required");
    expect(resync).toMatchObject({ type: "resync-required", seq: signalFrame.seq });
    expect(onOversizedEventDropped).not.toHaveBeenCalled();

    // The canonical replay entry is the tiny signal: bounded retained bytes.
    const retained = retainedBuffer(server);
    expect(retained).toHaveLength(1);
    expect(retained[0]?.catalogChange).toBe("signal");
    expect(retained[0]?.bytes).toBeLessThan(200);

    // A live follow-up proves the channel is alive for the declared socket and
    // that the mutation did not broadcast a global resync to it.
    server.publishThreadsChanged(["thread-live"]);
    const followUp = await readFrameType(declared.read, "remote-threads-changed");
    expect(followUp.event).toMatchObject({ threadIds: ["thread-live"] });
    declared.ws.close();
    undeclared.ws.close();
  });

  it("replays the signal to declared reconnects and per-socket resyncs an undeclared reconnect", async () => {
    dbUpsertProject(representativeProject(1), 0);
    await startServer();

    const first = await openSocket(info, token, { declaration: "bounded-v1" });
    const response = await postCommand(
      info,
      token,
      { kind: "set-workspace", projectId: "project-1", workspaceId: "w-replay" },
      "bounded-replay-1",
    );
    expect(response.status).toBe(200);
    const liveSignal = await readFrameType(first.read, "remote-projects-changed");
    expect(liveSignal.seq).toBe(1);

    const declaredReconnect = await openSocket(info, token, {
      declaration: "bounded-v1",
      lastSeenSeq: 0,
    });
    const replayed = await readFrameType(declaredReconnect.read, "remote-projects-changed");
    expect(replayed).toMatchObject({ seq: 1, event: { mode: "signal" } });

    const undeclaredReconnect = await openSocket(info, token, { lastSeenSeq: 0 });
    const resync = await readFrameType(undeclaredReconnect.read, "resync-required");
    expect(resync).toMatchObject({ type: "resync-required" });

    // After the per-socket resync the client is no longer replaying: a later
    // live event still reaches it.
    server.publishThreadsChanged(["thread-after-resync"]);
    const followUp = await readFrameType(undeclaredReconnect.read, "remote-threads-changed");
    expect(followUp.event).toMatchObject({ threadIds: ["thread-after-resync"] });

    first.ws.close();
    declaredReconnect.ws.close();
    undeclaredReconnect.ws.close();
  });

  it("does not read or parse the catalog for a bounded-only mutation without a legacy consumer", async () => {
    dbUpsertProject(representativeProject(1), 0);
    dbUpsertProject(representativeProject(2), 1);
    // A stored row that no longer satisfies the wire schema: a catalog-wide
    // read+parse would fault the mutation after its commit, while the bounded
    // path reads only the mutated row and stays clean.
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = ? WHERE id = 'project-2'")
      .run(JSON.stringify("not-a-draft-config"));
    await startServer();

    const db = await import("@/host/db");
    const getProjects = vi.spyOn(db, "dbGetProjects");
    const declared = await openSocket(info, token, { declaration: "bounded-v1" });
    const before = getProjects.mock.calls.length;
    const response = await postCommand(
      info,
      token,
      { kind: "set-workspace", projectId: "project-1", workspaceId: "w-bounded" },
      "bounded-noread-1",
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      project: expect.objectContaining({ id: "project-1" }),
    });
    expect(getProjects.mock.calls.length).toBe(before);
    expect((await readFrameType(declared.read, "remote-projects-changed")).event).toMatchObject({
      mode: "signal",
    });
    declared.ws.close();

    // Same poisoned catalog WITH an undeclared subscriber: the legacy full
    // read/parse runs (and truthfully reports the post-commit fault).
    const undeclared = await openSocket(info, token);
    const responseWithLegacy = await postCommand(
      info,
      token,
      { kind: "set-workspace", projectId: "project-1", workspaceId: "w-legacy" },
      "bounded-noread-2",
    );
    expect(getProjects.mock.calls.length).toBeGreaterThan(before);
    expect(responseWithLegacy.status).toBe(409);
    expect(responseWithLegacy.body).toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });

    // Restore the row and prove the undeclared socket receives the real full
    // event afterwards.
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = NULL WHERE id = 'project-2'")
      .run();
    const ok = await postCommand(
      info,
      token,
      { kind: "set-workspace", projectId: "project-1", workspaceId: "w-legacy-2" },
      "bounded-noread-3",
    );
    expect(ok.status).toBe(200);
    const full = await readFrameType(undeclared.read, "remote-projects-changed");
    expect((full.event as { projects: Project[] }).projects).toHaveLength(2);
    undeclared.ws.close();
    getProjects.mockRestore();
  });
});
