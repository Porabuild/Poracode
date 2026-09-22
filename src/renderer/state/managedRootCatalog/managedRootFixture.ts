import "fake-indexeddb/auto";
import { WebSocket as NodeWebSocket } from "ws";
// Shared test fixture (never shipped): the same node temp-dir/paths access the
// `*.test.ts` lint exemptions grant to the suites that consume this module.
// oxlint-disable-next-line no-restricted-imports
import { mkdtemp, rm } from "node:fs/promises";
// oxlint-disable-next-line no-restricted-imports
import { tmpdir } from "node:os";
// oxlint-disable-next-line no-restricted-imports
import { join } from "node:path";
import { expect, vi } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import type { SupervisorEvent } from "@/shared/ipc";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteAccessServerOptions } from "@/host/remote/RemoteAccessServer";
import type { RemoteExperimentAuthority } from "@/host/remote/remoteAccessServerTypes";
import { RemoteAccessServer } from "@/host/remote/RemoteAccessServer";
import {
  acknowledgeRuntimeThreadGap,
  attachRuntimePersistenceDurableGapFromCurrentConnection,
  closeDatabase,
  getRuntimeThreadGapDescriptor,
  getRuntimeThreadGapNotice,
  initDatabase,
  lookupRuntimeNotice,
} from "@/host/db";
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
  installManagedRootCatalogRuntime,
  __resetManagedRootCatalogRuntimeForTest,
} from "@/renderer/state/managedRootCatalog/rootCatalogAdapter";
import { exchangePairingCredential } from "@/renderer/state/remoteServers/desktopLoopbackAuth";
import { getManagedRootCatalogStatus } from "@/renderer/state/managedRootCatalog/rootCatalogStore";

/**
 * Shared managed-root integration fixture (extracted verbatim from
 * `rootCorrections.integration.test.ts`): a real `RemoteAccessServer` over a
 * real migrated SQLite database, a real managed loopback client (HTTP + WS)
 * driven through the production renderer runtime installers. Only the
 * supervisor/provider boundary (`callSupervisor`) and the local-shell git
 * worktree procedures (opt-in `preloadProcedures`) are stubbed.
 */

export const servers: RemoteAccessServer[] = [];
export const dataRoots: string[] = [];
export const preloadCalls: string[] = [];
export const socketUrls: string[] = [];
export const liveSockets: NodeWebSocket[] = [];
export const forwardedCommands: string[] = [];

/** Live supervisor-stub counters and captures, reset by the fixture setup. */
export const supervisorTrace = {
  startThreadFailures: 0,
  startThreadCalls: 0,
  lastStartThreadPayload: null as Record<string, unknown> | null,
  startThreadCommandIds: [] as Array<string | null>,
};

/** A stable fake commit for fixture git answers. */
export const FIXTURE_BASE_COMMIT = "b".repeat(40);

export interface FixtureOverrides {
  readonly dispatchThreadCommand?: (command: unknown) => Promise<boolean>;
  readonly withNotices?: boolean;
  /**
   * The embedded desktop experiment authority port. Wiring it is what makes
   * the fixture host advertise `capabilities.experiments` v1 and compose the
   * `/api/experiments` routes (the production composition passes the
   * supervisor seams; see `BackendDesktopServices`).
   */
  readonly experimentAuthority?: RemoteExperimentAuthority;
  /**
   * Local-shell (non-router) preload procedures the renderer may invoke during
   * the test (experiment worktree preparation is a git operation in the main
   * process, not a durable-authority surface).
   */
  readonly preloadProcedures?: Record<string, (args: unknown[]) => unknown>;
  /** Observe every supervisor procedure invocation (after the stub decision). */
  readonly supervisorObserver?: (procedure: string, payload: Record<string, unknown>) => void;
}

export function seedBase(): void {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      "INSERT INTO projects (id, name, location_kind, location_path, sort_order, created_at) VALUES ('p-1', 'Repo', 'posix', '/tmp/repo', 0, '2026-01-01T00:00:00.000Z')",
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, sort_order, created_at, updated_at)
       VALUES ('t-1', 'p-1', 'Original', 'claude', '{"model":"sonnet"}', 'idle', 'none', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    )
    .run();
}

export function seedHomeProjectRow(): void {
  getSqlite()
    .prepare(
      "INSERT INTO projects (id, name, location_kind, location_path, sort_order, created_at) VALUES (?, 'Home', 'posix', '/tmp/home', -1, '2026-01-01T00:00:00.000Z')",
    )
    .run(HOME_PROJECT_ID);
}

export function seedThread(
  id: string,
  projectId = "p-1",
  worktreePath?: string,
  sortOrder = 0,
): void {
  getSqlite()
    .prepare(
      `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, sort_order, created_at, updated_at${worktreePath ? ", worktree_path" : ""})
       VALUES (?, ?, ?, 'claude', '{"model":"sonnet"}', 'idle', 'none', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'${worktreePath ? ", ?" : ""})`,
    )
    .run(
      ...(worktreePath
        ? [id, projectId, id, sortOrder, worktreePath]
        : [id, projectId, id, sortOrder]),
    );
}

export function seedProject(id: string, sortOrder: number, name = id): void {
  getSqlite()
    .prepare(
      "INSERT INTO projects (id, name, location_kind, location_path, sort_order, created_at) VALUES (?, ?, 'posix', ?, ?, '2026-01-01T00:00:00.000Z')",
    )
    .run(id, name, `/tmp/${id}`, sortOrder);
}

export function seedRuntimeItems(threadId: string, count: number): void {
  const insert = getSqlite().prepare(
    `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
     VALUES (?, ?, ?, 'user_message', 'completed', ?)`,
  );
  getSqlite().transaction(() => {
    for (let index = 0; index < count; index += 1) {
      insert.run(threadId, `item-${index}`, index, JSON.stringify({ content: `message ${index}` }));
    }
  })();
}

export function seedCompletedTurns(threadId: string, count: number): void {
  const insert = getSqlite().prepare(
    `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
     VALUES (?, ?, ?, ?, NULL)`,
  );
  getSqlite().transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const started = new Date(Date.parse("2026-01-01T00:00:00.000Z") + index * 10_000);
      insert.run(
        threadId,
        index,
        started.toISOString(),
        new Date(started.getTime() + 5_000).toISOString(),
      );
    }
  })();
}

export function seedGap(threadId: string): void {
  const now = Date.parse("2026-02-01T00:00:00.000Z");
  getSqlite()
    .prepare(
      `INSERT INTO thread_runtime_gaps (thread_id, reason, refused_events, refused_bytes, epoch, created_at, episode_id)
       VALUES (?, 'oversize', 3, 4096, 1, ?, '11111111-1111-4111-8111-111111111111')`,
    )
    .run(threadId, now);
}

function noticePort() {
  return {
    read: getRuntimeThreadGapDescriptor,
    readNotice: getRuntimeThreadGapNotice,
    lookupNotice: lookupRuntimeNotice,
    acknowledge: acknowledgeRuntimeThreadGap,
  };
}

export async function startFixtureServer(
  overrides: FixtureOverrides = {},
): Promise<RemoteAccessServer> {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "root-corrections-fixture", label: "Fixture" },
    host: "127.0.0.1",
    port: 0,
    tls: null,
    ownsSupervisorPersistence: false,
    onEventInterestsChanged: vi.fn<() => void>(),
    ...(overrides.withNotices ? { runtimeHistoryGap: noticePort() } : {}),
    ...(overrides.experimentAuthority
      ? { experimentAuthority: overrides.experimentAuthority }
      : {}),
    callSupervisor: (async (procedure: string, payload: Record<string, unknown>) => {
      overrides.supervisorObserver?.(procedure, payload);
      if (procedure === "startThread") {
        supervisorTrace.startThreadCalls += 1;
        supervisorTrace.lastStartThreadPayload = payload;
        if (supervisorTrace.startThreadFailures > 0) {
          supervisorTrace.startThreadFailures -= 1;
          throw new Error("fixture supervisor failure after dispatch");
        }
        // The real supervisor's own contract for this procedure
        // (`startThreadResultSchema`): the generic remote passthrough parses it.
        return { threadId: payload.threadId };
      }
      if (procedure === "closeThreadConfirmed") return { confirmed: true };
      if (procedure === "gitListBranches") {
        return {
          current: "main",
          branches: [{ name: "main", current: true, commit: FIXTURE_BASE_COMMIT, isRemote: false }],
        };
      }
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
    ...(overrides.dispatchThreadCommand
      ? {
          dispatchThreadCommand: (async (command: unknown) => {
            forwardedCommands.push((command as { kind?: string }).kind ?? "unknown");
            return overrides.dispatchThreadCommand!(command);
          }) as NonNullable<RemoteAccessServerOptions["dispatchThreadCommand"]>,
        }
      : {}),
  });
  servers.push(server);
  await server.start();
  return server;
}

export function bootstrapPayloadFor(server: RemoteAccessServer): {
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

export function wsSocketFactory(url: string) {
  socketUrls.push(url);
  const socket = new NodeWebSocket(url);
  liveSockets.push(socket);
  socket.on("error", () => {});
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

export function electronHost(
  getBootstrap: () => { endpoint: string; pairingUrl: string } | null,
  preloadProcedures?: Record<string, (args: unknown[]) => unknown>,
): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch: "x64",
    platform: "darwin",
    onSupervisorEvent: (_listener: (event: SupervisorEvent, sequence?: number) => void) => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    invokeProcedure: (async (name: string, args: unknown[]) => {
      preloadCalls.push(name);
      const override = preloadProcedures?.[name];
      if (override) return override(args);
      if (name === "getManagedLoopbackBootstrap") return getBootstrap();
      if (name === "setRendererEventInterests") return null;
      if (name === "dbGetState") return null;
      if (name === "dbGetLatestThreadGoalItem") return null;
      throw new Error(`unexpected IPC procedure ${name}`);
    }) as ElectronHostBridge["invokeProcedure"],
  } as unknown as ElectronHostBridge;
}

export async function activate(overrides: FixtureOverrides = {}): Promise<RemoteAccessServer> {
  const server = await startFixtureServer(overrides);
  const bootstrap = bootstrapPayloadFor(server);
  const host = electronHost(() => bootstrap, overrides.preloadProcedures);
  // Test fixture: installs the fake preload shell exactly as the suites'
  // `*.test.ts` lint exemption for the raw preload globals intends.
  // oxlint-disable-next-line no-restricted-properties
  (window as unknown as { poracodeHost?: unknown }).poracodeHost = host;
  installElectronClientRuntime(host);
  __setDesktopLoopbackIntakeTestSeamsForTest({
    socketFactory: wsSocketFactory,
    retryDelayMs: 50,
    discoveryRetryMs: 80,
    descriptorRetryMs: 5_000,
  });
  installManagedRootCatalogRuntime();
  void startDesktopLoopbackEventIntake();
  await vi.waitFor(() => expect(isDesktopLoopbackIntakeActive()).toBe(true), { timeout: 10_000 });
  await vi.waitFor(() => expect(getManagedRootCatalogStatus().status).toBe("ready"), {
    timeout: 15_000,
  });
  return server;
}

/** A real other-client credential over the same fixture host. */
export async function externalClientFor(server: RemoteAccessServer): Promise<RemoteDesktopClient> {
  const info = server.getInfo();
  if (!info) throw new Error("fixture server not started");
  const pairingUrl = server.issuePairingUrl("root-order-external");
  const pairingToken = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  if (!pairingToken) throw new Error("fixture server issued no pairing credential");
  const tokens = await exchangePairingCredential(
    { fetchImpl: fetch, base: info.localHttpBaseUrl, timeoutMs: 10_000 },
    pairingToken,
  );
  return new RemoteDesktopClient(info.localHttpBaseUrl, tokens.accessToken);
}

export function rootThreads() {
  return useAppStore.getState().threads.filter((thread) => thread.remoteServerId === undefined);
}

export function rootProjects() {
  return useAppStore
    .getState()
    .projects.filter(
      (project) => project.remoteServerId === undefined && project.id !== HOME_PROJECT_ID,
    );
}

export function hostSortOrder(threadId: string): number {
  const row = getSqlite().prepare("SELECT sort_order FROM threads WHERE id = ?").get(threadId) as
    | { readonly sort_order: number }
    | undefined;
  return row?.sort_order ?? Number.NaN;
}

export function hostManualThreadOrder(): string[] {
  return (
    getSqlite().prepare("SELECT id FROM threads ORDER BY sort_order ASC, id ASC").all() as Array<{
      readonly id: string;
    }>
  ).map((row) => row.id);
}

export function hostManualProjectOrder(): string[] {
  return (
    getSqlite().prepare("SELECT id FROM projects ORDER BY sort_order ASC, id ASC").all() as Array<{
      readonly id: string;
    }>
  ).map((row) => row.id);
}

export function threadRow(threadId: string) {
  return useAppStore.getState().threads.find((thread) => thread.id === threadId);
}

export function hostThreadRow(threadId: string) {
  return getSqlite().prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as
    | Record<string, unknown>
    | undefined;
}

export async function setupManagedRootFixture(): Promise<void> {
  supervisorTrace.startThreadFailures = 0;
  supervisorTrace.startThreadCalls = 0;
  supervisorTrace.lastStartThreadPayload = null;
  supervisorTrace.startThreadCommandIds = [];
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
  preloadCalls.splice(0);
  socketUrls.splice(0);
  liveSockets.splice(0);
  forwardedCommands.splice(0);
  useAppStore.setState({ threads: [], projects: [] });
  const dir = await mkdtemp(join(tmpdir(), "poracode-root-corrections-"));
  dataRoots.push(dir);
  initDatabase(join(dir, "poracode.db"));
  attachRuntimePersistenceDurableGapFromCurrentConnection();
  seedBase();
}

export async function teardownManagedRootFixture(): Promise<void> {
  __resetManagedRootCatalogRuntimeForTest();
  resetDesktopLoopbackIntakeForTest();
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  await Promise.all(dataRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  closeDatabase();
  useAppStore.setState({
    threads: [],
    projects: [],
    runtimeItemIdsByThread: {},
    runtimeCompletedTurnsByThread: {},
  });
  vi.restoreAllMocks();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
