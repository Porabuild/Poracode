import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import { parseIpcProcedureArgs, type IpcProcedureName } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import { TERMINAL_CURSOR_SYNC_V2_VERSION } from "@/shared/remote/protocol";
import {
  REMOTE_OPERATOR_SCOPES,
  type RemoteWebSocketClientMessage,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import { RemoteDesktopClient } from "@/shared/remote/client";
import type { ManagedLoopbackBootstrap } from "@/shared/managedLoopback";
import {
  DesktopLoopbackIntake,
  isLoopbackEndpoint,
  parsePairingCredential,
  type DesktopLoopbackSocket,
} from "@/renderer/state/remoteServers/desktopLoopbackIntake";
import {
  clearManagedLoopbackOwnerRow,
  setManagedLoopbackOwnerRow,
} from "@/renderer/state/remoteServers/managedLoopbackOwner";
import { MANAGED_LOOPBACK_DESKTOP_ID } from "./managedIdentity";
import { isRemoteRoutableProcedure } from "@/renderer/remoteProcedureRoutes";
import {
  readRegisteredRemoteProcedureHost,
  routeRemoteProcedure,
  stampRemoteOwnerOntoPayload,
  type RemoteProcedureHost,
} from "@/renderer/remoteProcedureRouter";
import type { PreloadIpcTransport } from "./preloadIpcTransport";
import {
  HOST_TRANSPORT_VERSION,
  type HostEventListener,
  type HostIdentity,
  type HostTransport,
} from "./types";

/**
 * Snapshot of the installed Electron runtime the loopback intake needs.
 * Bound from `clientRuntime` so this module never reads the global runtime.
 */
export type ManagedLoopbackRuntimeSnapshot = {
  host: "electron" | "browser";
  transport: string;
  procedures: {
    getManagedLoopbackBootstrap: () => Promise<unknown>;
  };
};

let getRuntime: (() => ManagedLoopbackRuntimeSnapshot | null) | null = null;

export function bindManagedLoopbackRuntime(
  getter: () => ManagedLoopbackRuntimeSnapshot | null,
): void {
  getRuntime = getter;
}

/**
 * The renderer terminal feed, loaded lazily at intake start instead of at
 * module scope: that module reads the bridge, which evaluates the client
 * runtime, which imports this barrel — a module-scope import here would close
 * a module-evaluation cycle and leave the barrel's bindings uninitialized
 * (V6 B.1). The intake's dispatch callbacks stay synchronous because the
 * module is fully loaded before the intake is constructed.
 */
type RemoteTerminalFeedModule = typeof import("@/renderer/state/remoteTerminalFeed");
let terminalFeed: RemoteTerminalFeedModule | null = null;

async function loadTerminalFeed(): Promise<RemoteTerminalFeedModule> {
  terminalFeed ??= await import("@/renderer/state/remoteTerminalFeed");
  return terminalFeed;
}

/**
 * The managed window's event transports (V5 plan 2.5 / V6 B.6): the loopback
 * intake is the live data plane. Held so
 * {@link startDesktopLoopbackEventIntake} can wire them after install.
 */
const managedLoopback: {
  transport: PreloadIpcTransport | null;
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
  intake: DesktopLoopbackIntake,
): RemoteProcedureHost {
  const persisted = readRegisteredRemoteProcedureHost();
  const client = new RemoteDesktopClient(endpoint, accessToken, undefined, {
    tokenLifecycle: {
      refreshToken: () => intake.getRefreshToken() ?? undefined,
      onTokensRefreshed: (tokens) => {
        intake.applyTokens({
          accessToken: tokens.accessToken,
          ...(tokens.refreshToken !== undefined ? { refreshToken: tokens.refreshToken } : {}),
        });
        if (managedLoopback.intake !== intake || !intake.isActive()) return;
        setManagedLoopbackOwnerRow({
          endpoint,
          accessToken: tokens.accessToken,
          scopes: [...REMOTE_OPERATOR_SCOPES],
        });
      },
    },
  });
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
    resolveDesktopOwner: () => ({ desktopId: MANAGED_LOOPBACK_DESKTOP_ID }),
    withClient: (desktopId, invoke) => {
      if (desktopId !== MANAGED_LOOPBACK_DESKTOP_ID) {
        if (!persisted) throw new Error(msg("remote.server.unreachable"));
        return persisted.withClient(desktopId, invoke);
      }
      // Lean path: no runtime-row bookkeeping and no failure wrapping — raw
      // transport failures reach the caller (V6 B.6: no IPC retry).
      return invoke(client);
    },
  };
}

let managedLoopbackHost: RemoteProcedureHost | null = null;

export function attachManagedLoopbackPreload(transport: PreloadIpcTransport): void {
  managedLoopback.transport = transport;
}

/**
 * Routes one remote-routable managed request over the loopback HTTP leg.
 * Returns `undefined` when the router resolves the request locally (owner
 * `none` payloads and procedures whose owner lives on a persisted paired
 * desktop). V6 B.6: transport failures are not retried over preload IPC —
 * the loopback HTTP leg is the only data plane for these names.
 */
function routeManagedLoopbackRequest(
  name: IpcProcedureName,
  args: unknown[],
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
  return decision.result;
}

function shouldRouteManagedLoopbackRequest(name: IpcProcedureName): boolean {
  return isRemoteRoutableProcedure(name) && managedLoopbackHost !== null;
}

/**
 * Starts the managed window's loopback intake (V5 plan 2.5, completed by the
 * always-on guarantee). Fire-and-forget: main mints this launch's attach
 * payload at readiness (`getManagedLoopbackBootstrap`), so the first ask
 * normally succeeds; until then (backend still starting) discovery retries in
 * the background. V6 B.6: there is no IPC event/PTY/non-shell request
 * fallback — the window has no live data plane until this intake is active.
 *
 * No-op unless the managed Electron runtime is installed (attached and browser
 * flavors already run their own remote stacks).
 */
export async function startDesktopLoopbackEventIntake(): Promise<void> {
  const { transport } = managedLoopback;
  const installedRuntime = getRuntime?.() ?? null;
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
  // Loaded before the intake is constructed so the sync callbacks below can
  // mirror terminal lifecycle without their own imports (V6 B.1 cycle note).
  const feed = await loadTerminalFeed();
  const intake = new DesktopLoopbackIntake({
    endpoint,
    pairingToken,
    ...(managedLoopbackTestSeams.socketFactory
      ? { socketFactory: managedLoopbackTestSeams.socketFactory }
      : {}),
    ...(managedLoopbackTestSeams.retryDelayMs !== undefined
      ? { retryDelayMs: managedLoopbackTestSeams.retryDelayMs }
      : {}),
    dispatch: (event, seq, space) => {
      // Terminal lifecycle rides the feed while the leg is up: mirror
      // reset/exit into it before the desktop reducer (no-ops for ids with no
      // watchers).
      if (event.type === "thread-reset") {
        feed.emitRemoteTerminalReset(feed.managedTerminalFeedId(), event.threadId);
      } else if (event.type === "thread-exited") {
        feed.emitRemoteTerminalExited(
          feed.managedTerminalFeedId(),
          event.threadId,
          typeof event.exitCode === "number" ? event.exitCode : null,
        );
      }
      transport.dispatchSequencedEvent(event, seq, space ?? "loopback");
    },
    requestRebuild: () => transport.rebuildSubscribedState(),
    onActiveChanged: (active) => {
      if (active) {
        cancelLoopbackRediscovery();
        // Terminal leg first: watchers switch to the feed before the
        // transport's rebuild dispatch runs (the baseline supersedes the
        // resync on activation).
        feed.setManagedLoopbackTerminalLeg(true);
        transport.setLoopbackActive(true);
        const accessToken = intake.getAccessToken();
        if (accessToken) {
          managedLoopbackHost = createManagedLoopbackProcedureHost(endpoint, accessToken, intake);
          setManagedLoopbackOwnerRow({
            endpoint,
            accessToken,
            scopes: [...REMOTE_OPERATOR_SCOPES],
          });
        }
      } else {
        feed.setManagedLoopbackTerminalLeg(false);
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
      feed.setRemoteTerminalSocketSender(
        feed.managedTerminalFeedId(),
        send as (message: RemoteWebSocketClientMessage) => boolean,
        { cursorSyncVersion: TERMINAL_CURSOR_SYNC_V2_VERSION },
      );
    },
    onTerminalLost: () => {
      feed.setRemoteTerminalSocketSender(feed.managedTerminalFeedId(), null);
    },
    onServerFrame: (message) =>
      feed.handleRemoteTerminalServerMessage(
        feed.managedTerminalFeedId(),
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
 * rather than retrying a spent credential forever. There is no IPC event
 * relay meanwhile (V6 B.6); if the intake's own retained-token retry recovers
 * first, the pending rediscovery is cancelled on re-activation.
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
  // The feed module may never have loaded (no intake started): then the leg
  // was never armed either.
  terminalFeed?.setManagedLoopbackTerminalLeg(false);
}

/**
 * Loopback HTTP/WS hop for the managed desktop. Owns the intake, request
 * router, and module state so `ManagedElectronHostTransport` can delegate
 * without `clientRuntime` forking those legs.
 */
export class LoopbackHttpWsTransport implements HostTransport {
  readonly version = HOST_TRANSPORT_VERSION;
  readonly identity: HostIdentity = { kind: "managed" };

  constructor(
    private readonly preload: PreloadIpcTransport,
    readonly capabilities: HostServiceCapabilities,
  ) {
    attachManagedLoopbackPreload(preload);
  }

  request(name: IpcProcedureName, args: unknown[]): Promise<unknown> {
    if (shouldRouteManagedLoopbackRequest(name)) {
      const routed = routeManagedLoopbackRequest(name, args);
      if (routed !== undefined) return routed;
    }
    return this.preload.request(name, args);
  }

  /** Bootstrap / local-shell path when loopback routing is not yet active. */
  preloadRequest(name: IpcProcedureName, args: unknown[]): Promise<unknown> {
    return this.preload.request(name, args);
  }

  subscribeEvents(listener: HostEventListener): () => void {
    return this.preload.subscribeEvents(listener);
  }

  start(): Promise<void> {
    return startDesktopLoopbackEventIntake();
  }

  resetForTest(): void {
    resetDesktopLoopbackIntakeForTest();
  }
}
