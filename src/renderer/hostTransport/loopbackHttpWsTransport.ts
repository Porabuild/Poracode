import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import { parseIpcProcedureArgs, type IpcProcedureName } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import { msg as linguiMsg } from "@lingui/core/macro";
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
  clearManagedParentAuthority,
  failManagedParentAuthority,
  markManagedParentRetrying,
  publishManagedParentAuthority,
  setManagedLoopbackOwnerRow,
} from "@/renderer/state/remoteServers/managedLoopbackOwner";
import { i18n } from "@/renderer/i18n/i18n";
import {
  resetLiveStreamCapacityStore,
  useLiveStreamCapacityStore,
} from "@/renderer/state/liveStreamCapacityStore";
import { MANAGED_LOOPBACK_DESKTOP_ID } from "./managedIdentity";
import {
  environmentAdvertisesRuntimeHistoryNotices,
  forgetRuntimeHistoryNoticesCapability,
  managedRootNoticeAuthority,
  noteRuntimeHistoryNoticesCapability,
} from "@/renderer/state/remote/historyNoticeCapability";
import {
  clearManagedLoopbackBoundedCatalogChangesAdoption,
  environmentAdvertisesBoundedCatalogChanges,
  managedLoopbackBoundedCatalogChangesAdopted,
  noteManagedLoopbackBoundedCatalogChangesVerdict,
  __resetBoundedCatalogChangesCapabilityForTest,
} from "@/renderer/state/remote/boundedCatalogChangesCapability";
import { isBoundedCatalogControllerConfigured } from "@/renderer/state/remoteServers/catalog/boundedCatalogController";
import {
  isPassthroughRemoteProcedure,
  isRemoteRoutableProcedure,
} from "@/renderer/remoteProcedureRoutes";
import {
  readManagedLoopbackProcedureHost,
  readRegisteredRemoteProcedureHost,
  registerManagedLoopbackProcedureHost,
  routeRemoteProcedure,
  stampRemoteOwnerOntoPayload,
  type ManagedLoopbackProcedureHostRegistration,
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
  descriptorRetryMs?: number;
  preflightTimeoutMs?: number;
} = {};

/** Test seam: inject the intake's socket factory / retry cadence. */
export function __setDesktopLoopbackIntakeTestSeamsForTest(seams: {
  readonly socketFactory?: (url: string) => DesktopLoopbackSocket;
  readonly retryDelayMs?: number;
  readonly discoveryRetryMs?: number;
  readonly descriptorRetryMs?: number;
  readonly preflightTimeoutMs?: number;
}): void {
  if (seams.socketFactory !== undefined)
    managedLoopbackTestSeams.socketFactory = seams.socketFactory;
  if (seams.retryDelayMs !== undefined) managedLoopbackTestSeams.retryDelayMs = seams.retryDelayMs;
  if (seams.discoveryRetryMs !== undefined) {
    managedLoopbackTestSeams.discoveryRetryMs = seams.discoveryRetryMs;
  }
  if (seams.descriptorRetryMs !== undefined) {
    managedLoopbackTestSeams.descriptorRetryMs = seams.descriptorRetryMs;
  }
  if (seams.preflightTimeoutMs !== undefined) {
    managedLoopbackTestSeams.preflightTimeoutMs = seams.preflightTimeoutMs;
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
export function createManagedLoopbackProcedureHost(
  client: RemoteDesktopClient,
  persisted: RemoteProcedureHost | null | undefined,
): RemoteProcedureHost {
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

/**
 * The ONE managed loopback client. It backs both procedure routing and the
 * managed parent authority, so environment management rides the same live
 * credential lifecycle as every managed `call-*`. Rotation is fenced by
 * activation identity: a delayed rotation from a retired intake never
 * reinstall the owner row.
 */
function createManagedLoopbackClient(
  endpoint: string,
  accessToken: string,
  intake: DesktopLoopbackIntake,
): RemoteDesktopClient {
  return new RemoteDesktopClient(endpoint, accessToken, undefined, {
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
}

/**
 * Monotonic activation fence: incremented on every deactivation/dispose. A
 * descriptor response (or its retry) is applied only while the activation that
 * started it is still the live intake — a delayed response from a retired
 * intake, including a restart on the SAME port, is discarded.
 */
let managedParentActivationSeq = 0;

interface ManagedParentActivation {
  readonly intake: DesktopLoopbackIntake;
  readonly client: RemoteDesktopClient;
  readonly endpoint: string;
  readonly seq: number;
  /** Single-flight: one descriptor resolution run per live activation. */
  descriptorRun: Promise<void> | null;
}

let managedParentActivation: ManagedParentActivation | null = null;

function isCurrentManagedParentActivation(activation: ManagedParentActivation): boolean {
  return (
    managedParentActivation === activation &&
    managedParentActivationSeq === activation.seq &&
    managedLoopback.intake === activation.intake &&
    activation.intake.isActive()
  );
}

/**
 * Read-only activation accessor (B4 S1 seam): the endpoint and the ONE
 * managed loopback client of the live activation, fenced by the same
 * activation sequence as the managed parent descriptor. The client instance
 * is stable across token rotation (rotation updates it in place), and no
 * second client/credential is ever created. Consumers get `null` while the
 * leg is down; a delayed callback from a retired activation can never observe
 * the successor's identity.
 */
export interface ManagedLoopbackActivationSnapshot {
  readonly seq: number;
  readonly endpoint: string;
  readonly client: RemoteDesktopClient;
}

let managedLoopbackActivation: ManagedLoopbackActivationSnapshot | null = null;
const managedLoopbackActivationListeners = new Set<
  (activation: ManagedLoopbackActivationSnapshot | null) => void
>();

export function readManagedLoopbackActivation(): ManagedLoopbackActivationSnapshot | null {
  return managedLoopbackActivation;
}

export function subscribeManagedLoopbackActivation(
  listener: (activation: ManagedLoopbackActivationSnapshot | null) => void,
): () => void {
  managedLoopbackActivationListeners.add(listener);
  return () => {
    managedLoopbackActivationListeners.delete(listener);
  };
}

function publishManagedLoopbackActivation(
  activation: ManagedLoopbackActivationSnapshot | null,
): void {
  managedLoopbackActivation = activation;
  for (const listener of [...managedLoopbackActivationListeners]) listener(activation);
}

/** Catalog-membership event types the managed root schedules a pass for. */
export type ManagedLoopbackMembershipEventType =
  | "remote-threads-changed"
  | "remote-projects-changed"
  | "resync-required";

const MANAGED_LOOPBACK_MEMBERSHIP_EVENT_TYPES = new Set<string>([
  "remote-threads-changed",
  "remote-projects-changed",
  "resync-required",
]);

const managedLoopbackMembershipListeners = new Set<
  (eventType: ManagedLoopbackMembershipEventType) => void
>();

/**
 * Narrow membership-event subscription for the managed root catalog (B4 S1).
 * Fed from the SAME intake dispatch the desktop event reducer consumes, so a
 * host membership broadcast schedules a follow-up bounded pass without a
 * second socket, a second client, or any renderer write. A delayed frame from
 * a retired intake cannot reach listeners because the intake stops dispatching
 * on dispose.
 */
export function subscribeManagedLoopbackMembershipEvents(
  listener: (eventType: ManagedLoopbackMembershipEventType) => void,
): () => void {
  managedLoopbackMembershipListeners.add(listener);
  return () => {
    managedLoopbackMembershipListeners.delete(listener);
  };
}

function publishManagedLoopbackMembershipEvent(type: unknown): void {
  if (typeof type !== "string" || !MANAGED_LOOPBACK_MEMBERSHIP_EVENT_TYPES.has(type)) return;
  for (const listener of [...managedLoopbackMembershipListeners]) {
    listener(type as ManagedLoopbackMembershipEventType);
  }
}

/**
 * Truthful manual retry for the managed root catalog: asks the loopback intake
 * to (re)start through the same discovery/bootstrap path the boot uses. It is
 * a no-op while an intake is already live.
 */
export function retryManagedLoopbackIntake(): void {
  cancelLoopbackDiscoveryRetry();
  void startDesktopLoopbackEventIntake();
}

const MANAGED_DESCRIPTOR_MAX_ATTEMPTS = 3;
const MANAGED_DESCRIPTOR_RETRY_DELAY_MS = 5_000;

/**
 * Resolve and publish the managed parent authority from the co-located
 * server's descriptor, over the SAME client that routes managed procedures.
 * The owner row and local routing are already installed before this runs, so a
 * descriptor failure never stops local work: it retries boundedly while the
 * activation is live, then records a truthful failure the UI can retry.
 */
async function runManagedParentDescriptorResolution(
  activation: ManagedParentActivation,
): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MANAGED_DESCRIPTOR_MAX_ATTEMPTS; attempt += 1) {
    if (!isCurrentManagedParentActivation(activation)) return;
    try {
      const descriptor = await activation.client.environment();
      if (!isCurrentManagedParentActivation(activation)) return;
      // B1: the advertised notice capability is a per-activation fact from
      // this descriptor; the managed root's bounded reads declare `notices=v1`
      // and its explicit recovery actions run only when this is true.
      noteRuntimeHistoryNoticesCapability(
        managedRootNoticeAuthority(activation.seq),
        environmentAdvertisesRuntimeHistoryNotices(descriptor),
      );
      // boundedCatalogChanges v1: re-record the endpoint verdict from the
      // activation's authoritative descriptor. Adoption itself already
      // happened on the preflight before this socket opened; this pass only
      // re-proves the fact and, when it now contradicts a LIVE declared
      // socket, re-opens that socket to DROP the declaration — never to adopt:
      // forcing a bounce while the authority is healthy would retire and
      // re-resolve the activation (the C1 single-flight/publish contract must
      // stay intact).
      const advertisesCatalogChanges = environmentAdvertisesBoundedCatalogChanges(descriptor);
      noteManagedLoopbackBoundedCatalogChangesVerdict(
        activation.endpoint,
        advertisesCatalogChanges,
      );
      const intake = managedLoopback.intake;
      if (intake && intake.boundedCatalogChangesDeclared() && !advertisesCatalogChanges) {
        intake.refreshCapabilityDeclaration();
      }
      publishManagedParentAuthority({
        hostDesktopId: descriptor.desktopId,
        endpoint: activation.endpoint,
        sshEnvironments: descriptor.capabilities?.sshEnvironments !== undefined,
        scopes: [...REMOTE_OPERATOR_SCOPES],
        client: activation.client,
        accessToken: () => activation.intake.getAccessToken() ?? undefined,
      });
      return;
    } catch (error) {
      if (!isCurrentManagedParentActivation(activation)) return;
      lastError = error;
    }
    if (attempt < MANAGED_DESCRIPTOR_MAX_ATTEMPTS - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(
          resolve,
          managedLoopbackTestSeams.descriptorRetryMs ?? MANAGED_DESCRIPTOR_RETRY_DELAY_MS,
        );
      });
    }
  }
  if (!isCurrentManagedParentActivation(activation)) return;
  failManagedParentAuthority(
    lastError instanceof Error && lastError.message
      ? lastError.message
      : i18n._(linguiMsg`Unable to verify the desktop's own server.`),
  );
}

/**
 * Single-flight per activation: boot and every manual retry coalesce onto one
 * resolution run, so a second retry can neither start a competing loop nor let
 * a stale loop's terminal failure clobber a fresh `ready` publish from a
 * successful sibling. A retired activation's run is fenced by
 * {@link isCurrentManagedParentActivation} before either publish or failure.
 */
function resolveManagedParentDescriptor(activation: ManagedParentActivation): Promise<void> {
  activation.descriptorRun ??= runManagedParentDescriptorResolution(activation).finally(() => {
    activation.descriptorRun = null;
  });
  return activation.descriptorRun;
}

/**
 * Truthful manual retry: joins/restarts the single resolution run for the live
 * activation (no-op once the leg is down; the next activation resolves its
 * own). The failure surface shows the in-flight retry instead of accepting a
 * competing one.
 */
export function retryManagedParentDescriptor(): void {
  const activation = managedParentActivation;
  if (!activation || !isCurrentManagedParentActivation(activation)) return;
  markManagedParentRetrying();
  void resolveManagedParentDescriptor(activation);
}

export function attachManagedLoopbackPreload(transport: PreloadIpcTransport): void {
  managedLoopback.transport = transport;
}

/**
 * Routes one remote-routable managed request over the loopback HTTP leg.
 * Returns `undefined` only for procedures that are not the loopback leg's to
 * execute (non-passthrough handlers resolving local, and the not-current-leg
 * gate checked by `shouldRouteManagedLoopbackRequest`). V6 B.6: transport
 * failures are not retried over preload IPC — the loopback HTTP leg is the
 * only data plane for these names.
 *
 * The composed host is read from the router registration — the same object
 * the router selects for managed-owned routes from the bridge — so request
 * and terminal routing share exactly one composed host and one client per
 * activation (no per-reconnect wrappers).
 */
function routeManagedLoopbackRequest(
  name: IpcProcedureName,
  args: unknown[],
): Promise<unknown> | undefined {
  const registration = readManagedLoopbackProcedureHost();
  if (!registration?.isCurrent()) return undefined;
  const payload = parseIpcProcedureArgs(name, args);
  const stamped = stampRemoteOwnerOntoPayload(
    payload,
    MANAGED_LOOPBACK_DESKTOP_ID,
  ) as typeof payload;
  const decision = routeRemoteProcedure(name, stamped, registration.host);
  if (decision.kind === "remote") return decision.result;
  return executeLocalResolvingPassthrough(registration, name, payload);
}

/**
 * A routable name whose stamped payload still resolves LOCAL (no owner in the
 * payload: the skills page's global `{}` scan, `owner: "none"` shapes) has no
 * stamped route — and preload deliberately refuses every routable name, so
 * without an executor here the call has no data plane at all. For PASSTHROUGH
 * handlers the co-located server IS this desktop's supervisor authority, so
 * the call executes there over the SAME client the stamped path uses, with
 * the ORIGINAL unstamped payload — byte-identical to what the stamped path
 * puts on the wire (the router strips the stamp it added). Non-passthrough
 * handlers (adapter / clipboard / handoff / shell) keep their existing
 * ownership and return `undefined` (preload refusal, unchanged). Failures
 * propagate raw (the composed host's lean managed branch never wraps), so a
 * loopback HTTP failure is never retried over IPC.
 */
function executeLocalResolvingPassthrough(
  registration: ManagedLoopbackProcedureHostRegistration,
  name: IpcProcedureName,
  payload: unknown,
): Promise<unknown> | undefined {
  if (!isPassthroughRemoteProcedure(name)) return undefined;
  return registration.host.withClient(registration.desktopId, (client) =>
    client.callRemoteProcedure(name, payload),
  );
}

function shouldRouteManagedLoopbackRequest(name: IpcProcedureName): boolean {
  return (
    isRemoteRoutableProcedure(name) && readManagedLoopbackProcedureHost()?.isCurrent() === true
  );
}

/**
 * Starts the managed window's loopback intake (V5 plan 2.5, completed by the
 * always-on guarantee). Fire-and-forget: main mints this launch's attach
 * payload at readiness (`getManagedLoopbackBootstrap`), so the first ask
 * normally succeeds; until then (backend still starting) discovery retries in
 * the background. V6 B.6: there is no IPC event/PTY/non-shell request
 * fallback — the window has no live data plane until this intake is active.
 *
 * A4 escalation: transport-class failures retry inside the intake with the
 * shared local policy; only an exhausted local retry budget or a rejected
 * pairing credential re-resolves the bootstrap (port rediscovery / fresh
 * credential) through a fresh call to this function. A transport hiccup no
 * longer disposes the leg and waits out a discovery interval.
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
  // A1: the renderer interest registry is loaded lazily for the same reason —
  // it reads the bridge, which evaluates the client runtime, which imports this
  // barrel (module-scope import would close the evaluation cycle, V6 B.1).
  const eventInterests = await import("@/renderer/state/rendererEventInterests");
  let intake: DesktopLoopbackIntake | null = null;
  const recoverIntake = (): void => {
    if (managedLoopback.intake !== intake || intake === null) return;
    intake.dispose();
    managedLoopback.intake = null;
    intake = null;
    void startDesktopLoopbackEventIntake();
  };
  intake = new DesktopLoopbackIntake({
    endpoint,
    pairingToken,
    ...(managedLoopbackTestSeams.socketFactory
      ? { socketFactory: managedLoopbackTestSeams.socketFactory }
      : {}),
    ...(managedLoopbackTestSeams.retryDelayMs !== undefined
      ? { retryDelayMs: managedLoopbackTestSeams.retryDelayMs }
      : {}),
    ...(managedLoopbackTestSeams.preflightTimeoutMs !== undefined
      ? { preflightTimeoutMs: managedLoopbackTestSeams.preflightTimeoutMs }
      : {}),
    readItemInterests: () => eventInterests.snapshotRendererEventInterests().runtimeThreadIds,
    subscribeItemInterests: (listener) => eventInterests.subscribeRendererEventInterests(listener),
    onItemInterestsTruncated: (droppedCount) => {
      // Truthful window-local capacity state (A1): the thread surface shows the
      // overload with recovery guidance instead of a console-only warning, and
      // the state clears as soon as the wire carries every retained thread.
      useLiveStreamCapacityStore.getState().setDroppedRuntimeThreadCount(droppedCount);
    },
    onItemInterestsApplied: (threadIds) => {
      // The registry's only wire-coverage input: a lease's `continuous` must
      // never claim coverage the bounded array did not carry.
      eventInterests.noteRendererEventInterestWireCoverage(threadIds);
    },
    onCredentialExhausted: recoverIntake,
    onRecoveryExhausted: recoverIntake,
    dispatch: (event, seq, space) => {
      // Catalog membership rides the same dispatch as the desktop reducer:
      // the root adapter schedules a bounded follow-up pass, never a write.
      publishManagedLoopbackMembershipEvent(event.type);
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
    requestRebuild: (threadIds) => transport.rebuildSubscribedState(threadIds),
    onActiveChanged: (active) => {
      const owner = intake;
      if (!owner) return;
      if (active) {
        cancelLoopbackDiscoveryRetry();
        // Terminal leg first: watchers switch to the feed before the
        // transport's rebuild dispatch runs (the baseline supersedes the
        // resync on activation).
        feed.setManagedLoopbackTerminalLeg(true);
        transport.setLoopbackActive(true);
        const accessToken = owner.getAccessToken();
        if (accessToken) {
          const client = createManagedLoopbackClient(endpoint, accessToken, owner);
          const procedureHost = createManagedLoopbackProcedureHost(
            client,
            readRegisteredRemoteProcedureHost(),
          );
          // One composed host per activation, shared by the transport request
          // path and the router's managed-owned routes. The fence is the
          // live intake, so a retired registration can never serve a request.
          registerManagedLoopbackProcedureHost({
            desktopId: MANAGED_LOOPBACK_DESKTOP_ID,
            host: procedureHost,
            isCurrent: () => managedLoopback.intake === owner && owner.isActive(),
          });
          setManagedLoopbackOwnerRow({
            endpoint,
            accessToken,
            scopes: [...REMOTE_OPERATOR_SCOPES],
          });
          // Activation fence captured BEFORE the await; publication after the
          // await requires the same intake, still active, same sequence.
          const activation: ManagedParentActivation = {
            intake: owner,
            client,
            endpoint,
            seq: managedParentActivationSeq,
            descriptorRun: null,
          };
          managedParentActivation = activation;
          publishManagedLoopbackActivation({
            seq: activation.seq,
            endpoint,
            client,
          });
          void resolveManagedParentDescriptor(activation);
        }
      } else {
        feed.setManagedLoopbackTerminalLeg(false);
        transport.setLoopbackActive(false);
        registerManagedLoopbackProcedureHost(null);
        publishManagedLoopbackActivation(null);
        // The retired activation's notice capability is not inherited by a
        // successor: a restarted leg proves it again from its own descriptor.
        const retiring = managedParentActivation;
        if (retiring) {
          forgetRuntimeHistoryNoticesCapability(managedRootNoticeAuthority(retiring.seq));
        }
        // F5: neither is its bounded-catalog adoption — the successor proves
        // the capability again from its own preflight before it may declare.
        clearManagedLoopbackBoundedCatalogChangesAdoption();
        managedParentActivation = null;
        managedParentActivationSeq += 1;
        clearManagedParentAuthority();
        clearManagedLoopbackOwnerRow();
        // A4: deactivation is not an escalation signal. The intake retries
        // transport-class failures locally with the shared policy, and only a
        // rejected credential or an exhausted local budget calls back into
        // `recoverIntake` for a fresh bootstrap.
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
    // The declaration gate reads the endpoint adoption recorded by the
    // authenticated descriptor preflight plus the installed bounded consumer.
    // The preflight runs before every ticket mint/upgrade, so each upgrade
    // consults the endpoint's freshest verdict; deactivation clears the
    // adoption, so a successor activation on the same endpoint cannot inherit
    // its predecessor's declaration before proving it again.
    declaresBoundedCatalogChanges: (endpointUrl) =>
      isBoundedCatalogControllerConfigured() &&
      managedLoopbackBoundedCatalogChangesAdopted(endpointUrl),
    // F1: resolve the endpoint descriptor on the authenticated HTTP leg BEFORE
    // the first ticket/open (and before every later reconnect's upgrade), so a
    // capable host's first socket declares the payload-less signal instead of
    // waiting out a reconnect. The preflight creates no activation and
    // publishes no authority — the C1 single-flight descriptor run stays the
    // only activation resolver. Failures are swallowed by the intake: the
    // socket opens with the currently recorded facts and the activation's own
    // descriptor resolution remains authoritative.
    preflightBoundedCatalogChanges: async ({ base, accessToken, timeoutMs, signal }) => {
      const descriptor = await new RemoteDesktopClient(base, accessToken, undefined, {
        requestTimeoutMs: timeoutMs,
      }).environment();
      if (signal.aborted) return;
      noteManagedLoopbackBoundedCatalogChangesVerdict(
        endpoint,
        environmentAdvertisesBoundedCatalogChanges(descriptor),
      );
    },
    // A private resync-required frame covers both the shared stream restart and
    // a catalog change the host could not deliver on this socket: restart the
    // bounded catalog passes through the existing membership seam (the
    // adapter's resync branch) in addition to the subscribed-thread rebuild.
    onResyncRequired: () => publishManagedLoopbackMembershipEvent("resync-required"),
  });
  managedLoopback.intake = intake;
  // A4: activation failure is not terminal. The intake owns its bounded local
  // retry (and reports credential exhaustion / recovery exhaustion through
  // `recoverIntake`), so the wiring does not dispose it here.
  await intake.activate();
}

function scheduleLoopbackDiscoveryRetry(): void {
  if (managedLoopback.discoveryTimer || managedLoopback.intake) return;
  managedLoopback.discoveryTimer = setTimeout(() => {
    managedLoopback.discoveryTimer = null;
    void startDesktopLoopbackEventIntake();
  }, managedLoopbackTestSeams.discoveryRetryMs ?? LOOPBACK_DISCOVERY_RETRY_MS);
  managedLoopback.discoveryTimer.unref?.();
}

function cancelLoopbackDiscoveryRetry(): void {
  if (!managedLoopback.discoveryTimer) return;
  clearTimeout(managedLoopback.discoveryTimer);
  managedLoopback.discoveryTimer = null;
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
  registerManagedLoopbackProcedureHost(null);
  publishManagedLoopbackActivation(null);
  managedParentActivation = null;
  managedParentActivationSeq += 1;
  clearManagedParentAuthority();
  resetLiveStreamCapacityStore();
  clearManagedLoopbackOwnerRow();
  __resetBoundedCatalogChangesCapabilityForTest();
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
