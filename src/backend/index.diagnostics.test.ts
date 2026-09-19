import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BACKEND_HOST_PROTOCOL_VERSION,
  type BackendHostOutboundMessage,
} from "@/shared/backendHostProtocol";

/**
 * Gate 4 Batch 1 G1: the opt-in read-only diagnostics describe handle in the
 * backend entry. Both surfaces (globalThis.__poracodeBackendDiagnostics for
 * CDP evaluation and the dev IPC describe message) must be INERT unless
 * PORACODE_BACKEND_DIAGNOSTICS=1, and the payload must stay counters and
 * process identity only. (The renderer-stream counters this handle originally
 * exposed left with the deleted stream leg, V5 plan 2.5.)
 */

const state = vi.hoisted(() => ({
  sent: [] as BackendHostOutboundMessage[],
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
    supervisorClient = { call: async () => null };
    disposeSupervisor = async () => {};
    closeDatabase() {}
  },
}));
vi.mock("./BackendDesktopServices", () => ({
  BackendDesktopServices: class {
    call = async () => null;
    dispose = async () => {};
    async prepareSupervisor() {}
  },
}));

const ownedEvents = ["message", "disconnect", "SIGINT", "SIGTERM"] as const;
let previousListeners: Map<string, Set<ReturnType<typeof process.listeners>[number]>>;
let sendDescriptor: PropertyDescriptor | undefined;
let connectedDescriptor: PropertyDescriptor | undefined;
let deliver: (message: unknown) => void;

beforeEach(async () => {
  vi.resetModules();
  state.sent = [];
  delete (globalThis as Record<string, unknown>).__poracodeBackendDiagnostics;
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
  delete (globalThis as Record<string, unknown>).__poracodeBackendDiagnostics;
  delete process.env.PORACODE_BACKEND_DIAGNOSTICS;
  vi.restoreAllMocks();
});

async function importBackend(): Promise<void> {
  await import("./index");
  const onMessage = process
    .listeners("message")
    .find((listener) => !previousListeners.get("message")!.has(listener));
  if (!onMessage) throw new Error("Backend entrypoint did not install its message listener");
  deliver = (message) => {
    onMessage(message as Parameters<typeof onMessage>[0], undefined);
  };
}

async function reply(id: string): Promise<unknown> {
  await vi.waitFor(() =>
    expect(state.sent.some((message) => message.kind === "reply" && message.replyTo === id)).toBe(
      true,
    ),
  );
  const replyMessage = state.sent.find(
    (message) => message.kind === "reply" && message.replyTo === id,
  ) as { ok: boolean; data?: unknown; error?: string };
  expect(replyMessage.ok).toBe(true);
  return replyMessage.data;
}

it("is fully inert without PORACODE_BACKEND_DIAGNOSTICS", async () => {
  delete process.env.PORACODE_BACKEND_DIAGNOSTICS;
  await importBackend();
  expect((globalThis as Record<string, unknown>).__poracodeBackendDiagnostics).toBeUndefined();

  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "describe-off",
    kind: "backend-diagnostics-describe",
  });
  await vi.waitFor(() => expect(state.sent.some((message) => message.kind === "error")).toBe(true));
  // The dev describe message is rejected by the strict protocol gate like any
  // other unknown message: an error line, never a diagnostics reply.
  expect(
    state.sent.some((message) => message.kind === "reply" && message.replyTo === "describe-off"),
  ).toBe(false);
});

it("exposes the read-only describe handle when PORACODE_BACKEND_DIAGNOSTICS=1", async () => {
  process.env.PORACODE_BACKEND_DIAGNOSTICS = "1";
  await importBackend();
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
  await reply("initialize");

  // IPC surface.
  deliver({
    version: BACKEND_HOST_PROTOCOL_VERSION,
    id: "describe-ipc",
    kind: "backend-diagnostics-describe",
  });
  const data = (await reply("describe-ipc")) as { role: string; rendererStream?: unknown };
  expect(data.role).toBe("backend");
  // The deleted stream's diagnostics key is gone with it.
  expect(data).not.toHaveProperty("rendererStream");

  // CDP surface: plain counters only, no auth material in the payload.
  const handle = (
    globalThis as {
      __poracodeBackendDiagnostics?: { describe(): Record<string, unknown> };
    }
  ).__poracodeBackendDiagnostics;
  expect(handle).toBeDefined();
  const described = handle!.describe();
  expect(described.role).toBe("backend");
  expect(described).not.toHaveProperty("rendererStream");
  expect(JSON.stringify(described)).not.toContain("ws://");
});
