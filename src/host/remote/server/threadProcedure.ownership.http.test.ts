import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "@/host/db";
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
      scopes: ["session:read", "session:operate"],
      client: { label: "Procedure ownership test", deviceType: "mobile" },
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

/**
 * Generic `/api/git/call` ownership: the passthrough allowlist is
 * supervisor-typed, so a main-local IPC procedure name (raw DB or local-shell)
 * is refused with the typed 403 before any dispatch — never cast to a
 * supervisor procedure and never answered by a database dispatcher. A removed
 * name is indistinguishable from a never-allowlisted one for every client.
 */
describe.skipIf(!sqliteAvailable)("procedure passthrough ownership", () => {
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;
  let callSupervisor: ReturnType<typeof vi.fn<RemoteAccessServerOptions["callSupervisor"]>>;

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-procedure-ownership-"));
    initDatabase(join(dir, "state.sqlite"));
    callSupervisor = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => ({}) as never);
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

  const call = (procedure: string, payload: Record<string, unknown>) =>
    fetch(new URL("/api/git/call", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ procedure, payload }),
    });

  it.each([
    ["dbDeleteThread", { threadId: "t1" }],
    ["dbDeleteProject", { projectId: "p1" }],
    ["dbGetThreadRuntimeItems", { threadId: "t1" }],
    ["dbReplaceThreadRuntimeItems", { threadId: "t1", items: [] }],
    ["revealProjectEntry", { projectLocation: { kind: "posix", path: "/tmp/repo" } }],
    ["detectProjectIcon", { projectLocation: { kind: "posix", path: "/tmp/repo" } }],
    ["listProjectIconFiles", { projectLocation: { kind: "posix", path: "/tmp/repo" } }],
  ])("refuses main-local %s with the typed unsupported error", async (procedure, payload) => {
    const response = await call(procedure, payload);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "git_procedure_not_allowed" },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("refuses a never-allowlisted name the same way", async () => {
    const response = await call("notARealProcedure", {});
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "git_procedure_not_allowed" },
    });
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("still dispatches a retained supervisor procedure", async () => {
    callSupervisor.mockResolvedValueOnce([] as never);
    const response = await call("readThreadBackgroundTasks", { threadId: "t1" });
    expect(response.status).toBe(200);
    expect(callSupervisor).toHaveBeenCalledWith("readThreadBackgroundTasks", { threadId: "t1" });
  });
});
