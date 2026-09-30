import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, RemoteThreadCommand } from "@/shared/contracts";
import { closeDatabase, dbGetProject, dbUpsertProject, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  REMOTE_PROJECT_COMMAND_RESULT_DECLARATION,
  REMOTE_PROJECT_COMMAND_RESULT_HEADER,
  remoteProjectSchema,
} from "@/shared/remote";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";
import type { BufferedSupervisorEvent } from "./context";

/**
 * Bounded project-command results over the REAL HTTP server + REAL SQLite +
 * REAL WebSocket. This is the OPT-IN counterpart of the parent measurement
 * probe (`tmp/v2-production/managed-project-reply-parent-probe`, which stays
 * unchanged as the legacy baseline): the same one-project update against 2,000
 * representative rows answers with only the affected row and reads no
 * unrelated project row when every live consumer is declared, while an
 * undeclared caller keeps the byte-identical complete legacy result.
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
      },
    },
    worktreeLocation: { mode: "project-relative", basePath: ".poracode/worktrees" },
    ghAccount: { host: "github.com", login: "acme-operator" },
    workspaceId: `workspace-${index % 24}`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

async function exchangePairingUrl(pairingUrl: string): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read", "projects:manage"],
      client: { label: "Bounded project results test", deviceType: "mobile" },
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

async function openSocket(
  info: RemoteAccessServerInfo,
  token: string,
  options: { readonly declaration?: string } = {},
): Promise<{ readonly ws: WebSocket; readonly read: () => Promise<Record<string, unknown>> }> {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const ticket = (await ticketResponse.json()) as { ticket: string };
  const wsUrl = new URL("/ws", info.wsBaseUrl);
  wsUrl.searchParams.set("ticket", ticket.ticket);
  if (options.declaration !== undefined) {
    wsUrl.searchParams.set("catalogChanges", options.declaration);
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

describe.skipIf(!sqliteAvailable)("bounded project-command results over real HTTP/WS", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let server: RemoteAccessServer;
  let token: string;

  async function startServer(options: Partial<RemoteAccessServerOptions> = {}): Promise<void> {
    server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-bounded-project", label: "Bounded project desktop" },
      host: "127.0.0.1",
      port: 0,
      dispatchThreadCommand: vi.fn<(command: RemoteThreadCommand) => boolean>(() => false),
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
      ...options,
    });
    servers.push(server);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
  }

  async function postCommand(
    body: unknown,
    options: { readonly commandId?: string; readonly bounded?: boolean } = {},
  ): Promise<{ status: number; bytes: number; body: Record<string, unknown> }> {
    const response = await fetch(new URL("/api/projects/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(options.commandId ? { "x-poracode-command-id": options.commandId } : {}),
        ...(options.bounded
          ? { [REMOTE_PROJECT_COMMAND_RESULT_HEADER]: REMOTE_PROJECT_COMMAND_RESULT_DECLARATION }
          : {}),
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    return {
      status: response.status,
      bytes: Buffer.byteLength(raw, "utf8"),
      body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
    };
  }

  function seedRepresentativeCatalog(count: number): void {
    const rows = Array.from({ length: count }, (_, index) => representativeProject(index));
    getSqlite().transaction(() => {
      rows.forEach((row, index) => {
        dbUpsertProject(remoteProjectSchema.parse(row) as Project, index);
      });
    })();
  }

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-bounded-project-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((instance) => instance.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("allows an allowed-origin preflight to request the bounded declaration header without reflecting others", async () => {
    await startServer();
    const origin = "http://localhost:5173";
    const response = await fetch(new URL("/api/projects/command", info.httpBaseUrl), {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": [
          "authorization",
          "content-type",
          "x-poracode-command-id",
          REMOTE_PROJECT_COMMAND_RESULT_HEADER,
          "x-poracode-unlisted-probe",
        ].join(", "),
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    const allowed = (response.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    expect(allowed).toContain("authorization");
    expect(allowed).toContain("x-poracode-command-id");
    expect(allowed).toContain(REMOTE_PROJECT_COMMAND_RESULT_HEADER);
    // The fixed allow-list never reflects an arbitrary requested header.
    expect(allowed).not.toContain("x-poracode-unlisted-probe");

    // The F1 addition is additive only: a foreign origin is still refused with
    // no allow-origin, exactly as before.
    const foreign = await fetch(new URL("/api/projects/command", info.httpBaseUrl), {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": REMOTE_PROJECT_COMMAND_RESULT_HEADER,
      },
    });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("advertises projectCommandResults v1 and preserves the legacy complete result for undeclared callers", async () => {
    seedRepresentativeCatalog(2_000);
    await startServer();

    const descriptorResponse = await fetch(
      new URL("/.well-known/poracode/environment", info.httpBaseUrl),
    );
    const descriptor = (await descriptorResponse.json()) as {
      capabilities?: {
        projectCommandResults?: { versions?: number[] };
        threadLaunchMetadata?: { versions?: number[] };
      };
    };
    expect(descriptor.capabilities?.projectCommandResults?.versions).toEqual([1]);
    expect(descriptor.capabilities?.threadLaunchMetadata?.versions).toEqual([1]);

    const legacy = await postCommand({
      kind: "update",
      projectId: "project-1",
      patch: { name: "Renamed one project" },
    });
    expect(legacy.status).toBe(200);
    expect((legacy.body.projects as unknown[]).length).toBe(2_000);
    expect(legacy.bytes).toBeGreaterThan(1024 * 1024);
  });

  it("serves one declared update as a bounded affected-row response with zero unrelated full reads", async () => {
    seedRepresentativeCatalog(2_000);
    await startServer();
    const db = await import("@/host/db");
    const getProjects = vi.spyOn(db, "dbGetProjects");
    const declared = await openSocket(info, token, { declaration: "bounded-v1" });
    const readsBefore = getProjects.mock.calls.length;

    const response = await postCommand(
      { kind: "update", projectId: "project-1", patch: { name: "Renamed one project" } },
      { commandId: "bounded-project-update-1", bounded: true },
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      project: expect.objectContaining({ id: "project-1", name: "Renamed one project" }),
    });
    expect(Object.hasOwn(response.body, "projects")).toBe(false);
    expect(response.bytes).toBeLessThan(2_048);
    // No unrelated project row was loaded or parsed.
    expect(getProjects.mock.calls.length).toBe(readsBefore);

    const signal = await readFrameType(declared.read, "remote-projects-changed");
    expect(signal.event).toMatchObject({ mode: "signal" });
    const retained = retainedBuffer(server);
    expect(retained.at(-1)?.catalogChange).toBe("signal");
    expect(retained.at(-1)?.bytes).toBeLessThan(200);

    declared.ws.close();
    getProjects.mockRestore();
  });

  it("returns the registration id mapping for declared creates and keeps removal bounded", async () => {
    seedRepresentativeCatalog(2_000);
    await startServer();
    const db = await import("@/host/db");
    const getProjects = vi.spyOn(db, "dbGetProjects");
    const declared = await openSocket(info, token, { declaration: "bounded-v1" });
    const readsBefore = getProjects.mock.calls.length;

    const addExisting = await postCommand(
      { kind: "add-existing", path: join(dir, "registered") },
      { commandId: "bounded-project-add-1", bounded: true },
    );
    expect(addExisting.status).toBe(200);
    const registeredId = (addExisting.body.project as { id: string }).id;
    expect(registeredId).toBeTruthy();
    expect(Object.hasOwn(addExisting.body, "projects")).toBe(false);
    expect(dbGetProject(registeredId)).not.toBeNull();

    const removed = await postCommand(
      { kind: "remove", projectId: registeredId },
      { commandId: "bounded-project-remove-1", bounded: true },
    );
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ ok: true });
    expect(dbGetProject(registeredId)).toBeNull();
    expect(getProjects.mock.calls.length).toBe(readsBefore);

    declared.ws.close();
    getProjects.mockRestore();
  });

  it("keeps a pre-effect create refusal definite and marks the boundary once the directory exists", async () => {
    seedRepresentativeCatalog(2);
    await startServer();
    const db = await import("@/host/db");
    const getProjects = vi.spyOn(db, "dbGetProjects");
    const readsBefore = getProjects.mock.calls.length;

    const parent = join(dir, "projects");
    mkdirSync(parent);
    const created = await postCommand(
      { kind: "create", parentPath: parent, name: "fresh-app" },
      { commandId: "bounded-project-create-1", bounded: true },
    );
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      ok: true,
      project: expect.objectContaining({ name: "fresh-app" }),
    });
    expect(getProjects.mock.calls.length).toBe(readsBefore);

    // The directory already exists: mkdir fails before any effect, so the
    // refusal stays definite (never an uncertain receipt).
    const refused = await postCommand(
      { kind: "create", parentPath: parent, name: "fresh-app" },
      { commandId: "bounded-project-create-2", bounded: true },
    );
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ error: { code: "project_directory_failed" } });
    expect(getProjects.mock.calls.length).toBe(readsBefore);

    getProjects.mockRestore();
  });

  it("requires a command id for every declared mutation and binds the semantic mode to receipts", async () => {
    seedRepresentativeCatalog(3);
    await startServer();
    const db = await import("@/host/db");
    const updateProject = vi.spyOn(db, "dbUpdateProject");

    const missingId = await postCommand(
      { kind: "update", projectId: "project-1", patch: { name: "No id" } },
      { bounded: true },
    );
    expect(missingId.status).toBe(400);
    expect(missingId.body).toMatchObject({ error: { code: "command_id_required" } });
    expect(dbGetProject("project-1")?.name).toBe(representativeProject(1).name);
    expect(updateProject).not.toHaveBeenCalled();

    const first = await postCommand(
      { kind: "update", projectId: "project-1", patch: { name: "Bound name" } },
      { commandId: "bounded-project-receipt-1", bounded: true },
    );
    expect(first.status).toBe(200);
    expect(updateProject).toHaveBeenCalledTimes(1);

    // The exact same body + semantic mode replays the recorded bounded result:
    // no second write.
    const replay = await postCommand(
      { kind: "update", projectId: "project-1", patch: { name: "Bound name" } },
      { commandId: "bounded-project-receipt-1", bounded: true },
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(updateProject).toHaveBeenCalledTimes(1);

    // A changed body under the same id conflicts instead of re-applying.
    const changed = await postCommand(
      { kind: "update", projectId: "project-1", patch: { name: "Other name" } },
      { commandId: "bounded-project-receipt-1", bounded: true },
    );
    expect(changed.status).toBe(409);
    expect(changed.body).toMatchObject({ error: { code: "command_id_conflict" } });
    expect(updateProject).toHaveBeenCalledTimes(1);
    expect(dbGetProject("project-1")?.name).toBe("Bound name");

    // A changed command under the same id also conflicts (digest binding).
    const changedKind = await postCommand(
      { kind: "remove", projectId: "project-1" },
      { commandId: "bounded-project-receipt-1", bounded: true },
    );
    expect(changedKind.status).toBe(409);
    expect(changedKind.body).toMatchObject({ error: { code: "command_id_conflict" } });
    expect(dbGetProject("project-1")).not.toBeNull();

    // Legacy undeclared callers keep their historical behavior: the route never
    // consults (or records) a receipt there, so a legacy request carrying an id
    // executes as before and does not disturb the bounded receipt.
    const legacy = await postCommand({
      kind: "update",
      projectId: "project-1",
      patch: { name: "Legacy name" },
    });
    expect(legacy.status).toBe(200);
    expect(updateProject).toHaveBeenCalledTimes(2);
    const boundedReplayAfterLegacy = await postCommand(
      { kind: "update", projectId: "project-1", patch: { name: "Bound name" } },
      { commandId: "bounded-project-receipt-1", bounded: true },
    );
    expect(boundedReplayAfterLegacy.status).toBe(200);
    expect(boundedReplayAfterLegacy.body).toEqual(first.body);

    updateProject.mockRestore();
  });

  it("classifies a fault after the committed row write as uncertain, never as a definite failure", async () => {
    seedRepresentativeCatalog(3);
    // A stored row that no longer satisfies the wire schema: a catalog-wide
    // read+parse faults after the committed update, while the bounded response
    // never reads it.
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = ? WHERE id = 'project-2'")
      .run(JSON.stringify("not-a-draft-config"));
    await startServer();

    // Only an undeclared live subscriber forces the legacy full read on the
    // declared path's publication step, so the post-commit fault is reachable.
    const undeclared = await openSocket(info, token);
    const response = await postCommand(
      { kind: "update", projectId: "project-1", patch: { name: "Committed name" } },
      { commandId: "bounded-project-fault-1", bounded: true },
    );
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
    // The row write really committed.
    expect(dbGetProject("project-1")?.name).toBe("Committed name");

    const retry = await postCommand(
      { kind: "update", projectId: "project-1", patch: { name: "Committed name" } },
      { commandId: "bounded-project-fault-1", bounded: true },
    );
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });

    // Restore the unrelated row: the same declared mutation now succeeds and
    // the undeclared socket receives the truthful full event.
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = NULL WHERE id = 'project-2'")
      .run();
    const ok = await postCommand(
      { kind: "update", projectId: "project-1", patch: { name: "Committed name 2" } },
      { commandId: "bounded-project-fault-2", bounded: true },
    );
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, project: expect.objectContaining({ id: "project-1" }) });
    const full = await readFrameType(undeclared.read, "remote-projects-changed");
    expect((full.event as { projects: Project[] }).projects).toHaveLength(3);
    undeclared.ws.close();
  });
});
