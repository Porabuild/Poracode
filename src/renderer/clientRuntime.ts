import {
  PORACODE_CLIENT_RUNTIME_VERSION,
  type ClientCapabilities,
  type ClientRuntime,
  type ElectronHostBridge,
  type PoracodeNativeBridge,
} from "@/shared/clientRuntime";
import { createProcedureBridge, parseIpcProcedureArgs, type PoracodeBridge } from "@/shared/ipc";
import { ElectronBackendTransport } from "./electronBackendTransport";
import { isCompactLayoutViewport } from "./adaptiveLayout";

let installedRuntime: ClientRuntime | null = null;

const ELECTRON_CAPABILITIES: ClientCapabilities = {
  localBackend: true,
  manageRemoteEnvironments: true,
  nativeAppUpdates: true,
  nativeBrowserWebContents: true,
  nativeShell: true,
  nativeSsh: true,
};

const BROWSER_CAPABILITIES: ClientCapabilities = {
  localBackend: false,
  manageRemoteEnvironments: true,
  nativeAppUpdates: false,
  nativeBrowserWebContents: false,
  nativeShell: false,
  nativeSsh: false,
};

function browserCapabilities(): ClientCapabilities {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return capacitor?.isNativePlatform?.() === true
    ? { ...BROWSER_CAPABILITIES, nativeSsh: true }
    : BROWSER_CAPABILITIES;
}

export function installClientRuntime(runtime: ClientRuntime): void {
  if (runtime.version !== PORACODE_CLIENT_RUNTIME_VERSION) {
    throw new Error(`Unsupported client runtime version: ${String(runtime.version)}`);
  }
  installedRuntime = runtime;
}

export function installElectronClientRuntime(host: ElectronHostBridge): void {
  const transport = new ElectronBackendTransport(host);
  const procedures = createProcedureBridge((name, args) => {
    if (name === "setRendererEventInterests") {
      return transport.setEventInterests(parseIpcProcedureArgs(name, args));
    }
    const operation = transport.operationFor(name);
    if (!operation) return host.invokeProcedure(name, args);
    return transport.call(operation, name, parseIpcProcedureArgs(name, args), args);
  });
  const native: PoracodeNativeBridge = {
    ...host,
    onSupervisorEvent: (listener) => transport.subscribe(listener),
  };
  installClientRuntime({
    version: PORACODE_CLIENT_RUNTIME_VERSION,
    host: "electron",
    surface: "adaptive",
    transport: "electron-backend-host",
    capabilities: ELECTRON_CAPABILITIES,
    procedures,
    native,
  });
}

export function installBrowserClientRuntime(bridge: PoracodeBridge): void {
  installClientRuntime({
    version: PORACODE_CLIENT_RUNTIME_VERSION,
    host: "browser",
    surface: "adaptive",
    transport: "remote-http-websocket",
    capabilities: browserCapabilities(),
    procedures: bridge,
    native: bridge,
  });
}

function inferClientRuntime(bridge: PoracodeBridge): ClientRuntime {
  const browser = bridge.arch === "web" || bridge.appVersion === "remote";
  return {
    version: PORACODE_CLIENT_RUNTIME_VERSION,
    host: browser ? "browser" : "electron",
    surface: "adaptive",
    transport: browser ? "remote-http-websocket" : "electron-backend-host",
    capabilities: browser ? browserCapabilities() : ELECTRON_CAPABILITIES,
    procedures: bridge,
    native: bridge,
  };
}

export function readClientRuntime(): ClientRuntime {
  const bridge = window.poracode;
  if (installedRuntime) return installedRuntime;
  if (!bridge) throw new Error("Poracode client runtime is not installed.");
  return inferClientRuntime(bridge);
}

export function hasClientCapability(capability: keyof ClientCapabilities): boolean {
  if (!installedRuntime && !window.poracode) return false;
  return readClientRuntime().capabilities[capability];
}

export function isBrowserClientRuntime(): boolean {
  if (!installedRuntime && !window.poracode) return false;
  return readClientRuntime().host === "browser";
}

export function isCompactClientRuntimeSurface(): boolean {
  return (
    typeof window !== "undefined" &&
    (!!window.poracodeHost || !!window.poracode) &&
    readClientRuntime().host === "browser" &&
    readClientRuntime().surface === "adaptive" &&
    isCompactLayoutViewport()
  );
}

export function resetClientRuntimeForTest(): void {
  installedRuntime = null;
}
