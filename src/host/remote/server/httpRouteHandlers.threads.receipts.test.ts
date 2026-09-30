import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { closeDatabase, dbGetThread, dbUpsertProject, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

const servers: RemoteAccessServer[] = [];

async function exchangePairingUrl(pairingUrl: string): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:operate"],
      client: { label: "Receipt test", deviceType: "mobile" },
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

/**
 * End-to-end receipt wiring for the idempotent thread routes: a real server,
 * a real bearer session and a real SQLite receipt table. Proves the route
 * binds the stable principal and validated body digest, replays only its own
 * result, and reports an interrupted command as a typed uncertain outcome
 * without dispatching again.
 */
describe.skipIf(!sqliteAvailable)("thread route receipt wiring", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-route-receipts-"));
    initDatabase(join(dir, "state.sqlite"));
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never);
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
    });
    servers.push(server);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const send = (commandId: string, body: Record<string, unknown>, bearer = token) =>
    fetch(new URL("/api/threads/t1/send", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "x-poracode-command-id": commandId,
      },
      body: JSON.stringify({
        threadId: "t1",
        prompt: "hello",
        config: { model: "gpt-5" },
        ...body,
      }),
    });

  it("binds the principal and body digest, replays its own result, and conflicts on reuse", async () => {
    const commandId = "send-cmd-1";
    const first = await send(commandId, {});
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ ok: true });
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    const row = receiptRow(commandId);
    expect(row?.principal_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.request_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.state).toBe("completed");

    // Same session + same validated body replays without dispatching again.
    const retry = await send(commandId, {});
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({ ok: true });
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    // Same session + changed body conflicts and leaks nothing.
    const changed = await send(commandId, { prompt: "different" });
    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({
      error: { code: "command_id_conflict" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    // A different paired principal never replays another session's result.
    const otherPairing = servers[0]!.issueIndependentPairingUrl("Second device", {
      preset: "operator",
    });
    const otherToken = await exchangePairingUrl(otherPairing);
    const other = await send(commandId, {}, otherToken);
    expect(other.status).toBe(409);
    await expect(other.json()).resolves.toMatchObject({
      error: { code: "command_id_conflict" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("persists complete creation metadata and launches at the client initial size", async () => {
    const project: Project = {
      id: "p1",
      name: "Managed",
      location: { kind: "posix", path: "/tmp/p1" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    dbUpsertProject(project, 0);

    const response = await fetch(new URL("/api/threads/start-meta-1/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-poracode-command-id": "thread-start:start-meta-1",
      },
      body: JSON.stringify({
        kind: "start",
        projectId: "p1",
        agentKind: "claude",
        config: { model: "sonnet" },
        prompt: "build it",
        title: "Fork child",
        groupId: "group-1",
        groupName: "Group One",
        parentThreadId: "parent-1",
        prNumber: 42,
        worktreePath: "/tmp/wt/one",
        worktreeBranch: "feat/one",
        workspaceId: "ws-1",
        initialSize: { cols: 132, rows: 43 },
      }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    expect(dbGetThread("start-meta-1")).toMatchObject({
      id: "start-meta-1",
      projectId: "p1",
      title: "Fork child",
      groupId: "group-1",
      groupName: "Group One",
      parentThreadId: "parent-1",
      prNumber: 42,
      worktreePath: "/tmp/wt/one",
      worktreeBranch: "feat/one",
      workspaceId: "ws-1",
    });
    expect(callSupervisor).toHaveBeenCalledWith(
      "startThread",
      expect.objectContaining({
        threadId: "start-meta-1",
        projectLocation: { kind: "posix", path: "/tmp/wt/one" },
        initialSize: { cols: 132, rows: 43 },
      }),
    );
  });

  it("replays one launch operation on an identical retry and refuses a changed body or an uncertain relaunch", async () => {
    dbUpsertProject(
      {
        id: "p1",
        name: "Managed",
        location: { kind: "posix", path: "/tmp/p1" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    const launch = (commandId: string, prompt: string) =>
      fetch(new URL("/api/threads/start-op-1/command", info.httpBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-poracode-command-id": commandId,
        },
        body: JSON.stringify({
          kind: "start",
          projectId: "p1",
          agentKind: "claude",
          config: { model: "sonnet" },
          prompt,
        }),
      });

    const first = await launch("renderer-launch-op-1", "retained intent");
    expect(first.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    // The renderer retains the SAME operation identity across a retry: the
    // recorded outcome replays and no second runtime is launched.
    const retry = await launch("renderer-launch-op-1", "retained intent");
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({ ok: true });
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    // A changed launch body under the same id is a conflict, never a relaunch.
    const changed = await launch("renderer-launch-op-1", "different intent");
    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({
      error: { code: "command_id_conflict" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    // An interrupted attempt stays uncertain: a fresh request identity is a new
    // action, and the same identity is never blindly relaunched.
    callSupervisor.mockImplementationOnce(async () => {
      throw new Error("launch dispatch lost");
    });
    const interrupted = await launch("renderer-launch-op-2", "uncertain intent");
    expect(interrupted.status).toBe(500);
    expect(receiptRow("renderer-launch-op-2")?.state).toBe("uncertain");
    const uncertainRetry = await launch("renderer-launch-op-2", "uncertain intent");
    expect(uncertainRetry.status).toBe(409);
    await expect(uncertainRetry.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(2);
  });

  it("reports an interrupted dispatch as a typed uncertain outcome and does not re-execute it", async () => {
    const commandId = "send-cmd-2";
    // The supervisor call is dispatched, then the response is lost: the route
    // cannot know whether the provider accepted it.
    callSupervisor.mockImplementationOnce(async () => {
      throw new Error("response lost after dispatch");
    });
    const first = await send(commandId, {});
    expect(first.status).toBe(500);
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow(commandId)?.state).toBe("uncertain");

    const retry = await send(commandId, {});
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow(commandId)?.state).toBe("uncertain");
  });

  it("retains the durable row and exactly one external start across an effect-before-failure retry", async () => {
    dbUpsertProject(
      {
        id: "p1",
        name: "Managed",
        location: { kind: "posix", path: "/tmp/p1" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    let externalStarts = 0;
    callSupervisor.mockImplementation(async (procedure: string) => {
      if (procedure !== "startThread") return "" as never;
      externalStarts += 1;
      // The provider spawn committed BEFORE the response failure: this is the
      // shape that makes "no durable row" a false no-effect proof.
      throw new Error("fixture: provider spawn committed, response failed");
    });
    const launch = (commandId: string) =>
      fetch(new URL("/api/threads/effect-thread-1/command", info.httpBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-poracode-command-id": commandId,
        },
        body: JSON.stringify({
          kind: "start",
          projectId: "p1",
          agentKind: "claude",
          config: { model: "sonnet" },
          prompt: "uncertain external effect",
        }),
      });

    const first = await launch("effect-op-1");
    expect(first.status).toBe(500);
    expect(externalStarts).toBe(1);
    // Evidence retained: the row is NOT rolled back, so no client can read
    // absence as "never effected".
    expect(dbGetThread("effect-thread-1")).toBeDefined();
    expect(receiptRow("effect-op-1")?.state).toBe("uncertain");

    const retry = await launch("effect-op-1");
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(externalStarts).toBe(1);
    expect(dbGetThread("effect-thread-1")).toBeDefined();
  });

  it("classifies a pre-effect project refusal as definite and accepts only a fresh attempt id", async () => {
    const launch = (commandId: string, projectId: string) =>
      fetch(new URL("/api/threads/pre-effect-thread-1/command", info.httpBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-poracode-command-id": commandId,
        },
        body: JSON.stringify({
          kind: "start",
          projectId,
          agentKind: "claude",
          config: { model: "sonnet" },
          prompt: "genuine no-effect retry",
        }),
      });

    const refused = await launch("pre-effect-op-1", "p-missing");
    expect(refused.status).toBe(404);
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(dbGetThread("pre-effect-thread-1")).toBeFalsy();
    expect(receiptRow("pre-effect-op-1")?.state).toBe("failed");

    // The definite failure is not replayable under the same id: the client
    // mints a fresh attempt id for the genuinely new operation.
    const sameId = await launch("pre-effect-op-1", "p-missing");
    expect(sameId.status).toBe(409);
    await expect(sameId.json()).resolves.toMatchObject({ error: { code: "command_failed" } });
    expect(callSupervisor).not.toHaveBeenCalled();

    dbUpsertProject(
      {
        id: "p1",
        name: "Managed",
        location: { kind: "posix", path: "/tmp/p1" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    callSupervisor.mockImplementation(async () => "" as never);
    const fresh = await launch("pre-effect-op-2", "p1");
    expect(fresh.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(dbGetThread("pre-effect-thread-1")).toBeDefined();
  });
});
