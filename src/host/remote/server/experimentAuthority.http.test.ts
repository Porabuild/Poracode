import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  MAX_EXPERIMENT_STATE_BYTES,
  type Experiment,
  type Project,
  type RemoteExperimentCommand,
} from "@/shared/contracts";
import {
  beginProjectRemoval,
  closeDatabase,
  dbGetState,
  dbReadExperimentState,
  dbSetState,
  dbUpsertProject,
  experimentStoreRevision,
  initDatabase,
} from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";
import { ROUTE_HANDLERS, type HttpRouteCall } from "./httpRouteHandlers";
import type { RemoteServerContext } from "./context";
import { relayLoopbackHopSecret } from "./relayHopSecret";

/**
 * Experiment authority over the REAL HTTP server + REAL SQLite:
 * capability/composition truthfulness, receipts and command-id semantics,
 * canonical domain validation, store-wide CAS + client rebase, custody
 * (confirmed retirement held across the final destructive mutation), partial
 * external-effect uncertainty, locality, scopes, and the no-launch invariant.
 */

const servers: RemoteAccessServer[] = [];
const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(here, "../../../..");

function testProject(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function experimentRecord(id: string, projectId = "p1"): Experiment {
  return {
    id,
    projectId,
    title: `Experiment ${id}`,
    prompt: `compare ${id}`,
    baseBranch: "main",
    baseCommit: "a".repeat(40),
    candidates: [
      {
        threadId: `${id}-c1`,
        agentKind: "claude",
        worktreeBranch: `poracode/experiment-${id}-1`,
        worktreeOwnerToken: `${id}:${id}-c1`,
        worktreeState: "pending",
      },
      {
        threadId: `${id}-c2`,
        agentKind: "claude",
        worktreeBranch: `poracode/experiment-${id}-2`,
        worktreeOwnerToken: `${id}:${id}-c2`,
        worktreeState: "pending",
      },
    ],
    status: "running",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createCommandWire(record: Experiment): RemoteExperimentCommand {
  return {
    kind: "create",
    experimentId: record.id,
    record,
    threads: record.candidates.map((candidate, index) => ({
      threadId: candidate.threadId,
      projectId: record.projectId,
      title: `Candidate ${index + 1}`,
      agentKind: "claude",
      config: { model: "opus" },
      worktreeBranch: candidate.worktreeBranch,
    })),
  } as RemoteExperimentCommand;
}

type ExperimentRowUpdates = NonNullable<
  Extract<RemoteExperimentCommand, { kind: "replace" }>["rows"]
>;

function replaceCommandWire(
  record: Experiment,
  revision: string,
  rows?: ExperimentRowUpdates,
): RemoteExperimentCommand {
  return {
    kind: "replace",
    experimentId: record.id,
    revision,
    record,
    ...(rows ? { rows } : {}),
  } as RemoteExperimentCommand;
}

function removeCommandWire(
  experimentId: string,
  revision: string,
  candidateDisposition: "delete" | "release" = "delete",
): RemoteExperimentCommand {
  return { kind: "remove", experimentId, revision, candidateDisposition };
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
      client: { label: "Experiment authority test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function getState(
  info: RemoteAccessServerInfo,
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL("/api/experiments", info.httpBaseUrl), {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function postCommand(
  info: RemoteAccessServerInfo,
  token: string,
  experimentId: string,
  body: RemoteExperimentCommand,
  commandId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { experimentId: _pathId, ...wireBody } = body;
  const response = await fetch(
    new URL(`/api/experiments/${encodeURIComponent(experimentId)}/command`, info.httpBaseUrl),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(commandId ? { "x-poracode-command-id": commandId } : {}),
      },
      body: JSON.stringify(wireBody),
    },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

function receiptRow(commandId: string) {
  return getSqlite()
    .prepare("SELECT state, response FROM remote_command_receipts WHERE command_id = ?")
    .get(commandId) as { state: string; response: string | null } | undefined;
}

function storedExperiments(): Record<string, unknown> {
  const raw = dbGetState(EXPERIMENT_STORE_KEY);
  if (!raw) return {};
  return (JSON.parse(raw) as { state: { experiments: Record<string, unknown> } }).state.experiments;
}

function threadRow(threadId: string): Record<string, unknown> | undefined {
  return getSqlite().prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as
    | Record<string, unknown>
    | undefined;
}

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

describe.skipIf(!sqliteAvailable)("experiment authority over real HTTP", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let server: RemoteAccessServer;
  let operatorToken: string;
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;
  let custodyEvents: string[];
  let retireImpl: (threadId: string) => Promise<boolean>;
  let custody: NonNullable<RemoteAccessServerOptions["experimentAuthority"]>;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-experiment-http-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertProject(testProject("p2"), 1);
    custodyEvents = [];
    retireImpl = async () => true;
    custody = {
      runThreadMutation: async (threadId, operation) => {
        custodyEvents.push(`enter:${threadId}`);
        try {
          return await operation();
        } finally {
          custodyEvents.push(`exit:${threadId}`);
        }
      },
      retireThread: (threadId) => retireImpl(threadId),
    };
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never);
    server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-experiments", label: "Experiment desktop" },
      host: "127.0.0.1",
      port: 0,
      experimentAuthority: custody,
      callSupervisor,
    });
    servers.push(server);
    info = await server.start();
    operatorToken = await exchangePairingUrl(info.pairingUrl, ["session:read", "session:operate"]);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((instance) => instance.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("advertises the capability only with the authority composed and answers 501 without it", async () => {
    const descriptor = (await (
      await fetch(new URL("/.well-known/poracode/environment", info.httpBaseUrl))
    ).json()) as { capabilities?: { experiments?: { versions?: number[] } } };
    expect(descriptor.capabilities?.experiments?.versions).toEqual([1]);

    const bare = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-bare", label: "Bare desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(bare);
    const bareInfo = await bare.start();
    const bareDescriptor = (await (
      await fetch(new URL("/.well-known/poracode/environment", bareInfo.httpBaseUrl))
    ).json()) as { capabilities?: { experiments?: unknown } };
    expect(bareDescriptor.capabilities?.experiments).toBeUndefined();

    const bareToken = await exchangePairingUrl(bareInfo.pairingUrl, [
      "session:read",
      "session:operate",
    ]);
    expect((await getState(bareInfo, bareToken)).status).toBe(501);
    const command = await postCommand(
      bareInfo,
      bareToken,
      "E1",
      removeCommandWire("E1", "xh1:x"),
      "experiment-bare-1",
    );
    expect(command.status).toBe(501);
    expect(command.body).toMatchObject({ error: { code: "experiment_authority_unavailable" } });
  });

  it("creates the record and candidate rows atomically without launching, and publishes the touched ids", async () => {
    const { ws, read } = await openPairedSocket(info, operatorToken);
    try {
      await read();
      const record = experimentRecord("E1");
      const created = await postCommand(
        info,
        operatorToken,
        "E1",
        createCommandWire(record),
        "experiment-create-1",
      );
      expect(created.status).toBe(200);
      expect(created.body).toEqual({ ok: true, revision: expect.stringMatching(/^xh1:/) });

      expect(storedExperiments().E1).toEqual(record);
      expect(threadRow("E1-c1")).toMatchObject({
        project_id: "p1",
        status: "inactive",
        attention: "none",
        session_ref: null,
        worktree_path: null,
        worktree_branch: "poracode/experiment-E1-1",
        group_id: "E1",
        group_name: "Experiment E1",
        done: 0,
        starred: 0,
      });
      expect(threadRow("E1-c2")).toBeDefined();
      // Create is insert-only: no supervisor call for any kind at all.
      expect(callSupervisor).not.toHaveBeenCalled();

      const broadcast = await waitForEventType(read, "remote-threads-changed");
      expect((broadcast.threadIds as string[]).sort()).toEqual(["E1-c1", "E1-c2"]);
      expect(receiptRow("experiment-create-1")?.state).toBe("completed");
    } finally {
      ws.close();
    }
  });

  it("requires the command id, replays a completed receipt, and conflicts on a changed body", async () => {
    const record = experimentRecord("E1");
    const missing = await postCommand(info, operatorToken, "E1", createCommandWire(record));
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ error: { code: "command_id_required" } });
    expect(storedExperiments()).toEqual({});

    const first = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-2",
    );
    expect(first.status).toBe(200);
    const revision = (first.body as { revision: string }).revision;

    const replay = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-2",
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ ok: true, revision });

    const conflict = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire({ ...record, title: "Changed" }),
      "experiment-create-2",
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ error: { code: "command_id_conflict" } });
    expect((storedExperiments().E1 as Experiment).title).toBe(record.title);
  });

  it("re-parses the canonical record and candidate references before any effect", async () => {
    const base = experimentRecord("E1");
    const invalid: Experiment = { ...base, status: "decided" };
    const recordFailure = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(invalid),
      "experiment-invalid-1",
    );
    expect(recordFailure.status).toBe(400);
    expect(recordFailure.body).toMatchObject({ error: { code: "invalid_experiment" } });

    const mismatch = createCommandWire(base);
    if (mismatch.kind !== "create") throw new Error("unreachable");
    const threadsFailure = await postCommand(
      info,
      operatorToken,
      "E1",
      {
        ...mismatch,
        threads: [{ ...mismatch.threads[0]!, threadId: "not-a-candidate" }, mismatch.threads[1]!],
      } as RemoteExperimentCommand,
      "experiment-invalid-2",
    );
    expect(threadsFailure.status).toBe(400);
    expect(threadsFailure.body).toMatchObject({ error: { code: "invalid_experiment_threads" } });
    expect(storedExperiments()).toEqual({});
    expect(threadRow("E1-c1")).toBeUndefined();
  });

  it("conflicts on a stale store-wide token, then applies a rebased replace", async () => {
    const record = experimentRecord("E1");
    const created = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-3",
    );
    expect(created.status).toBe(200);
    const staleRevision = (created.body as { revision: string }).revision;

    // An unrelated out-of-band write invalidates the store-wide token.
    dbSetState(
      EXPERIMENT_STORE_KEY,
      JSON.stringify({
        state: {
          experiments: {
            E1: record,
            E2: { ...experimentRecord("E2", "p2"), futureField: { keep: true } },
          },
        },
        version: EXPERIMENT_STORE_VERSION,
      }),
    );

    const conflict = await postCommand(
      info,
      operatorToken,
      "E1",
      replaceCommandWire({ ...record, title: "Renamed" }, staleRevision),
      "experiment-replace-stale",
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ error: { code: "experiment_revision_conflict" } });

    const read = await getState(info, operatorToken);
    expect(read.status).toBe(200);
    const rebased = await postCommand(
      info,
      operatorToken,
      "E1",
      replaceCommandWire({ ...record, title: "Renamed" }, read.body.revision as string),
      "experiment-replace-rebased",
    );
    expect(rebased.status).toBe(200);
    expect((storedExperiments().E1 as Experiment).title).toBe("Renamed");
    // Untouched records keep their JSON values, unknown fields included.
    expect(storedExperiments().E2).toEqual({
      ...experimentRecord("E2", "p2"),
      futureField: { keep: true },
    });
  });

  it("holds per-candidate custody in deterministic order across confirmed retirement and the delete", async () => {
    const record = experimentRecord("E1");
    const created = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-4",
    );
    const revision = (created.body as { revision: string }).revision;
    const retired: string[] = [];
    retireImpl = async (threadId) => {
      retired.push(threadId);
      return true;
    };

    const removed = await postCommand(
      info,
      operatorToken,
      "E1",
      removeCommandWire("E1", revision),
      "experiment-remove-1",
    );
    expect(removed.status).toBe(200);
    expect(retired).toEqual(["E1-c1", "E1-c2"]);
    // Nested locks: both candidates are held before either is released.
    expect(custodyEvents).toEqual(["enter:E1-c1", "enter:E1-c2", "exit:E1-c2", "exit:E1-c1"]);
    expect(threadRow("E1-c1")).toBeUndefined();
    expect(threadRow("E1-c2")).toBeUndefined();
    expect(storedExperiments().E1).toBeUndefined();
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("classifies an unconfirmed retirement as uncertain and retries idempotently on the same id", async () => {
    const record = experimentRecord("E1");
    const created = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-5",
    );
    const revision = (created.body as { revision: string }).revision;
    retireImpl = async () => false;

    const refused = await postCommand(
      info,
      operatorToken,
      "E1",
      removeCommandWire("E1", revision),
      "experiment-remove-retry",
    );
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { code: "candidate_retirement_unconfirmed" } });
    expect(receiptRow("experiment-remove-retry")?.state).toBe("uncertain");
    expect(storedExperiments().E1).toBeDefined();
    expect(threadRow("E1-c1")).toBeDefined();

    // Same id after the runtime settles: the receipt reconciles (nothing about
    // the store changed), the retirement re-runs idempotently, and the command
    // completes without re-applying anything twice.
    retireImpl = async () => true;
    const retried = await postCommand(
      info,
      operatorToken,
      "E1",
      removeCommandWire("E1", revision),
      "experiment-remove-retry",
    );
    expect(retried.status).toBe(200);
    expect(storedExperiments().E1).toBeUndefined();
    expect(receiptRow("experiment-remove-retry")?.state).toBe("completed");
  });

  it("never reports a post-retirement conflict as a definite failure", async () => {
    const record = experimentRecord("E1");
    const created = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-6",
    );
    const revision = (created.body as { revision: string }).revision;
    // The retirement has a real external effect and, before the transaction,
    // an unrelated writer moves the store baseline.
    retireImpl = async () => {
      dbSetState(
        EXPERIMENT_STORE_KEY,
        JSON.stringify({
          state: { experiments: { E1: record, E9: experimentRecord("E9", "p2") } },
          version: EXPERIMENT_STORE_VERSION,
        }),
      );
      return true;
    };

    const refused = await postCommand(
      info,
      operatorToken,
      "E1",
      removeCommandWire("E1", revision),
      "experiment-remove-partial",
    );
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { code: "experiment_revision_conflict" } });
    // The runtime may already be retired, so the receipt must not be a
    // definite failure.
    expect(receiptRow("experiment-remove-partial")?.state).toBe("uncertain");

    // A same-id retry never re-applies under the newer baseline.
    const retry = await postCommand(
      info,
      operatorToken,
      "E1",
      removeCommandWire("E1", revision),
      "experiment-remove-partial",
    );
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ error: { code: "command_outcome_uncertain" } });
    expect(storedExperiments().E1).toBeDefined();
    expect(storedExperiments().E9).toBeDefined();
  });

  it("refuses a remove with a running checkpoint revert as a whole-command refusal", async () => {
    const record = experimentRecord("E1");
    const created = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-7",
    );
    const revision = (created.body as { revision: string }).revision;
    getSqlite()
      .prepare(
        `INSERT INTO checkpoint_revert_operations (
           operation_key, thread_id, checkpoint_item_id, num_turns, provider_phase, files_phase,
           truncate_phase, outcome, created_at, updated_at
         ) VALUES ('op-1', 'E1-c1', 'item-1', 1, 'pending', 'pending', 'pending', 'running', 1, 1)`,
      )
      .run();

    const blocked = await postCommand(
      info,
      operatorToken,
      "E1",
      removeCommandWire("E1", revision),
      "experiment-remove-blocked",
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ error: { code: "checkpoint_revert_running" } });
    expect(threadRow("E1-c1")).toBeDefined();
    expect(storedExperiments().E1).toBeDefined();
    expect(receiptRow("experiment-remove-blocked")?.state).toBe("failed");

    getSqlite()
      .prepare(
        "UPDATE checkpoint_revert_operations SET outcome = 'ambiguous' WHERE operation_key = 'op-1'",
      )
      .run();
    const applied = await postCommand(
      info,
      operatorToken,
      "E1",
      removeCommandWire("E1", revision),
      "experiment-remove-settled",
    );
    expect(applied.status).toBe(200);
    expect(storedExperiments().E1).toBeUndefined();
  });

  it("refuses every mutating intent for a project that is being removed", async () => {
    const record = experimentRecord("E1");
    const created = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-8",
    );
    const revision = (created.body as { revision: string }).revision;

    const release = beginProjectRemoval("p1");
    try {
      const createRefused = await postCommand(
        info,
        operatorToken,
        "E2",
        createCommandWire(experimentRecord("E2")),
        "experiment-create-removing",
      );
      expect(createRefused.status).toBe(409);
      expect(createRefused.body).toMatchObject({ error: { code: "project_removing" } });

      const removeRefused = await postCommand(
        info,
        operatorToken,
        "E1",
        removeCommandWire("E1", revision),
        "experiment-remove-removing",
      );
      expect(removeRefused.status).toBe(409);
      expect(removeRefused.body).toMatchObject({ error: { code: "project_removing" } });
      expect(storedExperiments().E1).toBeDefined();
      expect(threadRow("E1-c1")).toBeDefined();
    } finally {
      release();
    }
  });

  it("enforces the documented loopback locality gate for mutating kinds", async () => {
    const ctx = {
      options: { experimentAuthority: custody },
      publishThreadsChanged: () => {},
    } as unknown as RemoteServerContext;
    const call = {
      ctx,
      req: { socket: { remoteAddress: "203.0.113.9" }, headers: {} } as unknown as IncomingMessage,
      res: {} as never,
      url: new URL("http://localhost/api/experiments/E1/command"),
      forwardOrigin: null,
      bearerToken: "token",
      session: null,
      readClass: "normal",
      params: { experimentId: "E1" },
    } as HttpRouteCall;
    await expect(ROUTE_HANDLERS["experiment-command"](call)).rejects.toMatchObject({
      code: "experiments_desktop_local",
      status: 403,
    });
  });

  it("refuses a relay-stamped loopback command with the direct-peer locality gate", async () => {
    const record = experimentRecord("E1");
    const response = await fetch(new URL("/api/experiments/E1/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${operatorToken}`,
        "content-type": "application/json",
        "x-poracode-command-id": "experiment-relay-1",
        // Exactly the marker the in-process relay adapter stamps on its
        // loopback dial; the shared classifier must refuse it as proxied.
        "x-poracode-relay-hop": relayLoopbackHopSecret(),
      },
      body: JSON.stringify(createCommandWire(record)),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "experiments_desktop_local" },
    });
    expect(storedExperiments()).toEqual({});
    expect(threadRow("E1-c1")).toBeUndefined();
  });

  it("refuses an over-budget mutation before custody and still allows shrinking removal", async () => {
    const record = experimentRecord("E1");
    await postCommand(info, operatorToken, "E1", createCommandWire(record), "experiment-budget-1");
    const huge = {
      ...experimentRecord("E2"),
      futureField: "x".repeat(MAX_EXPERIMENT_STATE_BYTES + 1024),
    };
    dbSetState(
      EXPERIMENT_STORE_KEY,
      JSON.stringify({
        state: { experiments: { E1: record, E2: huge } },
        version: EXPERIMENT_STORE_VERSION,
      }),
    );
    const seededRaw = dbGetState(EXPERIMENT_STORE_KEY)!;
    const seededRevision = experimentStoreRevision(seededRaw);

    // A replace that would keep the store over budget is refused in preflight:
    // no custody event, no row effect, and the stored value is untouched.
    const refused = await postCommand(
      info,
      operatorToken,
      "E1",
      replaceCommandWire({ ...record, title: `${record.title} (renamed)` }, seededRevision, [
        { threadId: "E1-c1", retire: "done" },
      ]),
      "experiment-budget-2",
    );
    expect(refused.status).toBe(413);
    expect(refused.body).toMatchObject({ error: { code: "experiments_too_large" } });
    expect(custodyEvents).toEqual([]);
    expect(threadRow("E1-c1")!.done).toBe(0);
    expect(dbGetState(EXPERIMENT_STORE_KEY)).toBe(seededRaw);

    // Removing the over-budget record strictly shrinks the store: the shared
    // writer accepts the shrink and the served read recovers.
    const shrink = await postCommand(
      info,
      operatorToken,
      "E2",
      removeCommandWire("E2", seededRevision),
      "experiment-budget-3",
    );
    expect(shrink.status).toBe(200);
    expect(Buffer.byteLength(dbGetState(EXPERIMENT_STORE_KEY)!, "utf8")).toBeLessThanOrEqual(
      MAX_EXPERIMENT_STATE_BYTES,
    );
    expect(dbReadExperimentState().status).toBe("ok");
  });

  it("keeps the read on ordinary scopes and refuses the mutation to a viewer session", async () => {
    const viewerToken = await exchangePairingUrl(
      server.issueIndependentPairingUrl("Viewer tablet", { preset: "viewer" }),
    );
    expect((await getState(info, viewerToken)).status).toBe(200);
    const refused = await postCommand(
      info,
      viewerToken,
      "E1",
      createCommandWire(experimentRecord("E1")),
      "experiment-viewer-1",
    );
    expect(refused.status).toBe(403);
    expect(storedExperiments()).toEqual({});
  });

  it("never launches and never reaches the supervisor from the intent modules", () => {
    const sources = [
      "src/host/remote/server/experimentCommands.ts",
      "src/host/db/experimentIntents.ts",
      "src/host/db/experimentStore.ts",
    ]
      .map((path) => readFileSync(join(repositoryRoot, path), "utf8"))
      .join("\n");
    expect(sources).not.toContain("callSupervisor");
    expect(sources).not.toContain("startThread");
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("serves the canonical state read with the same token a command returns", async () => {
    const record = experimentRecord("E1");
    const created = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-9",
    );
    expect(created.status).toBe(200);
    const read = await getState(info, operatorToken);
    expect(read.status).toBe(200);
    expect(read.body.revision).toBe((created.body as { revision: string }).revision);
    expect(read.body.experiments).toEqual({ E1: record });
  });

  it("exposes immutable ownership and missing-row refusals truthfully", async () => {
    const record = experimentRecord("E1");
    const created = await postCommand(
      info,
      operatorToken,
      "E1",
      createCommandWire(record),
      "experiment-create-10",
    );
    const revision = (created.body as { revision: string }).revision;

    const changedOwnership = {
      ...record,
      candidates: [
        { ...record.candidates[0]!, worktreeBranch: "poracode/other" },
        record.candidates[1]!,
      ],
    };
    const ownership = await postCommand(
      info,
      operatorToken,
      "E1",
      replaceCommandWire(changedOwnership, revision),
      "experiment-ownership-1",
    );
    expect(ownership.status).toBe(409);
    expect(ownership.body).toMatchObject({ error: { code: "candidate_ownership_changed" } });

    getSqlite().prepare("DELETE FROM threads WHERE id = 'E1-c1'").run();
    const missing = await postCommand(
      info,
      operatorToken,
      "E1",
      replaceCommandWire(record, revision, [{ threadId: "E1-c1", groupName: "renamed" }]),
      "experiment-missing-row",
    );
    expect(missing.status).toBe(409);
    expect(missing.body).toMatchObject({ error: { code: "candidate_row_missing" } });
    expect(threadRow("E1-c1")).toBeUndefined();
  });

  it("answers a fully removed record idempotently and refuses when candidate rows remain", async () => {
    const record = experimentRecord("E1");
    await postCommand(info, operatorToken, "E1", createCommandWire(record), "experiment-create-11");
    // A record that never existed (or was already fully removed) has no
    // candidate rows left: the requested post-state already holds.
    const absent = await postCommand(
      info,
      operatorToken,
      "MISSING",
      removeCommandWire("MISSING", "xh1:x"),
      "experiment-missing-1",
    );
    expect(absent.status).toBe(200);
    expect(absent.body).toMatchObject({ ok: true });

    // A record id that still owns candidate rows but has no record is NOT an
    // idempotent post-state: truthful 404, never a blind row action.
    getSqlite()
      .prepare(
        `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention,
           can_resume_with_config, group_id, sort_order, created_at, updated_at)
         VALUES ('orphan-1', 'p1', 'orphan', 'claude', '{}', 'inactive', 'none', 0, 'ORPHAN', 9,
                 '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run();
    const orphan = await postCommand(
      info,
      operatorToken,
      "ORPHAN",
      removeCommandWire("ORPHAN", "xh1:x"),
      "experiment-orphan-1",
    );
    expect(orphan.status).toBe(404);
    expect(orphan.body).toMatchObject({ error: { code: "experiment_not_found" } });
    expect(threadRow("orphan-1")).toBeDefined();
    expect(dbReadExperimentState().status).toBe("ok");
  });
});
