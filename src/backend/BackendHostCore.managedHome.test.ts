import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { closeDatabase, dbGetProject, dbGetThread, initDatabase } from "@/host/db";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  RemoteAccessServer,
  type RemoteAccessServerInfo,
  type RemoteAccessServerOptions,
} from "@/host/remote/RemoteAccessServer";

const mocks = vi.hoisted(() => ({
  dispose: vi.fn<() => Promise<void>>(async () => undefined),
  call: vi.fn<(type: string, payload: unknown) => Promise<unknown>>(async () => "" as never),
  runThreadMutation: vi.fn<
    (threadId: string, operation: () => Promise<unknown>) => Promise<unknown>
  >((_threadId, operation) => operation()),
}));

vi.mock("@/host/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = vi.fn<() => Promise<void>>(async () => undefined);
    restart = vi.fn<() => Promise<void>>(async () => undefined);
    dispose = mocks.dispose;
    call = mocks.call;
    runThreadMutation = mocks.runThreadMutation;
    acknowledgeCanonicalFlow = vi.fn<() => void>();
    getPeerCanonicalCapabilities = vi.fn<() => unknown>(() => ({
      supportsCanonicalCredit: false,
      generation: null,
    }));
    setEventBackpressured = vi.fn<() => void>();
  },
}));

import { BackendHostCore } from "./BackendHostCore";

/**
 * Fresh-profile managed Home launch: the owning managed-host startup persists
 * the canonical Home row before the remote catalog/first launch can observe an
 * absent row, and a validate-only (offline/import) open writes nothing. The
 * launch is exercised through the REAL HTTP thread-command route against REAL
 * SQLite, and the negative case proves the startup prerequisite is load-bearing
 * (a fresh row-less host refuses the Home launch with project_not_found).
 */
describe.skipIf(!sqliteAvailable)("managed host canonical Home startup", () => {
  const servers: RemoteAccessServer[] = [];
  let dir: string;
  let info: RemoteAccessServerInfo;
  let token: string;

  async function exchangePairingUrl(pairingUrl: string): Promise<string> {
    const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
    const response = await fetch(new URL("/oauth/token", new URL(pairingUrl).origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential,
        scopes: ["session:operate"],
        client: { label: "Managed Home test", deviceType: "mobile" },
      }),
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { accessToken: string }).accessToken;
  }

  async function startServer(): Promise<void> {
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-managed-home", label: "Managed Home desktop" },
      host: "127.0.0.1",
      port: 0,
      dispatchThreadCommand: vi.fn<() => boolean>(() => true),
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    info = await server.start();
    token = await exchangePairingUrl(info.pairingUrl);
  }

  function startHomeThread(threadId: string): Promise<Response> {
    return fetch(new URL(`/api/threads/${threadId}/command`, info.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-poracode-command-id": `thread-start:${threadId}`,
      },
      body: JSON.stringify({
        kind: "start",
        projectId: HOME_PROJECT_ID,
        agentKind: "claude",
        config: { model: "sonnet" },
        prompt: "Home launch",
      }),
    });
  }

  function createHost(databaseSchemaMode?: "migrate" | "validate"): BackendHostCore {
    return new BackendHostCore({
      baseDir: dir,
      dbPath: join(dir, "state.sqlite"),
      ...(databaseSchemaMode ? { databaseSchemaMode } : {}),
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
      },
      onEvent: vi.fn<() => void>(),
      onReset: vi.fn<() => void>(),
    });
  }

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-managed-home-"));
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("refuses a fresh-profile Home launch when no host startup persisted the row", async () => {
    initDatabase(join(dir, "state.sqlite"));
    expect(dbGetProject(HOME_PROJECT_ID)).toBeNull();
    await startServer();

    const response = await startHomeThread("home-before-startup");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "project_not_found" },
    });
    expect(dbGetThread("home-before-startup")).toBeNull();
  });

  it("launches a fresh-profile Home thread after managed-host startup persisted canonical Home", async () => {
    initDatabase(join(dir, "state.sqlite"));
    // Real owning-managed-host startup on the same fresh profile.
    closeDatabase();
    const host = createHost();
    try {
      const home = dbGetProject(HOME_PROJECT_ID);
      expect(home).not.toBeNull();
      await startServer();

      const response = await startHomeThread("home-after-startup");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(dbGetThread("home-after-startup")).toMatchObject({
        id: "home-after-startup",
        projectId: HOME_PROJECT_ID,
      });
    } finally {
      await host.dispose();
    }
  });

  it("writes no Home row on a validate-only open, so an offline host cannot launch one", async () => {
    initDatabase(join(dir, "state.sqlite"));
    closeDatabase();
    const host = createHost("validate");
    try {
      expect(dbGetProject(HOME_PROJECT_ID)).toBeNull();
      await startServer();

      const response = await startHomeThread("home-validate-only");
      expect(response.status).toBe(404);
      expect(dbGetThread("home-validate-only")).toBeNull();
    } finally {
      await host.dispose();
    }
  });
});
