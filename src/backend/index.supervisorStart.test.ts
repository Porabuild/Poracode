import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostOutboundMessage,
  type BackendHostRequest,
} from "@/shared/backendHostProtocol";

/**
 * The desktop backend wires `SupervisorClientOptions.onStarted` (every spawn,
 * crash respawns included) to the durable project-watch re-apply, next to the
 * reset hook that marks it pending.
 */

const state = vi.hoisted(() => ({
  sent: [] as BackendHostOutboundMessage[],
  onStarted: undefined as (() => void) | undefined,
  onReset: undefined as (() => void) | undefined,
  services: [] as Array<{
    handleSupervisorStarted: ReturnType<typeof vi.fn<() => void>>;
    handleSupervisorReset: ReturnType<typeof vi.fn<() => void>>;
  }>,
}));

vi.mock("@/shared/diagnostics/nodePerformanceDiagnostics", () => ({
  startNodePerformanceDiagnostics: () => undefined,
}));
vi.mock("@/shared/secretStorage", () => ({ configureSecretStorageKey() {} }));
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
    supervisorClient = { call: async () => null };
    constructor(options: { supervisor: { onStarted?: () => void }; onReset: () => void }) {
      state.onStarted = options.supervisor.onStarted;
      state.onReset = options.onReset;
    }
    disposeSupervisor = async () => {};
    closeDatabase() {}
  },
}));
vi.mock("./BackendDesktopServices", () => ({
  BackendDesktopServices: class {
    call = async () => null;
    callSupervisor = async () => null;
    dispose = async () => {};
    handleSupervisorStarted = vi.fn<() => void>();
    handleSupervisorReset = vi.fn<() => void>();
    markLiveThreadsInactive = () => [];
    constructor() {
      state.services.push(this);
    }
    async prepareSupervisor() {}
  },
}));

const ownedEvents = ["message", "disconnect", "SIGINT", "SIGTERM"] as const;
let previousListeners: Map<string, Set<ReturnType<typeof process.listeners>[number]>>;
let sendDescriptor: PropertyDescriptor | undefined;
let connectedDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.resetModules();
  state.sent = [];
  state.onStarted = undefined;
  state.onReset = undefined;
  state.services = [];
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

it("wires every supervisor start to the desktop services re-apply", async () => {
  await import("./index");
  const onMessage = process
    .listeners("message")
    .find((listener) => !previousListeners.get("message")!.has(listener));
  if (!onMessage) throw new Error("Backend entrypoint did not install its message listener");
  const request: BackendHostRequest = {
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
  };
  onMessage(request, undefined);
  await vi.waitFor(() =>
    expect(
      state.sent.some((message) => message.kind === "reply" && message.replyTo === "initialize"),
    ).toBe(true),
  );
  const services = state.services.at(-1)!;
  expect(state.onStarted).toBeTypeOf("function");

  state.onReset?.();
  state.onStarted?.();

  expect(services.handleSupervisorReset).toHaveBeenCalledOnce();
  expect(services.handleSupervisorStarted).toHaveBeenCalledOnce();
});
