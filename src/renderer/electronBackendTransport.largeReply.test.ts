import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import { resetClientRuntimeForTest, installElectronClientRuntime } from "./clientRuntime";
import { readBridge } from "./bridge";

/**
 * V6 B.6: the 32 MiB byte-exact proof lives on the loopback HTTP leg
 * (`desktopLoopbackUnification.test.ts`). This file pins that the IPC
 * path is no longer a data plane for remote-routable file reads.
 */

beforeEach(() => {
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  Reflect.deleteProperty(window, "poracodeHost");
});

afterEach(() => {
  resetClientRuntimeForTest();
  vi.restoreAllMocks();
});

function install(invoke: (name: string, args: unknown[]) => Promise<unknown>) {
  const host = {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch: "x64",
    platform: "darwin",
    onSupervisorEvent: () => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    invokeProcedure: (name: string, args: unknown[]) => invoke(name, args),
  } as unknown as ElectronHostBridge;
  window.poracodeHost = host;
  installElectronClientRuntime(host);
  return readBridge();
}

describe("IPC is not a file-reply data plane", () => {
  it("refuses readProjectFile over preload IPC when loopback is down", async () => {
    let invoked = false;
    const bridge = install(async () => {
      invoked = true;
      return { path: "/x", status: "ready", modifiedAtMs: 1, content: "nope" };
    });
    await expect(
      bridge.readProjectFile({
        projectLocation: { kind: "posix", path: "/fixture" },
        path: "/fixture/large.txt",
      }),
    ).rejects.toThrow(/IPC data plane removed/);
    expect(invoked).toBe(false);
  });
});
