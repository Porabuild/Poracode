import { WebSocket as NodeWebSocket } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  RemoteAccessServer,
  type RemoteAccessServerOptions,
} from "@/main/remote/RemoteAccessServer";
import { ElectronBackendTransport } from "@/renderer/electronBackendTransport";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import {
  DesktopLoopbackIntake,
  isLoopbackEndpoint,
  parsePairingCredential,
  resolveLoopbackTarget,
} from "./desktopLoopbackIntake";

vi.mock("../../../main/db", () => {
  const appState = new Map<string, string>();
  return {
    dbAppendThreadCompletedTurn: vi.fn<(...args: unknown[]) => void>(),
    dbApplyThreadRuntimeEvents: vi.fn<(...args: unknown[]) => void>(),
    dbClaimRemoteCommand: vi.fn<() => { state: "claimed" }>(() => ({ state: "claimed" })),
    dbCompleteRemoteCommand: vi.fn<(...args: unknown[]) => void>(),
    dbFailRemoteCommand: vi.fn<(...args: unknown[]) => void>(),
    dbDeleteThread: vi.fn<(threadId: string) => void>(),
    dbGetProject: vi.fn<(projectId: string) => unknown>(() => null),
    dbGetProjectNotes: vi.fn<(projectId: string) => unknown>(() => null),
    dbGetProjects: vi.fn<() => unknown[]>(() => []),
    dbGetThreadCompletedTurns: vi.fn<() => unknown[]>(() => []),
    dbGetThreadContextUsage: vi.fn<() => null>(() => null),
    dbGetLatestThreadGoalItem: vi.fn<() => null>(() => null),
    dbGetLatestThreadRuntimeAnchorItemId: vi.fn<() => null>(() => null),
    dbGetThreadRuntimeItems: vi.fn<() => unknown[]>(() => []),
    dbGetThreadRuntimeItem: vi.fn<(...args: unknown[]) => unknown>(() => undefined),
    dbGetThreadRuntimeItemsPage: vi.fn<() => { items: unknown[]; nextCursor: number | null }>(
      () => ({ items: [], nextCursor: null }),
    ),
    dbGetThreadRuntimeSummaries: vi.fn<() => Record<string, unknown>>(() => ({})),
    dbGetThreadTerminalScrollback: vi.fn<() => string>(() => ""),
    dbGetThreadTerminalScrollbackRecord: vi.fn<
      () => { transcript: string; outputLength: number } | null
    >(() => null),
    dbGetThread: vi.fn<(threadId: string) => unknown>(() => null),
    dbGetThreads: vi.fn<() => unknown[]>(() => []),
    dbReplaceThreadRuntimeSnapshot: vi.fn<(...args: unknown[]) => void>(),
    dbUpdateProject: vi.fn<(project: unknown) => void>(),
    dbUpsertProject: vi.fn<(project: unknown, sortOrder: number) => void>(),
    dbDeleteProject: vi.fn<(projectId: string) => void>(),
    dbUpsertThread: vi.fn<(thread: unknown, sortOrder: number) => void>(),
    dbGetState: vi.fn<(key: string) => string | null>((key) => appState.get(key) ?? null),
    dbSetState: vi.fn<(key: string, value: string) => void>((key, value) => {
      appState.set(key, value);
    }),
    dbSetProjectNotes: vi.fn<(notes: unknown) => void>(),
    dbTruncateThreadRuntimeAfter: vi.fn<(...args: unknown[]) => void>(),
    dbGetAllUsageEvents: vi.fn<() => unknown[]>(() => []),
    getProfileDataGeneration: vi.fn<() => number>(() => 0),
    bumpProfileDataGeneration: vi.fn<() => void>(),
  };
});

describe("desktop loopback intake target resolution", () => {
  it("parses the pairing credential from a pairing URL fragment", () => {
    expect(parsePairingCredential("http://127.0.0.1:9000/#token=abc_123")).toBe("abc_123");
    expect(parsePairingCredential("http://127.0.0.1:9000/")).toBeNull();
    expect(parsePairingCredential("not a url")).toBeNull();
  });

  it("accepts loopback endpoints only", () => {
    expect(isLoopbackEndpoint("http://127.0.0.1:9000/")).toBe(true);
    expect(isLoopbackEndpoint("http://localhost:9000/")).toBe(true);
    expect(isLoopbackEndpoint("https://vite.localhost:9000/")).toBe(true);
    expect(isLoopbackEndpoint("http://192.168.1.4:9000/")).toBe(false);
    expect(isLoopbackEndpoint("http://machine.tailnet.ts.net/")).toBe(false);
  });

  it("resolves the attachment target only for a ready loopback pairing", () => {
    expect(resolveLoopbackTarget({ status: "disabled" })).toBeNull();
    expect(resolveLoopbackTarget({ status: "starting" })).toBeNull();
    expect(
      resolveLoopbackTarget({
        status: "ready",
        localHttpBaseUrl: "http://192.168.1.4:9000",
        pairingUrl: "http://192.168.1.4:9000/#token=t1",
      }),
    ).toBeNull();
    expect(
      resolveLoopbackTarget({
        status: "ready",
        localHttpBaseUrl: "http://127.0.0.1:9000",
        pairingUrl: "http://127.0.0.1:9000/#token=t1",
      }),
    ).toEqual({ endpoint: "http://127.0.0.1:9000", pairingToken: "t1" });
  });
});

describe("ElectronBackendTransport loopback leg", () => {
  type SupervisorListener = (event: SupervisorEvent, rendererSequence?: number) => void;

  function makeTransport() {
    const supervisorListeners = new Set<SupervisorListener>();
    const gapListeners = new Set<() => void>();
    const resetListeners = new Set<() => void>();
    const host = {
      onSupervisorEvent: (listener: SupervisorListener) => {
        supervisorListeners.add(listener);
        return () => supervisorListeners.delete(listener);
      },
      onSupervisorEventGap: (listener: () => void) => {
        gapListeners.add(listener);
        return () => gapListeners.delete(listener);
      },
      onBackendSupervisorReset: (listener: () => void) => {
        resetListeners.add(listener);
        return () => resetListeners.delete(listener);
      },
      invokeProcedure: async () => null,
    } as unknown as ElectronHostBridge;
    const transport = new ElectronBackendTransport(host);
    const emit = (event: SupervisorEvent, sequence?: number) => {
      for (const listener of [...supervisorListeners]) listener(event, sequence);
    };
    return { transport, emit, emitGap: () => gapListeners.forEach((l) => l()) };
  }

  const outputEvent = (threadId: string): SupervisorEvent => ({
    type: "thread-output",
    threadId,
    data: "pty",
    outputLength: 3,
    terminalInstanceId: "gen-1",
  });

  it("keeps thread-output on the relay and drops other relay events while the loopback leg is active", async () => {
    const { transport, emit } = makeTransport();
    const received: SupervisorEvent[] = [];
    transport.subscribe((event) => received.push(event));
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["t1"] });

    // Leg activation rebuilds every subscribed thread (the handoff primitive).
    transport.setLoopbackActive(true);
    expect(received).toEqual([expect.objectContaining({ type: "thread-reset", threadId: "t1" })]);

    // Relay events while active: thread-reset is dropped (the loopback leg
    // delivers it), PTY bytes still cross the relay.
    emit({ type: "thread-reset", threadId: "t1" }, 1);
    emit(outputEvent("t1"), 2);
    expect(received.slice(1)).toEqual([outputEvent("t1")]);

    // Fallback: the relay delivers everything again.
    transport.setLoopbackActive(false);
    emit({ type: "thread-reset", threadId: "t2" }, 3);
    expect(received.at(-1)).toEqual({ type: "thread-reset", threadId: "t2" });
  });

  it("delivers loopback events through the same listener surface", () => {
    const { transport } = makeTransport();
    const received: SupervisorEvent[] = [];
    transport.subscribe((event) => received.push(event));
    transport.dispatchLoopbackEvent({ type: "provider-usage-all", snapshots: [] });
    expect(received).toEqual([{ type: "provider-usage-all", snapshots: [] }]);
  });
});

describe("desktop loopback intake composition (loopback RemoteAccessServer)", () => {
  const servers: RemoteAccessServer[] = [];
  const intakes: DesktopLoopbackIntake[] = [];

  afterEach(async () => {
    for (const intake of intakes.splice(0)) intake.dispose();
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    vi.restoreAllMocks();
  });

  function buildServer(): RemoteAccessServer {
    const server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "1.0.0",
      identity: { desktopId: "desktop-test", label: "Test Desktop" },
      host: "127.0.0.1",
      port: 0,
      tls: null,
      ownsSupervisorPersistence: false,
      callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    });
    servers.push(server);
    return server;
  }

  function wsSocketFactory(url: string) {
    const socket = new NodeWebSocket(url);
    socket.on("error", () => {
      // Swallow transport errors: the intake models them as close.
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

  it("pairs, opens a desktop-internal session, and delivers both event streams", async () => {
    const info = await buildServer().start();
    const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    expect(pairingToken).toBeTruthy();

    const dispatched: SupervisorEvent[] = [];
    let rebuilds = 0;
    let activations = 0;
    const intake = new DesktopLoopbackIntake({
      endpoint: info.localHttpBaseUrl,
      pairingToken: pairingToken!,
      dispatch: (event) => dispatched.push(event),
      requestRebuild: () => {
        rebuilds += 1;
      },
      onActiveChanged: (active) => {
        if (active) activations += 1;
      },
      socketFactory: wsSocketFactory,
    });
    intakes.push(intake);

    // Resolves only once the socket is OPEN on the co-located server.
    await expect(intake.activate()).resolves.toBe(true);
    expect(intake.isActive()).toBe(true);
    expect(activations).toBe(1);
    expect(rebuilds).toBe(1);

    // The server classified the connection as desktop-internal: the
    // desktop-only family rides the desktop-event stream, the shared family
    // the ordinary one — into the same dispatch surface.
    const server = servers[0]!;
    server.publishSupervisorEvent({ type: "git-changed", projectId: "p1" });
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["t1"] });
    await vi.waitFor(() => {
      expect(dispatched.map((event) => event.type)).toEqual([
        "git-changed",
        "remote-threads-changed",
      ]);
    });

    intake.dispose();
    expect(intake.isActive()).toBe(false);
  });

  it("keeps desktop-only events away from an external socket on the same server", async () => {
    const info = await buildServer().start();

    // A plain (non-desktop-internal) client: exchange + ticket + ordinary /ws.
    const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    const tokenResponse = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grantType: "pairing-token",
        credential: pairingToken,
        scopes: ["session:read"],
        client: { label: "Phone", deviceType: "mobile" },
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const token = (await tokenResponse.json()) as { accessToken: string };
    const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    const ticket = ((await ticketResponse.json()) as { ticket: string }).ticket;

    const external = new NodeWebSocket(`${info.wsBaseUrl.replace(/\/$/, "")}/ws?ticket=${ticket}`);
    const frames: Record<string, unknown>[] = [];
    external.on("message", (data) =>
      frames.push(JSON.parse(data.toString()) as Record<string, unknown>),
    );
    await new Promise<void>((resolve, reject) => {
      external.once("open", resolve);
      external.once("error", reject);
    });

    const server = servers[0]!;
    server.publishSupervisorEvent({ type: "git-changed", projectId: "p1" });
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["t1"] });
    await vi.waitFor(() => {
      expect(frames.some((frame) => frame.type === "event")).toBe(true);
    });
    // FIFO over one socket: the desktop-only family never reached it.
    expect(frames.some((frame) => frame.type === "desktop-event")).toBe(false);
    external.close();
  });
});
