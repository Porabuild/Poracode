// Focused regression for the attached-Electron owner settings sync gate:
// attached Electron (remote-http-websocket transport) joins the same owner
// pull/push sync as the browser PWA; managed Electron (electron-backend-host)
// owns its settings locally and must stay out of it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PORACODE_CLIENT_RUNTIME_VERSION, type ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import {
  installAttachedElectronClientRuntime,
  installBrowserClientRuntime,
  installElectronClientRuntime,
  resetClientRuntimeForTest,
} from "@/renderer/clientRuntime";

const setClient = vi.fn<(...args: unknown[]) => void>();
const resetSettings = vi.fn<(...args: unknown[]) => void>();
vi.mock("@/renderer/browser/remoteBridge", () => ({
  setRemoteBridgeClient: (...args: unknown[]) => setClient(...args),
}));
vi.mock("@/renderer/browser/remoteSettingsSync", () => ({
  applyDesktopSettings: vi.fn<(...args: unknown[]) => void>(),
  resetDesktopSettings: (...args: unknown[]) => resetSettings(...args),
  pushDesktopSettingsDiff: vi.fn<(...args: unknown[]) => void>(),
}));

import { __resetRemoteServersStoreForTest, selectBrowserBridgeDesktop } from "./remoteServersStore";

function electronHost(): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch: "x64",
    platform: "darwin",
    onSupervisorEvent: () => () => {},
    onSupervisorEventGap: () => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: 1,
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

describe("attached owner settings sync gate", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetRemoteServersStoreForTest();
    resetClientRuntimeForTest();
    setClient.mockClear();
    resetSettings.mockClear();
    (window as unknown as Record<string, unknown>).poracodeHost = {};
  });

  it("keeps managed Electron out of the owner sync", () => {
    installElectronClientRuntime(electronHost());
    selectBrowserBridgeDesktop("desktop-1");
    expect(setClient).not.toHaveBeenCalled();
    expect(resetSettings).not.toHaveBeenCalled();
  });

  it("lets attached Electron join the owner sync like the browser PWA", () => {
    installAttachedElectronClientRuntime(electronHost(), attachInfo());
    selectBrowserBridgeDesktop("desktop-1");
    expect(setClient).toHaveBeenCalledWith(null);
    expect(resetSettings).toHaveBeenCalled();
  });

  it("keeps the browser PWA in the owner sync", () => {
    installBrowserClientRuntime({ arch: "web" } as never);
    selectBrowserBridgeDesktop("desktop-1");
    expect(setClient).toHaveBeenCalledWith(null);
    expect(resetSettings).toHaveBeenCalled();
  });
});
