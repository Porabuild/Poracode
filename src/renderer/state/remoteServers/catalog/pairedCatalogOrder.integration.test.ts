import "fake-indexeddb/auto";
import { WebSocket as NodeWebSocket } from "ws";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { exchangePairingCredential } from "@/renderer/state/remoteServers/desktopLoopbackAuth";
import type { RemoteAccessServerOptions } from "@/host/remote/RemoteAccessServer";
import { RemoteAccessServer } from "@/host/remote/RemoteAccessServer";
import { closeDatabase, initDatabase } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { useAppStore } from "@/renderer/state/appStore";
import {
  __resetRemoteServersStoreForTest,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { remoteProjectId, remoteThreadId } from "@/renderer/state/remoteProjection";
import type { RemoteSocketLike } from "@/renderer/state/remoteServers/types";
import { dispatchRemoteProjectReorder, dispatchRemoteThreadReorder } from "./remoteCatalogIntents";

/**
 * Paired bounded-catalog manual-order convergence over the REAL fixture stack
 * (adapted copy of the frozen read-only qualification probe
 * `tmp/v2-production/paired-catalog-order-proof/pairedCatalogOrder.probe.test.ts`;
 * the frozen probe is evidence and is never edited).
 *
 * The probe recorded the bug: a paired connection declared no manual-order
 * convergence, so an external reorder (same id set) left the client order stale
 * and a host-prepended row was appended at the end, for threads and projects.
 * This permanent regression pins the corrected behavior on the same real
 * `RemoteAccessServer` + `better-sqlite3` + `RemoteDesktopClient` +
 * `useRemoteServersStore` composition:
 *
 * - an external reorder of the same id set converges BOTH kinds without a
 *   reconnect (event → bounded paint pass → authoritative order applied to the
 *   runtime rows and the projected app-store slots);
 * - a host-prepended row converges to its host position;
 * - the existing drag interaction's dispatch reaches the host as a real
 *   `reorder` command (host `sort_order` changes), not a local-only move;
 * - a rejected reorder settles the local intent fence and recovers the
 *   authoritative order through the bounded paint refresh.
 */

const servers: RemoteAccessServer[] = [];
const dataRoots: string[] = [];
const liveSockets: Array<{ url: string; raw: NodeWebSocket }> = [];

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: { ...(actual.toast as object), danger: toastDanger } };
});

function wsSocketFactory(url: string): RemoteSocketLike {
  const raw = new NodeWebSocket(url);
  liveSockets.push({ url, raw });
  raw.on("error", () => {});
  let onopen: (() => void) | null = null;
  let onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  let onclose: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null =
    null;
  raw.on("open", () => onopen?.());
  raw.on("message", (data) => onmessage?.({ data: data.toString() }));
  raw.on("close", () => onclose?.());
  return {
    close: () => raw.close(),
    send: (data: string) => raw.send(data),
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
    set onclose(
      handler: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null,
    ) {
      onclose = handler;
    },
  };
}

function seed(): void {
  const sqlite = getSqlite();
  const insertProject = sqlite.prepare(
    "INSERT INTO projects (id, name, location_kind, location_path, sort_order, created_at) VALUES (?, ?, 'posix', ?, ?, '2026-01-01T00:00:00.000Z')",
  );
  const insertThread = sqlite.prepare(
    `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', '{"model":"sonnet"}', 'idle', 'none', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  );
  sqlite.transaction(() => {
    ["p-a", "p-b", "p-c"].forEach((id, index) => {
      insertProject.run(id, id, `/tmp/${id}`, index);
    });
    ["t-a", "t-b", "t-c"].forEach((id, index) => {
      insertThread.run(id, "p-a", id, index);
    });
  })();
}

function seedPrependProject(id: string): void {
  getSqlite()
    .prepare(
      "INSERT INTO projects (id, name, location_kind, location_path, sort_order, created_at) VALUES (?, ?, 'posix', ?, -1, '2026-01-01T00:00:00.000Z')",
    )
    .run(id, id, `/tmp/${id}`);
}

async function startFixtureServer(): Promise<RemoteAccessServer> {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "paired-order-fixture", label: "Paired Order Fixture" },
    host: "127.0.0.1",
    port: 0,
    tls: null,
    ownsSupervisorPersistence: false,
    onEventInterestsChanged: vi.fn<() => void>(),
    callSupervisor: (async (procedure: string) => {
      if (procedure === "getAgentStatuses") return { windows: [], wsl: [] };
      if (procedure === "dbGetLatestThreadGoalItem") return null;
      if (procedure === "dbGetThreadContextUsage") return null;
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

async function externalClientFor(server: RemoteAccessServer): Promise<RemoteDesktopClient> {
  const info = server.getInfo();
  if (!info) throw new Error("fixture server not started");
  const pairingUrl = server.issuePairingUrl("paired-order-external");
  const pairingToken = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  if (!pairingToken) throw new Error("fixture server issued no pairing credential");
  const tokens = await exchangePairingCredential(
    { fetchImpl: fetch, base: info.localHttpBaseUrl, timeoutMs: 10_000 },
    pairingToken,
  );
  return new RemoteDesktopClient(info.localHttpBaseUrl, tokens.accessToken);
}

function hostManualThreadOrder(): string[] {
  return (
    getSqlite()
      .prepare("SELECT id FROM threads WHERE project_id = 'p-a' ORDER BY sort_order ASC, id ASC")
      .all() as Array<{ readonly id: string }>
  ).map((row) => row.id);
}

function hostManualProjectOrder(): string[] {
  return (
    getSqlite().prepare("SELECT id FROM projects ORDER BY sort_order ASC, id ASC").all() as Array<{
      readonly id: string;
    }>
  ).map((row) => row.id);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("paired bounded catalog manual order over the real fixture", () => {
  beforeEach(async () => {
    localStorage.clear();
    liveSockets.splice(0);
    toastDanger.mockClear();
    __resetRemoteServersStoreForTest();
    await useRemoteServersStore.persist.rehydrate();
    await useAppStore.persist.rehydrate();
    useAppStore.setState({ threads: [], projects: [] });
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      hostUpdates: {},
      hostUpdateRestarts: {},
      excludedProjectIds: {},
      projectWorkspaceIds: {},
      projectNameOverrides: {},
      lastKnownProjects: {},
      openThread: null,
    });
    useRemoteServersStore.getState().setSocketFactory(wsSocketFactory);
    useRemoteServersStore
      .getState()
      .setClientFactory((endpoint, accessToken) => new RemoteDesktopClient(endpoint, accessToken));
    const dir = await mkdtemp(join(tmpdir(), "poracode-paired-order-"));
    dataRoots.push(dir);
    initDatabase(join(dir, "poracode.db"));
    seed();
  });

  afterEach(async () => {
    __resetRemoteServersStoreForTest();
    for (const { raw } of liveSockets.splice(0)) {
      try {
        raw.close();
      } catch {
        // already closed
      }
    }
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    await Promise.all(
      dataRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
    closeDatabase();
    useAppStore.setState({ threads: [], projects: [] });
    vi.restoreAllMocks();
    await delay(0);
  });

  it("converges external reorders, prepended rows, and real drag dispatches", async () => {
    const server = await startFixtureServer();
    const info = server.getInfo();
    if (!info) throw new Error("fixture server not started");

    const record = await useRemoteServersStore.getState().pairServer({
      endpoint: info.localHttpBaseUrl,
      token: server.issuePairingUrl("paired-order-regression"),
    });
    const key = record.connectionId ?? record.desktopId;
    const localThreadIds = (): string[] =>
      useAppStore
        .getState()
        .threads.filter((thread) => thread.remoteServerId === key)
        .map((thread) => thread.remoteId ?? thread.id);
    const localProjectIds = (): string[] =>
      useAppStore
        .getState()
        .projects.filter((project) => project.remoteServerId === key)
        .map((project) => project.remoteId ?? project.id);

    await vi.waitFor(
      () => expect(useRemoteServersStore.getState().runtime[key]?.status).toBe("online"),
      { timeout: 20_000 },
    );
    await useRemoteServersStore.getState().refreshServer(key);
    await vi.waitFor(() => expect(localThreadIds()).toEqual(hostManualThreadOrder()), {
      timeout: 20_000,
    });
    await vi.waitFor(() => expect(localProjectIds()).toEqual(hostManualProjectOrder()), {
      timeout: 20_000,
    });

    const external = await externalClientFor(server);

    // ── External reorder, same id set (threads) ─────────────────────────────
    await external.sendThreadCommand(
      {
        kind: "reorder",
        threadId: "t-c",
        projectId: "p-a",
        threadIds: ["t-c"],
        targetThreadId: "t-a",
        placement: "before",
      },
      { commandId: crypto.randomUUID() },
    );
    expect(hostManualThreadOrder()).toEqual(["t-c", "t-a", "t-b"]);
    await vi.waitFor(() => expect(localThreadIds()).toEqual(hostManualThreadOrder()), {
      timeout: 20_000,
    });

    // ── External reorder, same id set (projects) ────────────────────────────
    await external.projectCommand(
      {
        kind: "reorder",
        projectId: "p-c",
        targetProjectId: "p-a",
        placement: "before",
      },
      { commandId: crypto.randomUUID() },
    );
    expect(hostManualProjectOrder()).toEqual(["p-c", "p-a", "p-b"]);
    await vi.waitFor(() => expect(localProjectIds()).toEqual(hostManualProjectOrder()), {
      timeout: 20_000,
    });

    // ── Host-prepended thread row ───────────────────────────────────────────
    await external.sendThreadCommand(
      {
        kind: "start",
        threadId: "t-new",
        projectId: "p-a",
        agentKind: "claude",
        config: { model: "sonnet" },
        prompt: "external prepend",
      },
      { commandId: crypto.randomUUID() },
    );
    await vi.waitFor(() => expect(hostManualThreadOrder()[0]).toBe("t-new"), { timeout: 20_000 });
    await vi.waitFor(() => expect(localThreadIds()).toEqual(hostManualThreadOrder()), {
      timeout: 30_000,
    });

    // ── Host-prepended project row ──────────────────────────────────────────
    seedPrependProject("p-new");
    await external.projectCommand(
      {
        kind: "reorder",
        projectId: "p-a",
        targetProjectId: "p-b",
        placement: "after",
      },
      { commandId: crypto.randomUUID() },
    );
    await vi.waitFor(() => expect(hostManualProjectOrder()[0]).toBe("p-new"), { timeout: 20_000 });
    await vi.waitFor(() => expect(localProjectIds()).toEqual(hostManualProjectOrder()), {
      timeout: 30_000,
    });

    // ── The existing drag dispatch reaches the host (threads) ───────────────
    const threadOrderBefore = hostManualThreadOrder();
    const threadSource = threadOrderBefore[threadOrderBefore.length - 1]!;
    const threadTarget = threadOrderBefore[0]!;
    const viewThreadId = remoteThreadId(key, threadSource);
    const viewTargetThreadId = remoteThreadId(key, threadTarget);
    useAppStore.getState().reorderThreads(viewThreadId, viewTargetThreadId, "before");
    expect(dispatchRemoteThreadReorder(viewThreadId, viewTargetThreadId, "before")).toBe(true);
    await vi.waitFor(
      () =>
        expect(hostManualThreadOrder()).toEqual([threadSource, ...threadOrderBefore.slice(0, -1)]),
      {
        timeout: 20_000,
      },
    );
    await vi.waitFor(() => expect(localThreadIds()).toEqual(hostManualThreadOrder()), {
      timeout: 20_000,
    });

    // ── The existing drag dispatch reaches the host (projects) ──────────────
    const projectOrderBefore = hostManualProjectOrder();
    const projectSource = projectOrderBefore[projectOrderBefore.length - 1]!;
    const projectTarget = projectOrderBefore[0]!;
    const viewProjectId = remoteProjectId(key, projectSource);
    const viewTargetProjectId = remoteProjectId(key, projectTarget);
    useAppStore.getState().reorderProjects(viewProjectId, viewTargetProjectId, "before");
    expect(dispatchRemoteProjectReorder(viewProjectId, viewTargetProjectId, "before")).toBe(true);
    await vi.waitFor(
      () =>
        expect(hostManualProjectOrder()).toEqual([
          projectSource,
          ...projectOrderBefore.slice(0, -1),
        ]),
      { timeout: 20_000 },
    );
    await vi.waitFor(() => expect(localProjectIds()).toEqual(hostManualProjectOrder()), {
      timeout: 20_000,
    });

    // ── A rejected reorder recovers through the bounded paint refresh ───────
    const doomedAnchor = "t-doomed";
    getSqlite()
      .prepare(
        `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention, sort_order, created_at, updated_at)
         VALUES (?, 'p-a', 'Doomed', 'claude', '{"model":"sonnet"}', 'idle', 'none', -1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run(doomedAnchor);
    // The local client still sees the row (no event); the next bounded pass
    // does too, then the host row is deleted out-of-band, so the reorder's
    // anchor no longer exists host-side.
    await useRemoteServersStore.getState().refreshServer(key);
    await vi.waitFor(() => expect(localThreadIds()).toContain(doomedAnchor), { timeout: 20_000 });
    getSqlite().prepare("DELETE FROM threads WHERE id = ?").run(doomedAnchor);
    const authoritativeAfterDelete = hostManualThreadOrder();
    const doomedViewId = remoteThreadId(key, doomedAnchor);
    const moveSource = remoteThreadId(key, authoritativeAfterDelete[0]!);
    useAppStore.getState().reorderThreads(moveSource, doomedViewId, "after");
    expect(dispatchRemoteThreadReorder(moveSource, doomedViewId, "after")).toBe(true);
    await vi.waitFor(() => expect(toastDanger).toHaveBeenCalled(), { timeout: 20_000 });
    // The bounded refresh restores the host order (the deleted row is not part
    // of the authoritative order and trails until membership removes it).
    await vi.waitFor(
      () =>
        expect(localThreadIds().filter((id) => id !== doomedAnchor)).toEqual(
          authoritativeAfterDelete,
        ),
      { timeout: 20_000 },
    );

    // No forced reconnect: one socket, still online.
    expect(useRemoteServersStore.getState().runtime[key]?.status).toBe("online");
    expect(liveSockets.length).toBe(1);
  }, 180_000);
});
