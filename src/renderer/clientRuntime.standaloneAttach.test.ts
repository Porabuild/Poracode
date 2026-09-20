// Focused regression for attached-Electron renderer selection: validated
// attach payloads boot the existing remote stack (no local backend fork), bad
// payloads fail closed, and managed/browser paths stay sound.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PORACODE_CLIENT_RUNTIME_VERSION, type ElectronHostBridge } from "@/shared/clientRuntime";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import {
  UNKNOWN_HOST_CAPABILITIES,
  hasAnyClientBridge,
  hasElectronHostBridge,
  installAttachedElectronClientRuntime,
  installBrowserClientRuntime,
  installElectronClientRuntime,
  isStandaloneAttachRuntime,
  parseStandaloneAttachInfo,
  readClientRuntime,
  readStandaloneAttachInfo,
  resetClientRuntimeForTest,
} from "./clientRuntime";

const attachSettingsSync = vi.hoisted(() => ({
  push: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("./browser/remoteBridge", () => ({
  getRemoteBridgeClient: () => ({ endpoint: "http://127.0.0.1:9/" }),
}));
vi.mock("./browser/remoteSettingsSync", () => ({
  pushDesktopSettingsDiff: attachSettingsSync.push,
}));

function electronHost(): ElectronHostBridge {
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
    // Helper (headless) host describe capabilities, as minted by main.
    capabilities: {
      ssh: true,
      browserPanel: false,
      chromeBridge: true,
      computerUse: true,
      nativeSecrets: false,
      portForward: true,
      autoUpdate: false,
      osNotifications: false,
    },
  };
}

describe("standalone attach client runtime", () => {
  beforeEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
  });

  it("accepts a validated attach payload", () => {
    expect(parseStandaloneAttachInfo(attachInfo())).toMatchObject({
      endpoint: "http://127.0.0.1:49152/",
      ownerGeneration: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("rejects mismatched versions and malformed payloads without installing", () => {
    expect(parseStandaloneAttachInfo({ ...attachInfo(), remoteProtocolVersion: 999 })).toBeNull();
    expect(parseStandaloneAttachInfo({ ...attachInfo(), endpoint: "not-a-url" })).toBeNull();
    expect(parseStandaloneAttachInfo({ ...attachInfo(), pairingUrl: "no-token-here" })).toBeNull();
    expect(parseStandaloneAttachInfo(null)).toBeNull();
    const versionMismatch: unknown = { ...attachInfo(), remoteProtocolVersion: 999 };
    expect(parseStandaloneAttachInfo(versionMismatch)).toBeNull();
    expect(() =>
      installAttachedElectronClientRuntime(electronHost(), versionMismatch as StandaloneAttachInfo),
    ).toThrow(/Invalid standalone attach/);
  });

  it("boots Electron on the remote stack without desktop-managed-host-only capabilities", () => {
    installAttachedElectronClientRuntime(electronHost(), attachInfo());
    expect(readClientRuntime()).toMatchObject({
      version: PORACODE_CLIENT_RUNTIME_VERSION,
      host: "electron",
      transport: "remote-http-websocket",
      capabilities: {
        localBackend: false,
        manageRemoteEnvironments: true,
        nativeAppUpdates: true,
        nativeShell: true,
        // Attach mode constructs neither the SSH manager nor browser
        // webContents, so advertising either would render surfaces that
        // throw when invoked (V5 plan H2 / batch 0.1).
        nativeBrowserWebContents: false,
        nativeSsh: false,
        osNotifications: false,
      },
    });
    // The attached flavor keeps the helper host's declared capabilities
    // verbatim for consumers (V5 plan 1.2), derived from the attach payload
    // rather than inferred from the host kind.
    expect(readClientRuntime().hostCapabilities).toEqual(attachInfo().capabilities);
    expect(readClientRuntime().hostCapabilities).toMatchObject({
      autoUpdate: false,
      osNotifications: false,
    });
    expect(isStandaloneAttachRuntime()).toBe(true);
  });

  it("fails the attached flavor closed when the payload predates capabilities", () => {
    const legacy = { ...attachInfo() };
    delete (legacy as { capabilities?: unknown }).capabilities;
    installAttachedElectronClientRuntime(electronHost(), legacy);
    expect(readClientRuntime().hostCapabilities).toEqual(UNKNOWN_HOST_CAPABILITIES);
    expect(readClientRuntime().capabilities).toMatchObject({
      nativeSsh: false,
      osNotifications: false,
      nativeBrowserWebContents: false,
    });
  });

  it("rejects attach payloads with malformed host capabilities", () => {
    const malformed = {
      ...attachInfo(),
      capabilities: { ...attachInfo().capabilities!, browserPanel: "yes" },
    };
    expect(parseStandaloneAttachInfo(malformed)).toBeNull();
    const expanded = {
      ...attachInfo(),
      capabilities: { ...attachInfo().capabilities!, extra: true },
    };
    expect(parseStandaloneAttachInfo(expanded)).toBeNull();
  });

  it("reads attach info from the host bridge and treats absence as managed", async () => {
    await expect(readStandaloneAttachInfo(electronHost())).resolves.toBeNull();
    const host = {
      ...electronHost(),
      getStandaloneAttachInfo: async () => attachInfo(),
    } as unknown as ElectronHostBridge;
    await expect(readStandaloneAttachInfo(host)).resolves.toMatchObject({
      ownerGeneration: "11111111-1111-4111-8111-111111111111",
    });
    const explicitNull = {
      ...electronHost(),
      getStandaloneAttachInfo: async () => null,
    } as unknown as ElectronHostBridge;
    await expect(readStandaloneAttachInfo(explicitNull)).resolves.toBeNull();
  });

  it("fails closed on invalid/undefined payloads and getter failures (never managed)", async () => {
    const invalid = {
      ...electronHost(),
      getStandaloneAttachInfo: async () => ({ ...attachInfo(), endpoint: "not-a-url" }),
    } as unknown as ElectronHostBridge;
    await expect(readStandaloneAttachInfo(invalid)).rejects.toThrow(/Invalid standalone attach/);
    const undefinedPayload = {
      ...electronHost(),
      getStandaloneAttachInfo: async () => undefined,
    } as unknown as ElectronHostBridge;
    await expect(readStandaloneAttachInfo(undefinedPayload)).rejects.toThrow(
      /Invalid standalone attach/,
    );
    const rejecting = {
      ...electronHost(),
      getStandaloneAttachInfo: async () => {
        throw new Error("no handler");
      },
    } as unknown as ElectronHostBridge;
    await expect(readStandaloneAttachInfo(rejecting)).rejects.toThrow("no handler");
  });

  it("keeps managed and browser selection sound", () => {
    installElectronClientRuntime(electronHost());
    expect(readClientRuntime()).toMatchObject({
      host: "electron",
      transport: "electron-backend-host",
      capabilities: { localBackend: true },
    });
    expect(isStandaloneAttachRuntime()).toBe(false);

    resetClientRuntimeForTest();
    installBrowserClientRuntime({ arch: "web" } as never);
    expect(readClientRuntime()).toMatchObject({
      host: "browser",
      transport: "remote-http-websocket",
      capabilities: { localBackend: false, nativeShell: false },
    });
    expect(isStandaloneAttachRuntime()).toBe(false);
  });

  it("routes attached setSharedSettings to the owner push, never the host", async () => {
    const invokeProcedure = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined);
    const host = { ...electronHost(), invokeProcedure } as unknown as ElectronHostBridge;
    installAttachedElectronClientRuntime(host, attachInfo());
    attachSettingsSync.push.mockClear();
    await readClientRuntime().procedures.setSharedSettings({ themeMode: "dark" } as never);
    expect(invokeProcedure).not.toHaveBeenCalled();
    expect(attachSettingsSync.push).toHaveBeenCalledOnce();
    expect(attachSettingsSync.push.mock.calls[0]?.[1]).toMatchObject({ themeMode: "dark" });
  });

  it("keeps the Electron shell surface facts true under attach through the runtime accessors (V5 2.4)", () => {
    // Attached Electron still runs the preload shell, so client-SURFACE facts
    // (native window, sidebar desktop-preference semantics, window chrome)
    // resolve identically to managed — while host SERVICE availability stays
    // capability-derived (nativeSsh/nativeBrowserWebContents false above).
    window.poracodeHost = electronHost();
    installAttachedElectronClientRuntime(electronHost(), attachInfo());
    expect(hasElectronHostBridge()).toBe(true);
    expect(hasAnyClientBridge()).toBe(true);
    expect(isStandaloneAttachRuntime()).toBe(true);
    expect(readClientRuntime()).toMatchObject({
      host: "electron",
      transport: "remote-http-websocket",
    });
  });
});
