import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  BACKEND_RENDERER_STREAM_VERSION,
  type BackendHostOutboundMessage,
  type BackendHostRequest,
  type BackendNativeRequest,
  type BackendRendererRequest,
} from "@/shared/backendHostProtocol";

const state = vi.hoisted(() => ({
  closed: false,
  order: [] as string[],
  sent: [] as BackendHostOutboundMessage[],
  requestNative: null as ((request: BackendNativeRequest) => Promise<unknown>) | null,
  rendererRequest: null as ((request: BackendRendererRequest) => Promise<unknown>) | null,
  service: vi.fn<() => Promise<unknown>>(),
  supervisor: vi.fn<() => Promise<unknown>>(),
  stopSupervisor: vi.fn<() => Promise<void>>(),
  stopServices: vi.fn<() => Promise<void>>(),
  startStream: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/shared/diagnostics/nodePerformanceDiagnostics", () => ({
  startNodePerformanceDiagnostics: () => undefined,
}));
vi.mock("@/shared/secretStorage", () => ({ configureSecretStorageKey() {} }));
vi.mock("@/main/db/databaseRpc", () => ({ callDatabaseRpc: () => null }));
vi.mock("./BackendHostCore", () => ({
  BackendEventRouter: class {
    dispose() {}
    setInterests() {}
    filter() {
      return null;
    }
  },
  BackendHostCore: class {
    supervisorClient = { call: state.supervisor };
    constructor() {
      state.closed = false;
    }
    disposeSupervisor = state.stopSupervisor;
    closeDatabase() {
      state.closed = true;
      state.order.push("database-close");
    }
  },
}));
vi.mock("./BackendDesktopServices", () => ({
  BackendDesktopServices: class {
    constructor(options: { requestNative(request: BackendNativeRequest): Promise<unknown> }) {
      state.requestNative = options.requestNative;
    }
    call = state.service;
    dispose = state.stopServices;
    async prepareSupervisor() {}
  },
}));
vi.mock("./BackendRendererStream", () => ({
  BackendRendererStream: class {
    constructor(options: { onRequest(request: BackendRendererRequest): Promise<unknown> }) {
      state.rendererRequest = options.onRequest;
    }
    start = state.startStream;
    async dispose() {
      state.order.push("stream-close");
    }
  },
}));

const ownedEvents = ["message", "disconnect", "SIGINT", "SIGTERM"] as const;
let previousListeners: Map<string, Set<ReturnType<typeof process.listeners>[number]>>;
let sendDescriptor: PropertyDescriptor | undefined;
let connectedDescriptor: PropertyDescriptor | undefined;
let deliver: (request: BackendHostRequest) => void;

beforeEach(async () => {
  vi.resetModules();
  state.closed = false;
  state.order = [];
  state.sent = [];
  state.requestNative = null;
  state.rendererRequest = null;
  state.service.mockReset().mockResolvedValue(null);
  state.supervisor.mockReset().mockResolvedValue(null);
  state.stopSupervisor.mockReset().mockResolvedValue(undefined);
  state.stopServices.mockReset().mockResolvedValue(undefined);
  state.startStream.mockReset().mockResolvedValue({
    version: BACKEND_RENDERER_STREAM_VERSION,
    url: "ws://127.0.0.1:1/fixture",
    token: "synthetic-token",
  });
  previousListeners = new Map(
    ownedEvents.map((event) => [event, new Set(process.listeners(event))]),
  );
  sendDescriptor = Object.getOwnPropertyDescriptor(process, "send");
  connectedDescriptor = Object.getOwnPropertyDescriptor(process, "connected");
  Object.defineProperty(process, "connected", { configurable: true, value: true });
  Object.defineProperty(process, "send", {
    configurable: true,
    value: (message: BackendHostOutboundMessage, done: (error: Error | null) => void) => {
      state.sent.push(message);
      done(null);
      return true;
    },
  });
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  await import("./index");
  const onMessage = process
    .listeners("message")
    .find((listener) => !previousListeners.get("message")!.has(listener));
  if (!onMessage) throw new Error("Backend entrypoint did not install its message listener");
  deliver = (request) => {
    onMessage(request, undefined);
  };
});

afterEach(() => {
  for (const event of ownedEvents) {
    for (const listener of process.listeners(event)) {
      if (!previousListeners.get(event)!.has(listener)) process.off(event, listener);
    }
  }
  if (sendDescriptor) Object.defineProperty(process, "send", sendDescriptor);
  else Reflect.deleteProperty(process, "send");
  if (connectedDescriptor) Object.defineProperty(process, "connected", connectedDescriptor);
  else Reflect.deleteProperty(process, "connected");
  vi.restoreAllMocks();
});

function initialize(): void {
  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "initialize",
    operation: "initialize",
    payload: {
      baseDir: "/synthetic-fixture",
      dbPath: "/synthetic-fixture/state.sqlite",
      supervisor: {
        appVersion: "fixture",
        isDev: false,
        supervisorPath: "/synthetic-fixture/supervisor.cjs",
        wslHelpersDir: "/synthetic-fixture/wsl",
        secretStorageKey: "synthetic-key",
      },
    },
  });
}

function dispose(id = "dispose"): void {
  deliver({ version: BACKEND_HOST_PROTOCOL_VERSION, id, operation: "dispose", payload: {} });
}

async function reply(id: string) {
  await vi.waitFor(() =>
    expect(state.sent.some((message) => message.kind === "reply" && message.replyTo === id)).toBe(
      true,
    ),
  );
  return state.sent.find((message) => message.kind === "reply" && message.replyTo === id);
}

function signal(event: "SIGINT" | "SIGTERM" | "disconnect"): void {
  const listener = process
    .listeners(event)
    .find((candidate) => !previousListeners.get(event)!.has(candidate));
  expect(listener).toBeDefined();
  listener!();
}

it.each(["ipc", "renderer"] as const)(
  "retains SQLite until an admitted %s service continuation settles",
  async (transport) => {
    const admitted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    state.service.mockImplementation(async () => {
      admitted.resolve();
      await release.promise;
      if (state.closed) throw new Error("Synthetic write after database close");
      state.order.push("write");
      return "written";
    });
    initialize();
    await reply("initialize");
    let rendererReply: Promise<unknown> | undefined;
    if (transport === "ipc") {
      deliver({
        version: BACKEND_HOST_PROTOCOL_VERSION,
        id: "service",
        operation: "call-service",
        payload: { name: "getSharedSettings", payload: {} },
      });
    } else {
      rendererReply = state.rendererRequest!({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "service",
        operation: "service",
        name: "getSharedSettings",
        payload: {},
      });
      void rendererReply.catch(() => {});
    }
    await admitted.promise;
    dispose();
    try {
      await delay(20);
      expect(state.closed).toBe(false);
      expect(
        state.sent.some((message) => message.kind === "reply" && message.replyTo === "dispose"),
      ).toBe(false);
    } finally {
      release.resolve();
      await Promise.allSettled([rendererReply]);
      await reply("dispose");
    }
    expect(state.order.indexOf("write")).toBeLessThan(state.order.indexOf("database-close"));
  },
);

it("joins pending initialization before closing its runtime and refuses publishing a stopped stream", async () => {
  const release = Promise.withResolvers<void>();
  state.startStream.mockImplementation(async () => {
    await release.promise;
    return {
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: "ws://fixture",
      token: "synthetic-token",
    };
  });
  initialize();
  dispose();
  try {
    await delay(20);
    expect(state.closed).toBe(false);
    expect(state.stopSupervisor).not.toHaveBeenCalled();
  } finally {
    release.resolve();
    await reply("dispose");
  }
  expect(await reply("initialize")).toMatchObject({
    ok: false,
    error: expect.stringMatching(/shutting down/i),
  });
});

it("starts supervisor cancellation before joining a request that needs that cancellation", async () => {
  const admitted = Promise.withResolvers<void>();
  const canceled = Promise.withResolvers<unknown>();
  state.supervisor.mockImplementation(() => {
    admitted.resolve();
    return canceled.promise;
  });
  state.stopSupervisor.mockImplementation(async () => {
    state.order.push("cancel-supervisor");
    canceled.reject(new Error("Synthetic supervisor cancellation"));
  });
  initialize();
  await reply("initialize");
  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "supervisor",
    operation: "call-supervisor",
    payload: { id: "supervisor", type: "getAgentStatuses", payload: { wslDistros: [] } },
  });
  await admitted.promise;
  dispose();
  await expect(reply("supervisor")).resolves.toMatchObject({ ok: false });
  await expect(reply("dispose")).resolves.toMatchObject({ ok: true });
  expect(state.order.indexOf("cancel-supervisor")).toBeLessThan(
    state.order.indexOf("database-close"),
  );
});

it("keeps native reverse replies admitted while normal requests drain", async () => {
  state.service.mockImplementation(async () => {
    const value = await state.requestNative!({ operation: "browser-state", payload: {} });
    if (state.closed) throw new Error("Synthetic native result after database close");
    state.order.push("native-result");
    return value;
  });
  initialize();
  await reply("initialize");
  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "service",
    operation: "call-service",
    payload: { name: "getSharedSettings", payload: {} },
  });
  const native = state.sent.find((message) => message.kind === "native-request");
  expect(native?.kind).toBe("native-request");
  dispose();
  try {
    await delay(20);
    expect(state.closed).toBe(false);
  } finally {
    deliver({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "native-result",
      operation: "resolve-native-request",
      payload: { requestId: native!.id, ok: true, data: null },
    });
    await reply("dispose");
  }
  expect(await reply("native-result")).toMatchObject({ ok: true });
  expect(await reply("service")).toMatchObject({ ok: true });
  expect(state.order.indexOf("native-result")).toBeLessThan(state.order.indexOf("database-close"));
});

it("closes normal admission synchronously and joins duplicate disposal without closing twice", async () => {
  const admitted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  state.service.mockImplementation(async () => {
    admitted.resolve();
    await release.promise;
  });
  initialize();
  await reply("initialize");
  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "held",
    operation: "call-service",
    payload: { name: "getSharedSettings", payload: {} },
  });
  await admitted.promise;
  dispose("first-stop");
  dispose("second-stop");
  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "late",
    operation: "call-service",
    payload: { name: "getSharedSettings", payload: {} },
  });
  try {
    await expect(reply("late")).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/shutting down/i),
    });
    await expect(
      state.rendererRequest!({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "late-renderer",
        operation: "service",
        name: "getSharedSettings",
        payload: {},
      }),
    ).rejects.toThrow(/shutting down/i);
    expect(state.service).toHaveBeenCalledOnce();
    expect(state.closed).toBe(false);
  } finally {
    release.resolve();
    await Promise.all([reply("first-stop"), reply("second-stop")]);
  }
  expect(state.stopSupervisor).toHaveBeenCalledOnce();
  expect(state.stopServices).toHaveBeenCalledOnce();
  expect(state.order.filter((step) => step === "database-close")).toHaveLength(1);
});

it("joins native cleanup work started by a producer stop", async () => {
  let cleanup: Promise<unknown> | undefined;
  state.stopServices.mockImplementation(async () => {
    cleanup = state.requestNative!({ operation: "browser-watch-stop", payload: {} });
    void cleanup.catch(() => {});
  });
  initialize();
  await reply("initialize");
  dispose();
  await vi.waitFor(() =>
    expect(state.sent.some((message) => message.kind === "native-request")).toBe(true),
  );
  const native = state.sent.find((message) => message.kind === "native-request")!;
  try {
    await delay(20);
    expect(state.closed).toBe(false);
  } finally {
    deliver({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "cleanup-result",
      operation: "resolve-native-request",
      payload: { requestId: native.id, ok: true, data: null },
    });
    await cleanup;
    await reply("dispose");
  }
  expect(state.closed).toBe(true);
});

it.each(["SIGINT", "SIGTERM", "disconnect"] as const)(
  "%s cancels reverse-native waits and joins their continuations",
  async (event) => {
    state.service.mockImplementation(async () => {
      try {
        await state.requestNative!({ operation: "browser-state", payload: {} });
      } finally {
        expect(state.closed).toBe(false);
        state.order.push("native-canceled");
      }
    });
    initialize();
    await reply("initialize");
    deliver({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "service",
      operation: "call-service",
      payload: { name: "getSharedSettings", payload: {} },
    });
    signal(event);
    await expect(reply("service")).resolves.toMatchObject({ ok: false });
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalled());
    expect(state.order.indexOf("native-canceled")).toBeLessThan(
      state.order.indexOf("database-close"),
    );
    await expect(state.requestNative!({ operation: "browser-state", payload: {} })).rejects.toThrow(
      /shutting down/i,
    );
  },
);

it("retains the database and joins admitted work when runtime shutdown fails", async () => {
  const release = Promise.withResolvers<void>();
  state.stopSupervisor.mockRejectedValue(new Error("Synthetic unconfirmed supervisor stop"));
  state.service.mockImplementation(async () => {
    await release.promise;
    expect(state.closed).toBe(false);
    state.order.push("final-write");
  });
  initialize();
  await reply("initialize");
  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "service",
    operation: "call-service",
    payload: { name: "getSharedSettings", payload: {} },
  });
  dispose();
  try {
    await delay(20);
    expect(
      state.sent.some((message) => message.kind === "reply" && message.replyTo === "dispose"),
    ).toBe(false);
  } finally {
    release.resolve();
    await reply("service");
    await reply("dispose");
  }
  expect(await reply("dispose")).toMatchObject({ ok: false });
  expect(state.closed).toBe(false);
  expect(state.order).toContain("final-write");
});

it("disposes an uninitialized host without requiring a live runtime", async () => {
  dispose();
  await expect(reply("dispose")).resolves.toMatchObject({ ok: true });
  expect(state.stopSupervisor).not.toHaveBeenCalled();
  expect(state.order).not.toContain("database-close");
});
