import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REMOTE_PROTOCOL_VERSION_HEADER,
  REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
} from "@/shared/remote";
import type { Project } from "@/shared/contracts";
import {
  remoteMutationMayHaveCommitted,
  RemoteClientError,
  RemoteDesktopClient,
} from "@/shared/remote/client";
import { ThreadSessionAbsenceRefusalError } from "@/shared/threadSessionRefusal";
import { isUnknownThreadSessionError } from "@/shared/threadRelaunch";
import {
  closeDatabase,
  dbGetThread,
  dbGetState,
  dbSetState,
  dbUpsertProject,
  initDatabase,
} from "@/host/db";
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
  const dispatchThreadCommand =
    vi.fn<NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>>();
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-route-receipts-"));
    initDatabase(join(dir, "state.sqlite"));
    dispatchThreadCommand.mockReset();
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never);
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
      dispatchThreadCommand,
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
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
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

  it("starts an independent GUI client conversation without changing or navigating the desktop view", async () => {
    const desktopView = JSON.stringify({ kind: "thread", panes: ["desktop-chat"] });
    dbSetState("view", desktopView);
    dbUpsertProject(
      {
        id: "sidebar-project",
        name: "Sidebar fixture",
        location: { kind: "posix", path: "/tmp/sidebar-fixture" },
        createdAt: "2026-10-07T00:00:00.000Z",
      },
      0,
    );
    const response = await fetch(new URL("/api/threads/sidebar-chat/command", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      body: JSON.stringify({
        kind: "start",
        projectId: "sidebar-project",
        agentKind: "acp-generic:fixture",
        config: { model: "fixture" },
        title: "Browser conversation",
        prompt: "hello",
        presentationMode: "gui",
      }),
    });
    expect(response.status).toBe(200);
    expect(dbGetThread("sidebar-chat")).toMatchObject({ presentationMode: "gui" });
    expect(callSupervisor).toHaveBeenCalledWith(
      "startThread",
      expect.objectContaining({ threadId: "sidebar-chat", presentationMode: "gui" }),
    );
    expect(dispatchThreadCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: "start",
        threadId: "sidebar-chat",
        launchRuntime: false,
        focus: false,
      }),
    );
    expect(dbGetState("view")).toBe(desktopView);
  });

  it("routes per-turn client context to the supervisor without mirroring it to the desktop", async () => {
    dbUpsertProject(
      {
        id: "sidebar-project",
        name: "Sidebar fixture",
        location: { kind: "posix", path: "/tmp/sidebar-fixture" },
        createdAt: "2026-10-07T00:00:00.000Z",
      },
      0,
    );
    const clientContext = {
      browserFocus: { activeTab: { tabId: 17, title: "Inbox", url: "https://mail.test/" } },
    };
    const post = (path: string, body: Record<string, unknown>) =>
      fetch(new URL(path, info.httpBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
        },
        body: JSON.stringify(body),
      });
    const config = { model: "fixture" };
    expect(
      (
        await post("/api/threads/ctx-chat/command", {
          kind: "start",
          projectId: "sidebar-project",
          agentKind: "acp-generic:fixture",
          config,
          prompt: "hello",
          presentationMode: "gui",
          clientContext,
        })
      ).status,
    ).toBe(200);
    expect((await send("ctx-send", { clientContext })).status).toBe(200);
    expect(
      (await post("/api/threads/t1/steer/set", { prompt: "steer", config, clientContext })).status,
    ).toBe(200);

    expect(callSupervisor).toHaveBeenCalledWith(
      "startThread",
      expect.objectContaining({ threadId: "ctx-chat", clientContext }),
    );
    expect(callSupervisor).toHaveBeenCalledWith(
      "sendThreadInput",
      expect.objectContaining({ threadId: "t1", clientContext }),
    );
    expect(callSupervisor).toHaveBeenCalledWith(
      "setPendingSteer",
      expect.objectContaining({ threadId: "t1", clientContext }),
    );
    expect(dispatchThreadCommand.mock.calls[0]?.[0]).not.toHaveProperty("clientContext");
    expect(JSON.stringify(dbGetThread("ctx-chat"))).not.toContain("mail.test");
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
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
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
          [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
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
          [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
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
          [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
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

  it("answers the typed missing-session refusal with a definite 422, records failed, and never re-runs the id", async () => {
    callSupervisor.mockImplementation(async () => {
      throw new ThreadSessionAbsenceRefusalError("Unknown thread session: t1");
    });
    const first = await send("send-typed-1", {});
    expect(first.status).toBe(422);
    await expect(first.json()).resolves.toMatchObject({
      error: { code: "unknown_thread_session", message: "Unknown thread session: t1" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    // Truthful receipt: the refusal is proven pre-effect, so the row is a
    // definite failure, not an ambiguity.
    expect(receiptRow("send-typed-1")?.state).toBe("failed");

    // Same-id replay is the definite command_failed answer, refused without
    // another supervisor call — the failed send is never repeated.
    const replay = await send("send-typed-1", {});
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({ error: { code: "command_failed" } });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow("send-typed-1")?.state).toBe("failed");

    // Without a command id there is no receipt: the raw refusal still maps to
    // the same definite 422 (no uncertain escalation for a proven pre-effect
    // refusal).
    const unkeyed = await fetch(new URL("/api/threads/t1/send", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        [REMOTE_PROTOCOL_VERSION_HEADER]: REMOTE_PROTOCOL_VERSION_HEADER_VALUE,
      },
      body: JSON.stringify({ threadId: "t1", prompt: "hello", config: { model: "gpt-5" } }),
    });
    expect(unkeyed.status).toBe(422);
    await expect(unkeyed.json()).resolves.toMatchObject({
      error: { code: "unknown_thread_session", message: "Unknown thread session: t1" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(2);
  });

  it("classifies the typed 422 through the real client as definite and resume-matching", async () => {
    callSupervisor.mockImplementation(async () => {
      throw new ThreadSessionAbsenceRefusalError("Unknown thread session: t1");
    });
    const client = new RemoteDesktopClient(info.httpBaseUrl, token);
    const error = await client
      .sendThreadInput({
        threadId: "t1",
        prompt: "retry after a failed start",
        config: { model: "gpt-5" },
        userMessageItemId: "send-typed-client-1",
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(RemoteClientError);
    const remoteError = error as RemoteClientError;
    expect(remoteError.status).toBe(422);
    expect(remoteError.code).toBe("unknown_thread_session");
    // The refusal message survives the whole stack.
    expect(remoteError.message).toBe("Unknown thread session: t1");
    // Definite: the client may offer the exact-ref resume, never a blind
    // resend of this send.
    expect(remoteMutationMayHaveCommitted(error)).toBe(false);
    expect(isUnknownThreadSessionError(error)).toBe(true);
    expect(receiptRow("send-typed-client-1")?.state).toBe("failed");
  });

  it("keeps a message-only unknown-session refusal ambiguous (500, uncertain receipt)", async () => {
    // A predecessor supervisor reply (no typed code) — including nested
    // provider prose that merely mentions an unknown session — gets no server
    // message fallback: the code is the only proof of a pre-effect refusal.
    callSupervisor.mockImplementation(async () => {
      throw new Error("provider backend reported: Unknown thread session: t1");
    });
    const first = await send("send-prose-1", {});
    expect(first.status).toBe(500);
    await expect(first.json()).resolves.toMatchObject({
      error: { code: "internal_error", message: "Internal server error." },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow("send-prose-1")?.state).toBe("uncertain");

    const replay = await send("send-prose-1", {});
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("never reclassifies a legacy uncertain receipt, even when later attempts carry the typed refusal", async () => {
    callSupervisor.mockImplementationOnce(async () => {
      throw new Error("response lost after dispatch");
    });
    const first = await send("send-legacy-1", {});
    expect(first.status).toBe(500);
    expect(receiptRow("send-legacy-1")?.state).toBe("uncertain");

    // A newer host would now answer the typed refusal with a definite 422 —
    // but this id's durable row is an uncertainty that stays unresolved: no
    // replay, no reclassification, no supervisor call.
    callSupervisor.mockImplementation(async () => {
      throw new ThreadSessionAbsenceRefusalError("Unknown thread session: t1");
    });
    const replay = await send("send-legacy-1", {});
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow("send-legacy-1")?.state).toBe("uncertain");
  });
});
