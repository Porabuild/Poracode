import {
  PORACODE_CLIENT_RUNTIME_VERSION,
  type ClientCapabilities,
  type ClientRuntime,
  type ElectronHostBridge,
  type PoracodeNativeBridge,
} from "@/shared/clientRuntime";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import { standaloneAttachInfoSchema } from "@/shared/standaloneAttach";
import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import { createProcedureBridge, parseIpcProcedureArgs, type PoracodeBridge } from "@/shared/ipc";
import { ElectronBackendTransport } from "./electronBackendTransport";
import { isCompactLayoutViewport } from "./adaptiveLayout";
import { isRemoteRoutableProcedure } from "./remoteProcedureRoutes";
import { routeRemoteProcedure } from "./remoteProcedureRouter";

let installedRuntime: ClientRuntime | null = null;

/**
 * Fail-closed host capabilities: nothing is offered. Used when no host
 * capability data has been negotiated (browser clients — the remote wire
 * does not carry a describe yet) or when an attach payload predates the
 * capability field. Never derived from the host kind.
 */
export const UNKNOWN_HOST_CAPABILITIES: HostServiceCapabilities = {
  ssh: false,
  browserPanel: false,
  chromeBridge: false,
  computerUse: false,
  nativeSecrets: false,
  portForward: false,
};

/**
 * Desktop-managed local knowledge: the co-located desktop host composes the
 * full host-service set this build ships. Main's authenticated describe on
 * the control surface reports the authoritative values for other readers;
 * these constants only back the managed runtime, which owns that same host
 * process. `computerUse` mirrors the composition's legacy-driver rule
 * (Windows/macOS keep the in-process driver; on Linux only a staged helper
 * qualifies, which main describes authoritatively).
 */
export const DESKTOP_MANAGED_HOST_CAPABILITIES: HostServiceCapabilities = {
  ssh: true,
  browserPanel: true,
  chromeBridge: true,
  computerUse: process.platform === "win32" || process.platform === "darwin",
  nativeSecrets: true,
  portForward: true,
};

/**
 * Derive the client capability set from HOST-DECLARED capabilities plus the
 * client's own surface facts (V5 plan 1.2 / H6). Availability is the
 * conjunction of "the host composes the service" and "this client owns a
 * surface that can serve it" — never a host-kind inference.
 */
export function deriveClientCapabilities(input: {
  host: HostServiceCapabilities;
  /** This client holds the Electron native shell (windows, shortcuts). */
  nativeShell: boolean;
  /** This client owns the local backend authority (desktop-managed only). */
  localBackend: boolean;
  nativeAppUpdates: boolean;
}): ClientCapabilities {
  return {
    localBackend: input.localBackend,
    manageRemoteEnvironments: true,
    nativeAppUpdates: input.nativeAppUpdates,
    nativeShell: input.nativeShell,
    // Native SSH environments and browser webContents are served by the
    // local backend authority's handlers; a remote-only client (attached,
    // browser) has neither surface, whatever the host declares.
    nativeSsh: input.localBackend && input.host.ssh,
    nativeBrowserWebContents: input.localBackend && input.host.browserPanel,
  };
}

export function installClientRuntime(runtime: ClientRuntime): void {
  assertClientRuntimeVersion(runtime.version);
  installedRuntime = runtime;
}

function assertClientRuntimeVersion(version: unknown): void {
  if (version !== PORACODE_CLIENT_RUNTIME_VERSION) {
    throw new Error(`Unsupported client runtime version: ${String(version)}`);
  }
}

export function installElectronClientRuntime(host: ElectronHostBridge): void {
  assertClientRuntimeVersion(host.clientRuntimeVersion);
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
    onBackendRendererStreamGenerationChanged: (listener) => transport.onGenerationChanged(listener),
  };
  installClientRuntime({
    version: PORACODE_CLIENT_RUNTIME_VERSION,
    host: "electron",
    surface: "adaptive",
    transport: "electron-backend-host",
    capabilities: deriveClientCapabilities({
      host: DESKTOP_MANAGED_HOST_CAPABILITIES,
      nativeShell: true,
      localBackend: true,
      nativeAppUpdates: true,
    }),
    hostCapabilities: DESKTOP_MANAGED_HOST_CAPABILITIES,
    procedures,
    native,
  });
}

export function installBrowserClientRuntime(bridge: PoracodeBridge): void {
  // Browser clients negotiate host data over the remote wire, which does not
  // carry a describe yet — so the host capabilities stay fail-closed unknown
  // instead of being inferred from the paired host's mode.
  installClientRuntime({
    version: PORACODE_CLIENT_RUNTIME_VERSION,
    host: "browser",
    surface: "adaptive",
    transport: "remote-http-websocket",
    capabilities: deriveClientCapabilities({
      host: UNKNOWN_HOST_CAPABILITIES,
      nativeShell: false,
      localBackend: false,
      nativeAppUpdates: false,
    }),
    hostCapabilities: UNKNOWN_HOST_CAPABILITIES,
    procedures: bridge,
    native: bridge,
  });
}

/**
 * Validate an attach payload from main before selecting the remote stack.
 * Fails closed on version mismatch, malformed endpoint/pairing, or a changed
 * generation shape: the caller must fall back to refusing, never to a local
 * authority.
 */
export function parseStandaloneAttachInfo(value: unknown): StandaloneAttachInfo | null {
  const parsed = standaloneAttachInfoSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.remoteProtocolVersion !== PORACODE_REMOTE_PROTOCOL_VERSION) return null;
  return parsed.data;
}

/**
 * Read the attach payload without conflating absence with failure.
 *
 * Absence of the OPTIONAL getter (older managed preload) or an explicit
 * `null` (managed-local launch) means managed: returns `null`. A present
 * getter that throws/rejects, resolves to `undefined`, or resolves to an
 * invalid payload must fail closed: throws, so the caller refuses instead of
 * installing the managed renderer. Never returns managed on failure.
 */
export async function readStandaloneAttachInfo(
  host: ElectronHostBridge,
): Promise<StandaloneAttachInfo | null> {
  if (typeof host.getStandaloneAttachInfo !== "function") return null;
  const raw: unknown = await host.getStandaloneAttachInfo();
  if (raw === null) return null;
  const parsed = parseStandaloneAttachInfo(raw);
  if (!parsed) throw new Error("Invalid standalone attach configuration.");
  return parsed;
}

/**
 * Select the Electron bootstrap mode without installing anything.
 *
 * Managed exactly when the OPTIONAL getter is absent (older managed preload)
 * or resolves to explicit `null` (managed-local launch). A present getter
 * that throws/rejects or resolves to an invalid/`undefined` payload throws,
 * so the caller refuses instead of installing the managed renderer. Pure
 * selection: the bootstrap module owns installation.
 */
export async function resolveElectronAttachBootstrap(
  host: ElectronHostBridge,
): Promise<
  | { readonly kind: "managed" }
  | { readonly kind: "attached"; readonly attach: StandaloneAttachInfo }
> {
  const attach = await readStandaloneAttachInfo(host);
  if (attach) return { kind: "attached", attach };
  return { kind: "managed" };
}

/**
 * Boot Electron as a client of the already-running headless owner described
 * by `attach`. Procedures route remote-first through the existing remote
 * procedure router (owner data) and fall back to the Electron host for
 * device-owned locals; the local backend transport is never created, so no
 * fork, lease, or SQLite handle can come from this path. Native keeps the
 * Electron host surface (preload IPC, bridge ports); supervisor live events
 * arrive over the remote event sockets owned by the remote stores.
 *
 * Host capabilities come from the attach payload (the minting describe's
 * host-declared capabilities, V5 plan 1.2). The client still has no local
 * backend authority, so SSH/browser-panel surfaces stay unavailable even
 * when the host offers them remotely; a payload without capabilities (old
 * host) fails closed to the unknown set.
 */
export function installAttachedElectronClientRuntime(
  host: ElectronHostBridge,
  attach: StandaloneAttachInfo,
): void {
  assertClientRuntimeVersion(host.clientRuntimeVersion);
  const parsed = parseStandaloneAttachInfo(attach);
  if (!parsed) throw new Error("Invalid standalone attach configuration.");
  const hostCapabilities = parsed.capabilities ?? UNKNOWN_HOST_CAPABILITIES;
  const procedures = createProcedureBridge((name, args) => {
    if (isRemoteRoutableProcedure(name)) {
      const decision = routeRemoteProcedure(name, parseIpcProcedureArgs(name, args));
      if (decision.kind === "remote") return decision.result;
    }
    // Settings are owner-authoritative in attach: persist through the existing
    // remote pull/push sync instead of a local handler (which loud-rejects).
    // Dynamic imports keep this module cycle-free (the sync imports the store).
    if (name === "setSharedSettings") {
      const settings = parseIpcProcedureArgs("setSharedSettings", args);
      return (async () => {
        const [{ getRemoteBridgeClient }, { pushDesktopSettingsDiff }] = await Promise.all([
          import("./browser/remoteBridge"),
          import("./browser/remoteSettingsSync"),
        ]);
        pushDesktopSettingsDiff(getRemoteBridgeClient(), settings);
      })();
    }
    return host.invokeProcedure(name, args);
  });
  installClientRuntime({
    version: PORACODE_CLIENT_RUNTIME_VERSION,
    host: "electron",
    surface: "adaptive",
    transport: "remote-http-websocket",
    capabilities: deriveClientCapabilities({
      host: hostCapabilities,
      nativeShell: true,
      localBackend: false,
      nativeAppUpdates: true,
    }),
    hostCapabilities,
    procedures,
    native: host,
  });
}

export function isStandaloneAttachRuntime(): boolean {
  if (!installedRuntime) return false;
  return (
    installedRuntime.host === "electron" && installedRuntime.transport === "remote-http-websocket"
  );
}

function inferClientRuntime(bridge: PoracodeBridge): ClientRuntime {
  const browser = bridge.arch === "web" || bridge.appVersion === "remote";
  const hostCapabilities = browser ? UNKNOWN_HOST_CAPABILITIES : DESKTOP_MANAGED_HOST_CAPABILITIES;
  return {
    version: PORACODE_CLIENT_RUNTIME_VERSION,
    host: browser ? "browser" : "electron",
    surface: "adaptive",
    transport: browser ? "remote-http-websocket" : "electron-backend-host",
    capabilities: deriveClientCapabilities({
      host: hostCapabilities,
      nativeShell: !browser,
      localBackend: !browser,
      nativeAppUpdates: !browser,
    }),
    hostCapabilities,
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
