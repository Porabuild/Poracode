import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { Thread } from "@/shared/contracts";
import { runtimeEventSchema } from "@/shared/contracts/runtimeEvent";
import { toWebSocketUrl } from "@/shared/remote";
import type { SupervisorEvent } from "@/shared/ipc";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { getSqlite } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  createRuntimeGapAcknowledgedHook,
  createRuntimeHistoryGapPort,
  RUNTIME_GAP_ACKNOWLEDGED_RESYNC_REASON,
} from "@/host/remote/runtimeHistoryGapComposition";
import { RemoteAccessServer } from "@/host/remote/RemoteAccessServer";

/**
 * Composition-path regression for the B1 acknowledgement, on REAL compositions
 * + REAL SQLite + the REAL remote server:
 *
 * - `headless`: the real `BackendHostCore` with the headless composition's
 *   publication funnel (`server.publishSupervisorEvent` +
 *   `createRuntimeGapAcknowledgedHook`).
 * - `desktop`: the real `BackendDesktopServices` production entry (its real
 *   `BackendDurableServices` observer graph + real
 *   `DesktopRemoteAccessController` + the real loopback `RemoteAccessServer`
 *   the production readiness path starts). The host callbacks are wired exactly
 *   as `src/backend/index.ts` wires them
 *   (`desktopServices.observeSupervisorEvent` / `handleRuntimeGapAcknowledged`),
 *   so a regression that swallows `thread-reset` before the remote publish, or
 *   that lets the server persist/rebase the reset again, fails this test.
 *
 * It proves the two hard constraints on the ack path:
 * 1. committed transcript bytes are unchanged (the ack never routes
 *    `thread-reset` into supervisor-event persistence);
 * 2. both client classes recover: the local/capable reader re-hydrates the
 *    retained prefix with the notice, the incapable reader gets a definite 409
 *    — after receiving the live `thread-reset` + `resync-required` signals.
 */

const mocks = vi.hoisted(() => ({
  runThreadMutation:
    vi.fn<(threadId: string, operation: () => Promise<unknown>) => Promise<unknown>>(),
  supervisorCall: vi.fn<(type: string, payload: unknown) => Promise<unknown>>(),
  start: vi.fn<() => void>(),
  dispose: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock("@/host/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = mocks.start;
    dispose = mocks.dispose;
    call = mocks.supervisorCall;
    runThreadMutation = mocks.runThreadMutation;
    acknowledgeCanonicalFlow = vi.fn<() => void>();
    getPeerCanonicalCapabilities = vi.fn<() => null>(() => null);
    setEventBackpressured = vi.fn<() => void>();
  },
}));

import { BackendHostCore } from "./BackendHostCore";
import { BackendDesktopServices } from "./BackendDesktopServices";

const THREAD = "thread-composed";
const GAP_A = "gap2:e11111111-1111-4111-8111-111111111111";

const hosts: BackendHostCore[] = [];
const servers: RemoteAccessServer[] = [];
const composedDesktopServices: BackendDesktopServices[] = [];
const sockets: WebSocket[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  // Services first: the desktop composition owns the remote server and the
  // durable observer graph, and both must stop before the database closes.
  await Promise.all(composedDesktopServices.splice(0).map((services) => services.dispose()));
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

/** The endpoint fields both compositions surface to a remote client. */
interface CompositionEndpoint {
  httpBaseUrl: string;
  wsBaseUrl: string;
  pairingUrl: string;
}

function threadFixture(id: string): Thread {
  return {
    id,
    projectId: "project-1",
    title: id,
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
}

function seedCommittedPrefix(): void {
  dbUpsertProject(
    {
      id: "project-1",
      name: "Project 1",
      location: { kind: "posix", path: "/tmp/project-1" },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    0,
  );
  dbUpsertThread(threadFixture(THREAD), 0);
  const insertItem = getSqlite().prepare(
    `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
     VALUES (?, ?, ?, 'assistant', 'completed', ?)`,
  );
  for (let index = 0; index < 5; index += 1) {
    insertItem.run(THREAD, `item-${index}`, index, `{"text":"committed-${index}"}`);
  }
}

function committedBytes(): string {
  return JSON.stringify(
    getSqlite()
      .prepare(
        `SELECT item_id, position, type, state, payload FROM thread_runtime_items
         WHERE thread_id = ? ORDER BY position`,
      )
      .all(THREAD),
  );
}

function lateRuntimeEvent(): SupervisorEvent {
  return {
    type: "thread-runtime-event",
    threadId: THREAD,
    event: runtimeEventSchema.parse({
      type: "item.completed",
      threadId: THREAD,
      itemId: "late-item",
      payload: { name: "command", result: "late" },
    }),
  };
}

async function authorize(endpoint: CompositionEndpoint): Promise<string> {
  const credential = new URLSearchParams(new URL(endpoint.pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", endpoint.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read"],
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function connect(
  endpoint: CompositionEndpoint,
  token: string,
  noticesCapable: boolean,
): Promise<{ socket: WebSocket; frames: Array<{ type: string; event?: unknown }> }> {
  const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", endpoint.httpBaseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const { ticket } = (await ticketResponse.json()) as { ticket: string };
  const url = new URL("/ws", endpoint.wsBaseUrl);
  url.searchParams.set("ticket", ticket);
  if (noticesCapable) url.searchParams.set("notices", "v1");
  const socket = new WebSocket(url);
  sockets.push(socket);
  const frames: Array<{ type: string; event?: unknown }> = [];
  socket.on("message", (raw) => frames.push(JSON.parse(raw.toString()) as { type: string }));
  await once(socket, "open");
  return { socket, frames };
}

/**
 * The desktop production composition entry (`src/backend/index.ts`): a real
 * `BackendDesktopServices` over the real host, with the host callbacks routed
 * through the service exactly as production does. The managed-loopback
 * readiness surface (`getManagedLoopbackBootstrap`, the same call desktop main
 * makes for the renderer) starts the real loopback `RemoteAccessServer` and
 * mints the attach credential.
 */
async function composeDesktopBackend(dir: string): Promise<{
  host: BackendHostCore;
  endpoint: CompositionEndpoint;
  observe(event: SupervisorEvent): void;
}> {
  let services: BackendDesktopServices | null = null;
  const supervisor = {
    appVersion: "test",
    isDev: false,
    supervisorPath: "/dev/null/supervisor.cjs",
    wslHelpersDir: "/dev/null/wsl",
    secretStorageKey: "secret",
  };
  const host = new BackendHostCore({
    baseDir: dir,
    dbPath: join(dir, "state.sqlite"),
    supervisor,
    onEvent: (event) => {
      services?.observeSupervisorEvent(event);
    },
    onReset: () => {},
    onRuntimeGapAcknowledged: (threadId) => {
      services?.handleRuntimeGapAcknowledged(threadId);
    },
  });
  hosts.push(host);
  services = new BackendDesktopServices({
    initialize: {
      baseDir: dir,
      dbPath: join(dir, "state.sqlite"),
      supervisor,
      desktop: { channel: "stable", settingsPath: join(dir, "settings.json") },
    },
    host,
    requestNative: async () => null,
    emitNativeEvent: () => {},
    reportError: () => {},
  });
  composedDesktopServices.push(services);

  const bootstrap = await services.call("getManagedLoopbackBootstrap", {});
  if (!bootstrap) throw new Error("The composed desktop loopback remote server did not start.");
  return {
    host,
    endpoint: {
      httpBaseUrl: bootstrap.endpoint,
      wsBaseUrl: toWebSocketUrl(new URL("/ws", bootstrap.endpoint)).toString(),
      pairingUrl: bootstrap.pairingUrl,
    },
    observe: (event) => {
      services?.observeSupervisorEvent(event);
    },
  };
}

/**
 * Shared post-ack recovery contract, run against whichever real composition the
 * caller wired: committed bytes survive, both attached client classes receive
 * the reset + resync signals, the capable reader re-hydrates with the notice,
 * the incapable reader is refused 409, and a late canonical event still
 * persists while the live gate protects the incapable client.
 */
async function assertAcknowledgementRecovery(input: {
  endpoint: CompositionEndpoint;
  acknowledge(): Promise<{ outcome: string }>;
  publishLate(): void;
}): Promise<void> {
  const before = committedBytes();
  const token = await authorize(input.endpoint);
  const { frames: legacyFrames } = await connect(input.endpoint, token, false);
  const { frames: capableFrames } = await connect(input.endpoint, token, true);

  getSqlite()
    .prepare(
      `INSERT INTO thread_runtime_gaps
       (thread_id, reason, refused_events, refused_bytes, epoch, created_at, episode_id)
     VALUES (?, 'age', 2, 20, 1, 111, '11111111-1111-4111-8111-111111111111')`,
    )
    .run(THREAD);

  expect((await input.acknowledge()).outcome).toBe("applied");

  // 1. Committed transcript bytes are byte-identical: the ack's `thread-reset`
  // never reached supervisor-event persistence in either composition.
  expect(committedBytes()).toBe(before);

  // 2. Both attached clients received the live recovery signals: the reset
  // (published, not persisted) and the composition hook's `resync-required`.
  const inOrder = (frames: Array<{ type: string; event?: unknown }>) =>
    frames.filter((frame) => frame.type === "event" || frame.type === "resync-required");
  await expect
    .poll(() => inOrder(legacyFrames).length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => inOrder(capableFrames).length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(2);
  expect(
    inOrder(legacyFrames).some(
      (frame) =>
        frame.type === "event" &&
        (frame.event as { type?: string } | undefined)?.type === "thread-reset",
    ),
  ).toBe(true);
  expect(
    inOrder(capableFrames).some(
      (frame) =>
        frame.type === "event" && (frame.event as { type?: string })?.type === "thread-reset",
    ),
  ).toBe(true);
  expect(
    inOrder(legacyFrames).some(
      (frame) =>
        frame.type === "resync-required" &&
        (frame as { reason?: string }).reason === RUNTIME_GAP_ACKNOWLEDGED_RESYNC_REASON,
    ),
  ).toBe(true);

  // 3. Both clients recover: the capable reader re-hydrates the retained
  // prefix with the notice; the incapable reader gets a definite 409.
  const capable = await fetch(
    new URL(`/api/threads/${THREAD}/history/items?limit=50&notices=v1`, input.endpoint.httpBaseUrl),
    { headers: { authorization: `Bearer ${token}` } },
  );
  expect(capable.status).toBe(200);
  const capableBody = (await capable.json()) as {
    runtimeNotice?: { kind?: string };
    items?: unknown[];
  };
  expect(capableBody.runtimeNotice?.kind).toBe("history-incomplete");
  expect(capableBody.items).toHaveLength(5);
  const legacy = await fetch(
    new URL(`/api/threads/${THREAD}/history/items?limit=50`, input.endpoint.httpBaseUrl),
    { headers: { authorization: `Bearer ${token}` } },
  );
  expect(legacy.status).toBe(409);

  // 4. A late event after the ack persists (limit L4) and the live gate still
  // protects the incapable client.
  input.publishLate();
  await expect
    .poll(
      () =>
        capableFrames.filter(
          (frame) =>
            frame.type === "event" &&
            (frame.event as { type?: string } | undefined)?.type === "thread-runtime-event",
        ).length,
      { timeout: 5_000 },
    )
    .toBe(1);
  const lateLegacy = legacyFrames.filter(
    (frame) =>
      frame.type === "event" &&
      (frame.event as { type?: string } | undefined)?.type === "thread-runtime-events",
  );
  expect(lateLegacy).toHaveLength(1);
  expect((lateLegacy[0]!.event as { events: unknown[] }).events).toEqual([]);

  // The ack never deleted a runtime row even after the late publish.
  expect(committedBytes()).toBe(before);
}

describe.skipIf(!sqliteAvailable)("B1 acknowledgement composition path", () => {
  it("headless funnel: the real server publishes the acknowledgement recovery", async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    const dir = mkdtempSync(join(tmpdir(), "poracode-ack-composition-"));
    tempDirs.push(dir);

    let server: RemoteAccessServer | null = null;
    const host = new BackendHostCore({
      baseDir: dir,
      dbPath: join(dir, "state.sqlite"),
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/dev/null/supervisor.cjs",
        wslHelpersDir: "/dev/null/wsl",
        secretStorageKey: "secret",
      },
      // The headless composition funnel: `onEvent` publishes to the server and
      // the acknowledgement hook broadcasts `resync-required`.
      onEvent: (event) => server?.publishSupervisorEvent(event),
      onReset: () => {},
      onRuntimeGapAcknowledged: createRuntimeGapAcknowledgedHook(() => server),
    });
    hosts.push(host);

    seedCommittedPrefix();

    server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "test",
      identity: { desktopId: "ack-composition", label: "Ack composition" },
      host: "127.0.0.1",
      port: 0,
      webSocketHeartbeatIntervalMs: 0,
      ownsSupervisorPersistence: false,
      runtimeHistoryGap: createRuntimeHistoryGapPort(host),
      callSupervisor: async () => ({}) as never,
    });
    servers.push(server);
    const info = await server.start();
    expect(info.wsBaseUrl.startsWith("ws://")).toBe(true);

    mocks.runThreadMutation.mockImplementation((_threadId, operation) =>
      Promise.resolve(operation()),
    );
    await assertAcknowledgementRecovery({
      endpoint: {
        httpBaseUrl: info.httpBaseUrl,
        wsBaseUrl: info.wsBaseUrl,
        pairingUrl: info.pairingUrl,
      },
      acknowledge: () => host.acknowledgeThreadRuntimeGap(THREAD, GAP_A),
      publishLate: () => server!.publishSupervisorEvent(lateRuntimeEvent()),
    });
  });

  it("desktop funnel: the real BackendDesktopServices composition forwards the recovery", async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    const dir = mkdtempSync(join(tmpdir(), "poracode-ack-composition-"));
    tempDirs.push(dir);

    // The composed server binds an ephemeral loopback port instead of scanning
    // the production range; the composition wiring under test is unchanged.
    vi.stubEnv("PORACODE_REMOTE_ACCESS_PORT", "0");

    const composed = await composeDesktopBackend(dir);
    // The production readiness surface returned a live loopback credential.
    expect(composed.endpoint.pairingUrl).toContain("#token=");
    seedCommittedPrefix();

    mocks.runThreadMutation.mockImplementation((_threadId, operation) =>
      Promise.resolve(operation()),
    );
    await assertAcknowledgementRecovery({
      endpoint: composed.endpoint,
      acknowledge: () => composed.host.acknowledgeThreadRuntimeGap(THREAD, GAP_A),
      publishLate: () => composed.observe(lateRuntimeEvent()),
    });
  });
});
