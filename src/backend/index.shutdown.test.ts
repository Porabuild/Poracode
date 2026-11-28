import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostOutboundMessage,
  type BackendHostRequest,
  type BackendNativeRequest,
} from "@/shared/backendHostProtocol";
import { LATE_SHUTDOWN_EXIT_MS } from "./shutdownEscalation";

const state = vi.hoisted(() => ({
  closed: false,
  supervisorJoined: false,
  diagnosticsStop: null as null | (() => Promise<void>),
  configureKey: vi.fn<() => void>(),
  order: [] as string[],
  sent: [] as BackendHostOutboundMessage[],
  requestNative: null as ((request: BackendNativeRequest) => Promise<unknown>) | null,
  service: vi.fn<() => Promise<unknown>>(),
  supervisor: vi.fn<() => Promise<unknown>>(),
  stopSupervisor: vi.fn<() => Promise<void>>(),
  stopServices: vi.fn<() => Promise<void>>(),
  prepareLaunch: null as (() => Promise<void>) | null,
  resolveExtraEnv: null as (() => Record<string, string>) | null,
}));

vi.mock("@/shared/diagnostics/nodePerformanceDiagnostics", () => ({
  startNodePerformanceDiagnostics: () => ({
    queueCapture: undefined,
    observeIpcQueue: () => {},
    stop: () => state.diagnosticsStop?.() ?? Promise.resolve(),
  }),
}));
vi.mock("@/shared/secretStorage", () => ({ configureSecretStorageKey: state.configureKey }));
vi.mock("@/host/db/databaseRpc", () => ({ callDatabaseRpc: () => null }));
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
    constructor(options: {
      supervisor: {
        prepareLaunch(): Promise<void>;
        resolveExtraEnv(): Record<string, string>;
      };
    }) {
      state.closed = false;
      state.supervisorJoined = false;
      state.prepareLaunch = options.supervisor.prepareLaunch;
      state.resolveExtraEnv = options.supervisor.resolveExtraEnv;
    }
    async startSupervisor() {
      await state.prepareLaunch!();
    }
    async restartSupervisor() {
      await state.prepareLaunch!();
    }
    // Mirrors the real contract: the supervisor joins first, and only then
    // can the database close.
    async disposeSupervisor() {
      await state.stopSupervisor();
      state.supervisorJoined = true;
    }
    closeDatabase() {
      if (!state.supervisorJoined)
        throw new Error("Cannot close the database before supervisor work has joined.");
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
    callSupervisor = state.supervisor;
    dispose = state.stopServices;
    async prepareSupervisor() {}
    async startBackgroundServices() {}
    getSupervisorExtraEnv() {
      return { PORACODE_APP_MCP_URL: "http://127.0.0.1:12345" };
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
  state.supervisorJoined = false;
  state.diagnosticsStop = null;
  state.configureKey.mockClear();
  state.order = [];
  state.sent = [];
  state.requestNative = null;
  state.prepareLaunch = null;
  state.resolveExtraEnv = null;
  state.service.mockReset().mockResolvedValue(null);
  state.supervisor.mockReset().mockResolvedValue(null);
  state.stopSupervisor.mockReset().mockResolvedValue(undefined);
  state.stopServices.mockReset().mockResolvedValue(undefined);
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

it.each([
  null,
  0,
  { version: 2, profileNamespace: "/unused", ownerGeneration: "future" },
  {
    version: 1,
    profileNamespace: "/unused",
    ownerGeneration: "11111111-1111-4111-8111-111111111111",
  },
])(
  "refuses a malformed, future or foreign local control grant before configuring keys or constructing a host: %j",
  async (grant) => {
    deliver({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "future-local-control",
      operation: "initialize",
      payload: {
        baseDir: "/never-open",
        dbPath: "/never-open/state.sqlite",
        supervisor: {
          appVersion: "fixture",
          isDev: false,
          supervisorPath: "/never-spawn",
          wslHelpersDir: "/unused",
          secretStorageKey: "never-configure",
        },
        desktop: {
          channel: "stable",
          settingsPath: "/never-open/settings.json",
          localControl: grant,
        },
      },
    } as unknown as BackendHostRequest);
    expect(await reply("future-local-control")).toMatchObject({ ok: false });
    expect(state.configureKey).not.toHaveBeenCalled();
    expect(state.prepareLaunch).toBeNull();
    expect(state.supervisor).not.toHaveBeenCalled();
  },
);

function dispose(id = "dispose"): void {
  deliver({ version: BACKEND_HOST_PROTOCOL_VERSION, id, operation: "dispose", payload: {} });
}

it.each(["start-supervisor", "restart-supervisor"] as const)(
  "holds a lazy launch until %s supplies the native MCP environment",
  async (operation) => {
    initialize();
    await reply("initialize");
    const launched = vi.fn<() => void>();
    const launch = state.prepareLaunch!().then(launched);
    await delay(20);
    expect(launched).not.toHaveBeenCalled();
    const extraEnv = {
      PORACODE_CHROME_MCP_URL: "http://127.0.0.1:23456",
      PORACODE_CHROME_MCP_TOKEN: "fixture-token",
    };
    deliver({
      version: BACKEND_HOST_PROTOCOL_VERSION,
      id: "start",
      operation,
      payload: { extraEnv },
    });
    await reply("start");
    await launch;
    expect(launched).toHaveBeenCalledOnce();
    expect(state.resolveExtraEnv!()).toEqual({
      ...extraEnv,
      PORACODE_APP_MCP_URL: "http://127.0.0.1:12345",
    });
  },
);

it("accepts the previous startup wire shape with no native MCP environment", async () => {
  initialize();
  await reply("initialize");
  const launch = state.prepareLaunch!();
  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "start",
    operation: "start-supervisor",
    payload: { extraEnv: {} },
  });
  await expect(reply("start")).resolves.toMatchObject({ ok: true });
  await launch;
  expect(state.resolveExtraEnv!()).toEqual({ PORACODE_APP_MCP_URL: "http://127.0.0.1:12345" });
});

it("cancels a lazy launch waiting for main's environment when the backend stops", async () => {
  initialize();
  await reply("initialize");
  const launch = state.prepareLaunch!();
  dispose();
  await expect(launch).rejects.toThrow("Backend host is shutting down.");
  await expect(reply("dispose")).resolves.toMatchObject({ ok: true });
});

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

it("retains SQLite until an admitted IPC service continuation settles", async () => {
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
  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "service",
    operation: "call-service",
    payload: { name: "getSharedSettings", payload: {} },
  });
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
    await reply("dispose");
  }
  expect(state.order.indexOf("write")).toBeLessThan(state.order.indexOf("database-close"));
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

async function holdService(id: string): Promise<() => void> {
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
    id,
    operation: "call-service",
    payload: { name: "getSharedSettings", payload: {} },
  });
  await admitted.promise;
  return () => release.resolve();
}

it.each(["SIGINT", "SIGTERM"] as const)(
  "%s during an in-flight stop commits the database and exits once its grace elapses",
  async (event) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await holdService("held-service");
    dispose();
    const { SupervisorIpcSender } = await import("@/supervisor/supervisorIpcSender");
    const flush = vi.spyOn(SupervisorIpcSender.prototype, "flushAndWait");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      signal(event);
      await vi.advanceTimersByTimeAsync(LATE_SHUTDOWN_EXIT_MS - 1);
      expect(process.exit).not.toHaveBeenCalled();
      expect(state.closed).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
    } finally {
      vi.useRealTimers();
    }
    // The supervisor joined, so everything it accepted is committed even
    // though the admitted request never settled.
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(state.order.filter((step) => step === "database-close")).toHaveLength(1);
    expect(flush).not.toHaveBeenCalled();
  },
);

it.each(["SIGINT", "SIGTERM"] as const)(
  "%s during an in-flight stop leaves a stop that cannot commit yet to finish on its own",
  async (event) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const supervisorStopped = Promise.withResolvers<void>();
    state.stopSupervisor.mockImplementation(() => supervisorStopped.promise);
    const release = await holdService("held-service");
    dispose();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      signal(event);
      await vi.advanceTimersByTimeAsync(LATE_SHUTDOWN_EXIT_MS);
      // The owner's forced kill is still ahead, so ending the stop here could
      // only turn the clean close it may still reach into a lost one.
      expect(process.exit).not.toHaveBeenCalled();
      expect(state.closed).toBe(false);
      supervisorStopped.resolve();
      release();
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
    expect(error).not.toHaveBeenCalled();
    expect(state.closed).toBe(true);
  },
);

it("escalates a stop that an earlier signal started", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await holdService("held-service");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    signal("SIGTERM");
    signal("SIGTERM");
    await vi.advanceTimersByTimeAsync(LATE_SHUTDOWN_EXIT_MS);
  } finally {
    vi.useRealTimers();
  }
  expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(state.order.filter((step) => step === "database-close")).toHaveLength(1);
});

it("lets a stop that finishes inside the grace close its database and exit cleanly", async () => {
  const release = await holdService("held-service");
  dispose();
  const { SupervisorIpcSender } = await import("@/supervisor/supervisorIpcSender");
  const flush = vi.spyOn(SupervisorIpcSender.prototype, "flushAndWait");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    signal("SIGTERM");
    await vi.advanceTimersByTimeAsync(LATE_SHUTDOWN_EXIT_MS / 2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(state.closed).toBe(true);
    // Nothing is flushed to an owner that stopped waiting.
    expect(flush).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("flushes final messages to an owner that is still waiting on the stop", async () => {
  const release = await holdService("held-service");
  dispose();
  const { SupervisorIpcSender } = await import("@/supervisor/supervisorIpcSender");
  const flush = vi.spyOn(SupervisorIpcSender.prototype, "flushAndWait");
  release();
  await reply("dispose");
  await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
  expect(state.closed).toBe(true);
  expect(flush).toHaveBeenCalledOnce();
});

it("ends a stop that already committed once its remaining teardown is all that is left", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  state.diagnosticsStop = () => new Promise<void>(() => undefined);
  const release = await holdService("held-service");
  dispose();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    signal("SIGTERM");
    await vi.advanceTimersByTimeAsync(LATE_SHUTDOWN_EXIT_MS / 2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.closed).toBe(true);
    expect(process.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LATE_SHUTDOWN_EXIT_MS / 2);
  } finally {
    vi.useRealTimers();
  }
  expect(error).not.toHaveBeenCalled();
  expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
});
