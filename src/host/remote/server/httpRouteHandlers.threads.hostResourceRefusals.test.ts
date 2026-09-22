import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOST_RESOURCE_BUSY_CODE,
  HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
  HostResourceAdmissionRefusalError,
} from "@/shared/hostResourceAdmission";
import { closeDatabase, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "../RemoteAccessServer";

/**
 * Real HTTP truthfulness for host-resource-admission refusals, end to end: a
 * live server, a bearer session, the durable receipt table and the typed
 * refusal the host rehydrates from the supervisor reply.
 *
 * The first response and the persisted receipt always agree. A route whose
 * whole operation is source-proven pre-effect (the plain start routes) records
 * `failed` and answers a definite retryable 429; a compound route (provider
 * switch, thread-command start, send) keeps `uncertain` and answers the typed
 * 409 with the actionable cause and no retry hint. An unkeyed compound refusal
 * answers the same 409 and writes no receipt. Control routes are never gated by
 * admission and stay available while starts are refused.
 */
const PLAIN = "thread-plain";
const GUI = "thread-gui";
const SEND = "thread-send-target";

function busyRefusal() {
  return new HostResourceAdmissionRefusalError(
    "Host agent-session capacity is full: limit 1 (active 1, pending 0). Retry after 1000ms.",
    { code: HOST_RESOURCE_BUSY_CODE, retryAfterMs: 1_000 },
  );
}

function policyUnavailableRefusal() {
  return new HostResourceAdmissionRefusalError(
    "Host resource admission policy is unavailable (host-resource-admission-invalid); new counted starts are refused.",
    { code: HOST_RESOURCE_POLICY_UNAVAILABLE_CODE },
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
      scopes: ["session:operate", "terminal:operate"],
      client: { label: "Admission refusal test", deviceType: "mobile" },
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

function receiptCount(): number {
  return (
    getSqlite().prepare("SELECT COUNT(*) AS count FROM remote_command_receipts").get() as {
      count: number;
    }
  ).count;
}

describe.skipIf(!sqliteAvailable)("thread route host-resource-admission refusals", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  let server: RemoteAccessServer;
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-host-admission-http-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Admission project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), id: PLAIN, presentationMode: "terminal" }, 0);
    dbUpsertThread({ ...testThread(), id: GUI, presentationMode: "gui" }, 1);
    dbUpsertThread({ ...testThread(), id: SEND, presentationMode: "terminal" }, 2);
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async (name) => {
      // A send can refuse after the supervisor already mutated its in-memory
      // queue (a restart-on-demand), so the route treats it as compound. The
      // ensure-running reopen path is the one keyed start branch that must
      // never touch the receipt table — it is a passthrough to the supervisor.
      if (name === "startThread" || name === "sendThreadInput" || name === "ensureThreadRunning") {
        throw busyRefusal();
      }
      return "" as never;
    });
    server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      callSupervisor,
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

  const headers = () => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  const post = (
    path: string,
    body: Record<string, unknown>,
    commandId?: string,
  ): Promise<Response> =>
    fetch(new URL(path, info.httpBaseUrl), {
      method: "POST",
      headers: {
        ...headers(),
        ...(commandId ? { "x-poracode-command-id": commandId } : {}),
      },
      body: JSON.stringify(body),
    });

  const startBody = (threadId: string, extra: Record<string, unknown> = {}) => ({
    threadId,
    projectLocation: { kind: "posix", path: "/tmp/project" },
    agentKind: "codex",
    config: { model: "gpt-5" },
    prompt: "",
    initialSize: { cols: 120, rows: 30 },
    presentationMode: "terminal",
    ...extra,
  });

  const commandStartBody = () => ({
    kind: "start",
    projectId: "project-1",
    agentKind: "codex",
    config: { model: "gpt-5" },
    prompt: "",
    presentationMode: "terminal",
  });

  const sendBody = () => ({ prompt: "hello", config: { model: "gpt-5" } });

  it("answers a pre-effect start refusal with 429, a retry hint and a failed receipt", async () => {
    const commandId = "cmd-plain-start";
    const response = await post("/api/threads/start", startBody(PLAIN), commandId);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: HOST_RESOURCE_BUSY_CODE },
    });
    expect(receiptState(commandId)).toBe("failed");
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    // A same-id retry is a definite `command_failed`; a NEW command id is the
    // safe retry, and the supervisor is never re-invoked for the old id.
    const retry = await post("/api/threads/start", startBody(PLAIN), commandId);
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({ error: { code: "command_failed" } });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("shares the definite mapping for the procedure startThread passthrough", async () => {
    const commandId = "cmd-procedure-start";
    const response = await post(
      "/api/git/call",
      { procedure: "startThread", payload: startBody(PLAIN) },
      commandId,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: HOST_RESOURCE_BUSY_CODE },
    });
    expect(receiptState(commandId)).toBe("failed");

    const retry = await post(
      "/api/git/call",
      { procedure: "startThread", payload: startBody(PLAIN) },
      commandId,
    );
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({ error: { code: "command_failed" } });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: "the dedicated reopen route",
      path: "/api/threads/start",
      body: () => startBody(PLAIN, { ensureRunning: true }),
    },
    {
      label: "the ensureThreadRunning procedure passthrough",
      path: "/api/git/call",
      body: () => ({ procedure: "ensureThreadRunning", payload: startBody(PLAIN) }),
    },
  ])(
    "answers a keyed ensure-running refusal with 429, a retry hint and no receipt ever ($label)",
    async ({ path, body }) => {
      const commandId = "cmd-ensure-running";
      const response = await post(path, body(), commandId);
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("1");
      await expect(response.json()).resolves.toMatchObject({
        error: { code: HOST_RESOURCE_BUSY_CODE },
      });
      expect(callSupervisor.mock.calls.map(([name]) => name)).toEqual(["ensureThreadRunning"]);
      // The one keyed start branch that writes no receipt: the supervisor call
      // either starts a session or refuses; it never leaves a command outcome
      // to reconcile, so a same-id retry is not blocked by a stale receipt.
      expect(receiptState(commandId)).toBeUndefined();
      expect(receiptCount()).toBe(0);
    },
  );

  it("keeps a provider-switch refusal uncertain in both the response and the receipt", async () => {
    const commandId = "cmd-provider-switch";
    const body = startBody(GUI, {
      agentKind: "claude",
      presentationMode: "gui",
      providerSwitch: { fromAgentKind: "codex" },
    });
    const response = await post("/api/threads/start", body, commandId);
    expect(response.status).toBe(409);
    expect(response.headers.has("retry-after")).toBe(false);
    const payload = (await response.json()) as { error: { code: string; message: string } };
    expect(payload.error.code).toBe("command_outcome_uncertain");
    expect(payload.error.message).toContain("capacity is full");
    expect(payload.error.message).toContain("may have taken effect");
    expect(receiptState(commandId)).toBe("uncertain");
    expect(callSupervisor).toHaveBeenCalledTimes(1);

    const retry = await post("/api/threads/start", body, commandId);
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("keeps a compound thread-command start refusal uncertain", async () => {
    const commandId = "cmd-command-start";
    const response = await post(`/api/threads/${PLAIN}/command`, commandStartBody(), commandId);
    expect(response.status).toBe(409);
    expect(response.headers.has("retry-after")).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(receiptState(commandId)).toBe("uncertain");

    const retry = await post(`/api/threads/${PLAIN}/command`, commandStartBody(), commandId);
    expect(retry.status).toBe(409);
    expect(receiptState(commandId)).toBe("uncertain");
    expect(callSupervisor).toHaveBeenCalledTimes(1);
  });

  it("keeps a send refusal uncertain and answers an unkeyed send with no receipt", async () => {
    const commandId = "cmd-send";
    const keyed = await post(`/api/threads/${SEND}/send`, sendBody(), commandId);
    expect(keyed.status).toBe(409);
    await expect(keyed.json()).resolves.toMatchObject({
      error: { code: "command_outcome_uncertain" },
    });
    expect(receiptState(commandId)).toBe("uncertain");

    const before = receiptCount();
    const unkeyed = await post(`/api/threads/${SEND}/send`, sendBody());
    expect(unkeyed.status).toBe(409);
    const payload = (await unkeyed.json()) as { error: { code: string; message: string } };
    expect(payload.error.code).toBe("command_outcome_uncertain");
    expect(payload.error.message).toContain("capacity is full");
    expect(payload.error.message).toContain("may have taken effect");
    expect(receiptCount()).toBe(before);
  });

  it("maps a policy-unavailable start refusal to 429 without a retry promise", async () => {
    callSupervisor.mockImplementation(async (name) => {
      if (name === "startThread") throw policyUnavailableRefusal();
      return "" as never;
    });
    const commandId = "cmd-policy-unavailable";
    const response = await post("/api/threads/start", startBody(PLAIN), commandId);
    expect(response.status).toBe(429);
    expect(response.headers.has("retry-after")).toBe(false);
    const payload = (await response.json()) as { error: { code: string; message: string } };
    expect(payload.error.code).toBe(HOST_RESOURCE_POLICY_UNAVAILABLE_CODE);
    expect(payload.error.message).toContain("policy is unavailable");
    expect(receiptState(commandId)).toBe("failed");
  });

  it("maps an unkeyed policy-unavailable terminal start to 429", async () => {
    callSupervisor.mockImplementation(async (name) => {
      if (name === "startShell") throw policyUnavailableRefusal();
      return "" as never;
    });
    const response = await post("/api/terminal/start", {
      shellId: "shell-1",
      projectLocation: { kind: "posix", path: "/tmp/project" },
    });
    expect(response.status).toBe(429);
    expect(response.headers.has("retry-after")).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: HOST_RESOURCE_POLICY_UNAVAILABLE_CODE },
    });
  });

  it("keeps stop/close controls available while starts are refused", async () => {
    const refused = await post("/api/threads/start", startBody(PLAIN), "cmd-controls-full");
    expect(refused.status).toBe(429);

    const interrupt = await post(`/api/threads/${PLAIN}/interrupt`, {});
    expect(interrupt.status).toBe(200);
    await expect(interrupt.json()).resolves.toEqual({ ok: true });
    const close = await post(`/api/threads/${PLAIN}/close`, {});
    expect(close.status).toBe(200);
    await expect(close.json()).resolves.toEqual({ ok: true });

    // The same controls stay available under an unresolved (fail-closed)
    // policy: they never call the admission owner.
    callSupervisor.mockImplementation(async (name) => {
      if (name === "startThread") throw policyUnavailableRefusal();
      return "" as never;
    });
    const invalid = await post("/api/threads/start", startBody(PLAIN), "cmd-controls-invalid");
    expect(invalid.status).toBe(429);
    const interruptAgain = await post(`/api/threads/${PLAIN}/interrupt`, {});
    expect(interruptAgain.status).toBe(200);
    const closeAgain = await post(`/api/threads/${PLAIN}/close`, {});
    expect(closeAgain.status).toBe(200);
  });
});
