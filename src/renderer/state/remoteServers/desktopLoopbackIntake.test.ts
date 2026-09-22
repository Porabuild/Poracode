import { WebSocket as NodeWebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  RemoteAccessServer,
  type RemoteAccessServerOptions,
} from "@/host/remote/RemoteAccessServer";
import { ElectronBackendTransport, PreloadIpcTransport } from "@/renderer/hostTransport";
import {
  __resetRendererEventInterestsForTest,
  retainRendererEventInterest,
} from "@/renderer/state/rendererEventInterests";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import {
  DesktopLoopbackIntake,
  isLoopbackEndpoint,
  parsePairingCredential,
  resolveLoopbackTarget,
  type DesktopLoopbackIntakeDeps,
  type DesktopLoopbackSocket,
} from "./desktopLoopbackIntake";
import { boundManagedItemInterests, MANAGED_ITEM_INTERESTS_MAX } from "./desktopLoopbackInterests";

vi.mock("@/host/db", () => {
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
    const resetListeners = new Set<() => void>();
    const host = {
      onSupervisorEvent: (listener: SupervisorListener) => {
        supervisorListeners.add(listener);
        return () => supervisorListeners.delete(listener);
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
    return { transport, emit };
  }

  const outputEvent = (threadId: string): SupervisorEvent => ({
    type: "thread-output",
    threadId,
    data: "pty",
    outputLength: 3,
    terminalInstanceId: "gen-1",
  });

  it("never delivers live IPC relay events (V6 B.6)", async () => {
    const { transport, emit } = makeTransport();
    const received: SupervisorEvent[] = [];
    transport.subscribe((event) => received.push(event));
    __resetRendererEventInterestsForTest();
    const terminalLease = retainRendererEventInterest("terminal", "t1");
    const runtimeLease = retainRendererEventInterest("runtime", "t1");

    transport.setLoopbackActive(true);
    expect(received).toEqual([
      expect.objectContaining({ type: "thread-scrollback-resync", threadId: "t1" }),
      expect.objectContaining({ type: "thread-reset", threadId: "t1" }),
    ]);

    emit({ type: "thread-reset", threadId: "t1" }, 1);
    emit(outputEvent("t1"), 2);
    expect(received).toHaveLength(2);

    transport.setLoopbackActive(false);
    emit({ type: "thread-reset", threadId: "t2" }, 3);
    emit(outputEvent("t1"), 4);
    expect(received.filter((event) => event.type === "thread-output")).toEqual([]);
    expect(received.at(-1)).not.toEqual({ type: "thread-reset", threadId: "t2" });
    terminalLease.release();
    runtimeLease.release();
    __resetRendererEventInterestsForTest();
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

  function wsSocketFactory(url: string, capture?: (frame: string) => void) {
    const socket = new NodeWebSocket(url);
    socket.on("error", () => {
      // Swallow transport errors: the intake models them as close.
    });
    let onopen: (() => void) | null = null;
    let onmessage: ((event: { readonly data: unknown }) => void) | null = null;
    let onclose: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null =
      null;
    socket.on("open", () => onopen?.());
    socket.on("message", (data) => {
      const text = data.toString();
      capture?.(text);
      onmessage?.({ data: text });
    });
    socket.on("close", (code, reason) => onclose?.({ code, reason: reason.toString() }));
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
      set onclose(
        handler: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null,
      ) {
        onclose = handler;
      },
    };
  }

  it("pairs, opens a desktop-internal session, and delivers both event streams", async () => {
    const info = await buildServer().start();
    const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    expect(pairingToken).toBeTruthy();

    const dispatched: SupervisorEvent[] = [];
    // Deep-review regression: the shared stream's per-session seq must reach
    // the reducer — an unsequenced runtime delta permanently poisons
    // overflow recovery (hasUnsequenced refuses the snapshot). V6 B.4: the
    // sequence space rides the WIRE frame, so both streams' counters reach
    // dispatch and arbitration keys on (space, seq) — the desktop counter in
    // the "ipc" space never collides with the shared "loopback" counter.
    const dispatchedSeqs: Array<number | undefined> = [];
    const dispatchedSpaces: Array<string | undefined> = [];
    let rebuilds = 0;
    let activations = 0;
    const intake = new DesktopLoopbackIntake({
      endpoint: info.localHttpBaseUrl,
      pairingToken: pairingToken!,
      dispatch: (event, seq, space) => {
        dispatched.push(event);
        dispatchedSeqs.push(seq);
        dispatchedSpaces.push(space);
      },
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
    // Each frame names its own space on the wire: desktop-event frames carry
    // the desktop counter as ("ipc", 1), shared frames ("loopback", 1) — the
    // same seq number in two spaces, both delivered.
    expect(dispatchedSeqs).toEqual([1, 1]);
    expect(dispatchedSpaces).toEqual(["ipc", "loopback"]);

    intake.dispose();
    expect(intake.isActive()).toBe(false);
  });

  it("declares catalogChanges only when its input says so, and re-opens on demand", async () => {
    const info = await buildServer().start();
    const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    const urls: string[] = [];
    let declares = false;
    const intake = new DesktopLoopbackIntake({
      endpoint: info.localHttpBaseUrl,
      pairingToken: pairingToken!,
      dispatch: () => {},
      requestRebuild: () => {},
      onActiveChanged: () => {},
      declaresBoundedCatalogChanges: () => declares,
      retryDelayMs: 50,
      socketFactory: (url) => {
        urls.push(url);
        return wsSocketFactory(url);
      },
    });
    intakes.push(intake);
    await expect(intake.activate()).resolves.toBe(true);
    expect(new URL(urls[0]!).searchParams.has("catalogChanges")).toBe(false);
    expect(intake.boundedCatalogChangesDeclared()).toBe(false);
    // The declaration is asserted at upgrade, before any read.

    // A descriptor verdict arrives: the socket re-opens through the normal
    // liveness path and the next upgrade carries the exact declaration.
    declares = true;
    intake.refreshCapabilityDeclaration();
    await vi.waitFor(() => expect(urls.length).toBeGreaterThan(1), { timeout: 10_000 });
    const declared = urls
      .map((url) => new URL(url))
      .find((url) => url.searchParams.has("catalogChanges"));
    expect(declared?.searchParams.get("catalogChanges")).toBe("bounded-v1");
    await vi.waitFor(() => expect(intake.boundedCatalogChangesDeclared()).toBe(true), {
      timeout: 10_000,
    });

    // The verdict is withdrawn: the next re-open drops the declaration.
    declares = false;
    const beforeWithdrawal = urls.length;
    intake.refreshCapabilityDeclaration();
    await vi.waitFor(() => expect(urls.length).toBeGreaterThan(beforeWithdrawal), {
      timeout: 10_000,
    });
    expect(new URL(urls.at(-1)!).searchParams.has("catalogChanges")).toBe(false);
    await vi.waitFor(() => expect(intake.boundedCatalogChangesDeclared()).toBe(false), {
      timeout: 10_000,
    });
    intake.dispose();
  }, 30_000);

  it("preflights the authenticated descriptor before the ticket and declares on the FIRST upgrade", async () => {
    const info = await buildServer().start();
    const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    const order: string[] = [];
    const urls: string[] = [];
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth/token")) order.push("exchange");
      else if (url.includes("/api/auth/websocket-ticket")) order.push("ticket");
      return realFetch(input as RequestInfo, init as RequestInit);
    }) as typeof fetch;
    let declares = false;
    let preflightAccessToken: string | null = null;
    let preflightBase: string | null = null;
    let preflightTimeoutMs = 0;
    let preflightSignalAborted: boolean | null = null;
    let preflightOrder: string[] = [];
    const intake = new DesktopLoopbackIntake({
      endpoint: info.localHttpBaseUrl,
      pairingToken: pairingToken!,
      dispatch: () => {},
      requestRebuild: () => {},
      onActiveChanged: () => {},
      fetchImpl,
      declaresBoundedCatalogChanges: () => declares,
      preflightBoundedCatalogChanges: async ({ base, accessToken, timeoutMs, signal }) => {
        preflightOrder = [...order];
        order.push("preflight");
        preflightAccessToken = accessToken;
        preflightBase = base;
        preflightTimeoutMs = timeoutMs;
        preflightSignalAborted = signal.aborted;
        declares = true;
      },
      socketFactory: (url) => {
        order.push("socket");
        urls.push(url);
        return wsSocketFactory(url);
      },
    });
    intakes.push(intake);

    await expect(intake.activate()).resolves.toBe(true);
    expect(order).toEqual(["exchange", "preflight", "ticket", "socket"]);
    expect(preflightAccessToken).toBeTruthy();
    expect(preflightBase).toBe(
      info.localHttpBaseUrl.endsWith("/") ? info.localHttpBaseUrl : `${info.localHttpBaseUrl}/`,
    );
    expect(preflightTimeoutMs).toBeGreaterThan(0);
    expect(preflightSignalAborted).toBe(false);
    // Reading the descriptor AFTER the pairing exchange and BEFORE the one-use
    // ticket is what lets the verdict shape the first upgrade.
    expect(preflightOrder).toEqual(["exchange"]);
    expect(new URL(urls[0]!).searchParams.get("catalogChanges")).toBe("bounded-v1");
    expect(intake.boundedCatalogChangesDeclared()).toBe(true);
    intake.dispose();
  }, 30_000);

  it("opens the leg undeclared when the descriptor preflight fails", async () => {
    const info = await buildServer().start();
    const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    const urls: string[] = [];
    let declares = false;
    const intake = new DesktopLoopbackIntake({
      endpoint: info.localHttpBaseUrl,
      pairingToken: pairingToken!,
      dispatch: () => {},
      requestRebuild: () => {},
      onActiveChanged: () => {},
      declaresBoundedCatalogChanges: () => declares,
      preflightBoundedCatalogChanges: () => {
        throw new Error("descriptor unavailable");
      },
      socketFactory: (url) => {
        urls.push(url);
        return wsSocketFactory(url);
      },
    });
    intakes.push(intake);

    // A failed preflight never blocks the live leg: the upgrade stays
    // undeclared and the activation's own descriptor resolution remains the
    // endpoint authority.
    await expect(intake.activate()).resolves.toBe(true);
    expect(new URL(urls[0]!).searchParams.has("catalogChanges")).toBe(false);
    expect(intake.boundedCatalogChangesDeclared()).toBe(false);
    intake.dispose();
  }, 30_000);

  it("reports a private resync-required frame to the bounded catalog recovery port", async () => {
    const info = await buildServer().start();
    const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    let rebuilds = 0;
    let resyncs = 0;
    let deliver: ((event: { readonly data: unknown }) => void) | null = null;
    const intake = new DesktopLoopbackIntake({
      endpoint: info.localHttpBaseUrl,
      pairingToken: pairingToken!,
      dispatch: () => {},
      requestRebuild: () => {
        rebuilds += 1;
      },
      onActiveChanged: () => {},
      onResyncRequired: () => {
        resyncs += 1;
      },
      socketFactory: (url) => {
        const base = wsSocketFactory(url);
        return {
          close: () => base.close(),
          send: (data: string) => base.send(data),
          get onopen() {
            return base.onopen;
          },
          set onopen(handler: (() => void) | null) {
            base.onopen = handler;
          },
          get onmessage() {
            return base.onmessage;
          },
          set onmessage(handler: ((event: { readonly data: unknown }) => void) | null) {
            deliver = handler;
            base.onmessage = handler;
          },
          get onclose() {
            return base.onclose;
          },
          set onclose(
            handler:
              | ((event?: { readonly code?: number; readonly reason?: string }) => void)
              | null,
          ) {
            base.onclose = handler;
          },
        };
      },
    });
    intakes.push(intake);
    await expect(intake.activate()).resolves.toBe(true);

    const rebuildsBefore = rebuilds;
    deliver!({ data: JSON.stringify({ type: "resync-required" }) });
    await vi.waitFor(() => expect(resyncs).toBe(1));
    // The subscribed-thread rebuild still runs: a resync covers both the live
    // stream restart and the bounded catalog recovery.
    expect(rebuilds).toBeGreaterThan(rebuildsBefore);
    intake.dispose();
  }, 30_000);

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

  it("delivers interleaved (space, seq) streams across a mid-stream leg flip (V6 B.4)", async () => {
    const info = await buildServer().start();
    const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    expect(pairingToken).toBeTruthy();

    // Real wire capture: every raw server frame, and every live socket, so the
    // test can sever the leg mid-stream.
    const rawFrames: string[] = [];
    const opened: ReturnType<typeof wsSocketFactory>[] = [];
    const capturingSocketFactory = (url: string) => {
      const socket = wsSocketFactory(url, (frame) => rawFrames.push(frame));
      opened.push(socket);
      return socket;
    };

    // Arbitration rides the transport's per-space cursor exactly like the
    // managed wiring does (dispatch -> dispatchSequencedEvent).
    const resetListeners = new Set<() => void>();
    const transport = new PreloadIpcTransport({
      onBackendSupervisorReset: () => {
        const handler = (): void => {
          for (const listener of [...resetListeners]) listener();
        };
        resetListeners.add(handler);
        return () => resetListeners.delete(handler);
      },
      invokeProcedure: async () => null,
    } as unknown as ElectronHostBridge);
    const delivered: Array<{ type: string; seq: number | undefined; space: string | undefined }> =
      [];
    let activations = 0;
    let deactivations = 0;
    const intake = new DesktopLoopbackIntake({
      endpoint: info.localHttpBaseUrl,
      pairingToken: pairingToken!,
      retryDelayMs: 40,
      dispatch: (event, seq, space) => {
        transport.dispatchSequencedEvent(event, seq, space ?? "loopback");
      },
      requestRebuild: () => {},
      onActiveChanged: (active) => {
        if (active) activations += 1;
        else deactivations += 1;
        transport.setLoopbackActive(active);
      },
      socketFactory: capturingSocketFactory,
    });
    intakes.push(intake);
    transport.subscribeEvents((event, seq, space) => {
      delivered.push({ type: String(event.type), seq, space });
    });

    await expect(intake.activate()).resolves.toBe(true);

    const server = servers[0]!;
    // Interleave the two spaces: the desktop counter and the shared counter
    // advance independently. With a single-space dedupe cursor the shared
    // events (1, then 2) would be eaten by the desktop events (1, then 2).
    server.publishSupervisorEvent({ type: "git-changed", projectId: "p1" });
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["t1"] });
    server.publishSupervisorEvent({ type: "git-changed", projectId: "p2" });
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["t2"] });
    await vi.waitFor(() => expect(delivered).toHaveLength(4));
    expect(delivered.map((entry) => [entry.space, entry.seq])).toEqual([
      ["ipc", 1],
      ["loopback", 1],
      ["ipc", 2],
      ["loopback", 2],
    ]);
    // The space is ON THE WIRE FRAME — raw server bytes carry it, and the
    // intake read it from there, not from an in-process argument.
    expect(
      rawFrames.some((frame) => frame.startsWith('{"type":"desktop-event","seq":1,"space":"ipc"')),
    ).toBe(true);
    expect(
      rawFrames.some((frame) => frame.startsWith('{"type":"event","seq":1,"space":"loopback"')),
    ).toBe(true);

    // Flip the leg mid-stream: sever the socket; the intake reconnects on the
    // retained bearer and both spaces resume without dropping a frame. The
    // inactive window is shorter than a poll interval, so count the flip.
    for (const socket of opened.splice(0)) socket.close();
    await vi.waitFor(() => expect(deactivations).toBeGreaterThanOrEqual(1));
    await vi.waitFor(() => {
      expect(activations).toBeGreaterThanOrEqual(2);
      expect(intake.isActive()).toBe(true);
    });

    server.publishSupervisorEvent({ type: "git-changed", projectId: "p3" });
    server.publishSupervisorEvent({ type: "remote-threads-changed", threadIds: ["t3"] });
    await vi.waitFor(() => expect(delivered).toHaveLength(6));
    // Post-flip: the server-side counters continue (ipc 3, loopback 3) and
    // neither space's cursor swallowed them.
    expect(delivered.slice(4).map((entry) => [entry.space, entry.seq])).toEqual([
      ["ipc", 3],
      ["loopback", 3],
    ]);
  });

  it("scopes hidden bulk content, keeps hidden control events, and orders a newly selected thread", async () => {
    const info = await buildServer().start();
    const pairingToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    expect(pairingToken).toBeTruthy();

    const frames: Record<string, unknown>[] = [];
    const rawFrames: string[] = [];
    let interests = ["visible"];
    let notify: (() => void) | null = null;
    let rebuilds = 0;
    const intake = new DesktopLoopbackIntake({
      endpoint: info.localHttpBaseUrl,
      pairingToken: pairingToken!,
      dispatch: () => {},
      requestRebuild: () => {
        rebuilds += 1;
      },
      onActiveChanged: () => {},
      readItemInterests: () => interests,
      subscribeItemInterests: (listener) => {
        notify = listener;
        return () => {
          notify = null;
        };
      },
      socketFactory: (url) =>
        wsSocketFactory(url, (frame) => {
          rawFrames.push(frame);
          frames.push(JSON.parse(frame) as Record<string, unknown>);
        }),
    });
    intakes.push(intake);
    await expect(intake.activate()).resolves.toBe(true);
    expect(rebuilds).toBe(1);

    type EventFrame = {
      readonly threadId: string;
      readonly events?: unknown[];
      readonly event?: { readonly type?: string; readonly payload?: { readonly result?: string } };
    };
    const eventFrames = () =>
      frames
        .filter((frame) => frame.type === "event")
        .map((frame) => ({
          seq: frame.seq as number,
          event: frame.event as EventFrame,
        }));

    const server = servers[0]!;
    const itemEvent = (threadId: string) =>
      ({
        type: "thread-runtime-event",
        threadId,
        event: {
          type: "item.completed",
          threadId,
          itemId: `${threadId}-item`,
          payload: { name: "bash", result: "R".repeat(5_000) },
        },
      }) as const;
    const hiddenIds = Array.from({ length: 64 }, (_, index) => `hidden-${index}`);
    for (const threadId of hiddenIds) server.publishSupervisorEvent(itemEvent(threadId));
    server.publishSupervisorEvent(itemEvent("visible"));
    await vi.waitFor(() => expect(eventFrames()).toHaveLength(65));

    // One visible thread arrives intact; 64 hidden threads arrive as empty,
    // content-free frames (never dropped: replay/seq contiguity holds) whose
    // wire bytes do not grow with the hidden payload at all.
    const initial = eventFrames();
    const visibleFrames = initial.filter(({ event }) => event.threadId === "visible");
    expect(visibleFrames).toHaveLength(1);
    expect(visibleFrames[0]!.event.event?.payload?.result).toHaveLength(5_000);
    for (const { event } of initial.filter((frame) => frame.event.threadId !== "visible")) {
      expect(event).toEqual({
        type: "thread-runtime-events",
        threadId: event.threadId,
        events: [],
      });
    }
    const hiddenFrames = frames
      .map((frame, index) => ({ frame, raw: rawFrames[index]! }))
      .filter(
        ({ frame }) => frame.type === "event" && (frame.event as EventFrame).threadId !== "visible",
      );
    expect(hiddenFrames).toHaveLength(64);
    expect(Math.max(...hiddenFrames.map(({ raw }) => raw.length))).toBeLessThan(400);

    // Essential control for a hidden thread still arrives (a background
    // approval must never be stranded behind an interest filter).
    server.publishSupervisorEvent({
      type: "thread-runtime-event",
      threadId: "hidden-0",
      event: {
        type: "request.opened",
        threadId: "hidden-0",
        requestId: "req-1",
        requestType: "tool_call_approval",
        payload: { summary: "Allow this tool?" },
      },
    });
    await vi.waitFor(() =>
      expect(eventFrames().some(({ event }) => event.event?.type === "request.opened")).toBe(true),
    );

    // Select a previously hidden thread over the same socket: the next frame
    // for it carries its content, directly continuing the ordered stream.
    const before = eventFrames();
    const lastSeq = before.at(-1)!.seq;
    interests = ["visible", "hidden-0"];
    notify!();
    // The interest frame must be processed before the event is broadcast, or
    // the assertion below would race the socket's message ordering.
    const itemInterests = (
      server as unknown as { itemInterests: Map<unknown, ReadonlySet<string>> }
    ).itemInterests;
    await vi.waitFor(() =>
      expect([...itemInterests.values()].some((interestSet) => interestSet.has("hidden-0"))).toBe(
        true,
      ),
    );
    server.publishSupervisorEvent(itemEvent("hidden-0"));
    await vi.waitFor(() => expect(eventFrames()).toHaveLength(before.length + 1));
    const selected = eventFrames().at(-1)!;
    expect(selected.seq).toBe(lastSeq + 1);
    expect(selected.event.event?.payload?.result).toHaveLength(5_000);

    server.publishSupervisorEvent(itemEvent("hidden-0"));
    await vi.waitFor(() => expect(eventFrames()).toHaveLength(before.length + 2));
    expect(eventFrames().at(-1)!.seq).toBe(lastSeq + 2);
    // Interest switching is not a full rebuild: the baseline path stays the
    // activation rebuild + the pane's hydration-on-ready.
    expect(rebuilds).toBe(1);
  });

  it("keeps independent windows on independent interest sets", async () => {
    const server = buildServer();
    const info = await server.start();
    const startupToken = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
    // `issuePairingUrl` would revoke the startup credential; the independent
    // grant coexists so both windows pair concurrently.
    const secondToken = new URLSearchParams(
      new URL(server.issueIndependentPairingUrl("window-b")).hash.slice(1),
    ).get("token");
    expect(startupToken && secondToken).toBeTruthy();

    type EventFrame = {
      readonly threadId: string;
      readonly events?: unknown[];
      readonly event?: { readonly payload?: { readonly result?: string } };
    };
    const makeWindow = (threadId: string, pairingToken: string) => {
      const frames: Record<string, unknown>[] = [];
      const intake = new DesktopLoopbackIntake({
        endpoint: info.localHttpBaseUrl,
        pairingToken,
        dispatch: () => {},
        requestRebuild: () => {},
        onActiveChanged: () => {},
        readItemInterests: () => [threadId],
        socketFactory: (url) =>
          wsSocketFactory(url, (frame) =>
            frames.push(JSON.parse(frame) as Record<string, unknown>),
          ),
      });
      intakes.push(intake);
      return {
        intake,
        eventFrames: () =>
          frames
            .filter((frame) => frame.type === "event")
            .map((frame) => frame.event as EventFrame),
      };
    };
    const windowA = makeWindow("thread-A", startupToken!);
    const windowB = makeWindow("thread-B", secondToken!);
    await expect(
      Promise.all([windowA.intake.activate(), windowB.intake.activate()]),
    ).resolves.toEqual([true, true]);

    const itemEvent = (threadId: string) =>
      ({
        type: "thread-runtime-event",
        threadId,
        event: {
          type: "item.completed",
          threadId,
          itemId: `${threadId}-item`,
          payload: { name: "bash", result: "R".repeat(5_000) },
        },
      }) as const;
    server.publishSupervisorEvent(itemEvent("thread-A"));
    server.publishSupervisorEvent(itemEvent("thread-B"));
    await vi.waitFor(() => {
      expect(windowA.eventFrames()).toHaveLength(2);
      expect(windowB.eventFrames()).toHaveLength(2);
    });

    const contentFor = (frames: EventFrame[], threadId: string) =>
      frames.find((frame) => frame.threadId === threadId)!;
    expect(contentFor(windowA.eventFrames(), "thread-A").event?.payload?.result).toHaveLength(
      5_000,
    );
    expect(contentFor(windowA.eventFrames(), "thread-B").events).toEqual([]);
    expect(contentFor(windowB.eventFrames(), "thread-B").event?.payload?.result).toHaveLength(
      5_000,
    );
    expect(contentFor(windowB.eventFrames(), "thread-A").events).toEqual([]);
  });
});

describe("boundManagedItemInterests (A1 wire bound)", () => {
  it("dedupes valid ids, preserves priority order, and reports the overflow", () => {
    const ids = Array.from(
      { length: MANAGED_ITEM_INTERESTS_MAX + 6 },
      (_, index) => `runtime-${index}`,
    );
    const bounded = boundManagedItemInterests([...ids, "runtime-0", "", 7 as unknown as string]);
    expect(bounded.threadIds).toEqual(ids.slice(0, MANAGED_ITEM_INTERESTS_MAX));
    expect(bounded.droppedCount).toBe(6);
  });

  it("drops malformed entries instead of ever sending a null-widening array", () => {
    expect(
      boundManagedItemInterests(["", "runtime-a", "runtime-a", 7 as unknown as string]),
    ).toEqual({ threadIds: ["runtime-a"], droppedCount: 0 });
  });
});

interface FakeSocketHarness {
  readonly socket: DesktopLoopbackSocket;
  readonly sent: string[];
  closeCount: number;
  emitOpen(): void;
  emitMessage(data: unknown): void;
  emitClose(event?: { readonly code?: number; readonly reason?: string }): void;
}

function makeFakeSocket(): FakeSocketHarness {
  let onopen: (() => void) | null = null;
  let onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  let onclose: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null =
    null;
  const sent: string[] = [];
  const harness: FakeSocketHarness = {
    sent,
    closeCount: 0,
    socket: {
      close: () => {
        harness.closeCount += 1;
      },
      send: (data: string) => {
        sent.push(data);
      },
      get onopen() {
        return onopen;
      },
      set onopen(handler) {
        onopen = handler;
      },
      get onmessage() {
        return onmessage;
      },
      set onmessage(handler) {
        onmessage = handler;
      },
      get onclose() {
        return onclose;
      },
      set onclose(handler) {
        onclose = handler;
      },
    },
    emitOpen: () => onopen?.(),
    emitMessage: (data) => onmessage?.({ data }),
    emitClose: (event) => onclose?.(event),
  };
  return harness;
}

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function createFakeFetch(
  options: {
    readonly exchange?: () => Response | Promise<Response>;
    readonly ticket?: () => Response | Promise<Response>;
  } = {},
) {
  const calls: Array<{ readonly url: string; readonly authorization: string | null }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, authorization: headers.authorization ?? null });
    if (url.endsWith("/oauth/token")) {
      return options.exchange
        ? options.exchange()
        : jsonResponse(200, { accessToken: "access-1", refreshToken: "refresh-1" });
    }
    if (url.endsWith("/api/auth/websocket-ticket")) {
      return options.ticket
        ? options.ticket()
        : jsonResponse(200, { ticket: `ticket-${calls.length}` });
    }
    throw new Error(`unexpected fetch url: ${url}`);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function baseIntakeDeps(
  overrides: Partial<DesktopLoopbackIntakeDeps> & {
    readonly socketFactory: (url: string) => DesktopLoopbackSocket;
  },
): DesktopLoopbackIntakeDeps {
  return {
    endpoint: "http://127.0.0.1:9031",
    pairingToken: "pairing-credential",
    dispatch: () => {},
    requestRebuild: () => {},
    onActiveChanged: () => {},
    ...overrides,
  };
}

describe("desktop loopback managed interests (A1)", () => {
  const intakes: DesktopLoopbackIntake[] = [];
  afterEach(() => {
    for (const intake of intakes.splice(0)) intake.dispose();
  });

  it("declares an explicit empty item-interest array when nothing is retained", async () => {
    const { fetchImpl } = createFakeFetch();
    const urls: string[] = [];
    const fake = makeFakeSocket();
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        socketFactory: (url) => {
          urls.push(url);
          return fake.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.waitFor(() => expect(urls).toHaveLength(1));
    const params = new URL(urls[0]!).searchParams;
    expect(params.get("desktopInternal")).toBe("1");
    expect(params.get("threadItemInterests")).toBe("[]");
    fake.emitOpen();
    await expect(activation).resolves.toBe(true);
  });

  it("carries the priority set on the upgrade and updates it over the same socket", async () => {
    const { fetchImpl } = createFakeFetch();
    let interests = ["runtime-new", "runtime-old"];
    let notify: (() => void) | null = null;
    let unsubscribed = false;
    const urls: string[] = [];
    const fake = makeFakeSocket();
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        readItemInterests: () => interests,
        subscribeItemInterests: (listener) => {
          notify = listener;
          return () => {
            unsubscribed = true;
            notify = null;
          };
        },
        socketFactory: (url) => {
          urls.push(url);
          return fake.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.waitFor(() => expect(urls).toHaveLength(1));
    expect(new URL(urls[0]!).searchParams.get("threadItemInterests")).toBe(
      '["runtime-new","runtime-old"]',
    );
    fake.emitOpen();
    await expect(activation).resolves.toBe(true);
    // The upgrade already carried the set: no redundant frame on open.
    expect(fake.sent).toEqual([]);

    interests = ["runtime-new", "runtime-old", "runtime-latest"];
    notify!();
    expect(fake.sent).toHaveLength(1);
    expect(JSON.parse(fake.sent[0]!)).toEqual({
      type: "thread-item-interests",
      threadIds: interests,
    });
    // No duplicate frame when the set did not change.
    notify!();
    expect(fake.sent).toHaveLength(1);

    intake.dispose();
    expect(unsubscribed).toBe(true);
  });

  it("bounds the wire array and reports dropped interests instead of sending malformed JSON", async () => {
    const ids = Array.from(
      { length: MANAGED_ITEM_INTERESTS_MAX + 12 },
      (_, index) => `runtime-${index}`,
    );
    const truncated = vi.fn<(dropped: number) => void>();
    const { fetchImpl } = createFakeFetch();
    const urls: string[] = [];
    const fake = makeFakeSocket();
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        readItemInterests: () => ids,
        onItemInterestsTruncated: truncated,
        socketFactory: (url) => {
          urls.push(url);
          return fake.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.waitFor(() => expect(urls).toHaveLength(1));
    const raw = new URL(urls[0]!).searchParams.get("threadItemInterests");
    // Valid and bounded: the server must never parse this as "no interests
    // declared", which would silently widen the session to every thread.
    expect(JSON.parse(raw!)).toEqual(ids.slice(0, MANAGED_ITEM_INTERESTS_MAX));
    expect(truncated).toHaveBeenCalledExactlyOnceWith(12);
    fake.emitOpen();
    await expect(activation).resolves.toBe(true);
  });

  it("rebuilds a still-mounted thread only when it re-enters the wire selection after a cap gap", async () => {
    const { fetchImpl } = createFakeFetch();
    const cap = MANAGED_ITEM_INTERESTS_MAX;
    // t-0 is retained (last in priority) but cap-excluded: its mounted view is
    // not live-streamed.
    let interests = [...Array.from({ length: cap }, (_, index) => `t-${index + 1}`), "t-0"];
    let notify: (() => void) | null = null;
    const rebuilds: Array<ReadonlySet<string>> = [];
    const fake = makeFakeSocket();
    let socketCreated = false;
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        readItemInterests: () => interests,
        subscribeItemInterests: (listener) => {
          notify = listener;
          return () => {
            notify = null;
          };
        },
        requestRebuild: (threadIds) => {
          rebuilds.push(threadIds ?? new Set<string>());
        },
        socketFactory: () => {
          socketCreated = true;
          return fake.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.waitFor(() => expect(socketCreated).toBe(true));
    fake.emitOpen();
    await expect(activation).resolves.toBe(true);
    // Activation rebuilds every subscription (no per-thread set).
    expect(rebuilds).toEqual([new Set<string>()]);

    // Another pane releases: capacity frees up and t-0 is admitted again even
    // though nothing re-retained it. Its mounted view missed frames, so the
    // transport must rebuild exactly it.
    interests = interests.filter((threadId) => threadId !== `t-${cap}`);
    notify!();
    expect(rebuilds).toHaveLength(2);
    expect([...rebuilds[1]!]).toEqual(["t-0"]);

    // A fresh overflow that excludes t-0 again, then a re-retain that moves it
    // to the front: the priority path also rebuilds it.
    interests = [...Array.from({ length: cap }, (_, index) => `t-${index + 1}`), "t-0"];
    notify!();
    expect(rebuilds).toHaveLength(2);
    interests = ["t-0", ...Array.from({ length: cap }, (_, index) => `t-${index + 1}`)];
    notify!();
    expect(rebuilds).toHaveLength(3);
    expect([...rebuilds[2]!]).toEqual(["t-0"]);
  });

  it("reports the cap overflow as clearable capacity state and reports wire coverage", async () => {
    const { fetchImpl } = createFakeFetch();
    const cap = MANAGED_ITEM_INTERESTS_MAX;
    let interests = [...Array.from({ length: cap }, (_, index) => `t-${index + 1}`), "t-0"];
    let notify: (() => void) | null = null;
    const overflow = vi.fn<(dropped: number) => void>();
    const applied: Array<readonly string[] | null> = [];
    const fake = makeFakeSocket();
    let socketCreated = false;
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        readItemInterests: () => interests,
        subscribeItemInterests: (listener) => {
          notify = listener;
          return () => {
            notify = null;
          };
        },
        onItemInterestsTruncated: overflow,
        onItemInterestsApplied: (threadIds) => applied.push(threadIds),
        socketFactory: () => {
          socketCreated = true;
          return fake.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.waitFor(() => expect(socketCreated).toBe(true));
    fake.emitOpen();
    await expect(activation).resolves.toBe(true);
    // The upgrade carried 200 ids (t-0 excluded): coverage reflects the wire.
    expect(overflow).toHaveBeenCalledExactlyOnceWith(1);
    expect(applied.at(-1)).toHaveLength(cap);
    expect(applied.at(-1)).not.toContain("t-0");

    // Capacity frees up: the visible state must clear, not stay stale.
    interests = interests.filter((threadId) => threadId !== `t-${cap}`);
    notify!();
    expect(overflow).toHaveBeenLastCalledWith(0);
    expect(applied.at(-1)).toContain("t-0");

    // Leg down: coverage is reported gone (never claimed while dead).
    intake.dispose();
    expect(applied.at(-1)).toBeNull();
  });

  it("keeps an unrelated window's rebuilds out of another window's overflow", async () => {
    const { fetchImpl } = createFakeFetch();
    const cap = MANAGED_ITEM_INTERESTS_MAX;
    const makeWindow = (overflowed: boolean) => {
      let interests = overflowed
        ? [...Array.from({ length: cap }, (_, index) => `w-${index + 1}`), "w-0"]
        : ["other-window-thread"];
      let notify: (() => void) | null = null;
      const rebuilds: Array<ReadonlySet<string>> = [];
      const fake = makeFakeSocket();
      let socketCreated = false;
      const intake = new DesktopLoopbackIntake(
        baseIntakeDeps({
          fetchImpl,
          readItemInterests: () => interests,
          subscribeItemInterests: (listener) => {
            notify = listener;
            return () => {
              notify = null;
            };
          },
          requestRebuild: (threadIds) => {
            rebuilds.push(threadIds ?? new Set<string>());
          },
          socketFactory: () => {
            socketCreated = true;
            return fake.socket;
          },
        }),
      );
      intakes.push(intake);
      return {
        intake,
        fake,
        rebuilds,
        isSocketCreated: () => socketCreated,
        setInterests: (next: string[]) => {
          interests = next;
        },
        notify: () => notify?.(),
      };
    };
    const windowA = makeWindow(true);
    const windowB = makeWindow(false);
    const activationA = windowA.intake.activate();
    const activationB = windowB.intake.activate();
    await vi.waitFor(() => {
      expect(windowA.isSocketCreated()).toBe(true);
      expect(windowB.isSocketCreated()).toBe(true);
    });
    windowA.fake.emitOpen();
    windowB.fake.emitOpen();
    await expect(Promise.all([activationA, activationB])).resolves.toEqual([true, true]);
    expect(windowA.rebuilds).toEqual([new Set<string>()]);
    expect(windowB.rebuilds).toEqual([new Set<string>()]);

    // Window A frees capacity; only A rebuilds its re-admitted thread.
    windowA.setInterests([
      ...Array.from({ length: cap - 1 }, (_, index) => `w-${index + 1}`),
      "w-0",
    ]);
    windowA.notify();
    expect(windowA.rebuilds).toHaveLength(2);
    expect([...windowA.rebuilds[1]!]).toEqual(["w-0"]);
    expect(windowB.rebuilds).toHaveLength(1);
  });

  it("does not infer restoration across a reconnect and unsubscribes on dispose", async () => {
    const { fetchImpl } = createFakeFetch();
    const cap = MANAGED_ITEM_INTERESTS_MAX;
    let interests = [...Array.from({ length: cap }, (_, index) => `t-${index + 1}`), "t-0"];
    let unsubscribed = false;
    const rebuilds: Array<ReadonlySet<string>> = [];
    const sockets: FakeSocketHarness[] = [];
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        retryDelayMs: 10,
        readItemInterests: () => interests,
        subscribeItemInterests: () => {
          return () => {
            unsubscribed = true;
          };
        },
        requestRebuild: (threadIds) => {
          rebuilds.push(threadIds ?? new Set<string>());
        },
        socketFactory: () => {
          const harness = makeFakeSocket();
          sockets.push(harness);
          return harness.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]!.emitOpen();
    await expect(activation).resolves.toBe(true);
    expect(rebuilds).toEqual([new Set<string>()]);

    // The leg drops; capacity frees while it is down.
    sockets[0]!.emitClose({ code: 1006, reason: "lost" });
    interests = interests.filter((threadId) => threadId !== `t-${cap}`);
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1]!.emitOpen();
    await vi.waitFor(() => expect(intake.isActive()).toBe(true));
    // Re-open re-establishes coverage wholesale; t-0 is never reported as a
    // per-thread restoration across the dead leg (activation already rebuilt).
    expect(rebuilds.every((ids) => ids.size === 0)).toBe(true);

    intake.dispose();
    expect(unsubscribed).toBe(true);
  });
});

describe("desktop loopback socket policy (A4)", () => {
  const intakes: DesktopLoopbackIntake[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const intake of intakes.splice(0)) intake.dispose();
    vi.useRealTimers();
  });

  it("force-closes a socket that never opens at the connect deadline and retries locally", async () => {
    const { fetchImpl } = createFakeFetch();
    const sockets: FakeSocketHarness[] = [];
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        retryDelayMs: 100,
        connectTimeoutMs: 500,
        socketFactory: () => {
          const harness = makeFakeSocket();
          sockets.push(harness);
          return harness.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(498);
    expect(sockets[0]!.closeCount).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(sockets[0]!.closeCount).toBe(1);
    await activation;
    expect(intake.isActive()).toBe(false);

    // Quick bounded local retry (the test seam cadence), not the old
    // unconditional 30 s pause.
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets).toHaveLength(2);
    sockets[1]!.emitOpen();
    await vi.advanceTimersByTimeAsync(1);
    expect(intake.isActive()).toBe(true);
  });

  it("detects a half-open socket with correlated pings and recovers on pong", async () => {
    const { fetchImpl } = createFakeFetch();
    const sockets: FakeSocketHarness[] = [];
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        retryDelayMs: 100,
        socketFactory: () => {
          const harness = makeFakeSocket();
          sockets.push(harness);
          return harness.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(1);
    sockets[0]!.emitOpen();
    await activation;
    expect(intake.isActive()).toBe(true);

    await vi.advanceTimersByTimeAsync(15_000);
    const ping = JSON.parse(sockets[0]!.sent.at(-1)!) as { type: string; id: string };
    expect(ping.type).toBe("ping");
    // A matching pong keeps the leg alive through the timeout window.
    sockets[0]!.emitMessage(JSON.stringify({ type: "pong", id: ping.id }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sockets[0]!.closeCount).toBe(0);
    expect(intake.isActive()).toBe(true);

    // The next probe goes unanswered: half-open detected, socket replaced.
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sockets[0]!.closeCount).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets).toHaveLength(2);
    sockets[1]!.emitOpen();
    await vi.advanceTimersByTimeAsync(1);
    expect(intake.isActive()).toBe(true);
  });

  it("aborts a pairing exchange that exceeds its deadline and retries locally", async () => {
    let calls = 0;
    const hangingFetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    }) as typeof fetch;
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl: hangingFetch,
        requestTimeoutMs: 100,
        retryDelayMs: 100,
        socketFactory: () => makeFakeSocket().socket,
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(100);
    await activation;
    expect(calls).toBe(1);
    expect(intake.isActive()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);
  });

  it("re-exchanges the pairing credential once when the retained bearer is refused", async () => {
    let ticketCalls = 0;
    const { fetchImpl, calls } = createFakeFetch({
      ticket: () => {
        ticketCalls += 1;
        return ticketCalls === 1 ? jsonResponse(401, {}) : jsonResponse(200, { ticket: "fresh" });
      },
    });
    const urls: string[] = [];
    const fake = makeFakeSocket();
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        socketFactory: (url) => {
          urls.push(url);
          return fake.socket;
        },
      }),
    );
    intakes.push(intake);
    intake.applyTokens({ accessToken: "retained" });
    const activation = intake.activate();
    await vi.waitFor(() => expect(urls).toHaveLength(1));
    fake.emitOpen();
    await expect(activation).resolves.toBe(true);
    expect(
      calls.map((call) => (call.url.endsWith("/oauth/token") ? "exchange" : "ticket")),
    ).toEqual(["ticket", "exchange", "ticket"]);
    expect(calls.at(-1)!.authorization).toBe("Bearer access-1");
  });

  it("reports a refused pairing credential once and stops retrying it", async () => {
    const exhausted = vi.fn<() => void>();
    const { fetchImpl, calls } = createFakeFetch({ exchange: () => jsonResponse(401, {}) });
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        onCredentialExhausted: exhausted,
        socketFactory: () => makeFakeSocket().socket,
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(1);
    await activation;
    expect(exhausted).toHaveBeenCalledTimes(1);
    expect(intake.isActive()).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  });

  it("treats an unauthorized socket close as credential exhaustion, not a bearer retry", async () => {
    const exhausted = vi.fn<() => void>();
    const { fetchImpl, calls } = createFakeFetch();
    const sockets: FakeSocketHarness[] = [];
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        onCredentialExhausted: exhausted,
        retryDelayMs: 100,
        socketFactory: () => {
          const harness = makeFakeSocket();
          sockets.push(harness);
          return harness.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(1);
    sockets[0]!.emitOpen();
    await activation;
    expect(intake.isActive()).toBe(true);
    expect(calls).toHaveLength(2);

    sockets[0]!.emitClose({ code: 1008, reason: "Remote access session revoked" });
    expect(exhausted).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(2);
    expect(sockets).toHaveLength(1);
  });

  it("reports recovery exhaustion once after the bounded local attempts", async () => {
    const exhausted = vi.fn<() => void>();
    const { fetchImpl, calls } = createFakeFetch({ exchange: () => jsonResponse(503, {}) });
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        onRecoveryExhausted: exhausted,
        localRecoveryMaxAttempts: 3,
        retryDelayMs: 100,
        socketFactory: () => makeFakeSocket().socket,
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(1);
    await activation;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(exhausted).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(3);
  });

  it("keeps retrying at the capped cadence when no escalation port is installed", async () => {
    const { fetchImpl, calls } = createFakeFetch({ exchange: () => jsonResponse(503, {}) });
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        localRecoveryMaxAttempts: 2,
        retryDelayMs: 100,
        socketFactory: () => makeFakeSocket().socket,
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(1);
    await activation;
    await vi.advanceTimersByTimeAsync(1_000);
    // The leg must not strand silently without an owner to re-bootstrap it.
    expect(calls.length).toBeGreaterThan(3);
  });

  it("fences late socket callbacks after dispose and joins the pending activation", async () => {
    const dispatch = vi.fn<(...args: unknown[]) => void>();
    const terminalReady = vi.fn<(...args: unknown[]) => void>();
    const { fetchImpl } = createFakeFetch();
    const sockets: FakeSocketHarness[] = [];
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        dispatch: dispatch as DesktopLoopbackIntakeDeps["dispatch"],
        onTerminalReady: terminalReady as NonNullable<DesktopLoopbackIntakeDeps["onTerminalReady"]>,
        socketFactory: () => {
          const harness = makeFakeSocket();
          sockets.push(harness);
          return harness.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(1);
    intake.dispose();
    await expect(activation).resolves.toBe(false);

    sockets[0]!.emitOpen();
    sockets[0]!.emitMessage(
      JSON.stringify({ type: "event", event: { type: "git-changed", projectId: "p" } }),
    );
    sockets[0]!.emitClose();
    expect(dispatch).not.toHaveBeenCalled();
    expect(terminalReady).not.toHaveBeenCalled();
    expect(intake.isActive()).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
  });
});
