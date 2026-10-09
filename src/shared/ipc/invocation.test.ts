import { describe, expect, it } from "vitest";
import { CLIENT_HOST_HOP_VERSION, PREVIOUS_CLIENT_HOST_HOP_VERSION } from "../clientHostHop";
import { IPC_PROCEDURE_MAP_VERSION, IpcProcedureMapVersionError } from "./procedureMap";
import { createClientProcedureInvocation, parseClientProcedureInvocation } from "./invocation";

/**
 * Hop-17 checked invocation envelope: the version is minted in the RENDERER
 * bundle by `createClientProcedureInvocation` (its own compiled constant —
 * never a parameter, never manufactured by preload for a legacy positional
 * call), forwarded unchanged through preload, and asserted by main before any
 * parse/dispatch (see `clientHostHop.ts` version 17).
 */
describe("client procedure invocation envelope", () => {
  it("stamps the bundle's own compiled hop constant, never a parameter", () => {
    const invocation = createClientProcedureInvocation("focusWindow", []);
    expect(IPC_PROCEDURE_MAP_VERSION).toBe(CLIENT_HOST_HOP_VERSION);
    // The settled hop-17 lane: the factory's compiled constant is 17. A bump
    // must revisit this lane's admission tests, not silently re-version them.
    expect(IPC_PROCEDURE_MAP_VERSION).toBe(17);
    expect(invocation).toEqual({
      ipcProcedureMapVersion: 17,
      name: "focusWindow",
      args: [],
    });
    expect(invocation.ipcProcedureMapVersion).toBe(IPC_PROCEDURE_MAP_VERSION);
  });

  it("passes the procedure name and args through verbatim", () => {
    const args = [{ path: "src/a.ts" }];
    const invocation = createClientProcedureInvocation("readLocalImageFile", args);
    expect(invocation.name).toBe("readLocalImageFile");
    expect(invocation.args).toBe(args);
  });

  it("admits a factory-produced envelope and returns the validated name and args", () => {
    const invocation = createClientProcedureInvocation("focusWindow", []);
    expect(parseClientProcedureInvocation(invocation)).toEqual({
      name: "focusWindow",
      args: [],
    });
  });

  it("rejects a missing declaration as a version-0 legacy peer, typed", () => {
    // Old-reader shape: a pre-envelope payload (`{name, args}`) declares no
    // version. The existing primitive counts that as version 0 and rejects
    // typed — it must never be dispatched with guessed semantics.
    const caught = catchParse({ name: "focusWindow", args: [] });
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(0);
  });

  it("rejects a bare non-envelope payload (old positional call) as version 0, typed", () => {
    // A legacy positional caller through the current preload forwards its
    // first argument unchanged — a bare procedure name string. It must fail
    // before any effect and never acquire the current version.
    const caught = catchParse("getSchedules");
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(0);
  });

  it("rejects the previous hop envelope typed", () => {
    const caught = catchParse({
      ipcProcedureMapVersion: PREVIOUS_CLIENT_HOST_HOP_VERSION,
      name: "focusWindow",
      args: [],
    });
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(
      PREVIOUS_CLIENT_HOST_HOP_VERSION,
    );
  });

  it("rejects a future envelope typed", () => {
    const caught = catchParse({
      ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION + 1,
      name: "focusWindow",
      args: [],
    });
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(IPC_PROCEDURE_MAP_VERSION + 1);
  });

  it("rejects a malformed declaration typed", () => {
    const caught = catchParse({
      ipcProcedureMapVersion: "17",
      name: "focusWindow",
      args: [],
    });
    expect(caught).toBeInstanceOf(IpcProcedureMapVersionError);
    expect((caught as IpcProcedureMapVersionError).peerVersion).toBe(0);
  });

  it("rejects an unknown name at the current version as a shape error, never a faked legacy version", () => {
    // A version-17 envelope with a bad name is a CURRENT-peer protocol error:
    // the existing shape rejection, not a coerced version-0 mismatch.
    const caught = catchParse({
      ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
      name: "noSuchProcedure",
      args: [],
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Invalid client procedure request.");
    expect(caught).not.toBeInstanceOf(IpcProcedureMapVersionError);
  });

  it("rejects non-array args at the current version as a shape error", () => {
    const caught = catchParse({
      ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
      name: "focusWindow",
      args: "not-an-array",
    });
    expect((caught as Error).message).toBe("Invalid client procedure request.");
    expect(caught).not.toBeInstanceOf(IpcProcedureMapVersionError);
  });
});

function catchParse(request: unknown): unknown {
  try {
    parseClientProcedureInvocation(request);
  } catch (error) {
    return error;
  }
  return undefined;
}
