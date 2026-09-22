import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, RemoteThreadCommand, Thread } from "@/shared/contracts";
import {
  dbGetProjects,
  dbGetThreads,
  dbReadProjectOrderRows,
  dbReadThreadOrderRowsByProject,
  dbUpsertProject,
  dbUpsertThread,
  closeDatabase,
  initDatabase,
  onProjectThreadDataChanged,
} from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

/**
 * End-to-end managed-catalog host intents over the REAL HTTP server + REAL
 * SQLite: relative project/thread reorder over the host's complete order,
 * narrow nullable workspace and draft-config writes that never clobber
 * concurrent fields, bounded mutation responses, receipt retry/digest/principal
 * binding, scope refusals, capability advertisement, and server-side
 * publication to every client.
 */

const servers: RemoteAccessServer[] = [];

function testProject(id: string, name = id): Project {
  return {
    id,
    name,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function testThread(id: string, projectId: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    projectId,
    title: id,
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function exchangePairingUrl(pairingUrl: string, scopes?: readonly string[]): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      ...(scopes ? { scopes } : {}),
      client: { label: "Catalog intents test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

function receiptRow(commandId: string) {
  return getSqlite()
    .prepare(
      `SELECT state, response, principal_id, request_digest
       FROM remote_command_receipts WHERE command_id = ?`,
    )
    .get(commandId) as
    | {
        state: string;
        response: string | null;
        principal_id: string | null;
        request_digest: string | null;
      }
    | undefined;
}

function projectOrder(): string[] {
  return dbReadProjectOrderRows().map((row) => row.id);
}

function threadOrder(projectId: string): string[] {
  return dbReadThreadOrderRowsByProject(projectId).map((row) => row.id);
}

async function postCommand(
  info: RemoteAccessServerInfo,
  token: string,
  path: string,
  body: unknown,
  commandId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL(path, info.httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(commandId ? { "x-poracode-command-id": commandId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

/** Queued WS reader: frames that arrive back-to-back are not lost. */
function createWsReader(ws: WebSocket): () => Promise<unknown> {
  const queue: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];
  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString()) as unknown;
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return () =>
    new Promise((resolve, reject) => {
      if (queue.length > 0) {
        resolve(queue.shift());
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for websocket message")),
        5_000,
      );
      waiters.push((value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
}

async function openPairedSocket(
  info: RemoteAccessServerInfo,
  token: string,
): Promise<{ readonly ws: WebSocket; readonly read: () => Promise<unknown> }> {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(ticketResponse.status).toBe(200);
  const ticket = (await ticketResponse.json()) as { ticket: string };
  const wsUrl = new URL("/ws", info.wsBaseUrl);
  wsUrl.searchParams.set("ticket", ticket.ticket);
  const ws = new WebSocket(wsUrl);
  const read = createWsReader(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { ws, read };
}

async function waitForEventType(
  read: () => Promise<unknown>,
  type: string,
): Promise<Record<string, unknown>> {
  for (let index = 0; index < 12; index += 1) {
    const frame = (await read()) as { type?: string; event?: { type?: string } };
    const event = frame.event ?? frame;
    if (event.type === type) return event as Record<string, unknown>;
  }
  throw new Error(`Never received websocket event ${type}`);
}

describe.skipIf(!sqliteAvailable)("managed catalog host intents over real HTTP", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let server: RemoteAccessServer;
  let operatorToken: string;
  let onProjectsChanged: ReturnType<typeof vi.fn<(projects: readonly Project[]) => void>>;
  let dispatchThreadCommand: ReturnType<typeof vi.fn<(command: RemoteThreadCommand) => boolean>>;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-catalog-http-"));
    initDatabase(join(dir, "state.sqlite"));
    ["p1", "p2", "p3", "p4"].forEach((id, index) =>
      dbUpsertProject(testProject(id, `Project ${id}`), index),
    );
    ["t1", "t2", "t3", "t4", "t5"].forEach((id, index) =>
      dbUpsertThread(
        testThread(id, "p1", {
          status: "working",
          sessionRef: {
            providerSessionId: `session-${id}`,
            discoveredAt: "2026-01-01T00:00:00.000Z",
          },
        }),
        index,
      ),
    );
    dbUpsertThread(testThread("q1", "p2"), 0);
    onProjectsChanged = vi.fn<(projects: readonly Project[]) => void>();
    dispatchThreadCommand = vi.fn<(command: RemoteThreadCommand) => boolean>(() => false);
    server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-catalog", label: "Catalog desktop" },
      host: "127.0.0.1",
      port: 0,
      onProjectsChanged,
      dispatchThreadCommand,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    info = await server.start();
    operatorToken = await exchangePairingUrl(info.pairingUrl, [
      "session:read",
      "session:operate",
      "projects:manage",
    ]);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((instance) => instance.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("advertises the catalogMutations capability and keeps legacy responses complete", async () => {
    const descriptorResponse = await fetch(
      new URL("/.well-known/poracode/environment", info.httpBaseUrl),
    );
    expect(descriptorResponse.status).toBe(200);
    const descriptor = (await descriptorResponse.json()) as {
      capabilities?: { catalogMutations?: { versions?: number[] } };
    };
    expect(descriptor.capabilities?.catalogMutations?.versions).toEqual([1]);

    const legacy = await postCommand(info, operatorToken, "/api/projects/command", {
      kind: "add-existing",
      path: "/tmp/legacy-project",
    });
    expect(legacy.status).toBe(200);
    expect(Array.isArray(legacy.body.projects)).toBe(true);
    expect((legacy.body.projects as unknown[]).length).toBe(5);
  });

  it("reorders projects relatively over the host order with a bounded response, receipt replay, and broadcast", async () => {
    const { ws, read } = await openPairedSocket(info, operatorToken);
    try {
      await read();
      const commandId = "catalog-project-reorder-1";
      const first = await postCommand(
        info,
        operatorToken,
        "/api/projects/command",
        { kind: "reorder", projectId: "p4", targetProjectId: "p1", placement: "before" },
        commandId,
      );
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ ok: true });
      expect(Object.hasOwn(first.body, "projects")).toBe(false);
      expect(projectOrder()).toEqual(["p4", "p1", "p2", "p3"]);
      // Slot-preserving: p2/p3 keep their exact positions and payloads.
      const values = new Map(
        dbReadProjectOrderRows().map((row) => [row.id, row.sortOrder] as const),
      );
      expect(values.get("p2")).toBe(2);
      expect(values.get("p3")).toBe(3);
      expect(onProjectsChanged).toHaveBeenCalledTimes(1);
      const publishedProjects = onProjectsChanged.mock.calls[0]?.[0] ?? [];
      expect(publishedProjects.map((project) => project.id)).toEqual(["p4", "p1", "p2", "p3"]);

      const broadcast = await waitForEventType(read, "remote-projects-changed");
      expect((broadcast.projects as Project[]).map((project) => project.id)).toEqual([
        "p4",
        "p1",
        "p2",
        "p3",
      ]);

      const receipt = receiptRow(commandId);
      expect(receipt?.state).toBe("completed");
      expect(receipt?.principal_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(receipt?.request_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.parse(String(receipt?.response))).toEqual({ ok: true });

      // Same id + identical body replays without re-applying or re-broadcasting.
      const retry = await postCommand(
        info,
        operatorToken,
        "/api/projects/command",
        { kind: "reorder", projectId: "p4", targetProjectId: "p1", placement: "before" },
        commandId,
      );
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual({ ok: true });
      expect(onProjectsChanged).toHaveBeenCalledTimes(1);

      // Same id + changed body conflicts and writes nothing.
      const conflict = await postCommand(
        info,
        operatorToken,
        "/api/projects/command",
        { kind: "reorder", projectId: "p4", targetProjectId: "p2", placement: "after" },
        commandId,
      );
      expect(conflict.status).toBe(409);
      expect(conflict.body).toMatchObject({ error: { code: "command_id_conflict" } });
      expect(projectOrder()).toEqual(["p4", "p1", "p2", "p3"]);

      // A different principal never replays another session's receipt.
      const otherToken = await exchangePairingUrl(
        server.issueIndependentPairingUrl("Second operator"),
        ["projects:manage"],
      );
      const other = await postCommand(
        info,
        otherToken,
        "/api/projects/command",
        { kind: "reorder", projectId: "p4", targetProjectId: "p1", placement: "before" },
        commandId,
      );
      expect(other.status).toBe(409);
      expect(other.body).toMatchObject({ error: { code: "command_id_conflict" } });
      expect(onProjectsChanged).toHaveBeenCalledTimes(1);
    } finally {
      ws.close();
    }
  });

  it("treats missing reorder targets as stale-projection refusals without effects", async () => {
    const missingTargetId = "catalog-missing-target-1";
    const missingTarget = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      {
        kind: "reorder",
        projectId: "p1",
        targetProjectId: "missing",
        placement: "before",
      },
      missingTargetId,
    );
    expect(missingTarget.status).toBe(404);
    expect(missingTarget.body).toMatchObject({ error: { code: "project_not_found" } });
    const missingSourceId = "catalog-missing-source-1";
    const missingSource = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      {
        kind: "reorder",
        projectId: "missing",
        targetProjectId: "p1",
        placement: "before",
      },
      missingSourceId,
    );
    expect(missingSource.status).toBe(404);
    expect(projectOrder()).toEqual(["p1", "p2", "p3", "p4"]);
    // A refusal before any catalog write stays a DEFINITE failure: the receipt
    // exists (an id was supplied) and records zero effect.
    expect(receiptRow(missingTargetId)?.state).toBe("failed");
    expect(receiptRow(missingSourceId)?.state).toBe("failed");
  });

  it("moves a thread block over the host order, keeps unnamed rows identical, and never mirrors to the renderer", async () => {
    const { ws, read } = await openPairedSocket(info, operatorToken);
    try {
      await read();
      const q1Before = JSON.stringify(dbGetThreads().find((thread) => thread.id === "q1"));
      const t3Before = JSON.stringify(dbGetThreads().find((thread) => thread.id === "t3"));
      const response = await postCommand(
        info,
        operatorToken,
        "/api/threads/t4/command",
        {
          kind: "reorder",
          projectId: "p1",
          threadIds: ["t4"],
          targetThreadId: "t1",
          placement: "before",
        },
        "catalog-thread-reorder-1",
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(threadOrder("p1")).toEqual(["t4", "t1", "t2", "t3", "t5"]);
      expect(threadOrder("p2")).toEqual(["q1"]);
      expect(JSON.stringify(dbGetThreads().find((thread) => thread.id === "q1"))).toBe(q1Before);
      expect(JSON.stringify(dbGetThreads().find((thread) => thread.id === "t3"))).toBe(t3Before);
      // Catalog mutations are host-authoritative: the renderer mirror is not asked.
      expect(dispatchThreadCommand).not.toHaveBeenCalled();

      const broadcast = await waitForEventType(read, "remote-threads-changed");
      expect([...(broadcast.threadIds as string[])].sort()).toEqual(["t1", "t4"]);

      // A multi-entry block keeps its authoritative internal order.
      const block = await postCommand(
        info,
        operatorToken,
        "/api/threads/t2/command",
        {
          kind: "reorder",
          projectId: "p1",
          threadIds: ["t2", "t3"],
          targetThreadId: "t5",
          placement: "after",
        },
        "catalog-thread-block-1",
      );
      expect(block.status).toBe(200);
      expect(threadOrder("p1")).toEqual(["t4", "t1", "t5", "t2", "t3"]);
    } finally {
      ws.close();
    }
  });

  it("refuses cross-project, duplicate, anchor, and unknown thread reorder targets before any effect", async () => {
    const before = JSON.stringify(dbGetThreads());
    const crossProject = await postCommand(
      info,
      operatorToken,
      "/api/threads/q1/command",
      {
        kind: "reorder",
        projectId: "p1",
        threadIds: ["q1"],
        targetThreadId: "t1",
        placement: "before",
      },
      "catalog-cross-project-1",
    );
    expect(crossProject.status).toBe(409);
    expect(crossProject.body).toMatchObject({ error: { code: "thread_project_mismatch" } });

    const duplicates = await postCommand(
      info,
      operatorToken,
      "/api/threads/t2/command",
      {
        kind: "reorder",
        projectId: "p1",
        threadIds: ["t2", "t2"],
        targetThreadId: "t1",
        placement: "before",
      },
      "catalog-duplicates-1",
    );
    expect(duplicates.status).toBe(400);
    expect(duplicates.body).toMatchObject({ error: { code: "invalid_request" } });

    const anchor = await postCommand(
      info,
      operatorToken,
      "/api/threads/t3/command",
      {
        kind: "reorder",
        projectId: "p1",
        threadIds: ["t2", "t3"],
        targetThreadId: "t1",
        placement: "before",
      },
      "catalog-anchor-1",
    );
    expect(anchor.status).toBe(400);
    expect(anchor.body).toMatchObject({ error: { code: "invalid_request" } });

    const unknown = await postCommand(
      info,
      operatorToken,
      "/api/threads/t1/command",
      {
        kind: "reorder",
        projectId: "p1",
        threadIds: ["missing"],
        targetThreadId: "t1",
        placement: "before",
      },
      "catalog-unknown-1",
    );
    expect(unknown.status).toBe(400); // anchor/block mismatch surfaces first
    const unknownTarget = await postCommand(
      info,
      operatorToken,
      "/api/threads/t1/command",
      {
        kind: "reorder",
        projectId: "p1",
        threadIds: ["t1"],
        targetThreadId: "missing",
        placement: "before",
      },
      "catalog-unknown-target-1",
    );
    expect(unknownTarget.status).toBe(404);
    expect(unknownTarget.body).toMatchObject({ error: { code: "thread_not_found" } });

    const targetInBlock = await postCommand(
      info,
      operatorToken,
      "/api/threads/t2/command",
      {
        kind: "reorder",
        projectId: "p1",
        threadIds: ["t2", "t3"],
        targetThreadId: "t3",
        placement: "before",
      },
      "catalog-target-in-block-1",
    );
    expect(targetInBlock.status).toBe(200);
    expect(targetInBlock.body).toEqual({ ok: true });
    expect(JSON.stringify(dbGetThreads())).toBe(before);

    const noOp = await postCommand(
      info,
      operatorToken,
      "/api/threads/t2/command",
      {
        kind: "reorder",
        projectId: "p1",
        threadIds: ["t2"],
        targetThreadId: "t1",
        placement: "after",
      },
      "catalog-noop-1",
    );
    expect(noOp.status).toBe(200);
    expect(JSON.stringify(dbGetThreads())).toBe(before);
  });

  it("writes only the workspace column even when a second client changed other fields meanwhile", async () => {
    // A second client (or host-side flow) edited the same row after this
    // client built its projection.
    dbUpsertThread(
      testThread("t1", "p1", {
        title: "Renamed by client B",
        status: "working",
        sessionRef: { providerSessionId: "session-b", discoveredAt: "2026-01-01T00:00:00.000Z" },
      }),
      0,
    );
    const readRow = () =>
      getSqlite()
        .prepare(
          `SELECT workspace_id, title, status, session_ref, sort_order, group_id, config
           FROM threads WHERE id = 't1'`,
        )
        .get() as Record<string, unknown>;
    const before = readRow();

    const project = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      {
        kind: "set-workspace",
        projectId: "p1",
        workspaceId: "workspace-7",
      },
      "catalog-project-workspace-1",
    );
    expect(project.status).toBe(200);
    expect(project.body).toMatchObject({ ok: true, project: { workspaceId: "workspace-7" } });
    expect(Object.hasOwn(project.body, "projects")).toBe(false);

    const thread = await postCommand(
      info,
      operatorToken,
      "/api/threads/t1/command",
      {
        kind: "set-workspace",
        workspaceId: "workspace-7",
      },
      "catalog-thread-workspace-1",
    );
    expect(thread.status).toBe(200);
    expect(thread.body).toEqual({ ok: true });

    const stored = readRow();
    expect(stored.workspace_id).toBe("workspace-7");
    for (const key of Object.keys(before)) {
      if (key === "workspace_id") continue;
      expect(stored[key]).toEqual(before[key]);
    }
    expect(JSON.parse(String(stored.session_ref))).toEqual({
      providerSessionId: "session-b",
      discoveredAt: "2026-01-01T00:00:00.000Z",
    });
    expect(stored.title).toBe("Renamed by client B");
    // Clearing is a single-column write too.
    const cleared = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      {
        kind: "set-workspace",
        projectId: "p1",
        workspaceId: null,
      },
      "catalog-project-workspace-clear-1",
    );
    expect(cleared.status).toBe(200);
    expect(
      (
        getSqlite().prepare("SELECT workspace_id FROM projects WHERE id = 'p1'").get() as {
          workspace_id: string | null;
        }
      ).workspace_id,
    ).toBeNull();
    expect(dbGetProjects().find((entry) => entry.id === "p1")?.name).toBe("Project p1");
  });

  it("persists lastDraftConfig without clobbering a concurrently renamed project", async () => {
    const renamed = { ...testProject("p1", "Renamed by client B") };
    dbUpsertProject(renamed, 0);

    const response = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      {
        kind: "set-draft-config",
        projectId: "p1",
        lastDraftConfig: { agentKind: "claude", model: "sonnet", effort: "high" },
      },
      "catalog-draft-1",
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true });
    expect(Object.hasOwn(response.body, "projects")).toBe(false);

    const stored = getSqlite()
      .prepare("SELECT name, last_draft_config, sort_order FROM projects WHERE id = 'p1'")
      .get() as { name: string; last_draft_config: string | null; sort_order: number };
    expect(stored.name).toBe("Renamed by client B");
    expect(JSON.parse(String(stored.last_draft_config))).toEqual({
      agentKind: "claude",
      model: "sonnet",
      effort: "high",
    });
    expect(stored.sort_order).toBe(0);

    const cleared = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      {
        kind: "set-draft-config",
        projectId: "p1",
        lastDraftConfig: null,
      },
      "catalog-draft-clear-1",
    );
    expect(cleared.status).toBe(200);
    expect(
      (
        getSqlite().prepare("SELECT last_draft_config FROM projects WHERE id = 'p1'").get() as {
          last_draft_config: string | null;
        }
      ).last_draft_config,
    ).toBeNull();
    expect(receiptRow("catalog-draft-1")?.state).toBe("completed");
  });

  it("denies catalog mutations to viewer-scoped tokens without any effect", async () => {
    const viewerToken = await exchangePairingUrl(
      server.issueIndependentPairingUrl("Viewer tablet", { preset: "viewer" }),
    );
    const before = JSON.stringify(dbGetProjects());
    const project = await postCommand(info, viewerToken, "/api/projects/command", {
      kind: "reorder",
      projectId: "p4",
      targetProjectId: "p1",
      placement: "before",
    });
    expect(project.status).toBe(403);
    expect(project.body).toMatchObject({ error: { code: "missing_scope" } });
    const thread = await postCommand(info, viewerToken, "/api/threads/t1/command", {
      kind: "set-workspace",
      workspaceId: "workspace-1",
    });
    expect(thread.status).toBe(403);
    expect(thread.body).toMatchObject({ error: { code: "missing_scope" } });
    expect(JSON.stringify(dbGetProjects())).toBe(before);
    expect(
      (
        getSqlite().prepare("SELECT COUNT(*) AS count FROM remote_command_receipts").get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
  });

  it("binds thread reorder receipts to the principal and the validated body digest", async () => {
    const commandId = "catalog-thread-receipt-1";
    const body = {
      kind: "reorder",
      projectId: "p1",
      threadIds: ["t5"],
      targetThreadId: "t1",
      placement: "before",
    };
    const first = await postCommand(
      info,
      operatorToken,
      "/api/threads/t5/command",
      body,
      commandId,
    );
    expect(first.status).toBe(200);
    expect(threadOrder("p1")).toEqual(["t5", "t1", "t2", "t3", "t4"]);
    expect(receiptRow(commandId)?.state).toBe("completed");

    const retry = await postCommand(
      info,
      operatorToken,
      "/api/threads/t5/command",
      body,
      commandId,
    );
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ ok: true });
    expect(threadOrder("p1")).toEqual(["t5", "t1", "t2", "t3", "t4"]);

    const changed = await postCommand(
      info,
      operatorToken,
      "/api/threads/t5/command",
      { ...body, targetThreadId: "t2" },
      commandId,
    );
    expect(changed.status).toBe(409);
    expect(changed.body).toMatchObject({ error: { code: "command_id_conflict" } });
    expect(threadOrder("p1")).toEqual(["t5", "t1", "t2", "t3", "t4"]);
  });

  it("classifies a post-commit change-listener failure as uncertain on the project route", async () => {
    const commandId = "catalog-project-listener-fault-1";
    const unsubscribe = onProjectThreadDataChanged(() => {
      throw new Error("post-commit project/thread change listener failure");
    });
    let response: { status: number; body: Record<string, unknown> };
    try {
      response = await postCommand(
        info,
        operatorToken,
        "/api/projects/command",
        { kind: "reorder", projectId: "p4", targetProjectId: "p1", placement: "before" },
        commandId,
      );
    } finally {
      unsubscribe();
    }
    // The atomic write committed; the listener failure must NOT be a definite failure.
    expect(projectOrder()).toEqual(["p4", "p1", "p2", "p3"]);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
    expect(receiptRow(commandId)?.state).toBe("uncertain");

    // The same id is refused as uncertain (never re-applied, never `command_failed`).
    const retry = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      { kind: "reorder", projectId: "p4", targetProjectId: "p1", placement: "before" },
      commandId,
    );
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
    expect(projectOrder()).toEqual(["p4", "p1", "p2", "p3"]);

    // A fresh id converges (the relative move is already a no-op).
    const fresh = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      { kind: "reorder", projectId: "p4", targetProjectId: "p1", placement: "before" },
      "catalog-project-listener-fault-fresh-1",
    );
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual({ ok: true });
  });

  it("classifies a post-commit change-listener failure as uncertain on the thread route", async () => {
    const commandId = "catalog-thread-listener-fault-1";
    const unsubscribe = onProjectThreadDataChanged(() => {
      throw new Error("post-commit project/thread change listener failure");
    });
    let response: { status: number; body: Record<string, unknown> };
    try {
      response = await postCommand(
        info,
        operatorToken,
        "/api/threads/t4/command",
        {
          kind: "reorder",
          projectId: "p1",
          threadIds: ["t4"],
          targetThreadId: "t1",
          placement: "before",
        },
        commandId,
      );
    } finally {
      unsubscribe();
    }
    expect(threadOrder("p1")).toEqual(["t4", "t1", "t2", "t3", "t5"]);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
    expect(receiptRow(commandId)?.state).toBe("uncertain");

    const retry = await postCommand(
      info,
      operatorToken,
      "/api/threads/t4/command",
      {
        kind: "reorder",
        projectId: "p1",
        threadIds: ["t4"],
        targetThreadId: "t1",
        placement: "before",
      },
      commandId,
    );
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
    expect(threadOrder("p1")).toEqual(["t4", "t1", "t2", "t3", "t5"]);
  });

  it("classifies a post-commit mirror-callback failure as uncertain while the broadcast still lands", async () => {
    onProjectsChanged.mockImplementation(() => {
      throw new Error("projects mirror callback failure");
    });
    const { ws, read } = await openPairedSocket(info, operatorToken);
    const commandId = "catalog-project-mirror-fault-1";
    try {
      const response = await postCommand(
        info,
        operatorToken,
        "/api/projects/command",
        { kind: "set-workspace", projectId: "p2", workspaceId: "workspace-fault" },
        commandId,
      );
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
      const stored = getSqlite()
        .prepare("SELECT workspace_id FROM projects WHERE id = 'p2'")
        .get() as { workspace_id: string | null };
      expect(stored.workspace_id).toBe("workspace-fault");
      expect(receiptRow(commandId)?.state).toBe("uncertain");
      // The WS publication runs before the mirror callback: other clients did converge.
      const broadcast = await waitForEventType(read, "remote-projects-changed");
      expect((broadcast.projects as Project[]).some((project) => project.id === "p2")).toBe(true);

      const retry = await postCommand(
        info,
        operatorToken,
        "/api/projects/command",
        { kind: "set-workspace", projectId: "p2", workspaceId: "workspace-fault" },
        commandId,
      );
      expect(retry.status).toBe(409);
      expect(retry.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
    } finally {
      ws.close();
    }
  });

  it("classifies a post-commit response-parse failure as uncertain, never invalid_request", async () => {
    // A stored row that no longer satisfies the wire schema poisons the
    // post-write authoritative read used to build the response.
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = ? WHERE id = 'p3'")
      .run(JSON.stringify("not-a-draft-config"));
    const commandId = "catalog-project-parse-fault-1";
    const response = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      { kind: "set-workspace", projectId: "p2", workspaceId: "workspace-parse" },
      commandId,
    );
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
    const stored = getSqlite()
      .prepare("SELECT workspace_id FROM projects WHERE id = 'p2'")
      .get() as { workspace_id: string | null };
    expect(stored.workspace_id).toBe("workspace-parse");
    expect(receiptRow(commandId)?.state).toBe("uncertain");

    getSqlite().prepare("UPDATE projects SET last_draft_config = NULL WHERE id = 'p3'").run();
    const retry = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      { kind: "set-workspace", projectId: "p2", workspaceId: "workspace-parse" },
      commandId,
    );
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
    expect(
      (
        getSqlite().prepare("SELECT workspace_id FROM projects WHERE id = 'p2'").get() as {
          workspace_id: string | null;
        }
      ).workspace_id,
    ).toBe("workspace-parse");
  });

  it("returns truthful committed success when the receipt write fails and blocks the same id", async () => {
    // Real fault injection: a trigger aborts the receipt `completed` write while
    // the catalog write itself commits.
    getSqlite()
      .prepare(
        `CREATE TRIGGER catalog_fail_receipt_complete
           BEFORE UPDATE OF state ON remote_command_receipts
           WHEN NEW.state = 'completed'
           BEGIN SELECT RAISE(ABORT, 'receipt write failure'); END`,
      )
      .run();
    const commandId = "catalog-project-receipt-fault-1";
    let response: { status: number; body: Record<string, unknown> };
    try {
      response = await postCommand(
        info,
        operatorToken,
        "/api/projects/command",
        { kind: "reorder", projectId: "p4", targetProjectId: "p1", placement: "before" },
        commandId,
      );
    } finally {
      getSqlite().prepare("DROP TRIGGER catalog_fail_receipt_complete").run();
    }
    // The committed result is returned truthfully; no false failure is fabricated.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(projectOrder()).toEqual(["p4", "p1", "p2", "p3"]);
    expect(receiptRow(commandId)?.state).toBe("in_progress");

    // The unresolved receipt blocks the same id instead of re-applying the move.
    const retry = await postCommand(
      info,
      operatorToken,
      "/api/projects/command",
      { kind: "reorder", projectId: "p4", targetProjectId: "p1", placement: "before" },
      commandId,
    );
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ error: { code: "command_in_progress" } });
    expect(projectOrder()).toEqual(["p4", "p1", "p2", "p3"]);
  });

  it("requires the command id for catalog kinds before any effect and keeps legacy kinds unchanged", async () => {
    const receiptsBefore = (
      getSqlite().prepare("SELECT COUNT(*) AS count FROM remote_command_receipts").get() as {
        count: number;
      }
    ).count;
    const orderBefore = projectOrder();
    const threadBefore = JSON.stringify(dbGetThreads());

    const projectReorder = await postCommand(info, operatorToken, "/api/projects/command", {
      kind: "reorder",
      projectId: "p4",
      targetProjectId: "p1",
      placement: "before",
    });
    expect(projectReorder.status).toBe(400);
    expect(projectReorder.body).toMatchObject({ error: { code: "command_id_required" } });

    const projectWorkspace = await postCommand(info, operatorToken, "/api/projects/command", {
      kind: "set-workspace",
      projectId: "p1",
      workspaceId: "workspace-without-id",
    });
    expect(projectWorkspace.status).toBe(400);
    expect(projectWorkspace.body).toMatchObject({ error: { code: "command_id_required" } });

    const projectDraft = await postCommand(info, operatorToken, "/api/projects/command", {
      kind: "set-draft-config",
      projectId: "p1",
      lastDraftConfig: { agentKind: "claude", model: "sonnet" },
    });
    expect(projectDraft.status).toBe(400);
    expect(projectDraft.body).toMatchObject({ error: { code: "command_id_required" } });

    const threadReorder = await postCommand(info, operatorToken, "/api/threads/t4/command", {
      kind: "reorder",
      projectId: "p1",
      threadIds: ["t4"],
      targetThreadId: "t1",
      placement: "before",
    });
    expect(threadReorder.status).toBe(400);
    expect(threadReorder.body).toMatchObject({ error: { code: "command_id_required" } });

    const threadWorkspace = await postCommand(info, operatorToken, "/api/threads/t1/command", {
      kind: "set-workspace",
      workspaceId: "workspace-without-id",
    });
    expect(threadWorkspace.status).toBe(400);
    expect(threadWorkspace.body).toMatchObject({ error: { code: "command_id_required" } });

    expect(projectOrder()).toEqual(orderBefore);
    expect(JSON.stringify(dbGetThreads())).toBe(threadBefore);
    expect(
      (
        getSqlite().prepare("SELECT COUNT(*) AS count FROM remote_command_receipts").get() as {
          count: number;
        }
      ).count,
    ).toBe(receiptsBefore);

    // Legacy kinds keep their historical no-id dispatch.
    const legacyProject = await postCommand(info, operatorToken, "/api/projects/command", {
      kind: "update",
      projectId: "p1",
      patch: { name: "Legacy rename without id" },
    });
    expect(legacyProject.status).toBe(200);
    expect(Array.isArray(legacyProject.body.projects)).toBe(true);
    expect(dbGetProjects().find((project) => project.id === "p1")?.name).toBe(
      "Legacy rename without id",
    );

    const legacyThread = await postCommand(info, operatorToken, "/api/threads/t1/command", {
      kind: "rename",
      title: "Legacy thread rename without id",
    });
    expect(legacyThread.status).toBe(200);
    expect(dbGetThreads().find((thread) => thread.id === "t1")?.title).toBe(
      "Legacy thread rename without id",
    );
  });
});
