// Preload-boundary regression for the hop-17 invocation envelope.
//
// Exercises the ACTUAL method exposed by src/main/preload.ts through a
// captured contextBridge: the renderer-produced envelope crosses to
// `clientProcedureInvoke` UNCHANGED (same reference, never re-created, never
// re-versioned), and a legacy positional call forwards its bare first
// argument — preload never manufactures a generation for an old caller.
import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  let exposed: Record<string, unknown> = {};
  const invokeCalls: Array<{ channel: string; payload: unknown }> = [];
  return {
    exposed: () => exposed,
    invokeCalls,
    contextBridge: {
      exposeInMainWorld: vi.fn<(key: string, value: Record<string, unknown>) => void>(
        (key: string, value: Record<string, unknown>) => {
          if (key === "poracodeHost") exposed = value;
        },
      ),
    },
    ipcRenderer: {
      invoke: vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(
        (channel: string, payload?: unknown) => {
          invokeCalls.push({ channel, payload });
          return Promise.resolve(null);
        },
      ),
      on: vi.fn<() => void>(),
      removeListener: vi.fn<() => void>(),
    },
    webUtils: {
      getPathForFile: vi.fn<(file: { path?: string }) => string>(() => ""),
    },
  };
});
vi.mock("electron", () => ({
  contextBridge: electron.contextBridge,
  ipcRenderer: electron.ipcRenderer,
  webUtils: electron.webUtils,
}));
vi.mock("./testing/smokeNativeControls", () => ({
  installSmokeNativePreload: vi.fn<() => void>(),
}));

import { IPC_WINDOW_CHANNELS } from "@/shared/ipc/channels";
import { createClientProcedureInvocation } from "@/shared/ipc/invocation";

type ExposedInvoke = (invocation: unknown, ...rest: unknown[]) => Promise<unknown>;

async function exposedInvokeProcedure(): Promise<ExposedInvoke> {
  // The preload reads document.readyState at import; a complete stub keeps the
  // import side-effect free in the node test environment.
  (globalThis as { document?: unknown }).document ??= { readyState: "complete" };
  await import("./preload");
  const exposed = electron.exposed() as { invokeProcedure?: unknown };
  expect(exposed.invokeProcedure).toBeTypeOf("function");
  return exposed.invokeProcedure as ExposedInvoke;
}

describe("preload invokeProcedure envelope passthrough", () => {
  beforeEach(() => {
    vi.resetModules();
    electron.invokeCalls.length = 0;
  });

  it("forwards the renderer-produced envelope to the procedure channel unchanged", async () => {
    const invocation = createClientProcedureInvocation("getUpdateStatus", []);
    const invoke = await exposedInvokeProcedure();
    await invoke(invocation);
    expect(electron.invokeCalls).toEqual([
      { channel: IPC_WINDOW_CHANNELS.clientProcedureInvoke, payload: invocation },
    ]);
    // Identity, not a copy: preload adds no field and overwrites no field.
    const forwarded = electron.invokeCalls[0] as {
      payload: { ipcProcedureMapVersion?: unknown };
    };
    expect(forwarded.payload).toBe(invocation);
    expect(forwarded.payload.ipcProcedureMapVersion).toBe(17);
  });

  it("never manufactures a version for a legacy positional call", async () => {
    // An old renderer bundle calls the bridge positionally. The current
    // preload's single-parameter method must forward that bare first argument
    // unchanged — main's version gate then rejects it typed. Preload itself
    // must not wrap it into a versioned envelope.
    const invoke = await exposedInvokeProcedure();
    await invoke("getSchedules", []);
    expect(electron.invokeCalls).toEqual([
      { channel: IPC_WINDOW_CHANNELS.clientProcedureInvoke, payload: "getSchedules" },
    ]);
  });
});
