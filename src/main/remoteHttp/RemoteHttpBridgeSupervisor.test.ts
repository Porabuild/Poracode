import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagePortMain } from "electron";
import {
  REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
  REMOTE_HTTP_BRIDGE_VERSION,
  REMOTE_HTTP_MAX_ACTIVE_REQUESTS,
  REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW,
  type RemoteHttpBridgeOpenRequest,
} from "@/shared/remote/httpBridgeProtocol";
import { IPC_WINDOW_CHANNELS } from "@/shared/ipc/channels";
import {
  RemoteHttpBridgeSupervisor,
  type RemoteHttpBridgeRendererTarget,
  type RemoteHttpBridgeUtilityProcessLike,
} from "./RemoteHttpBridgeSupervisor";

vi.mock("electron", () => ({
  MessageChannelMain: class {
    port1 = { postMessage: vi.fn<() => void>(), close: vi.fn<() => void>() };
    port2 = { postMessage: vi.fn<() => void>(), close: vi.fn<() => void>() };
  },
  utilityProcess: { fork: vi.fn<() => never>() },
}));

interface PostedMessage {
  readonly channel: string;
  readonly message: unknown;
  readonly transfer: readonly unknown[];
}

interface TestTarget extends RemoteHttpBridgeRendererTarget {
  readonly posted: PostedMessage[];
  destroyed: boolean;
  throwOnPost: boolean;
}

function createTarget(id = 10): TestTarget {
  const target: TestTarget = {
    id,
    posted: [],
    destroyed: false,
    throwOnPost: false,
    isDestroyed: () => target.destroyed,
    postMessage: (channel, message, transfer) => {
      if (target.throwOnPost) throw new Error("Object has been destroyed");
      target.posted.push({ channel, message, transfer });
    },
  };
  return target;
}

function postedKinds(child: FakeUtilityProcess, kind: string): unknown[] {
  return child.posted.filter((message) => (message as { kind?: string }).kind === kind);
}

class FakeUtilityProcess implements RemoteHttpBridgeUtilityProcessLike {
  readonly pid: number | undefined;
  killed = false;
  private readonly spawnListeners: Array<() => void> = [];
  private readonly exitListeners: Array<(code: number | null) => void> = [];
  private readonly messageListeners: Array<(message: unknown) => void> = [];

  constructor(pid: number | undefined) {
    this.pid = pid;
  }

  postMessage(message: unknown, transfer?: MessagePortMain[]): void {
    this.posted.push(message);
    (this.transfers as unknown[][]).push(transfer ?? []);
  }

  readonly posted: unknown[] = [];
  readonly transfers: readonly unknown[][] = [];

  kill(): boolean {
    this.killed = true;
    return true;
  }

  once(event: "spawn", listener: () => void): unknown {
    if (event === "spawn") this.spawnListeners.push(listener);
    return this;
  }

  on(event: "spawn" | "exit" | "message", listener: never): unknown {
    if (event === "spawn") this.spawnListeners.push(listener as () => void);
    if (event === "exit") this.exitListeners.push(listener as (code: number | null) => void);
    if (event === "message") this.messageListeners.push(listener as (message: unknown) => void);
    return this;
  }

  off(event: "spawn" | "exit" | "message", listener: (...args: never[]) => void): unknown {
    const remove = <T>(list: T[]) => {
      const index = list.indexOf(listener as unknown as T);
      if (index >= 0) list.splice(index, 1);
    };
    if (event === "spawn") remove(this.spawnListeners);
    if (event === "exit") remove(this.exitListeners);
    if (event === "message") remove(this.messageListeners);
    return this;
  }

  emitSpawn(): void {
    for (const listener of [...this.spawnListeners]) listener();
  }

  emitExit(code: number | null): void {
    for (const listener of [...this.exitListeners]) listener(code);
  }

  emitMessage(message: unknown): void {
    for (const listener of [...this.messageListeners]) listener(message);
  }
}

function request(
  overrides: Partial<RemoteHttpBridgeOpenRequest> = {},
): RemoteHttpBridgeOpenRequest {
  return {
    requestId: crypto.randomUUID(),
    url: "https://remote.example.test/api",
    method: "GET",
    headers: {},
    hasBody: false,
    bodyBytes: 0,
    ...overrides,
  };
}

function createHarness(
  options: {
    readonly pidForFork?: (index: number) => number | undefined;
    readonly spawnTimeoutMs?: number;
    readonly createChannel?: () => { port1: MessagePortMain; port2: MessagePortMain };
  } = {},
) {
  const forks: FakeUtilityProcess[] = [];
  const channelPorts: Array<{ port1: unknown; port2: unknown }> = [];
  const settled: unknown[] = [];
  const pidForFork = options.pidForFork ?? (() => 4242);
  let forkIndex = 0;
  const supervisor = new RemoteHttpBridgeSupervisor({
    utilityPath: "/tmp/remoteHttpBridge.cjs",
    ...(options.spawnTimeoutMs !== undefined ? { spawnTimeoutMs: options.spawnTimeoutMs } : {}),
    forkUtility: () => {
      const child = new FakeUtilityProcess(pidForFork(forkIndex));
      forkIndex += 1;
      forks.push(child);
      return child;
    },
    createChannel:
      options.createChannel ??
      (() => {
        const pair = {
          port1: { postMessage: vi.fn<() => void>(), close: vi.fn<() => void>() },
          port2: { postMessage: vi.fn<() => void>(), close: vi.fn<() => void>() },
        };
        channelPorts.push(pair);
        return pair as unknown as { port1: MessagePortMain; port2: MessagePortMain };
      }),
    onSettled: (message) => settled.push(message),
  });
  return { supervisor, forks, channelPorts, settled };
}

describe("RemoteHttpBridgeSupervisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lazily forks one utility, hands off both port halves, and carries no body bytes", async () => {
    const { supervisor, forks, channelPorts } = createHarness();
    const target = createTarget();

    const first = await supervisor.open(target, request({ requestId: crypto.randomUUID() }));
    const second = await supervisor.open(target, request({ requestId: crypto.randomUUID() }));

    expect(forks).toHaveLength(1);
    expect(first.generation).toBe(1);
    expect(second.generation).toBe(1);
    expect(supervisor.localStats()).toMatchObject({
      activeRequests: 2,
      openedRequests: 2,
      utilityStarts: 1,
      generation: 1,
    });
    for (const [index, posted] of target.posted.entries()) {
      expect(posted.channel).toBe(IPC_WINDOW_CHANNELS.remoteHttpBridgePort);
      expect(posted.message).toMatchObject({
        channel: REMOTE_HTTP_BRIDGE_PORT_CHANNEL,
        v: REMOTE_HTTP_BRIDGE_VERSION,
        generation: 1,
      });
      expect(posted.transfer).toEqual([channelPorts[index]!.port2]);
    }
    for (const [index, message] of forks[0]!.posted.entries()) {
      expect(message).toMatchObject({ kind: "open", generation: 1, senderId: target.id });
      const descriptor = message as Record<string, unknown>;
      expect(descriptor).not.toHaveProperty("body");
      expect(descriptor).not.toHaveProperty("bodyBase64");
      expect(forkTransfers(forks[0]!, index)).toEqual([channelPorts[index]!.port1]);
    }
  });

  it("refuses duplicate request ids and per-window admission overruns", async () => {
    const { supervisor } = createHarness();
    const target = createTarget();
    const sharedId = crypto.randomUUID();
    await supervisor.open(target, request({ requestId: sharedId }));

    await expect(supervisor.open(target, request({ requestId: sharedId }))).rejects.toThrow(
      "already active",
    );

    for (let index = 1; index < REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW; index += 1) {
      await supervisor.open(target, request({ requestId: crypto.randomUUID() }));
    }
    await expect(
      supervisor.open(target, request({ requestId: crypto.randomUUID() })),
    ).rejects.toThrow("Too many active remote requests for this window");
  });

  it("releases capacity when the utility settles a request", async () => {
    const { supervisor, forks, settled } = createHarness();
    const target = createTarget();
    const open = request({ requestId: crypto.randomUUID() });
    await supervisor.open(target, open);
    expect(supervisor.localStats().activeRequests).toBe(1);

    forks[0]!.emitMessage({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "settled",
      generation: 1,
      requestId: open.requestId,
      outcome: "completed",
      receivedBytes: 12,
      sentBytes: 12,
    });

    expect(supervisor.localStats().activeRequests).toBe(0);
    expect(settled).toEqual([
      expect.objectContaining({ requestId: open.requestId, outcome: "completed" }),
    ]);
  });

  it("fences generations across a utility crash and starts a fresh one", async () => {
    const { supervisor, forks } = createHarness();
    const target = createTarget();
    await supervisor.open(target, request({ requestId: crypto.randomUUID() }));

    forks[0]!.emitExit(1);
    expect(supervisor.localStats()).toMatchObject({ activeRequests: 0, generation: 0 });

    const result = await supervisor.open(target, request({ requestId: crypto.randomUUID() }));
    expect(result.generation).toBe(2);
    expect(forks).toHaveLength(2);
    expect(forks[0]!.killed).toBe(false);
  });

  it("scopes cancel to the owning window and forwards it to the utility", async () => {
    const { supervisor, forks } = createHarness();
    const owner = createTarget(10);
    const stranger = createTarget(11);
    const open = request({ requestId: crypto.randomUUID() });
    await supervisor.open(owner, open);

    supervisor.cancel(stranger.id, open.requestId);
    expect(forks[0]!.posted).toHaveLength(1);

    supervisor.cancel(owner.id, open.requestId);
    expect(forks[0]!.posted.at(-1)).toMatchObject({
      kind: "cancel",
      requestId: open.requestId,
      generation: 1,
    });
  });

  it("aborts a window's requests on lifecycle events", async () => {
    const { supervisor, forks } = createHarness();
    const listeners = new Map<string, (...args: never[]) => void>();
    const contents = {
      id: 21,
      on(event: string, listener: (...args: never[]) => void) {
        listeners.set(event, listener);
        return contents;
      },
    };
    supervisor.watchWebContents(contents);
    const open = request({ requestId: crypto.randomUUID() });
    await supervisor.open(createTarget(contents.id), open);

    listeners.get("did-start-navigation")!({ isMainFrame: true, isSameDocument: true } as never);
    expect(supervisor.localStats().activeRequests).toBe(1);

    listeners.get("did-start-navigation")!({ isMainFrame: true, isSameDocument: false } as never);
    expect(supervisor.localStats().activeRequests).toBe(0);
    expect(forks[0]!.posted.at(-1)).toMatchObject({ kind: "abort-window", senderId: contents.id });

    await supervisor.open(createTarget(contents.id), request({ requestId: crypto.randomUUID() }));
    listeners.get("destroyed")!();
    expect(supervisor.localStats().activeRequests).toBe(0);
  });

  it("rejects a destroyed target before forking", async () => {
    const { supervisor, forks } = createHarness();
    const target = { ...createTarget(), isDestroyed: () => true };
    await expect(supervisor.open(target, request())).rejects.toThrow("window is gone");
    expect(forks).toHaveLength(0);
  });

  it("queries payload-free utility stats and shuts the utility down", async () => {
    const { supervisor, forks } = createHarness();
    await supervisor.open(createTarget(), request({ requestId: crypto.randomUUID() }));
    const query = supervisor.queryStats();
    const queryMessage = forks[0]!.posted.at(-1) as { kind: string; queryId: number };
    expect(queryMessage.kind).toBe("stats-query");

    forks[0]!.emitMessage({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "stats-reply",
      generation: 1,
      queryId: queryMessage.queryId,
      stats: { ...RemoteHttpBridgeSupervisor.emptyStats(), downloadedBytes: 42 },
    });
    await expect(query).resolves.toMatchObject({ downloadedBytes: 42 });

    supervisor.shutdown();
    expect(forks[0]!.killed).toBe(true);
    expect(forks[0]!.posted.at(-1)).toMatchObject({ kind: "abort-all" });
  });

  it("kills a child that misses the spawn deadline, never publishes a late spawn, and retries fresh", async () => {
    const { supervisor, forks } = createHarness({
      spawnTimeoutMs: 20,
      pidForFork: (index) => (index === 0 ? undefined : 4242),
    });
    const pending = supervisor.open(createTarget(), request({ requestId: crypto.randomUUID() }));

    await expect(pending).rejects.toThrow("did not start");
    expect(forks).toHaveLength(1);
    expect(forks[0]!.killed).toBe(true);
    expect(supervisor.localStats()).toMatchObject({
      generation: 0,
      utilityStarts: 0,
      activeRequests: 0,
    });

    // A spawn that arrives after the deadline must not revive the attempt.
    forks[0]!.emitSpawn();
    forks[0]!.emitExit(0);
    expect(supervisor.localStats()).toMatchObject({ generation: 0, utilityStarts: 0 });

    // The failed attempt consumed generation 1; the retry gets generation 2.
    const healthy = await supervisor.open(
      createTarget(),
      request({ requestId: crypto.randomUUID() }),
    );
    expect(healthy.generation).toBe(2);
    expect(forks).toHaveLength(2);
    expect(forks[1]!.killed).toBe(false);
    expect(supervisor.localStats()).toMatchObject({ generation: 2, utilityStarts: 1 });
  });

  it("treats an exit before spawn as a start failure and cleans up the owned child", async () => {
    const { supervisor, forks } = createHarness({
      pidForFork: (index) => (index === 0 ? undefined : 4242),
    });
    const pending = supervisor.open(createTarget(), request({ requestId: crypto.randomUUID() }));
    await vi.waitFor(() => expect(forks).toHaveLength(1));

    forks[0]!.emitExit(9);

    await expect(pending).rejects.toThrow("exited before start");
    expect(forks[0]!.killed).toBe(true);
    expect(supervisor.localStats()).toMatchObject({ generation: 0, utilityStarts: 0 });

    const healthy = await supervisor.open(
      createTarget(),
      request({ requestId: crypto.randomUUID() }),
    );
    expect(healthy.generation).toBe(2);
    expect(forks[1]!.killed).toBe(false);
  });

  it("shares one fork attempt for concurrent opens", async () => {
    const { supervisor, forks } = createHarness({ pidForFork: () => undefined });
    const first = supervisor.open(createTarget(31), request({ requestId: crypto.randomUUID() }));
    const second = supervisor.open(createTarget(32), request({ requestId: crypto.randomUUID() }));
    await vi.waitFor(() => expect(forks).toHaveLength(1));
    forks[0]!.emitSpawn();

    const [a, b] = await Promise.all([first, second]);
    expect(a.generation).toBe(1);
    expect(b.generation).toBe(1);
    expect(forks).toHaveLength(1);
    expect(supervisor.localStats()).toMatchObject({ utilityStarts: 1, generation: 1 });
  });

  it("retires a cold-start reservation on a pre-port cancel and never dispatches it", async () => {
    const { supervisor, forks } = createHarness({ pidForFork: () => undefined });
    const target = createTarget();
    const open = request({ requestId: crypto.randomUUID() });
    const pending = supervisor.open(target, open);
    await vi.waitFor(() => expect(forks).toHaveLength(1));

    // The renderer's main-side fallback for an abort before the port attaches.
    supervisor.cancel(target.id, open.requestId);
    // The reservation is gone immediately; starting the utility must not
    // revive it even though the shared start continues.
    expect(supervisor.localStats().activeRequests).toBe(0);

    forks[0]!.emitSpawn();
    await expect(pending).rejects.toThrow("retired before it could start");
    expect(postedKinds(forks[0]!, "open")).toHaveLength(0);
    expect(postedKinds(forks[0]!, "cancel")).toHaveLength(0);
    expect(target.posted).toHaveLength(0);
    expect(supervisor.localStats().activeRequests).toBe(0);

    const healthy = await supervisor.open(target, request({ requestId: crypto.randomUUID() }));
    expect(healthy.generation).toBe(1);
    expect(postedKinds(forks[0]!, "open")).toHaveLength(1);
    expect(target.posted).toHaveLength(1);
  });

  it("retires a cold-start reservation on main-frame navigation", async () => {
    const { supervisor, forks } = createHarness({ pidForFork: () => undefined });
    const listeners = new Map<string, (...args: never[]) => void>();
    const contents = {
      id: 21,
      on(event: string, listener: (...args: never[]) => void) {
        listeners.set(event, listener);
        return contents;
      },
    };
    supervisor.watchWebContents(contents);
    const target = createTarget(contents.id);
    const pending = supervisor.open(target, request({ requestId: crypto.randomUUID() }));
    await vi.waitFor(() => expect(forks).toHaveLength(1));

    listeners.get("did-start-navigation")!({ isMainFrame: true, isSameDocument: false } as never);
    forks[0]!.emitSpawn();

    await expect(pending).rejects.toThrow("retired before it could start");
    expect(postedKinds(forks[0]!, "open")).toHaveLength(0);
    expect(target.posted).toHaveLength(0);
    expect(supervisor.localStats().activeRequests).toBe(0);

    // The same (current) document can still open after the navigation fence.
    const healthy = await supervisor.open(target, request({ requestId: crypto.randomUUID() }));
    expect(healthy.generation).toBe(1);
    expect(target.posted).toHaveLength(1);
  });

  it("holds cold-start concurrency to the global and per-window admission caps", async () => {
    const { supervisor, forks } = createHarness({ pidForFork: () => undefined });
    const windowA = createTarget(10);
    const perWindowRequests = Array.from(
      { length: REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW + 8 },
      () => request({ requestId: crypto.randomUUID() }),
    );
    const perWindow = perWindowRequests.map((open) => supervisor.open(windowA, open));
    const otherTargets = Array.from({ length: REMOTE_HTTP_MAX_ACTIVE_REQUESTS - 8 }, (_, index) =>
      index % 2 === 0 ? createTarget(11) : createTarget(20 + index),
    );
    const otherRequests = Array.from({ length: otherTargets.length }, () =>
      request({ requestId: crypto.randomUUID() }),
    );
    const otherWindows = otherTargets.map((target, index) =>
      supervisor.open(target, otherRequests[index]!),
    );
    await vi.waitFor(() => expect(forks).toHaveLength(1));

    // Everything over either cap rejects before the utility has spawned, so
    // these settle without the spawn event.
    const remainingGlobalSlots =
      REMOTE_HTTP_MAX_ACTIVE_REQUESTS - REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW;
    const overCap = [
      ...perWindow.slice(REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW),
      ...otherWindows.slice(remainingGlobalSlots),
    ];
    const overCapResults = await Promise.allSettled(overCap);
    expect(overCapResults.map((result) => result.status)).toEqual(
      Array.from({ length: overCap.length }, () => "rejected"),
    );

    forks[0]!.emitSpawn();
    const acceptedResults = await Promise.allSettled([
      ...perWindow.slice(0, REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW),
      ...otherWindows.slice(0, remainingGlobalSlots),
    ]);
    expect(acceptedResults.every((result) => result.status === "fulfilled")).toBe(true);

    const stats = supervisor.localStats();
    expect(stats.activeRequests).toBe(REMOTE_HTTP_MAX_ACTIVE_REQUESTS);
    expect(postedKinds(forks[0]!, "open")).toHaveLength(REMOTE_HTTP_MAX_ACTIVE_REQUESTS);
    await expect(
      supervisor.open(createTarget(99), request({ requestId: crypto.randomUUID() })),
    ).rejects.toThrow("Too many active remote requests.");

    // Free one global slot: window A is still exactly at its own cap.
    forks[0]!.emitMessage({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "settled",
      generation: 1,
      requestId: otherRequests[0]!.requestId,
      outcome: "completed",
      receivedBytes: 0,
      sentBytes: 0,
    });
    expect(supervisor.localStats().activeRequests).toBe(REMOTE_HTTP_MAX_ACTIVE_REQUESTS - 1);
    await expect(
      supervisor.open(windowA, request({ requestId: crypto.randomUUID() })),
    ).rejects.toThrow("Too many active remote requests for this window");
  });

  it("rejects a duplicate id while its cold-start reservation is pending", async () => {
    const { supervisor, forks } = createHarness({ pidForFork: () => undefined });
    const target = createTarget();
    const duplicateId = crypto.randomUUID();
    const first = supervisor.open(target, request({ requestId: duplicateId }));
    const second = supervisor.open(target, request({ requestId: duplicateId }));
    await vi.waitFor(() => expect(forks).toHaveLength(1));

    await expect(second).rejects.toThrow("already active");
    forks[0]!.emitSpawn();
    await expect(first).resolves.toMatchObject({ generation: 1 });

    expect(postedKinds(forks[0]!, "open")).toHaveLength(1);
    expect(supervisor.localStats().activeRequests).toBe(1);
    forks[0]!.emitMessage({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "settled",
      generation: 1,
      requestId: duplicateId,
      outcome: "completed",
      receivedBytes: 0,
      sentBytes: 0,
    });
    expect(supervisor.localStats().activeRequests).toBe(0);

    // The rejected duplicate must not have leaked or double-counted a slot.
    let accepted = 0;
    for (let index = 0; index < REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW; index += 1) {
      await supervisor.open(target, request({ requestId: crypto.randomUUID() }));
      accepted += 1;
    }
    expect(accepted).toBe(REMOTE_HTTP_MAX_ACTIVE_REQUESTS_PER_WINDOW);
  });

  it("releases capacity immediately on a utility rejection settle, even while starting", async () => {
    const { supervisor, forks } = createHarness({ pidForFork: () => undefined });
    const target = createTarget();
    const open = request({ requestId: crypto.randomUUID() });
    const pending = supervisor.open(target, open);
    await vi.waitFor(() => expect(forks).toHaveLength(1));

    // Starting records carry generation 0 and were never dispatched; a settle
    // for an unpublished generation must not touch the reservation (message
    // listeners are only attached once the attempt is published).
    forks[0]!.emitMessage({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "settled",
      generation: 1,
      requestId: open.requestId,
      outcome: "failed",
      receivedBytes: 0,
      sentBytes: 0,
    });
    expect(supervisor.localStats().activeRequests).toBe(1);

    forks[0]!.emitSpawn();
    await expect(pending).resolves.toMatchObject({ generation: 1 });
    // The utility's rejection notice releases the slot synchronously; no
    // safety-timer wait is involved.
    forks[0]!.emitMessage({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "settled",
      generation: 1,
      requestId: open.requestId,
      outcome: "failed",
      receivedBytes: 0,
      sentBytes: 0,
    });
    expect(supervisor.localStats().activeRequests).toBe(0);
    await expect(
      supervisor.open(target, request({ requestId: crypto.randomUUID() })),
    ).resolves.toMatchObject({ generation: 1 });
  });

  it("does not let a fenced cold-start continuation release a reused id", async () => {
    const { supervisor, forks } = createHarness({ pidForFork: () => undefined });
    const target = createTarget();
    const sharedId = crypto.randomUUID();
    const first = supervisor.open(target, request({ requestId: sharedId }));
    await vi.waitFor(() => expect(forks).toHaveLength(1));

    supervisor.cancel(target.id, sharedId);
    const second = supervisor.open(target, request({ requestId: sharedId }));
    forks[0]!.emitSpawn();

    await expect(first).rejects.toThrow("retired before it could start");
    await expect(second).resolves.toMatchObject({ generation: 1 });
    // The stale continuation must not have released the newer record.
    expect(supervisor.localStats().activeRequests).toBe(1);
    expect(postedKinds(forks[0]!, "open")).toHaveLength(1);
    expect(target.posted).toHaveLength(1);
  });

  it("ignores a stale settle for an id reused after a utility restart", async () => {
    const { supervisor, forks } = createHarness();
    const target = createTarget();
    const sharedId = crypto.randomUUID();
    await supervisor.open(target, request({ requestId: sharedId }));
    expect(supervisor.localStats().activeRequests).toBe(1);

    forks[0]!.emitExit(1);
    expect(supervisor.localStats()).toMatchObject({ activeRequests: 0, generation: 0 });

    const reopened = await supervisor.open(target, request({ requestId: sharedId }));
    expect(reopened.generation).toBe(2);
    expect(supervisor.localStats().activeRequests).toBe(1);

    forks[1]!.emitMessage({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "settled",
      generation: 1,
      requestId: sharedId,
      outcome: "cancelled",
      receivedBytes: 0,
      sentBytes: 0,
    });
    expect(supervisor.localStats().activeRequests).toBe(1);

    forks[1]!.emitMessage({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "settled",
      generation: 2,
      requestId: sharedId,
      outcome: "completed",
      receivedBytes: 4,
      sentBytes: 4,
    });
    expect(supervisor.localStats().activeRequests).toBe(0);
  });

  it("cleans up a reservation when the window dies during start", async () => {
    const { supervisor, forks } = createHarness({ pidForFork: () => undefined });
    const target = createTarget();
    const pending = supervisor.open(target, request({ requestId: crypto.randomUUID() }));
    await vi.waitFor(() => expect(forks).toHaveLength(1));

    target.destroyed = true;
    forks[0]!.emitSpawn();

    await expect(pending).rejects.toThrow("window is gone");
    expect(postedKinds(forks[0]!, "open")).toHaveLength(0);
    expect(target.posted).toHaveLength(0);
    expect(supervisor.localStats().activeRequests).toBe(0);

    target.destroyed = false;
    await expect(
      supervisor.open(target, request({ requestId: crypto.randomUUID() })),
    ).resolves.toMatchObject({ generation: 1 });
  });

  it("cancels and releases a dispatched request whose port handoff throws", async () => {
    const { supervisor, forks } = createHarness();
    const target = createTarget();
    target.throwOnPost = true;
    const pending = supervisor.open(target, request({ requestId: crypto.randomUUID() }));

    await expect(pending).rejects.toThrow("Object has been destroyed");
    expect(postedKinds(forks[0]!, "open")).toHaveLength(1);
    expect(postedKinds(forks[0]!, "cancel")).toHaveLength(1);
    expect(target.posted).toHaveLength(0);
    expect(supervisor.localStats().activeRequests).toBe(0);
  });

  it("releases a reservation when channel creation fails", async () => {
    let failChannels = true;
    const { supervisor } = createHarness({
      createChannel: () => {
        if (failChannels) throw new Error("channel unavailable");
        return {
          port1: { postMessage: vi.fn<() => void>(), close: vi.fn<() => void>() } as never,
          port2: { postMessage: vi.fn<() => void>(), close: vi.fn<() => void>() } as never,
        };
      },
    });
    const target = createTarget();
    await expect(
      supervisor.open(target, request({ requestId: crypto.randomUUID() })),
    ).rejects.toThrow("channel unavailable");
    expect(supervisor.localStats()).toMatchObject({
      activeRequests: 0,
      openedRequests: 0,
      generation: 1,
    });

    failChannels = false;
    await expect(
      supervisor.open(target, request({ requestId: crypto.randomUUID() })),
    ).resolves.toMatchObject({ generation: 1 });
    expect(supervisor.localStats()).toMatchObject({ activeRequests: 1, openedRequests: 1 });
  });

  it("fences shutdown during start, kills the owned child, and allows a later healthy call", async () => {
    const { supervisor, forks } = createHarness({
      pidForFork: (index) => (index === 0 ? undefined : 4242),
    });
    const pending = supervisor.open(createTarget(), request({ requestId: crypto.randomUUID() }));
    await vi.waitFor(() => expect(forks).toHaveLength(1));

    supervisor.shutdown();
    expect(forks[0]!.killed).toBe(true);

    // The killed start settles through its exit event; the supervisor refuses
    // to publish the retired child.
    forks[0]!.emitExit(0);
    await expect(pending).rejects.toThrow(/shut down while starting|exited before start/);
    expect(supervisor.localStats()).toMatchObject({ generation: 0, utilityStarts: 0 });

    const healthy = await supervisor.open(
      createTarget(),
      request({ requestId: crypto.randomUUID() }),
    );
    expect(healthy.generation).toBe(2);
    expect(forks).toHaveLength(2);
    expect(forks[1]!.killed).toBe(false);
    expect(supervisor.localStats()).toMatchObject({ generation: 2, utilityStarts: 1 });
  });

  it("retires an active child on shutdown exactly once and detaches its listeners", async () => {
    const { supervisor, forks } = createHarness();
    await supervisor.open(createTarget(), request({ requestId: crypto.randomUUID() }));
    expect(supervisor.localStats()).toMatchObject({ generation: 1, utilityStarts: 1 });

    supervisor.shutdown();
    expect(forks[0]!.killed).toBe(true);

    // A late exit/message from the killed child must not disturb a new one.
    forks[0]!.emitExit(0);
    forks[0]!.emitMessage({
      v: REMOTE_HTTP_BRIDGE_VERSION,
      kind: "settled",
      generation: 1,
      requestId: crypto.randomUUID(),
      outcome: "completed",
      receivedBytes: 1,
      sentBytes: 1,
    });
    expect(supervisor.localStats()).toMatchObject({ generation: 0, utilityStarts: 1 });

    const healthy = await supervisor.open(
      createTarget(),
      request({ requestId: crypto.randomUUID() }),
    );
    expect(healthy.generation).toBe(2);
    expect(forks).toHaveLength(2);
  });
});

function forkTransfers(child: FakeUtilityProcess, index: number): unknown {
  return (child.transfers as unknown[][])[index];
}
