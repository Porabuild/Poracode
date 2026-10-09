// Focused regression for the managed `clientProcedureInvoke` ingress at hop
// 17: the renderer-supplied envelope's declared version is asserted BEFORE any
// payload parse or dispatch (missing/previous/future/malformed all reject
// typed with zero handler and supervisor effects), shape/name/args validation
// keeps the existing patterns, a valid current-version envelope dispatches
// exactly once, and the obsolete unversioned per-procedure channels are no
// longer registered at all.
import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn<
        (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void
      >((channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, listener);
      }),
    },
  };
});
vi.mock("electron", () => ({ ipcMain: electron.ipcMain }));

import { PREVIOUS_CLIENT_HOST_HOP_VERSION } from "@/shared/clientHostHop";
import { IPC_WINDOW_CHANNELS } from "@/shared/ipc";
import type { MainLocalIpcHandlerMap } from "@/shared/ipc";
import { IpcProcedureMapVersionError } from "@/shared/ipc/procedureMap";
import { createClientProcedureInvocation } from "@/shared/ipc/invocation";
import { registerIpcHandlers } from "./registerHandlers";

const getUpdateStatus = vi.fn<() => unknown>(() => null);
const dbGetProjectNotes = vi.fn<() => unknown>(() => null);
const callSupervisor = vi.fn<() => Promise<unknown>>(async () => null);

function registerHandlers(): void {
  registerIpcHandlers({
    localHandlers: {
      getUpdateStatus,
      dbGetProjectNotes,
    } as unknown as MainLocalIpcHandlerMap,
    callSupervisor: callSupervisor as unknown as Parameters<
      typeof registerIpcHandlers
    >[0]["callSupervisor"],
  });
}

/** Dispatches one payload through the actually-registered channel handler. */
function invokeIngress(payload: unknown, sender: unknown = { id: 1 }): Promise<unknown> {
  const handler = electron.handlers.get(IPC_WINDOW_CHANNELS.clientProcedureInvoke);
  expect(handler).toBeTypeOf("function");
  return (async () => handler?.({ sender }, payload))() as Promise<unknown>;
}

/** Catches one ingress rejection for typed-error assertions. */
async function catchIngress(payload: unknown): Promise<unknown> {
  try {
    await invokeIngress(payload);
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectZeroEffects(): void {
  expect(getUpdateStatus).not.toHaveBeenCalled();
  expect(dbGetProjectNotes).not.toHaveBeenCalled();
  expect(callSupervisor).not.toHaveBeenCalled();
}

describe("managed clientProcedureInvoke ingress (hop 17 envelope)", () => {
  beforeEach(() => {
    electron.handlers.clear();
    getUpdateStatus.mockClear();
    dbGetProjectNotes.mockClear();
    callSupervisor.mockClear();
    registerHandlers();
  });

  it("registers the single versioned ingress and no per-procedure channels", () => {
    // The unversioned `poracode:<procedure>` per-procedure channels were an
    // obsolete ingress that bypassed the envelope version fence; with no
    // current caller left they are no longer registered, so a channel-dialed
    // alias fails loudly instead of mutating without admission.
    expect([...electron.handlers.keys()]).toEqual([IPC_WINDOW_CHANNELS.clientProcedureInvoke]);
  });

  it("dispatches a valid current-version main-local envelope exactly once", async () => {
    await expect(
      invokeIngress(createClientProcedureInvocation("getUpdateStatus", [])),
    ).resolves.toBeNull();
    // Main-local handlers receive the parsed payload plus the invoking sender.
    expect(getUpdateStatus).toHaveBeenCalledExactlyOnceWith({}, { id: 1 });
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("dispatches a valid current-version supervisor envelope exactly once", async () => {
    await expect(
      invokeIngress(createClientProcedureInvocation("listWslDistros", [])),
    ).resolves.toBeNull();
    expect(callSupervisor).toHaveBeenCalledExactlyOnceWith("listWslDistros", {});
    expect(getUpdateStatus).not.toHaveBeenCalled();
  });

  it("rejects a missing version declaration typed with zero effects", async () => {
    // Old-reader envelope: `{name, args}` with no declared version.
    const caught = await catchIngress({ name: "getUpdateStatus", args: [] });
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(0);
    expectZeroEffects();
  });

  it("rejects the previous hop envelope typed with zero effects", async () => {
    const caught = await catchIngress({
      ipcProcedureMapVersion: PREVIOUS_CLIENT_HOST_HOP_VERSION,
      name: "getUpdateStatus",
      args: [],
    });
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(
      PREVIOUS_CLIENT_HOST_HOP_VERSION,
    );
    expectZeroEffects();
  });

  it("rejects a future envelope typed with zero effects", async () => {
    const caught = await catchIngress({
      ipcProcedureMapVersion: 18,
      name: "getUpdateStatus",
      args: [],
    });
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(18);
    expectZeroEffects();
  });

  it("rejects a malformed version declaration typed with zero effects", async () => {
    const caught = await catchIngress({
      ipcProcedureMapVersion: "17",
      name: "getUpdateStatus",
      args: [],
    });
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(0);
    expectZeroEffects();
  });

  it("rejects an old positional caller (bare name payload) typed with zero effects", async () => {
    // What a legacy positional `invokeProcedure(name, args)` call forwards
    // through the current preload: the bare name string, unchanged. It must
    // fail before effects and never acquire the current version.
    const caught = await catchIngress("getUpdateStatus");
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(0);
    expectZeroEffects();
  });

  it("rejects an unknown name at the current version as a shape error with zero effects", async () => {
    const caught = await catchIngress({
      ipcProcedureMapVersion: 17,
      name: "noSuchProcedure",
      args: [],
    });
    expect((caught as Error).message).toBe("Invalid client procedure request.");
    expect(caught).not.toBeInstanceOf(IpcProcedureMapVersionError);
    expectZeroEffects();
  });

  it("rejects non-array args at the current version as a shape error with zero effects", async () => {
    await expect(
      invokeIngress({ ipcProcedureMapVersion: 17, name: "getUpdateStatus", args: "nope" }),
    ).rejects.toThrow("Invalid client procedure request.");
    expectZeroEffects();
  });

  it("rejects schema-invalid args at the current version with zero effects", async () => {
    // Past version and shape admission, the payload schema still refuses: the
    // rejection is the parse error, not a version or shape mismatch.
    const caught = await catchIngress(createClientProcedureInvocation("dbGetProjectNotes", [42]));
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as Error).message).not.toBe("Invalid client procedure request.");
    expect(dbGetProjectNotes).not.toHaveBeenCalled();
    expect(callSupervisor).not.toHaveBeenCalled();
  });

  it("keeps sender identity available to main-local handlers", async () => {
    const sender = { id: 7 };
    await invokeIngress(createClientProcedureInvocation("getUpdateStatus", []), sender);
    expect(getUpdateStatus).toHaveBeenCalledExactlyOnceWith({}, sender);
  });
});
