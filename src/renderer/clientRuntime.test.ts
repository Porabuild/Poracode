import { beforeEach, describe, expect, it } from "vitest";
import {
  IpcProcedureMapVersionError,
  IPC_PROCEDURE_MAP_VERSION,
  type PoracodeBridge,
} from "@/shared/ipc";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import { PORACODE_CLIENT_RUNTIME_VERSION, type ElectronHostBridge } from "@/shared/clientRuntime";
import {
  UNKNOWN_HOST_CAPABILITIES,
  applyNegotiatedHostCapabilities,
  deriveClientCapabilities,
  hasAnyClientBridge,
  hasClientCapability,
  hasElectronHostBridge,
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

const DESKTOP_HOST_CAPABILITIES = hostServiceCapabilities({
  ssh: true,
  browserPanel: true,
  chromeBridge: true,
  computerUse: true,
  nativeSecrets: true,
  portForward: true,
  autoUpdate: true,
  osNotifications: true,
});

function electronHost(arch: string): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch,
    platform: "win32",
    hostCapabilities: DESKTOP_HOST_CAPABILITIES,
    onSupervisorEvent: () => () => {},
    onSupervisorEventGap: () => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    invokeProcedure: async () => undefined,
  } as unknown as ElectronHostBridge;
}

describe("client runtime", () => {
  beforeEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
  });

  it.each([undefined, 6, 7, 8, 9, 10, 11, 12, 13])(
    "refuses an old preload host version %s before creating its transport",
    (version) => {
      const host = {
        ...electronHost("x64"),
        clientRuntimeVersion: version,
      } as unknown as ElectronHostBridge;
      expect(() => installElectronClientRuntime(host)).toThrow(
        /Unsupported client runtime version/,
      );
      expect(() => readClientRuntime()).toThrow(/not installed/);
    },
  );

  it("rejects a preload that cannot declare the procedure-map version, typed (V5 2.6)", () => {
    const host = {
      ...electronHost("x64"),
      // Absent/malformed declarations count as legacy version 0 and reject
      // typed — never guessed semantics.
      ipcProcedureMapVersion: undefined,
    } as unknown as ElectronHostBridge;
    expect(() => installElectronClientRuntime(host)).toThrow(IpcProcedureMapVersionError);
    expect(() => readClientRuntime()).toThrow(/not installed/);
  });

  it("rejects a foreign procedure-map version, typed (V5 2.6)", () => {
    const host = {
      ...electronHost("x64"),
      ipcProcedureMapVersion: 99,
    } as unknown as ElectronHostBridge;
    expect(() => installElectronClientRuntime(host)).toThrow(/IPC procedure map version mismatch/);
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
        osNotifications: true,
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
        osNotifications: false,
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

describe("host-declared capabilities (V6 C.2)", () => {
  beforeEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
  });

  it("uses preload hostCapabilities instead of a renderer-side host mirror", () => {
    installElectronClientRuntime(electronHost("x64"));
    const runtime = readClientRuntime();
    expect(runtime.hostCapabilities).toEqual(DESKTOP_HOST_CAPABILITIES);
    expect(runtime.capabilities).toEqual({
      localBackend: true,
      manageRemoteEnvironments: true,
      nativeAppUpdates: true,
      nativeShell: true,
      nativeSsh: true,
      osNotifications: true,
      nativeBrowserWebContents: true,
    });
  });

  it("fails closed when the preload omits hostCapabilities", () => {
    const host = {
      ...electronHost("x64"),
      hostCapabilities: undefined,
    } as unknown as ElectronHostBridge;
    installElectronClientRuntime(host);
    expect(readClientRuntime().hostCapabilities).toEqual(UNKNOWN_HOST_CAPABILITIES);
    expect(hasClientCapability("nativeSsh")).toBe(false);
  });

  it("derives the desktop-managed flavor from declared host capabilities, not the host field", () => {
    expect(
      deriveClientCapabilities({
        host: { ...DESKTOP_HOST_CAPABILITIES, ssh: false },
        nativeShell: true,
        localBackend: true,
        nativeAppUpdates: true,
      }),
    ).toMatchObject({ nativeSsh: false, nativeBrowserWebContents: true });
  });

  it("keeps the helper-host flavor host-declared with no native-only surfaces", () => {
    // A helper (headless) host declares exactly what it composes; a client
    // without the local backend authority never gains SSH/browser surfaces
    // from it, whatever the host offers remotely.
    const helperHost = {
      ssh: true,
      browserPanel: false,
      chromeBridge: true,
      computerUse: true,
      nativeSecrets: false,
      portForward: true,
      autoUpdate: false,
      osNotifications: false,
    };
    expect(
      deriveClientCapabilities({
        host: helperHost,
        nativeShell: true,
        localBackend: false,
        nativeAppUpdates: true,
      }),
    ).toEqual({
      localBackend: false,
      manageRemoteEnvironments: true,
      nativeAppUpdates: true,
      nativeShell: true,
      nativeSsh: false,
      osNotifications: false,
      nativeBrowserWebContents: false,
    });
  });

  it("fails the browser flavor closed to unknown host capabilities until describe", () => {
    installBrowserClientRuntime(bridge("web"));
    const runtime = readClientRuntime();
    expect(runtime.hostCapabilities).toEqual(UNKNOWN_HOST_CAPABILITIES);
    expect(runtime.capabilities).toMatchObject({
      localBackend: false,
      nativeShell: false,
      nativeSsh: false,
      osNotifications: false,
      nativeBrowserWebContents: false,
    });
    expect(hasClientCapability("nativeSsh")).toBe(false);
    applyNegotiatedHostCapabilities(DESKTOP_HOST_CAPABILITIES);
    expect(readClientRuntime().hostCapabilities).toEqual(DESKTOP_HOST_CAPABILITIES);
    expect(hasClientCapability("nativeSsh")).toBe(false);
    expect(hasClientCapability("nativeBrowserWebContents")).toBe(false);
  });

  it("keeps managed capabilities when a secondary host negotiates fewer services", () => {
    installElectronClientRuntime(electronHost("x64"));
    applyNegotiatedHostCapabilities(UNKNOWN_HOST_CAPABILITIES);
    expect(readClientRuntime().hostCapabilities).toEqual(DESKTOP_HOST_CAPABILITIES);
    expect(hasClientCapability("nativeSsh")).toBe(true);
    expect(hasClientCapability("nativeBrowserWebContents")).toBe(true);
    expect(hasClientCapability("osNotifications")).toBe(true);
  });

  it("reads autoUpdate and osNotifications from each flavor's describe (V6 C.3)", () => {
    installElectronClientRuntime(electronHost("x64"));
    expect(readClientRuntime().hostCapabilities).toMatchObject({
      autoUpdate: true,
      osNotifications: true,
    });
    expect(hasClientCapability("osNotifications")).toBe(true);
    resetClientRuntimeForTest();
    installBrowserClientRuntime(bridge("web"));
    expect(readClientRuntime().hostCapabilities).toMatchObject({
      autoUpdate: false,
      osNotifications: false,
    });
    expect(hasClientCapability("osNotifications")).toBe(false);
    applyNegotiatedHostCapabilities({
      ...UNKNOWN_HOST_CAPABILITIES,
      autoUpdate: true,
      osNotifications: true,
    });
    expect(readClientRuntime().hostCapabilities).toMatchObject({
      autoUpdate: true,
      osNotifications: true,
    });
  });
});

describe("preload-global gateways (V5 plan 2.4 / T5)", () => {
  beforeEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
  });

  it("reports no bridge on a preload-less surface without installing a runtime", () => {
    expect(hasElectronHostBridge()).toBe(false);
    expect(hasAnyClientBridge()).toBe(false);
  });

  it("reads the Electron shell fact from the preload bridge, runtime installed or not", () => {
    window.poracodeHost = { clientRuntimeVersion: 1 } as unknown as ElectronHostBridge;
    expect(hasElectronHostBridge()).toBe(true);
    expect(hasAnyClientBridge()).toBe(true);
  });

  it("reads a browser-only bridge through hasAnyClientBridge without an Electron shell", () => {
    window.poracode = bridge("web");
    expect(hasElectronHostBridge()).toBe(false);
    expect(hasAnyClientBridge()).toBe(true);
  });
});
