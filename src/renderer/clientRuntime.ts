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
  PORACODE_REMOTE_PROTOCOL_VERSION,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
} from "@/shared/remote/protocol";
import {
  REMOTE_OPERATOR_SCOPES,
  type RemoteWebSocketClientMessage,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import {
  assertIpcProcedureMapVersion,
  createProcedureBridge,
  parseIpcProcedureArgs,
  type IpcProcedureName,
  type PoracodeBridge,
} from "@/shared/ipc";
import { msg } from "@/shared/messages";
import { ElectronBackendTransport } from "./electronBackendTransport";
import { isCompactLayoutViewport } from "./adaptiveLayout";
import { isRemoteRoutableProcedure } from "./remoteProcedureRoutes";
import {
  readRegisteredRemoteProcedureHost,
  routeRemoteProcedure,
  stampRemoteOwnerOntoPayload,
  type RemoteProcedureHost,
} from "./remoteProcedureRouter";
import { isRemoteTransportFailure, RemoteDesktopClient } from "@/shared/remote/client";
import type { ManagedLoopbackBootstrap } from "@/shared/managedLoopback";
import {
  DesktopLoopbackIntake,
  isLoopbackEndpoint,
  parsePairingCredential,
  type DesktopLoopbackSocket,
} from "./state/remoteServers/desktopLoopbackIntake";
import {
  MANAGED_LOOPBACK_DESKTOP_ID,
  clearManagedLoopbackOwnerRow,
  isManagedLoopbackRequestRoutingActive,
  setManagedLoopbackOwnerRow,
} from "./state/remoteServers/managedLoopbackOwner";
import {
  emitRemoteTerminalExited,
  emitRemoteTerminalReset,
  handleRemoteTerminalServerMessage,
  setManagedLoopbackTerminalLeg,
  setRemoteTerminalSocketSender,
} from "./state/remoteTerminalFeed";

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

function nodeProcessPlatform(): string | undefined {
  return typeof process !== "undefined" && typeof process.platform === "string"
    ? process.platform
    : undefined;
}

/**
 * Desktop-managed local knowledge: the co-located desktop host composes the
 * full host-service set this build ships. Main's authenticated describe on
 * the control surface reports the authoritative values for other readers;
 * these values only back the managed runtime, which owns that same host
 * process. `computerUse` mirrors the composition's legacy-driver rule
 * (Windows/macOS keep the in-process driver; on Linux only a staged helper
 * qualifies, which main describes authoritatively).
 *
 * Do not read `process.platform` at module scope — the sandboxed renderer
 * has no Node `process`, and that ReferenceError blanks the window before
 * React mounts.
 */
export function desktopManagedHostCapabilities(
  platform = nodeProcessPlatform(),
): HostServiceCapabilities {
  return {
    ssh: true,
    browserPanel: true,
    chromeBridge: true,
    computerUse: platform === "win32" || platform === "darwin",
    nativeSecrets: true,
    portForward: true,
  };
}

export const DESKTOP_MANAGED_HOST_CAPABILITIES: HostServiceCapabilities =
  desktopManagedHostCapabilities();

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
  assertIpcProcedureMapVersion(host.ipcProcedureMapVersion);
  const transport = new ElectronBackendTransport(host);
  managedLoopback.transport = transport;
  const procedures = createProcedureBridge((name, args) => {
    if (name === "setRendererEventInterests") {
      return transport.setEventInterests(parseIpcProcedureArgs(name, args));
    }
    // V5 plan 2.5: every procedure crosses the preload invoke boundary
    // (main → backend-host call-* operations); the direct renderer stream
    // that used to shortcut requests is deleted.
    //
    // 2.5 completion: while the loopback HTTP leg is active, remote-routable
    // requests route over it first and fall back to the preload invoke on
    // transport failure (leg severed mid-request) — never on a server verdict,
    // which the same backend would answer identically over IPC.
    if (isRemoteRoutableProcedure(name) && isManagedLoopbackRequestRoutingActive()) {
      const routed = routeManagedLoopbackRequest(name, args, host);
      if (routed !== undefined) return routed;
    }
    return host.invokeProcedure(name, args);
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
    capabilities: deriveClientCapabilities({
      host: desktopManagedHostCapabilities(host.platform),
      nativeShell: true,
      localBackend: true,
      nativeAppUpdates: true,
    }),
    hostCapabilities: desktopManagedHostCapabilities(host.platform),
    procedures,
    native,
  });
}

/**
 * The managed window's event transports (V5 plan 2.5): the loopback intake is
 * the preferred leg once the co-located remote server is reachable, and the
 * desktop-IPC relay stays the fallback. Held so
 * {@link startDesktopLoopbackEventIntake} can wire them after install.
 */
const managedLoopback: {
  transport: ElectronBackendTransport | null;
  intake: DesktopLoopbackIntake | null;
  discoveryTimer: ReturnType<typeof setTimeout> | null;
} = { transport: null, intake: null, discoveryTimer: null };

/** Test seams for the wiring-created intake (real-server loopback tests drive
 * the socket with the `ws` package instead of the DOM WebSocket). */
const managedLoopbackTestSeams: {
  socketFactory?: (url: string) => DesktopLoopbackSocket;
  retryDelayMs?: number;
  discoveryRetryMs?: number;
} = {};

/** Test seam: inject the intake's socket factory / retry cadence. */
export function __setDesktopLoopbackIntakeTestSeamsForTest(seams: {
  readonly socketFactory?: (url: string) => DesktopLoopbackSocket;
  readonly retryDelayMs?: number;
  readonly discoveryRetryMs?: number;
}): void {
  if (seams.socketFactory !== undefined)
    managedLoopbackTestSeams.socketFactory = seams.socketFactory;
  if (seams.retryDelayMs !== undefined) managedLoopbackTestSeams.retryDelayMs = seams.retryDelayMs;
  if (seams.discoveryRetryMs !== undefined) {
    managedLoopbackTestSeams.discoveryRetryMs = seams.discoveryRetryMs;
  }
}

/** Test seam: whether the managed loopback intake is currently serving. */
export function isDesktopLoopbackIntakeActive(): boolean {
  return managedLoopback.intake?.isActive() ?? false;
}

/** Re-discovery cadence while the loopback server is starting or its
 * credential was consumed by a server restart (cheap one-procedure check per
 * tick; the always-on guarantee makes the first ask succeed in practice). */
const LOOPBACK_DISCOVERY_RETRY_MS = 30_000;

/**
 * The managed loopback routing host (V5 plan 2.5 completion). Mirrors attach
 * mode's owner row for the DESKTOP'S OWN entities: while the loopback leg is
 * active, local threads/projects/locations resolve to the loopback identity
 * (id-preserving — managed rows are not projected), and requests execute
 * through a lean loopback `RemoteDesktopClient`. Persisted paired owners keep
 * resolving through the registered host first, so desktop-as-client routing
 * is unchanged.
 */
function createManagedLoopbackProcedureHost(
  endpoint: string,
  accessToken: string,
): RemoteProcedureHost {
  const persisted = readRegisteredRemoteProcedureHost();
  const client = new RemoteDesktopClient(endpoint, accessToken);
  return {
    resolveThreadOwner: (threadId) => {
      const persistedOwner = persisted?.resolveThreadOwner(threadId);
      if (persistedOwner) return persistedOwner;
      return { desktopId: MANAGED_LOOPBACK_DESKTOP_ID, remoteId: threadId };
    },
    resolveProjectOwner: (projectId) => {
      const persistedOwner = persisted?.resolveProjectOwner(projectId);
      if (persistedOwner) return persistedOwner;
      return { desktopId: MANAGED_LOOPBACK_DESKTOP_ID, remoteId: projectId };
    },
    withClient: (desktopId, invoke) => {
      if (desktopId !== MANAGED_LOOPBACK_DESKTOP_ID) {
        if (!persisted) throw new Error(msg("remote.server.unreachable"));
        return persisted.withClient(desktopId, invoke);
      }
      // Lean path: no runtime-row bookkeeping and no failure wrapping — raw
      // transport failures reach the caller, which is exactly what the IPC
      // fallback in {@link routeManagedLoopbackRequest} keys on.
      return invoke(client);
    },
  };
}

let managedLoopbackHost: RemoteProcedureHost | null = null;

/**
 * Routes one remote-routable managed request over the loopback HTTP leg.
 * Returns `undefined` when the router resolves the request locally (owner
 * `none` payloads and procedures whose owner lives on a persisted paired
 * desktop), so the caller falls through to the preload invoke. Transport
 * failures on the loopback leg retry over preload IPC — leg severing mid
 * request degrades, never loses the call.
 */
function routeManagedLoopbackRequest(
  name: IpcProcedureName,
  args: unknown[],
  host: ElectronHostBridge,
): Promise<unknown> | undefined {
  const loopbackHost = managedLoopbackHost;
  if (!loopbackHost) return undefined;
  const payload = parseIpcProcedureArgs(name, args);
  const stamped = stampRemoteOwnerOntoPayload(
    payload,
    MANAGED_LOOPBACK_DESKTOP_ID,
  ) as typeof payload;
  const decision = routeRemoteProcedure(name, stamped, loopbackHost);
  if (decision.kind !== "remote") return undefined;
  return decision.result.catch((error: unknown) => {
    if (!isRemoteTransportFailure(error)) throw error;
    // The leg went down between the activation check and this request (or the
    // row has not been cleared yet). Preload IPC is the durable fallback: the
    // same backend answers, so semantics are identical.
    return host.invokeProcedure(name, [payload]);
  });
}

/**
 * Starts the managed window's loopback intake (V5 plan 2.5, completed by the
 * always-on guarantee). Fire-and-forget: main mints this launch's attach
 * payload at readiness (`getManagedLoopbackBootstrap`), so the first ask
 * normally succeeds; until then (backend still starting) discovery retries in
 * the background. Every failure is non-fatal — the window keeps working over
 * the desktop-IPC relay (the fallback leg) for events, terminals, and
 * requests alike.
 *
 * No-op unless the managed Electron runtime is installed (attached and browser
 * flavors already run their own remote stacks).
 */
export async function startDesktopLoopbackEventIntake(): Promise<void> {
  const { transport } = managedLoopback;
  if (!transport || !installedRuntime) return;
  if (
    installedRuntime.host !== "electron" ||
    installedRuntime.transport !== "electron-backend-host"
  ) {
    return;
  }
  if (managedLoopback.intake) return;
  let bootstrap: ManagedLoopbackBootstrap | null = null;
  try {
    bootstrap =
      (await installedRuntime.procedures.getManagedLoopbackBootstrap()) as ManagedLoopbackBootstrap | null;
  } catch {
    bootstrap = null;
  }
  const pairingToken = bootstrap ? parsePairingCredential(bootstrap.pairingUrl) : null;
  if (!bootstrap || !pairingToken || !isLoopbackEndpoint(bootstrap.endpoint)) {
    scheduleLoopbackDiscoveryRetry();
    return;
  }
  const endpoint = bootstrap.endpoint;
  const intake = new DesktopLoopbackIntake({
    endpoint,
    pairingToken,
    ...(managedLoopbackTestSeams.socketFactory
      ? { socketFactory: managedLoopbackTestSeams.socketFactory }
      : {}),
    ...(managedLoopbackTestSeams.retryDelayMs !== undefined
      ? { retryDelayMs: managedLoopbackTestSeams.retryDelayMs }
      : {}),
    dispatch: (event, seq) => {
      // Terminal lifecycle rides the feed while the leg is up: mirror
      // reset/exit into it before the desktop reducer (no-ops for ids with no
      // watchers).
      if (event.type === "thread-reset") {
        emitRemoteTerminalReset(MANAGED_LOOPBACK_DESKTOP_ID, event.threadId);
      } else if (event.type === "thread-exited") {
        emitRemoteTerminalExited(
          MANAGED_LOOPBACK_DESKTOP_ID,
          event.threadId,
          typeof event.exitCode === "number" ? event.exitCode : null,
        );
      }
      transport.dispatchLoopbackEvent(event, seq);
    },
    requestRebuild: () => transport.rebuildSubscribedState(),
    onActiveChanged: (active) => {
      if (active) {
        cancelLoopbackRediscovery();
        // Terminal leg first: watchers switch to the feed before the
        // transport's rebuild dispatch runs (the baseline supersedes the
        // resync on activation).
        setManagedLoopbackTerminalLeg(true);
        transport.setLoopbackActive(true);
        const accessToken = intake.getAccessToken();
        if (accessToken) {
          managedLoopbackHost = createManagedLoopbackProcedureHost(endpoint, accessToken);
          setManagedLoopbackOwnerRow({
            endpoint,
            accessToken,
            scopes: [...REMOTE_OPERATOR_SCOPES],
          });
        }
      } else {
        setManagedLoopbackTerminalLeg(false);
        transport.setLoopbackActive(false);
        managedLoopbackHost = null;
        clearManagedLoopbackOwnerRow();
        // The retained token may recover a same-endpoint drop via the
        // intake's own retries; a moved/consumed credential needs a fresh
        // bootstrap ask.
        scheduleLoopbackRediscovery();
      }
    },
    onTerminalReady: (send) => {
      setRemoteTerminalSocketSender(
        MANAGED_LOOPBACK_DESKTOP_ID,
        send as (message: RemoteWebSocketClientMessage) => boolean,
        { cursorSyncVersion: TERMINAL_CURSOR_SYNC_V2_VERSION },
      );
    },
    onTerminalLost: () => {
      setRemoteTerminalSocketSender(MANAGED_LOOPBACK_DESKTOP_ID, null);
    },
    onServerFrame: (message) =>
      handleRemoteTerminalServerMessage(
        MANAGED_LOOPBACK_DESKTOP_ID,
        message as RemoteWebSocketServerMessage,
      ),
  });
  managedLoopback.intake = intake;
  const activated = await intake.activate();
  if (!activated && managedLoopback.intake === intake) {
    // The bootstrap target is unusable (server moved its port, credential
    // consumed): drop the intake and re-ask main after the retry interval —
    // the always-on guarantee guarantees a fresh answer, not a still-valid
    // endpoint.
    intake.dispose();
    managedLoopback.intake = null;
    scheduleLoopbackDiscoveryRetry();
  }
}

function scheduleLoopbackDiscoveryRetry(): void {
  if (managedLoopback.discoveryTimer || managedLoopback.intake) return;
  managedLoopback.discoveryTimer = setTimeout(() => {
    managedLoopback.discoveryTimer = null;
    void startDesktopLoopbackEventIntake();
  }, managedLoopbackTestSeams.discoveryRetryMs ?? LOOPBACK_DISCOVERY_RETRY_MS);
  managedLoopback.discoveryTimer.unref?.();
}

function cancelLoopbackRediscovery(): void {
  if (!managedLoopback.discoveryTimer) return;
  clearTimeout(managedLoopback.discoveryTimer);
  managedLoopback.discoveryTimer = null;
}

/**
 * Leg-loss rediscovery (V5 plan 2.5 completion): when the loopback socket
 * dies for good — a server restart may have moved the port or consumed the
 * pairing credential — the intake is replaced through a FRESH bootstrap ask
 * rather than retrying a spent credential forever. The desktop-IPC relay and
 * preload IPC carry the surface meanwhile; if the intake's own retained-token
 * retry recovers first, the pending rediscovery is cancelled on re-activation.
 */
function scheduleLoopbackRediscovery(): void {
  cancelLoopbackRediscovery();
  managedLoopback.discoveryTimer = setTimeout(() => {
    managedLoopback.discoveryTimer = null;
    managedLoopback.intake?.dispose();
    managedLoopback.intake = null;
    void startDesktopLoopbackEventIntake();
  }, managedLoopbackTestSeams.discoveryRetryMs ?? LOOPBACK_DISCOVERY_RETRY_MS);
  managedLoopback.discoveryTimer.unref?.();
}

/** Test seam: forget the managed loopback wiring. */
export function resetDesktopLoopbackIntakeForTest(): void {
  if (managedLoopback.discoveryTimer) {
    clearTimeout(managedLoopback.discoveryTimer);
    managedLoopback.discoveryTimer = null;
  }
  managedLoopback.intake?.dispose();
  managedLoopback.intake = null;
  managedLoopback.transport = null;
  managedLoopbackHost = null;
  clearManagedLoopbackOwnerRow();
  setManagedLoopbackTerminalLeg(false);
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
  // V5 plan 2.6: the same typed handshake guards the attach bootstrap — the
  // device-procedure surface the attached renderer falls back to must agree
  // with this bundle's procedure map before anything installs.
  assertIpcProcedureMapVersion(host.ipcProcedureMapVersion);
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
    : desktopManagedHostCapabilities(bridge.platform);
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
}
