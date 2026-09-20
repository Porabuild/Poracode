import { beforeEach, describe, expect, it } from "vitest";
import { IpcProcedureMapVersionError, type PoracodeBridge } from "@/shared/ipc";
import { PORACODE_CLIENT_RUNTIME_VERSION, type ElectronHostBridge } from "@/shared/clientRuntime";
import {
  DESKTOP_MANAGED_HOST_CAPABILITIES,
  desktopManagedHostCapabilities,
  UNKNOWN_HOST_CAPABILITIES,
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

function electronHost(arch: string): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch,
    platform: "win32",
    onSupervisorEvent: () => () => {},
    onSupervisorEventGap: () => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: 1,
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

describe("host-declared capabilities (V5 plan 1.2)", () => {
  beforeEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
  });

  it("builds desktop-managed computerUse from the host platform without Node process", () => {
    expect(desktopManagedHostCapabilities("darwin").computerUse).toBe(true);
    expect(desktopManagedHostCapabilities("win32").computerUse).toBe(true);
    expect(desktopManagedHostCapabilities("linux").computerUse).toBe(false);
    expect(desktopManagedHostCapabilities().computerUse).toBe(
      process.platform === "win32" || process.platform === "darwin",
    );
  });

  it("keeps the desktop-managed flavor on local host knowledge", () => {
    installElectronClientRuntime(electronHost("x64"));
    const runtime = readClientRuntime();
    expect(runtime.hostCapabilities).toEqual(desktopManagedHostCapabilities("win32"));
    expect(runtime.capabilities).toEqual({
      localBackend: true,
      manageRemoteEnvironments: true,
      nativeAppUpdates: true,
      nativeShell: true,
      nativeSsh: DESKTOP_MANAGED_HOST_CAPABILITIES.ssh,
      nativeBrowserWebContents: DESKTOP_MANAGED_HOST_CAPABILITIES.browserPanel,
    });
  });

  it("derives the desktop-managed flavor from declared host capabilities, not the host field", () => {
    // A desktop-managed client whose host somehow stops composing a service
    // loses the client capability with it — the conjunction, never an
    // inference from `host === "electron"`.
    expect(
      deriveClientCapabilities({
        host: { ...DESKTOP_MANAGED_HOST_CAPABILITIES, ssh: false },
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
      nativeBrowserWebContents: false,
    });
  });

  it("fails the browser flavor closed to unknown host capabilities", () => {
    installBrowserClientRuntime(bridge("web"));
    const runtime = readClientRuntime();
    expect(runtime.hostCapabilities).toEqual(UNKNOWN_HOST_CAPABILITIES);
    expect(runtime.capabilities).toMatchObject({
      localBackend: false,
      nativeShell: false,
      nativeSsh: false,
      nativeBrowserWebContents: false,
    });
    expect(hasClientCapability("nativeSsh")).toBe(false);
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
