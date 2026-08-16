import { beforeEach, describe, expect, it } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { PORACODE_CLIENT_RUNTIME_VERSION, type ElectronHostBridge } from "@/shared/clientRuntime";
import {
  hasClientCapability,
  isBrowserClientRuntime,
  installBrowserClientRuntime,
  installElectronClientRuntime,
  readClientRuntime,
  resetClientRuntimeForTest,
} from "./clientRuntime";
import { isCompactClientSurface, isRemoteSession, readBridge } from "./bridge";

function bridge(arch: string): PoracodeBridge {
  return { arch } as unknown as PoracodeBridge;
}

function electronHost(arch: string): ElectronHostBridge {
  return {
    arch,
    platform: "win32",
    onSupervisorEvent: () => () => {},
    onBackendRendererStreamChanged: () => () => {},
    getBackendRendererStreamInfo: async () => null,
    invokeProcedure: async () => undefined,
  } as unknown as ElectronHostBridge;
}

describe("client runtime", () => {
  beforeEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
  });

  it("describes the Electron desktop host and its native capabilities", () => {
    const host = electronHost("x64");
    installElectronClientRuntime(host);

    expect(readClientRuntime()).toMatchObject({
      version: PORACODE_CLIENT_RUNTIME_VERSION,
      host: "electron",
      surface: "adaptive",
      transport: "electron-backend-host",
      capabilities: {
        localBackend: true,
        manageRemoteEnvironments: true,
        nativeAppUpdates: true,
        nativeBrowserWebContents: true,
        nativeShell: true,
        nativeSsh: true,
      },
      native: { arch: "x64" },
    });
    expect(hasClientCapability("localBackend")).toBe(true);
    expect(isBrowserClientRuntime()).toBe(false);
    expect(isRemoteSession()).toBe(false);
    expect(isCompactClientSurface()).toBe(false);
  });

  it("publishes enumerable procedure and native keys through the composed bridge", () => {
    const host = electronHost("x64");
    window.poracodeHost = host;
    installElectronClientRuntime(host);

    expect(Object.keys(readBridge())).toEqual(
      expect.arrayContaining(["startThread", "ghListWorkflows", "platform", "arch"]),
    );
    expect("resolveThreadServerRequest" in readBridge()).toBe(true);
  });

  it("describes the canonical browser desktop without native shell ownership", () => {
    const browserBridge = bridge("web");
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);

    expect(readClientRuntime()).toMatchObject({
      version: PORACODE_CLIENT_RUNTIME_VERSION,
      host: "browser",
      surface: "adaptive",
      transport: "remote-http-websocket",
      capabilities: {
        localBackend: false,
        manageRemoteEnvironments: true,
        nativeAppUpdates: false,
        nativeBrowserWebContents: false,
        nativeShell: false,
        nativeSsh: false,
      },
    });
    expect(isRemoteSession()).toBe(true);
    expect(isBrowserClientRuntime()).toBe(true);
    expect(isCompactClientSurface()).toBe(false);
  });

  it("treats an uninstalled runtime as non-browser during isolated rendering", () => {
    expect(isBrowserClientRuntime()).toBe(false);
  });

  it("uses one adaptive surface for every browser viewport", () => {
    const browserBridge = bridge("web");
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);

    expect(readClientRuntime()).toMatchObject({
      host: "browser",
      surface: "adaptive",
      capabilities: { manageRemoteEnvironments: true },
    });
    expect(isRemoteSession()).toBe(true);
    expect(isCompactClientSurface()).toBe(false);
  });
});
