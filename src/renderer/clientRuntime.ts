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
import {
  hostServiceCapabilitiesSchema,
  UNKNOWN_HOST_SERVICE_CAPABILITIES,
} from "@/shared/hostControlProtocol";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import {
  assertIpcProcedureMapVersion,
  createProcedureBridge,
  parseIpcProcedureArgs,
  type PoracodeBridge,
} from "@/shared/ipc";
import { isCompactLayoutViewport } from "./adaptiveLayout";
import { isRemoteRoutableProcedure } from "./remoteProcedureRoutes";
import { routeRemoteProcedure } from "./remoteProcedureRouter";
import {
  activateHostTransport,
  attachManagedLoopbackPreload,
  bindManagedLoopbackRuntime,
  ManagedElectronHostTransport,
  PreloadIpcTransport,
  RemoteHttpWsTransport,
  requestActiveHost,
  resetActiveHostTransportForTest,
} from "./hostTransport";

export {
  startDesktopLoopbackEventIntake,
  resetDesktopLoopbackIntakeForTest,
  isDesktopLoopbackIntakeActive,
  __setDesktopLoopbackIntakeTestSeamsForTest,
} from "./hostTransport";

let installedRuntime: ClientRuntime | null = null;

bindManagedLoopbackRuntime(() => installedRuntime);

/**
 * Fail-closed host capabilities: nothing is offered. Used when no host
 * capability data has been negotiated (browser clients before GET
 * `/api/host/describe`, or an attach payload that omits capabilities).
 * Never derived from the host kind.
 */
export const UNKNOWN_HOST_CAPABILITIES: HostServiceCapabilities = UNKNOWN_HOST_SERVICE_CAPABILITIES;

function negotiatedHostCapabilities(value: unknown): HostServiceCapabilities {
  const parsed = hostServiceCapabilitiesSchema.safeParse(value);
  return parsed.success ? parsed.data : UNKNOWN_HOST_CAPABILITIES;
}

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
    osNotifications: input.host.osNotifications,
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
  assertIpcProcedureMapVersion(host.ipcProcedureMapVersion);
  const hostCapabilities = negotiatedHostCapabilities(host.hostCapabilities);
  const preload = new PreloadIpcTransport(host, hostCapabilities);
  attachManagedLoopbackPreload(preload);
  const transport = activateHostTransport(
    new ManagedElectronHostTransport(preload, hostCapabilities),
  );
  const procedures = createProcedureBridge(requestActiveHost);
  const native: PoracodeNativeBridge = {
    ...host,
    onSupervisorEvent: (listener) => transport.subscribeEvents(listener),
  };
  installClientRuntime({
    version: PORACODE_CLIENT_RUNTIME_VERSION,
    host: "electron",
    surface: "adaptive",
    transport: "electron-backend-host",
    capabilities: deriveClientCapabilities({
      host: hostCapabilities,
      nativeShell: true,
      localBackend: true,
      nativeAppUpdates: true,
    }),
    hostCapabilities,
    procedures,
    native,
  });
}

export function installBrowserClientRuntime(bridge: PoracodeBridge): void {
  // Browser clients start fail-closed unknown and apply GET /api/host/describe
  // after pairing (V6 C.2) — never inferred from the paired host's mode.
  activateHostTransport(
    new RemoteHttpWsTransport(async (name, args) => {
      const invoke = bridge[name] as (...invokeArgs: unknown[]) => Promise<unknown>;
      return invoke(...args);
    }, UNKNOWN_HOST_CAPABILITIES),
  );
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
  // V5 plan 2.6: the same typed handshake guards the attach bootstrap — the
  // device-procedure surface the attached renderer falls back to must agree
  // with this bundle's procedure map before anything installs.
  assertIpcProcedureMapVersion(host.ipcProcedureMapVersion);
  const parsed = parseStandaloneAttachInfo(attach);
  if (!parsed) throw new Error("Invalid standalone attach configuration.");
  const hostCapabilities = negotiatedHostCapabilities(parsed.capabilities);
  const transport = activateHostTransport(
    new RemoteHttpWsTransport(async (name, args) => {
      if (isRemoteRoutableProcedure(name)) {
        const decision = routeRemoteProcedure(name, parseIpcProcedureArgs(name, args));
        if (decision.kind === "remote") return decision.result;
      }
      // Settings are owner-authoritative in attach: persist through the existing
      // remote pull/push sync instead of a local handler (which loud-rejects).
      // Dynamic imports keep this module cycle-free (the sync imports the store).
      if (name === "setSharedSettings") {
        const settings = parseIpcProcedureArgs("setSharedSettings", args);
        const [{ getRemoteBridgeClient }, { pushDesktopSettingsDiff }] = await Promise.all([
          import("./browser/remoteBridge"),
          import("./browser/remoteSettingsSync"),
        ]);
        pushDesktopSettingsDiff(getRemoteBridgeClient(), settings);
        return;
      }
      return host.invokeProcedure(name, args);
    }, hostCapabilities),
  );
  const procedures = createProcedureBridge(requestActiveHost);
  const native: PoracodeNativeBridge = {
    ...host,
    onSupervisorEvent: (listener) => transport.subscribeEvents(listener),
  };
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
    native,
  });
}

export function isStandaloneAttachRuntime(): boolean {
  if (!installedRuntime) return false;
  return (
    installedRuntime.host === "electron" && installedRuntime.transport === "remote-http-websocket"
  );
}

/**
 * True when this window runs behind the Electron preload shell bridge. This
 * is the ONLY sanctioned reader of `window.poracodeHost` (V5 plan 2.4 / T5):
 * the raw globals exist exactly once — here and in the installers that
 * materialize them (`bootstrap.ts`, `bridge.ts`, `browser/remoteBridge.ts`) —
 * and every other module reads them through these accessors. The check is a
 * client SURFACE fact (an Electron native window owns this renderer), valid
 * for managed and attached Electron alike; host SERVICE availability never
 * derives from it — use `hasClientCapability` / `hostCapabilities` for that.
 */
export function hasElectronHostBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.poracodeHost);
}

/**
 * The Electron preload host bridge for Electron-only bootstrap wiring
 * (`app.tsx` main-window event subscriptions), or null off the Electron
 * surface. Sanctioned accessor like the raw-global readers it wraps: the raw
 * `window.poracodeHost` global exists exactly once — in the installers and
 * this accessor — and every other module reads the bridge through it.
 */
export function readElectronHostBridge(): ElectronHostBridge | null {
  return typeof window !== "undefined" && window.poracodeHost ? window.poracodeHost : null;
}

/**
 * True when any Poracode preload bridge is present (`window.poracodeHost` or
 * `window.poracode`). Shared launcher/persistence gates read this instead of
 * the globals directly, so a preload-less surface (tests, plain browser tab
 * before the remote bridge installs) stays the single "no bridge" flavor.
 */
export function hasAnyClientBridge(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.poracodeHost !== undefined || window.poracode !== undefined)
  );
}

function inferClientRuntime(bridge: PoracodeBridge): ClientRuntime {
  const browser = bridge.arch === "web" || bridge.appVersion === "remote";
  const hostCapabilities = browser
    ? UNKNOWN_HOST_CAPABILITIES
    : negotiatedHostCapabilities(
        (bridge as unknown as { readonly hostCapabilities?: unknown }).hostCapabilities,
      );
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
    hasAnyClientBridge() &&
    readClientRuntime().host === "browser" &&
    readClientRuntime().surface === "adaptive" &&
    isCompactLayoutViewport()
  );
}

export function resetClientRuntimeForTest(): void {
  installedRuntime = null;
  resetActiveHostTransportForTest();
}

/**
 * V6 C.2: apply GET /api/host/describe (or an attach describe) onto the
 * installed runtime so browser/native/attached clients derive availability
 * from the host instead of `hostMode`.
 */
export function applyNegotiatedHostCapabilities(host: HostServiceCapabilities): void {
  if (!installedRuntime || installedRuntime.transport !== "remote-http-websocket") return;
  const hostCapabilities = negotiatedHostCapabilities(host);
  installedRuntime = {
    ...installedRuntime,
    hostCapabilities,
    capabilities: deriveClientCapabilities({
      host: hostCapabilities,
      nativeShell: installedRuntime.capabilities.nativeShell,
      localBackend: installedRuntime.capabilities.localBackend,
      nativeAppUpdates: installedRuntime.capabilities.nativeAppUpdates,
    }),
  };
}
