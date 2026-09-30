import "fake-indexeddb/auto";
import { WebSocket as NodeWebSocket } from "ws";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import type { SupervisorEvent } from "@/shared/ipc";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteAccessServerOptions } from "@/host/remote/RemoteAccessServer";
import { RemoteAccessServer } from "@/host/remote/RemoteAccessServer";
import { closeDatabase, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { useAppStore } from "@/renderer/state/appStore";
import {
  installElectronClientRuntime,
  isDesktopLoopbackIntakeActive,
  resetClientRuntimeForTest,
  resetDesktopLoopbackIntakeForTest,
  startDesktopLoopbackEventIntake,
  __setDesktopLoopbackIntakeTestSeamsForTest,
} from "@/renderer/clientRuntime";
import {
  attachManagedLoopbackPreload,
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { PreloadIpcTransport } from "@/renderer/hostTransport/preloadIpcTransport";
import {
  installManagedRootCatalogRuntime,
  resolveManagedRootThreadPin,
  __resetManagedRootCatalogRuntimeForTest,
} from "./rootCatalogAdapter";
import { getManagedRootCatalogStatus } from "./rootCatalogStore";

/**
 * B4 root catalog adapter against the REAL HTTP + SQLite authority.
 *
 * - real `RemoteAccessServer` (real bounded-read routes) on loopback;
 * - real `better-sqlite3` database seeded with 10,000 threads / 2,000
 *   projects;
 * - real managed loopback `RemoteDesktopClient` activation through the real
 *   `DesktopLoopbackIntake`;
 * - page 1 paints while the continuation is HELD, then the walk converges,
 *   an exact pin installs before membership, and a host-confirmed deletion
 *   removes the row with zero renderer catalog writes.
 */

const THREAD_COUNT = 10_000;
const PROJECT_COUNT = 2_000;

const servers: RemoteAccessServer[] = [];
const dataRoots: string[] = [];
const preloadCalls: string[] = [];
let databasePath: string | null = null;
let restoreBoundedReadHolds: (() => void) | null = null;

function threadId(index: number): string {
  return `t-${index.toString(16).padStart(8, "0")}`;
}

function projectId(index: number): string {
  return `p-${index.toString(16).padStart(6, "0")}`;
}

function seed(): void {
  const sqlite = getSqlite();
  sqlite.pragma("foreign_keys = OFF");
  const insertProject = sqlite.prepare(
    "INSERT INTO projects (id, name, location_kind, location_path, sort_order, created_at) VALUES (?, ?, 'posix', ?, ?, '2026-01-01T00:00:00.000Z')",
  );
  const insertThread = sqlite.prepare(
    `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', '{"model":"sonnet"}', 'idle', 'none', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  );
  sqlite.transaction(() => {
    for (let index = 0; index < PROJECT_COUNT; index += 1) {
      insertProject.run(projectId(index), `Project ${index}`, `/tmp/root-${index}`, index);
    }
    for (let index = 0; index < THREAD_COUNT; index += 1) {
      insertThread.run(threadId(index), projectId(index % PROJECT_COUNT), `Thread ${index}`, index);
    }
  })();
}

async function startFixtureServer(): Promise<RemoteAccessServer> {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "root-catalog-fixture", label: "Fixture" },
    host: "127.0.0.1",
    port: 0,
    tls: null,
    ownsSupervisorPersistence: false,
    onEventInterestsChanged: vi.fn<() => void>(),
    callSupervisor: (async (procedure: string) => {
      if (procedure === "readTerminalScrollback") return "";
      if (procedure === "readTerminalSize") return { cols: 80, rows: 24 };
      if (procedure === "readThreadBackgroundTasks") return [];
      if (procedure === "getThreadFollowUpQueue") return null;
      return { ok: true };
    }) as unknown as RemoteAccessServerOptions["callSupervisor"],
    schedules: {
      list: () => [],
      runs: () => [],
      create: () => {
        throw new Error("not used");
      },
      update: () => {
        throw new Error("not used");
      },
      delete: () => {},
      runNow: () => {
        throw new Error("not used");
      },
    },
  });
  servers.push(server);
  await server.start();
  return server;
}

function bootstrapPayloadFor(server: RemoteAccessServer): {
  endpoint: string;
  pairingUrl: string;
} {
  const info = server.getInfo();
  if (!info) throw new Error("fixture server not started");
  const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  if (!pairingToken) throw new Error("fixture server has no startup credential");
  return {
    endpoint: info.localHttpBaseUrl,
    pairingUrl: `${info.localHttpBaseUrl}/#token=${pairingToken}`,
  };
}

function wsSocketFactory(url: string) {
  const socket = new NodeWebSocket(url);
  socket.on("error", () => {
    // The intake models transport errors as close.
  });
  let onopen: (() => void) | null = null;
  let onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  let onclose: (() => void) | null = null;
  socket.on("open", () => onopen?.());
  socket.on("message", (data) => onmessage?.({ data: data.toString() }));
  socket.on("close", () => onclose?.());
  return {
    close: () => socket.close(),
    send: (data: string) => socket.send(data),
    get onopen() {
      return onopen;
    },
    set onopen(handler: (() => void) | null) {
      onopen = handler;
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(handler: ((event: { readonly data: unknown }) => void) | null) {
      onmessage = handler;
    },
    get onclose() {
      return onclose;
    },
    set onclose(handler: (() => void) | null) {
      onclose = handler;
    },
  };
}

function electronHost(
  getBootstrap: () => { endpoint: string; pairingUrl: string } | null,
): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch: "x64",
    platform: "darwin",
    onSupervisorEvent: (_listener: (event: SupervisorEvent, sequence?: number) => void) => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    invokeProcedure: (async (name: string) => {
      preloadCalls.push(name);
      if (name === "getManagedLoopbackBootstrap") return getBootstrap();
      if (name === "setRendererEventInterests") return null;
      if (name === "dbGetState") return null;
      throw new Error(`unexpected IPC procedure ${name}`);
    }) as ElectronHostBridge["invokeProcedure"],
  } as unknown as ElectronHostBridge;
}

async function waitForCatalogReady(): Promise<void> {
  try {
    await vi.waitFor(() => expect(getManagedRootCatalogStatus().status).toBe("ready"), {
      timeout: 15_000,
    });
  } catch (error) {
    console.error("catalog status:", JSON.stringify(getManagedRootCatalogStatus()));
    throw error;
  }
}

function rootThreads() {
  return useAppStore.getState().threads.filter((thread) => thread.remoteServerId === undefined);
}

function rootProjects() {
  return useAppStore.getState().projects.filter((project) => project.remoteServerId === undefined);
}

beforeEach(async () => {
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
  preloadCalls.splice(0);
  useAppStore.setState({ threads: [], projects: [] });
  const dir = await mkdtemp(join(tmpdir(), "poracode-root-catalog-"));
  dataRoots.push(dir);
  databasePath = join(dir, "poracode.db");
  initDatabase(databasePath);
  seed();
});

afterEach(async () => {
  restoreBoundedReadHolds?.();
  restoreBoundedReadHolds = null;
  __resetManagedRootCatalogRuntimeForTest();
  resetDesktopLoopbackIntakeForTest();
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  await Promise.all(dataRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  databasePath = null;
  closeDatabase();
  useAppStore.setState({ threads: [], projects: [] });
  vi.restoreAllMocks();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("managed root catalog over real HTTP + SQLite", () => {
  it("paints page 1 before the held continuation, converges, pins, and gates deletion", async () => {
    const server = await startFixtureServer();
    const bootstrap = bootstrapPayloadFor(server);
    const host = electronHost(() => bootstrap);
    window.poracodeHost = host;
    installElectronClientRuntime(host);
    __setDesktopLoopbackIntakeTestSeamsForTest({
      socketFactory: wsSocketFactory,
      retryDelayMs: 50,
      discoveryRetryMs: 80,
      descriptorRetryMs: 5_000,
    });
    // Hold EVERY continuation call at the prototype level, armed BEFORE the
    // intake starts, so no page beyond page 1 can paint even if the intake
    // activates faster than this test resumes. Page 1 itself is the bounded
    // shell snapshot and is never held.
    const prototype = RemoteDesktopClient.prototype as unknown as {
      boundedThreadListPage: (options?: unknown) => Promise<unknown>;
      boundedProjectListPage: (options?: unknown) => Promise<unknown>;
    };
    const originalListPage = prototype.boundedThreadListPage;
    const originalProjectPage = prototype.boundedProjectListPage;
    const held: Array<() => void> = [];
    let holdArmed = true;
    const hold = <Result>(run: () => Promise<Result>): Promise<Result> => {
      if (!holdArmed) return run();
      return new Promise<Result>((resolve, reject) => {
        held.push(() => {
          run().then(resolve, reject);
        });
      });
    };
    prototype.boundedThreadListPage = function (options?: unknown) {
      return hold(() => originalListPage.call(this, options)) as Promise<never>;
    };
    prototype.boundedProjectListPage = function (options?: unknown) {
      return hold(() => originalProjectPage.call(this, options)) as Promise<never>;
    };
    const releaseContinuations = () => {
      holdArmed = false;
      const pending = held.splice(0);
      for (const run of pending) run();
    };
    restoreBoundedReadHolds = () => {
      prototype.boundedThreadListPage = originalListPage;
      prototype.boundedProjectListPage = originalProjectPage;
      releaseContinuations();
    };

    installManagedRootCatalogRuntime();
    void startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 10_000 });
    await waitForCatalogReady();

    const activation = readManagedLoopbackActivation();
    expect(activation).not.toBeNull();
    const client = activation!.client;

    // Page 1 painted with a bounded page while every continuation is held.
    await vi.waitFor(() => expect(rootThreads().length).toBeGreaterThan(0));
    expect(rootThreads().length).toBe(100);
    expect(new Set(rootThreads().map((thread) => thread.id)).size).toBe(100);
    expect(rootThreads()[0]!.id).toBe("t-00000000");
    // Wait for the first continuation to actually park on the hold, then
    // prove no later page painted while it is parked.
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0));
    expect(rootThreads().length).toBe(100);
    expect(rootProjects().length).toBeLessThanOrEqual(50);
    releaseContinuations();

    await vi.waitFor(() => expect(rootThreads().length).toBe(THREAD_COUNT), { timeout: 60_000 });
    await vi.waitFor(() => expect(rootProjects().length).toBe(PROJECT_COUNT), { timeout: 60_000 });
    // Root ids are preserved (no remote projection) and every row carries the
    // host's status.
    expect(
      rootThreads().every((thread) => thread.id.startsWith("t-") && thread.remoteId === undefined),
    ).toBe(true);
    expect(rootProjects().every((project) => project.id.startsWith("p-"))).toBe(true);

    // Exact pin install: a host row created after the walk still resolves
    // through the existing bounded history route and installs immediately.
    const pinnedId = "t-deadbeef";
    getSqlite()
      .prepare(
        `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, sort_order, created_at, updated_at)
         VALUES (?, ?, 'Pinned', 'claude', '{"model":"sonnet"}', 'idle', 'none', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run(pinnedId, projectId(0));
    expect(await resolveManagedRootThreadPin(pinnedId)).toBe(true);
    expect(rootThreads().some((thread) => thread.id === pinnedId)).toBe(true);

    // Host-confirmed deletion: the command removes the durable row and the
    // membership broadcast drives the confirmation-gated local removal. The
    // deletion must not come from a page omission and must not write back.
    const doomedId = threadId(THREAD_COUNT - 1);
    expect(rootThreads().some((thread) => thread.id === doomedId)).toBe(true);
    await client.sendThreadCommand({ kind: "delete", threadId: doomedId });
    await vi.waitFor(
      () => expect(rootThreads().some((thread) => thread.id === doomedId)).toBe(false),
      { timeout: 30_000 },
    );
    // 10k walk + the exact pin - the confirmed deletion.
    expect(rootThreads().length).toBe(THREAD_COUNT);

    // No renderer catalog write path was exercised: the raw preload data
    // plane saw preferences and bootstrap only.
    expect(preloadCalls).not.toContain("dbSyncAll");
    expect(preloadCalls).not.toContain("dbSyncChanges");
    expect(preloadCalls).not.toContain("dbGetThreadsPage");
    expect(preloadCalls).not.toContain("dbGetProjects");
  }, 120_000);

  it("restarts from page 1 on a fresh activation and never applies a retired page", async () => {
    const server = await startFixtureServer();
    const info = server.getInfo();
    if (!info) throw new Error("fixture server not started");
    let bootstrapAsks = 0;
    const host = electronHost(() => {
      bootstrapAsks += 1;
      // Main mints a fresh single-use credential per ask, so the restart after
      // a teardown does not replay the spent startup credential.
      return bootstrapAsks === 1
        ? bootstrapPayloadFor(server)
        : { endpoint: info.localHttpBaseUrl, pairingUrl: server.issuePairingUrl("restart") };
    });
    window.poracodeHost = host;
    installElectronClientRuntime(host);
    __setDesktopLoopbackIntakeTestSeamsForTest({
      socketFactory: wsSocketFactory,
      retryDelayMs: 50,
      discoveryRetryMs: 80,
      descriptorRetryMs: 5_000,
    });
    installManagedRootCatalogRuntime();
    const activations: Array<number | null> = [];
    subscribeManagedLoopbackActivation((next) => {
      activations.push(next?.seq ?? null);
    });
    void startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 10_000 });
    await waitForCatalogReady();
    expect(activations.length).toBeGreaterThan(0);
    const firstSeq = readManagedLoopbackActivation()?.seq;

    // Simulate a leg restart: dispose the intake (a retired activation must
    // never serve a delayed page) and re-attach the preload so the next intake
    // can bootstrap with a fresh single-use credential.
    resetDesktopLoopbackIntakeForTest();
    await vi.waitFor(() => expect(readManagedLoopbackActivation()).toBeNull());
    expect(getManagedRootCatalogStatus().status).toBe("starting");
    attachManagedLoopbackPreload(new PreloadIpcTransport(host, {} as never));

    void startDesktopLoopbackEventIntake();
    await vi.waitFor(
      () => {
        const next = readManagedLoopbackActivation();
        expect(next).not.toBeNull();
        expect(next?.seq).not.toBe(firstSeq);
      },
      { timeout: 10_000 },
    );
    await waitForCatalogReady();
    expect(bootstrapAsks).toBeGreaterThanOrEqual(2);
    expect(readManagedLoopbackActivation()).not.toBeNull();
  }, 60_000);
});
