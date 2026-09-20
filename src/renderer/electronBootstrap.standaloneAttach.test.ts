// Narrowly focused regression for the Electron bootstrap selection: absence
// of the OPTIONAL getter (older managed preload) or an explicit null
// (managed-local launch) selects managed; a present getter that
// throws/rejects or resolves to an invalid/undefined payload throws, so the
// caller refuses instead of installing the managed renderer.

import { describe, expect, it } from "vitest";
import { PORACODE_CLIENT_RUNTIME_VERSION, type ElectronHostBridge } from "@/shared/clientRuntime";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import { resolveElectronAttachBootstrap } from "./clientRuntime";

function managedHost(): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch: "x64",
    platform: "darwin",
    onSupervisorEvent: () => () => {},
    onSupervisorEventGap: () => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    invokeProcedure: async () => undefined,
  } as unknown as ElectronHostBridge;
}

function attachInfo(): StandaloneAttachInfo {
  return {
    profileNamespace: "/tmp/profile",
    dataRoot: "/tmp/profile.host-v1",
    endpoint: "http://127.0.0.1:49152/",
    ownerGeneration: "11111111-1111-4111-8111-111111111111",
    remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    pairingUrl: "http://127.0.0.1:49152/#token=fixture-pairing-credential",
  };
}

describe("electron attach bootstrap selection", () => {
  it("selects managed on older preloads without the optional getter", async () => {
    await expect(resolveElectronAttachBootstrap(managedHost())).resolves.toEqual({
      kind: "managed",
    });
  });

  it("selects managed on explicit null (managed-local launch)", async () => {
    const host = {
      ...managedHost(),
      getStandaloneAttachInfo: async () => null,
    } as unknown as ElectronHostBridge;
    await expect(resolveElectronAttachBootstrap(host)).resolves.toEqual({ kind: "managed" });
  });

  it("selects attached on a validated payload", async () => {
    const host = {
      ...managedHost(),
      getStandaloneAttachInfo: async () => attachInfo(),
    } as unknown as ElectronHostBridge;
    const selection = await resolveElectronAttachBootstrap(host);
    expect(selection.kind).toBe("attached");
    if (selection.kind !== "attached") throw new Error("Expected attached.");
    expect(selection.attach.ownerGeneration).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("refuses invalid/undefined payloads instead of selecting managed", async () => {
    const invalid = {
      ...managedHost(),
      getStandaloneAttachInfo: async () => ({ ...attachInfo(), endpoint: "not-a-url" }),
    } as unknown as ElectronHostBridge;
    await expect(resolveElectronAttachBootstrap(invalid)).rejects.toThrow(
      /Invalid standalone attach/,
    );
    const undefinedPayload = {
      ...managedHost(),
      getStandaloneAttachInfo: async () => undefined,
    } as unknown as ElectronHostBridge;
    await expect(resolveElectronAttachBootstrap(undefinedPayload)).rejects.toThrow(
      /Invalid standalone attach/,
    );
  });

  it("refuses getter failures instead of selecting managed", async () => {
    const rejecting = {
      ...managedHost(),
      getStandaloneAttachInfo: async () => {
        throw new Error("attach IPC failed");
      },
    } as unknown as ElectronHostBridge;
    await expect(resolveElectronAttachBootstrap(rejecting)).rejects.toThrow("attach IPC failed");
  });
});
