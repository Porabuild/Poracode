import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOST_RESOURCE_BUSY_CODE,
  HostResourceAdmissionRefusalError,
} from "@/shared/hostResourceAdmission";
import { closeDatabase, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

/**
 * B2 correctness for the provider-switch variant of `/api/threads/start`: the
 * dispatch marker must sit at the true effect boundary. A pure rejection
 * (durable row is not GUI / the switch source provider is stale) happens before
 * the row retarget, the renderer mirror or the supervisor call, so the first
 * response is a definite 409 and the receipt records `failed`; a same-id retry
 * is a definite `command_failed`. Anything at or after the retarget — including
 * a host-resource admission refusal — stays `uncertain`, and a previously
 * uncertain receipt is never downgraded by a later validation rejection.
 */
const GUI = "thread-switch-gui";
const TERMINAL = "thread-switch-terminal";

function busyRefusal() {
  return new HostResourceAdmissionRefusalError(
    "Host agent-session capacity is full: limit 1 (active 1, pending 0). Retry after 1000ms.",
    { code: HOST_RESOURCE_BUSY_CODE, retryAfterMs: 1_000 },
  );
}

async function exchangePairingUrl(pairingUrl: string): Promise<string> {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:operate", "session:read"],
      client: { label: "Switch receipt test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

function receiptState(commandId: string): string | undefined {
  return (
    getSqlite()
      .prepare("SELECT state FROM remote_command_receipts WHERE command_id = ?")
      .get(commandId) as { state: string } | undefined
  )?.state;
}

describe.skipIf(!sqliteAvailable)("provider-switch validation receipts", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  let server: RemoteAccessServer;
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;
  let dispatched: ReturnType<
    typeof vi.fn<NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>>
  >;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-switch-receipts-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Switch project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), id: GUI, presentationMode: "gui" }, 0);
    dbUpsertThread({ ...testThread(), id: TERMINAL, presentationMode: "terminal" }, 1);
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => ({ threadId: GUI }) as never,
    );
    dispatched = vi.fn<NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>>(() => true);
    server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
      dispatchThreadCommand: dispatched,
    } satisfies RemoteAccessServerOptions);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
  });

  afterEach(async () => {
    await server.dispose();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  const post = (commandId: string, body: Record<string, unknown>): Promise<Response> =>
    fetch(new URL("/api/threads/start", info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-poracode-command-id": commandId,
      },
      body: JSON.stringify(body),
    });

  const switchBody = (threadId: string, fromAgentKind: string, agentKind = "claude") => ({
    threadId,
    projectLocation: { kind: "posix", path: "/tmp/project" },
    agentKind,
    config: { model: `${agentKind}-model` },
    prompt: "continue",
    initialSize: { cols: 120, rows: 30 },
    presentationMode: "gui",
    providerSwitch: { fromAgentKind },
  });

  it("records a stale-source rejection as a definite failure with no effect", async () => {
    const commandId = "switch-stale";
    const body = switchBody(GUI, "claude");
    const first = await post(commandId, body);
    expect(first.status).toBe(409);
    await expect(first.json()).resolves.toMatchObject({
      error: { code: "provider_switch_stale" },
    });
    expect(receiptState(commandId)).toBe("failed");
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(dispatched).not.toHaveBeenCalled();
    expect(dbGetThread(GUI)).toMatchObject({
      agentKind: "codex",
      presentationMode: "gui",
      status: "working",
    });

    const retry = await post(commandId, body);
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({ error: { code: "command_failed" } });
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(receiptState(commandId)).toBe("failed");
  });

  it("records a durable-row GUI rejection as a definite failure with no effect", async () => {
    const commandId = "switch-requires-gui";
    const body = switchBody(TERMINAL, "codex");
    const first = await post(commandId, body);
    expect(first.status).toBe(409);
    await expect(first.json()).resolves.toMatchObject({
      error: { code: "provider_switch_requires_gui" },
    });
    expect(receiptState(commandId)).toBe("failed");
    expect(callSupervisor).not.toHaveBeenCalled();
    expect(dispatched).not.toHaveBeenCalled();
    expect(dbGetThread(TERMINAL)).toMatchObject({ presentationMode: "terminal" });

    const retry = await post(commandId, body);
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({ error: { code: "command_failed" } });
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("completes a valid switch and replays the same-id result without a second effect", async () => {
    const commandId = "switch-valid";
    const body = switchBody(GUI, "codex");
    const first = await post(commandId, body);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ threadId: GUI });
    expect(receiptState(commandId)).toBe("completed");
    expect(dbGetThread(GUI)).toMatchObject({ agentKind: "claude", status: "launching" });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(dispatched).toHaveBeenCalledTimes(1);

    const replay = await post(commandId, body);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual({ threadId: GUI });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(dispatched).toHaveBeenCalledTimes(1);
    expect(receiptState(commandId)).toBe("completed");
  });

  it("keeps a post-retarget admission refusal uncertain and never downgrades it", async () => {
    const commandId = "switch-busy";
    const body = switchBody(GUI, "codex");
    callSupervisor.mockImplementationOnce(async () => {
      throw busyRefusal();
    });
    const first = await post(commandId, body);
    expect(first.status).toBe(409);
    await expect(first.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(receiptState(commandId)).toBe("uncertain");
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    // The retarget and its compensating renderer mirror really happened: the
    // refusal is genuinely ambiguous, not a pure validation rejection.
    expect(dispatched).toHaveBeenCalledTimes(2);

    // Make the durable row reject the switch shape, then retry: a previously
    // uncertain receipt must not be downgraded by current-attempt validation.
    const restored = dbGetThread(GUI)!;
    dbUpsertThread({ ...restored, presentationMode: "terminal" }, 0);
    const retry = await post(commandId, body);
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
    expect(dispatched).toHaveBeenCalledTimes(2);
    expect(receiptState(commandId)).toBe("uncertain");
  });
});
