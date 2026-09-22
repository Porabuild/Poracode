import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  remoteMutationMayHaveCommitted,
  RemoteDesktopClient,
  type RemoteFetch,
} from "@/shared/remote/client";
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
      client: { label: "Procedure receipt test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

function receiptRow(commandId: string) {
  return getSqlite()
    .prepare(
      `SELECT state, response, principal_id, request_digest, route
       FROM remote_command_receipts WHERE command_id = ?`,
    )
    .get(commandId) as
    | {
        state: string;
        response: string | null;
        principal_id: string | null;
        request_digest: string | null;
        route: string;
      }
    | undefined;
}

const startPayload = {
  threadId: "t1",
  projectLocation: { kind: "posix", path: "/tmp/repo" },
  agentKind: "codex",
  config: { model: "gpt-5" },
  prompt: "hello",
  initialSize: { cols: 80, rows: 24 },
};

/**
 * Receipt wiring for `startThread` delivered through the generic
 * `/api/git/call` procedure passthrough — the managed-loopback and browser
 * transport. A real server, a real bearer session, and a real SQLite receipt
 * table prove the stable-principal/digest binding and the typed uncertain
 * outcome on a lost response.
 */
describe.skipIf(!sqliteAvailable)("startThread procedure receipt wiring", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-procedure-receipts-"));
    initDatabase(join(dir, "state.sqlite"));
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => ({ threadId: "t1" }) as never,
    );
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

  const call = (
    commandId: string | undefined,
    payload: Record<string, unknown> = startPayload,
    bearer = token,
    procedure = "startThread",
  ) =>
    fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        ...(commandId !== undefined ? { "x-poracode-command-id": commandId } : {}),
      },
      body: JSON.stringify({ procedure, payload }),
    });

  it("binds the principal and payload digest, then replays without dispatching again", async () => {
    const commandId = "thread-start:t1";
    const first = await call(commandId);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ result: { threadId: "t1" } });
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    const row = receiptRow(commandId);
    expect(row?.route).toBe("procedure:startThread");
    expect(row?.principal_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.request_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.state).toBe("completed");

    const replay = await call(commandId);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({ result: { threadId: "t1" } });
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    const changed = await call(commandId, { ...startPayload, prompt: "different" });
    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({
      error: { code: "command_id_conflict" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    const otherPairing = servers[0]!.issueIndependentPairingUrl("Second device", {
      preset: "operator",
    });
    const otherToken = await exchangePairingUrl(otherPairing);
    const other = await call(commandId, startPayload, otherToken);
    expect(other.status).toBe(409);
    await expect(other.json()).resolves.toMatchObject({
      error: { code: "command_id_conflict" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("reports an interrupted dispatch as a typed uncertain outcome and never re-executes it", async () => {
    const commandId = "thread-start:t2";
    callSupervisor.mockImplementationOnce(async () => {
      throw new Error("response lost after dispatch");
    });

    const first = await call(commandId, { ...startPayload, threadId: "t2" });
    expect(first.status).toBe(500);
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow(commandId)?.state).toBe("uncertain");

    const retry = await call(commandId, { ...startPayload, threadId: "t2" });
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("keeps an unwrapped call unwrapped when the client sends no command id", async () => {
    await expect(call(undefined).then((response) => response.status)).resolves.toBe(200);
    await expect(call(undefined).then((response) => response.status)).resolves.toBe(200);
    expect(callSupervisor).toHaveBeenCalledTimes(2);
  });

  it("does not receipt-wrap other procedures that carry a command id", async () => {
    const commandId = "thread-start:t3";
    const response = await call(
      commandId,
      { ...startPayload, threadId: "t3" },
      token,
      "ensureThreadRunning",
    );
    expect(response.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow(commandId)).toBeUndefined();
  });

  it("rejects a malformed command id before dispatching", async () => {
    const response = await call("bad id!");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_command_id" },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("classifies a lost /send response through the real route and replays instead of repeating", async () => {
    const client = new RemoteDesktopClient(info.httpBaseUrl, token, losingResponseFetch());
    const input = {
      threadId: "t1",
      prompt: "hello",
      config: { model: "gpt-5" },
      userMessageItemId: "user-9",
    };

    const error = await client.sendThreadInput(input).catch((value: unknown) => value);
    expect(error).toMatchObject({ status: 0, code: "network", requestMayHaveCommitted: true });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow("user-9")?.state).toBe("completed");

    await expect(client.sendThreadInput(input)).resolves.toBeUndefined();
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("classifies a lost response after the real effect as may-have-committed, then replays the frozen result", async () => {
    const client = new RemoteDesktopClient(info.httpBaseUrl, token, losingResponseFetch());
    const commandId = "thread-start-item:user-1";
    const payload = { ...startPayload, userMessageItemId: "user-1" };

    const error = await client
      .callRemoteProcedure("startThread", payload)
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ status: 0, code: "network", requestMayHaveCommitted: true });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow(commandId)?.state).toBe("completed");

    // The host finished before the response was lost, so a retry of the same
    // attempt (same optimistic item id) replays the frozen result instead of
    // repeating the effect or reporting uncertainty.
    await expect(client.callRemoteProcedure("startThread", payload)).resolves.toEqual({
      threadId: "t1",
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    // A manual new attempt mints a new command id and is a new command: the
    // host may repeat the effect. Receipts are crash-aware dedupe, not an
    // exactly-once guarantee.
    await expect(
      client.callRemoteProcedure("startThread", { ...startPayload, userMessageItemId: "user-2" }),
    ).resolves.toEqual({ threadId: "t1" });
    expect(callSupervisor).toHaveBeenCalledTimes(2);
  });

  it("reports a dispatched failure through the real client as may-have-committed, then serves the typed 409", async () => {
    const client = new RemoteDesktopClient(info.httpBaseUrl, token, passthroughFetch());
    const commandId = "thread-start-item:user-3";
    const payload = { ...startPayload, threadId: "t2", userMessageItemId: "user-3" };
    callSupervisor.mockImplementationOnce(async () => {
      throw new Error("host crashed after dispatch");
    });

    const error = await client
      .callRemoteProcedure("startThread", payload)
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ status: 500 });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(receiptRow(commandId)?.state).toBe("uncertain");

    const retry = await client
      .callRemoteProcedure("startThread", payload)
      .catch((value: unknown) => value);
    expect(retry).toMatchObject({ status: 409, code: "command_outcome_uncertain" });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  /**
   * First call: perform the real HTTP request (so the host commits the effect),
   * then discard the response — a lost response after a committed command. The
   * second call passes through so the retry observes the host's answer.
   */
  function losingResponseFetch(): RemoteFetch {
    let loseNextResponse = true;
    return async (url, init) => {
      const response = await passthroughFetch()(url, init);
      if (loseNextResponse) {
        loseNextResponse = false;
        throw new TypeError("Failed to fetch");
      }
      return response;
    };
  }

  function passthroughFetch(): RemoteFetch {
    return async (url, init) =>
      fetch(url, {
        ...(init?.method ? { method: init.method } : {}),
        ...(init?.headers ? { headers: init.headers } : {}),
        ...(init?.body !== undefined ? { body: init.body as BodyInit } : {}),
        ...(init?.signal ? { signal: init.signal } : {}),
      });
  }
});
