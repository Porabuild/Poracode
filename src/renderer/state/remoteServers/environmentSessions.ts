import { environmentProxyPrefix } from "@/shared/environments";
import {
  environmentImageRefKey,
  environmentLocalImageKey,
} from "@/shared/remote/clientEnvironmentImages";
import {
  RemoteEnvironmentClient,
  type RemoteEnvironmentParentAuthority,
} from "@/shared/remote/clientEnvironments";
import { endpointUrl } from "@/shared/remote/clientTypes";
import type { RemoteImageRefValue } from "@/shared/remote";
import type { RemoteDesktopClient, RemoteDesktopClientOptions } from "@/shared/remote/client";
import { electronCertFingerprintProbe } from "./certFingerprintProbe";
import { mainProcessFetch } from "./mainProcessFetch";
import {
  acquireRefreshSubjectOwnership,
  ensureConnectionIncarnation,
  managedEnvironmentRefreshSubject,
  ownsConnectionIncarnation,
  ownsRefreshSubject,
  refreshSubjectVaultKey,
  releaseRefreshSubjectOwnership,
  remoteEnvironmentRefreshSubject,
  revokeConnectionIncarnation,
  type RefreshSubject,
} from "./refreshTokens";
import { getManagedParentAuthority, type ManagedParentAuthority } from "./managedLoopbackOwner";
import {
  environmentParentCacheKey,
  environmentParentRef,
  isEnvironmentServer,
  remoteConnectionKey,
  type EnvironmentParentRef,
  type RemoteEnvironmentImageTarget,
  type RemoteEnvironmentTransport,
  type RemoteServerRecord,
  type RemoteServersState,
} from "./types";

/**
 * Renderer-owned long-lived environment sessions (C1.3b, design §3.2 / R1–R2).
 *
 * - One long-lived client per parent authority. A persisted remote parent uses
 *   the existing per-connection client with the refresh lifecycle attached; a
 *   managed parent reuses the SAME live client the loopback procedure host
 *   routes with (no second client, no vault lifecycle, no persisted bearer).
 *   `ensureLive()` is single-flight per parent, so N environments coalesce
 *   onto one refresh.
 * - One child client per environment record, keyed by the record's local
 *   `connectionId`, with the CHILD lifecycle under the parent-scoped grant
 *   subject (`environmentRefresh.<parent>.<envId>` for a remote parent,
 *   `managedEnvironment.<hostDesktopId>.<envId>` for the managed parent) and
 *   the PARENT TLS pin (remote parents only). Grant ownership is fenced: a
 *   delayed rotation from a replaced/removed session can never write.
 * - A session is rebuilt when its endpoint, child token, parent endpoint,
 *   parent identity, or the parent's approved TLS pin changes (re-pair, parent
 *   transport reconnect); the old client is disposed (in-flight images aborted,
 *   object URLs revoked) and its grant ownership released. An ordinary parent
 *   token rotation changes nothing (the live token is read dynamically per
 *   request).
 * - The persisted parent session is coupled to its connection record: removal
 *   disposes it with the deleted grant, and an explicit re-pair (direct, SSH,
 *   standalone attach) disposes it before the new credential lands, so the new
 *   pin/token are adopted and a delayed rotation from the retired pairing is
 *   inert in both memory and the vault.
 * - The parent ref is structurally discriminated: a connection ref resolves a
 *   direct/ssh record (environment parents still refused, R4 stable); a
 *   managed ref resolves only the live authority. Both/neither/malformed
 *   parents fail closed before any dial.
 * - Child sessions are independently repairable: disposing one never touches
 *   the parent authority, grant, or pin.
 */

export interface EnvironmentSessionDependencies {
  readonly getState: () => RemoteServersState;
  readonly clientFactory: () => RemoteDesktopClientFactory;
  readonly certPinForConnection: (connectionKey: string) => string | undefined;
  readonly refreshTokenForSubject: (subject: RefreshSubject) => string | undefined;
  readonly rememberRefreshToken: (subject: RefreshSubject, token: string) => void;
  readonly writeRefreshTokenToVault: (
    subject: RefreshSubject,
    token: string,
    owner?: symbol,
  ) => Promise<boolean>;
  readonly deleteRefreshTokenFromVault: (subject: RefreshSubject) => Promise<void>;
  /** Test seam; defaults to the production Electron/browser fetch + pin probe. */
  readonly createEnvironmentClient?: (
    endpoint: string,
    accessToken: string | undefined,
    options: EnvironmentClientOptions,
  ) => RemoteEnvironmentClient;
}

type RemoteDesktopClientFactory = (endpoint: string, accessToken?: string) => RemoteDesktopClient;

interface EnvironmentClientOptions extends RemoteDesktopClientOptions {
  readonly environmentId: string;
  readonly childDesktopId?: string;
  readonly parentAuthority: RemoteEnvironmentParentAuthority;
}

let dependencies: EnvironmentSessionDependencies | null = null;

export function configureEnvironmentSessions(next: EnvironmentSessionDependencies): void {
  dependencies = next;
}

function deps(): EnvironmentSessionDependencies {
  if (!dependencies) {
    throw new Error("Environment sessions are not configured.");
  }
  return dependencies;
}

/**
 * The typed child-grant custody subject for a persisted environment transport,
 * or `undefined` when the parent discriminator is invalid (fail closed).
 * Remote parents keep their own root outside `refresh.`, so no direct
 * connection id — including one shaped like the legacy grant key — can address
 * a remote environment grant.
 */
export function environmentChildGrantSubject(
  transport: RemoteEnvironmentTransport,
): RefreshSubject | undefined {
  const ref = environmentParentRef(transport);
  if (!ref) return undefined;
  return ref.kind === "connection"
    ? remoteEnvironmentRefreshSubject(ref.connectionId, transport.environmentId)
    : managedEnvironmentRefreshSubject(ref.hostDesktopId, transport.environmentId);
}

/** Vault slot of an environment's child grant (display/tests). */
export function environmentChildGrantKey(
  transport: RemoteEnvironmentTransport,
): string | undefined {
  const subject = environmentChildGrantSubject(transport);
  return subject ? refreshSubjectVaultKey(subject) : undefined;
}

export function environmentProxyEndpoint(parentEndpoint: string, environmentId: string): string {
  return endpointUrl(parentEndpoint, environmentProxyPrefix(environmentId)).toString();
}

export function environmentImageKeyForTarget(target: RemoteEnvironmentImageTarget): string {
  return target.kind === "ref"
    ? environmentImageRefKey(target.ref)
    : environmentLocalImageKey(target.path);
}

function findServer(connectionKey: string): RemoteServerRecord | undefined {
  return deps()
    .getState()
    .servers.find((server) => remoteConnectionKey(server) === connectionKey);
}

/** A persisted direct/ssh parent record for a connection ref, never an
 * environment record (no second proxy hop, R4). */
function directParentFor(ref: EnvironmentParentRef): RemoteServerRecord | undefined {
  if (ref.kind !== "connection") return undefined;
  const parent = findServer(ref.connectionId);
  if (!parent || isEnvironmentServer(parent)) return undefined;
  return parent;
}

/**
 * The live managed authority for a managed ref. The parent transport object is
 * reused as the authority cell: a delayed callback only writes while the very
 * same authority object is still published.
 */
function managedParentFor(ref: EnvironmentParentRef): ManagedParentAuthority | undefined {
  if (ref.kind !== "managed") return undefined;
  return getManagedParentAuthority(ref) ?? undefined;
}

/** Resolved parent endpoint, or `undefined` when the parent is not live. */
export function environmentParentEndpointFor(ref: EnvironmentParentRef): string | undefined {
  if (ref.kind === "connection") return directParentFor(ref)?.endpoint;
  return managedParentFor(ref)?.endpoint;
}

/** Live long-lived parent client for a ref (managed: the shared routing
 * client), or `undefined`. Used by management actions and ticket mints. */
export function parentClientFor(ref: EnvironmentParentRef): RemoteDesktopClient | undefined {
  if (ref.kind === "connection") {
    const parent = directParentFor(ref);
    return parent ? parentSessionFor(parent).client : undefined;
  }
  return managedParentFor(ref)?.client;
}

interface PersistedParentSession {
  readonly kind: "connection";
  readonly refKey: string;
  readonly connectionKey: string;
  readonly client: RemoteDesktopClient;
  readonly endpoint: string;
  /** The connection incarnation this client's rotation belongs to; a
   * re-pair replaces it, so a delayed writer of the retired pairing is inert. */
  readonly incarnation: symbol;
  accessToken: string;
  ensureLive: Promise<void> | null;
}

interface ManagedParentSession {
  readonly kind: "managed";
  readonly refKey: string;
  readonly authority: ManagedParentAuthority;
  ensureLive: Promise<void> | null;
}

type ParentSession = PersistedParentSession | ManagedParentSession;

const parentSessions = new Map<string, ParentSession>();

/** Long-lived parent-authority client for one direct/ssh connection. */
export function parentClientForConnection(connectionKey: string): RemoteDesktopClient | undefined {
  const ref: EnvironmentParentRef = { kind: "connection", connectionId: connectionKey };
  return parentClientFor(ref);
}

function parentSessionFor(server: RemoteServerRecord): PersistedParentSession {
  const connectionKey = remoteConnectionKey(server);
  const refKey = environmentParentCacheKey({ kind: "connection", connectionId: connectionKey });
  const existing = parentSessions.get(refKey);
  if (existing?.kind === "connection" && existing.endpoint === server.endpoint) {
    // Keep the session's live token: the persisted record's access token may
    // predate a rotation.
    return existing;
  }
  const api = deps();
  // The connection incarnation is shared with every other legitimate writer of
  // `refresh.<connectionId>` (the per-request store clients), so acquiring it
  // here never revokes a live client's valid rotation; a re-pair replaces it.
  const incarnation = ensureConnectionIncarnation(connectionKey);
  const client = api.clientFactory()(server.endpoint, server.accessToken);
  const session: PersistedParentSession = {
    kind: "connection",
    refKey,
    connectionKey,
    client,
    endpoint: server.endpoint,
    incarnation,
    accessToken: server.accessToken,
    ensureLive: null,
  };
  client.setTokenLifecycle({
    refreshToken: () =>
      api.refreshTokenForSubject({ kind: "connection", connectionId: connectionKey }),
    onTokensRefreshed: (tokens) => {
      // Origin fence: a delayed rotation from a replaced session or a retired
      // connection incarnation never updates the live token or the grant.
      if (parentSessions.get(refKey) !== session) return;
      if (!ownsConnectionIncarnation(connectionKey, incarnation)) return;
      session.accessToken = tokens.accessToken;
      if (tokens.refreshToken !== undefined) {
        api.rememberRefreshToken(
          { kind: "connection", connectionId: connectionKey },
          tokens.refreshToken,
        );
        void api.writeRefreshTokenToVault(
          { kind: "connection", connectionId: connectionKey },
          tokens.refreshToken,
          incarnation,
        );
      } else {
        void api.deleteRefreshTokenFromVault({
          kind: "connection",
          connectionId: connectionKey,
        });
      }
    },
  });
  const pin = api.certPinForConnection(connectionKey);
  if (pin) client.setCertFingerprintPin(pin);
  parentSessions.set(refKey, session);
  return session;
}

/**
 * Disposes the long-lived parent-authority client of one direct/ssh connection
 * and retires the connection incarnation its writers were fenced by. Removal
 * calls this with the deleted grant; an explicit re-pair calls it BEFORE the
 * new credential/record commit (direct, SSH, and standalone attach all pair
 * through `pairAtEndpoint`). A delayed rotation from the retired client can
 * then neither update the live token, resurrect a removed grant, nor overwrite
 * the newly paired one; the next lookup builds a client from the current record
 * with its current pin and token.
 */
export function disposeEnvironmentParentSession(connectionKey: string): void {
  const refKey = environmentParentCacheKey({ kind: "connection", connectionId: connectionKey });
  const session = parentSessions.get(refKey);
  if (session?.kind === "connection") {
    // The client has no explicit dispose: dropping the registered entry is
    // what makes every captured callback inert (the callback also fails the
    // incarnation check after the revocation below).
    session.ensureLive = null;
    parentSessions.delete(refKey);
  }
  revokeConnectionIncarnation(connectionKey);
}

function managedParentSessionFor(authority: ManagedParentAuthority): ManagedParentSession {
  const refKey = environmentParentCacheKey(authority.ref);
  const existing = parentSessions.get(refKey);
  if (existing?.kind === "managed" && existing.authority === authority) return existing;
  const session: ManagedParentSession = { kind: "managed", refKey, authority, ensureLive: null };
  parentSessions.set(refKey, session);
  return session;
}

/**
 * Single-flight parent refresh, coalesced on the session object so concurrent
 * calls from N environments share one rotation. The managed branch drives the
 * SAME routing client's refresh (its lifecycle writes the intake and owner
 * row, fenced by activation identity).
 */
async function ensureParentLive(ref: EnvironmentParentRef): Promise<void> {
  const session = ensureParentSession(ref);
  if (!session) {
    throw new Error("The paired server that owns this environment is not connected.");
  }
  session.ensureLive ??= (
    session.kind === "connection"
      ? session.client.refreshTokens().then((tokens) => {
          if (!tokens) {
            throw new Error("The paired server's grant could not be renewed.");
          }
          session.accessToken = tokens.accessToken;
        })
      : session.authority.client.refreshTokens().then((tokens) => {
          if (!tokens) {
            throw new Error("The paired server's grant could not be renewed.");
          }
        })
  ).finally(() => {
    session.ensureLive = null;
  });
  return session.ensureLive;
}

function ensureParentSession(ref: EnvironmentParentRef): ParentSession | undefined {
  if (ref.kind === "connection") {
    const parent = directParentFor(ref);
    return parent ? parentSessionFor(parent) : undefined;
  }
  const authority = managedParentFor(ref);
  return authority ? managedParentSessionFor(authority) : undefined;
}

function parentAuthorityFor(
  ref: EnvironmentParentRef,
  environmentId: string,
): RemoteEnvironmentParentAuthority | undefined {
  if (ref.kind === "connection") {
    const session = ensureParentSession(ref);
    if (!session || session.kind !== "connection") return undefined;
    const refKey = session.refKey;
    return {
      accessToken: () => {
        const current = parentSessions.get(refKey);
        if (current?.kind === "connection") return current.accessToken;
        // No live session (never built, or retired by an explicit re-pair that
        // is committing the new record): the persisted record's bearer is the
        // current pairing's token until the next lookup rebuilds the client.
        return directParentFor(ref)?.accessToken;
      },
      ensureLive: () => ensureParentLive(ref),
      mintWebSocketTicket: async () => {
        const parent = parentClientForConnection(ref.connectionId);
        if (!parent) {
          throw new Error("The paired server that owns this environment is not connected.");
        }
        return parent.environmentWebSocketTicket(environmentId);
      },
    };
  }
  if (!managedParentFor(ref)) return undefined;
  return {
    // Always resolve the CURRENT authority for this ref: a rotation or a
    // same-identity republish never leaves a session holding a retired
    // authority object or a retired credential.
    accessToken: () => {
      const current = managedParentFor(ref);
      return current ? current.accessToken() : undefined;
    },
    ensureLive: () => ensureParentLive(ref),
    mintWebSocketTicket: async () => {
      const current = managedParentFor(ref);
      if (!current) {
        throw new Error("The desktop's own server is not connected.");
      }
      return current.client.environmentWebSocketTicket(environmentId);
    },
  };
}

export interface EnvironmentClientSession {
  readonly connectionKey: string;
  readonly client: RemoteEnvironmentClient;
  readonly parentAuthority: RemoteEnvironmentParentAuthority;
  readonly childGrantKey: string;
  dispose(): void;
}

interface CachedEnvironmentSession {
  readonly fingerprint: string;
  readonly session: EnvironmentClientSession;
}

const environmentSessions = new Map<string, CachedEnvironmentSession>();

/**
 * The parent's currently approved certificate pin. Persisted (direct/ssh)
 * parents carry the pin captured at pairing; a managed parent is pinless by
 * construction — its loopback authority is the same machine and never consults
 * the pin store.
 */
function approvedParentPin(ref: EnvironmentParentRef): string | undefined {
  return ref.kind === "connection" ? deps().certPinForConnection(ref.connectionId) : undefined;
}

/**
 * Identity of a child session: connection key, the record's own endpoint and
 * child bearer, the verified child identity, the discriminated parent identity,
 * the live parent endpoint, and the parent's currently approved TLS pin. The
 * child client captures the pin at construction, so a re-pair that replaces,
 * adds, or removes it must rebuild the child instead of serving the stale pin.
 * The parent's LIVE access token is deliberately excluded — the child client
 * attaches it dynamically per request (`authorityFor.accessToken()`), so a
 * parent rotation must not dispose the child cache or drop mounted image
 * subscribers.
 */
function environmentSessionFingerprint(
  server: RemoteServerRecord,
  ref: EnvironmentParentRef,
  parentEndpoint: string,
): string {
  return [
    remoteConnectionKey(server),
    server.endpoint,
    server.accessToken,
    server.transport?.kind === "environment" ? (server.transport.childDesktopId ?? "") : "",
    environmentParentCacheKey(ref),
    parentEndpoint,
    approvedParentPin(ref) ?? "",
  ].join("\u0000");
}

interface EnvironmentClientInput {
  readonly parent: EnvironmentParentRef;
  readonly environmentId: string;
  readonly childDesktopId?: string;
  readonly endpoint: string;
  readonly accessToken?: string;
  /** Existing grant owner (a session rebuild keeps its own fence). */
  readonly grantOwner?: symbol;
}

/**
 * Builds an environment client with the parent authority, parent pin, and the
 * child grant lifecycle attached. Used by the session registry and by the
 * pairing action (which has no record yet).
 *
 * The grant lifecycle is fenced by ownership: the callback captures the owner
 * symbol and the client object, so a delayed rotation from a disposed client —
 * or from a client replaced at the same grant key — is inert. The caller owns
 * the returned `grantOwner`; releasing it (usually on dispose) hands the fence
 * to the next legitimate writer.
 */
export function createEnvironmentClientForPairing(input: EnvironmentClientInput):
  | {
      readonly client: RemoteEnvironmentClient;
      readonly parentAuthority: RemoteEnvironmentParentAuthority;
      readonly childGrantSubject: RefreshSubject;
      readonly childGrantKey: string;
      readonly grantOwner: symbol;
    }
  | undefined {
  const ref = input.parent;
  const parentEndpoint = environmentParentEndpointFor(ref);
  if (parentEndpoint === undefined) return undefined;
  if (ref.kind === "connection") {
    const parent = directParentFor(ref);
    if (!parent) return undefined;
    parentSessionFor(parent);
  }
  const api = deps();
  const grantSubject =
    ref.kind === "connection"
      ? remoteEnvironmentRefreshSubject(ref.connectionId, input.environmentId)
      : managedEnvironmentRefreshSubject(ref.hostDesktopId, input.environmentId);
  const parentAuthority = parentAuthorityFor(ref, input.environmentId);
  if (!parentAuthority) return undefined;
  const grantOwner = input.grantOwner ?? acquireRefreshSubjectOwnership(grantSubject);
  const parentPin = approvedParentPin(ref);
  const options: EnvironmentClientOptions = {
    environmentId: input.environmentId,
    parentAuthority,
    ...(input.childDesktopId !== undefined ? { childDesktopId: input.childDesktopId } : {}),
    ...(parentPin !== undefined ? { certFingerprint: parentPin } : {}),
  };
  const client = api.createEnvironmentClient
    ? api.createEnvironmentClient(input.endpoint, input.accessToken, options)
    : createDefaultEnvironmentClient(input.endpoint, input.accessToken, options);
  const childGrantKey = refreshSubjectVaultKey(grantSubject);
  client.setTokenLifecycle({
    refreshToken: () => api.refreshTokenForSubject(grantSubject),
    onTokensRefreshed: (tokens) => {
      // Origin fence: only the client that still owns this grant may write,
      // and a disposal between response and write leaves the successor's
      // grant untouched (including an explicit re-pair at the same endpoint).
      if (!ownsRefreshSubject(grantSubject, grantOwner)) return;
      if (tokens.refreshToken !== undefined) {
        api.rememberRefreshToken(grantSubject, tokens.refreshToken);
        void api.writeRefreshTokenToVault(grantSubject, tokens.refreshToken, grantOwner);
      } else {
        void api.deleteRefreshTokenFromVault(grantSubject);
      }
    },
  });
  return { client, parentAuthority, childGrantSubject: grantSubject, childGrantKey, grantOwner };
}

/** Release a grant fence acquired by {@link createEnvironmentClientForPairing}
 * (no-op when a successor already owns the subject). */
export function releaseEnvironmentChildGrant(subject: RefreshSubject, owner: symbol): void {
  releaseRefreshSubjectOwnership(subject, owner);
}

/**
 * Keyed readiness subscriptions survive a genuine session rebuild. A rebuild
 * (parent endpoint or approved pin change, re-pair, record bearer or child
 * identity change) disposes the previous client — clearing its listeners and
 * cache — so every mounted subscriber is rebound to the replacement client and
 * re-requested, then notified to re-read. `useSyncExternalStore` snapshots
 * stay pure: the notification is scheduled outside the read that triggered the
 * rebuild.
 */
interface EnvironmentImageBinding {
  /** `null` until a child session exists (e.g. the parent is still offline). */
  client: RemoteEnvironmentClient | null;
  readonly listener: () => void;
  readonly target: RemoteEnvironmentImageTarget | undefined;
  unsubscribe: () => void;
}

const environmentImageBindings = new Map<string, Map<string, Set<EnvironmentImageBinding>>>();

function requestBinding(binding: EnvironmentImageBinding): void {
  if (!binding.target || !binding.client) return;
  if (binding.target.kind === "ref") {
    binding.client.imageRefResolution(binding.target.ref);
  } else {
    binding.client.localImageResolution(binding.target.path);
  }
}

function bindImageListener(
  connectionKey: string,
  key: string,
  listener: () => void,
  target: RemoteEnvironmentImageTarget | undefined,
  client: RemoteEnvironmentClient | null,
): EnvironmentImageBinding {
  const binding: EnvironmentImageBinding = {
    client,
    listener,
    target,
    unsubscribe: client ? client.subscribeImageKey(key, listener) : () => undefined,
  };
  let byKey = environmentImageBindings.get(connectionKey);
  if (!byKey) {
    byKey = new Map();
    environmentImageBindings.set(connectionKey, byKey);
  }
  let bindings = byKey.get(key);
  if (!bindings) {
    bindings = new Set();
    byKey.set(key, bindings);
  }
  bindings.add(binding);
  return binding;
}

function unbindImageListener(
  connectionKey: string,
  key: string,
  binding: EnvironmentImageBinding,
): void {
  const byKey = environmentImageBindings.get(connectionKey);
  const bindings = byKey?.get(key);
  if (bindings) {
    bindings.delete(binding);
    if (bindings.size === 0) byKey?.delete(key);
  }
  if (byKey && byKey.size === 0) environmentImageBindings.delete(connectionKey);
  binding.unsubscribe();
}

function rebindEnvironmentImageListeners(
  connectionKey: string,
  client: RemoteEnvironmentClient,
): void {
  const byKey = environmentImageBindings.get(connectionKey);
  if (!byKey || byKey.size === 0) return;
  const rebound: EnvironmentImageBinding[] = [];
  for (const [key, bindings] of byKey) {
    for (const binding of bindings) {
      if (binding.client === client) continue;
      binding.unsubscribe();
      binding.client = client;
      binding.unsubscribe = client.subscribeImageKey(key, binding.listener);
      requestBinding(binding);
      rebound.push(binding);
    }
  }
  if (rebound.length === 0) return;
  queueMicrotask(() => {
    for (const binding of rebound) binding.listener();
  });
}

function forgetEnvironmentImageBindings(connectionKey: string): void {
  const byKey = environmentImageBindings.get(connectionKey);
  if (!byKey) return;
  environmentImageBindings.delete(connectionKey);
  for (const bindings of byKey.values()) {
    for (const binding of bindings) binding.unsubscribe();
  }
}

/**
 * The long-lived child client for one environment record, or `undefined` when
 * the record is not an environment, its parent ref is malformed/absent, or the
 * parent is itself an environment (nested proxy refused by construction).
 */
export function environmentSessionForServer(
  server: RemoteServerRecord,
): EnvironmentClientSession | undefined {
  const transport = server.transport;
  if (!transport || transport.kind !== "environment") return undefined;
  const ref = environmentParentRef(transport);
  if (!ref) return undefined;
  const parentEndpoint = environmentParentEndpointFor(ref);
  if (parentEndpoint === undefined) return undefined;
  const connectionKey = remoteConnectionKey(server);
  const fingerprint = environmentSessionFingerprint(server, ref, parentEndpoint);
  const existing = environmentSessions.get(connectionKey);
  if (existing?.fingerprint === fingerprint) return existing.session;

  existing?.session.dispose();
  const endpoint = environmentProxyEndpoint(parentEndpoint, transport.environmentId);
  const created = createEnvironmentClientForPairing({
    parent: ref,
    environmentId: transport.environmentId,
    ...(transport.childDesktopId !== undefined ? { childDesktopId: transport.childDesktopId } : {}),
    endpoint,
    ...(server.accessToken !== undefined ? { accessToken: server.accessToken } : {}),
  });
  if (!created) return undefined;
  const session: EnvironmentClientSession = {
    connectionKey,
    client: created.client,
    parentAuthority: created.parentAuthority,
    childGrantKey: created.childGrantKey,
    dispose: () => {
      created.client.dispose();
      releaseEnvironmentChildGrant(created.childGrantSubject, created.grantOwner);
    },
  };
  environmentSessions.set(connectionKey, { fingerprint, session });
  rebindEnvironmentImageListeners(connectionKey, created.client);
  return session;
}

function createDefaultEnvironmentClient(
  endpoint: string,
  accessToken: string | undefined,
  options: EnvironmentClientOptions,
): RemoteEnvironmentClient {
  return new RemoteEnvironmentClient(endpoint, accessToken, mainProcessFetch, {
    ...options,
    certFingerprintProbe: electronCertFingerprintProbe,
  });
}

/** Disposes one environment session, leaving the parent authority untouched. */
export function disposeEnvironmentSession(connectionKey: string): void {
  forgetEnvironmentImageBindings(connectionKey);
  const cached = environmentSessions.get(connectionKey);
  if (!cached) return;
  environmentSessions.delete(connectionKey);
  cached.session.dispose();
}

/** Disposes every environment session under one parent ref. */
export function disposeEnvironmentSessionsForParent(ref: EnvironmentParentRef): void {
  const state = deps().getState();
  const parentKey = environmentParentCacheKey(ref);
  for (const [connectionKey, cached] of environmentSessions) {
    const server = state.servers.find(
      (candidate) => remoteConnectionKey(candidate) === connectionKey,
    );
    if (server?.transport?.kind !== "environment") continue;
    const childParent = environmentParentRef(server.transport);
    if (!childParent || environmentParentCacheKey(childParent) !== parentKey) continue;
    forgetEnvironmentImageBindings(connectionKey);
    cached.session.dispose();
    environmentSessions.delete(connectionKey);
  }
}

export function __resetEnvironmentSessionsForTest(): void {
  for (const cached of environmentSessions.values()) cached.session.dispose();
  environmentSessions.clear();
  environmentImageBindings.clear();
  parentSessions.clear();
}

/** Test-only: clears the configured dependencies (production configures once). */
export function __resetEnvironmentSessionDependenciesForTest(): void {
  dependencies = null;
}

/**
 * Renderer-side readiness surface for environment-held images (R3). Consumers
 * drive `useSyncExternalStore` with `subscribe*` + `resolve*` and call
 * `request*` from an effect, so `getSnapshot` stays pure.
 */
export interface RemoteImageReadiness {
  readonly resolveRef: (ref: RemoteImageRefValue) => string;
  readonly subscribeRef: (ref: RemoteImageRefValue, listener: () => void) => () => void;
  readonly requestRef: (ref: RemoteImageRefValue) => void;
  readonly resolvePath: (path: string) => string;
  readonly subscribePath: (path: string, listener: () => void) => () => void;
  readonly requestPath: (path: string) => void;
}

/**
 * Binds the readiness surface to one connection key, or `undefined` when the
 * record is not a host-owned environment (direct/ssh keep their ticket path).
 */
export function environmentImageReadinessFor(
  connectionKey: string,
): RemoteImageReadiness | undefined {
  const server = findServer(connectionKey);
  if (!server || server.transport?.kind !== "environment") return undefined;
  return {
    resolveRef: (ref) => environmentImageUrl(connectionKey, environmentImageRefKey(ref)),
    subscribeRef: (ref, listener) =>
      subscribeEnvironmentImage(connectionKey, environmentImageRefKey(ref), listener, {
        kind: "ref",
        ref,
      }),
    requestRef: (ref) => requestEnvironmentImage(connectionKey, { kind: "ref", ref }),
    resolvePath: (path) => environmentImageUrl(connectionKey, environmentLocalImageKey(path)),
    subscribePath: (path, listener) =>
      subscribeEnvironmentImage(connectionKey, environmentLocalImageKey(path), listener, {
        kind: "localPath",
        path,
      }),
    requestPath: (path) => requestEnvironmentImage(connectionKey, { kind: "localPath", path }),
  };
}

/**
 * Pure keyed readiness read for `useSyncExternalStore` ("" while pending,
 * failed, evicted, or when no session exists).
 */
export function environmentImageUrl(connectionKey: string, key: string): string {
  const server = findServer(connectionKey);
  if (!server) return "";
  const session = environmentSessionForServer(server);
  if (!session) return "";
  return session.client.imageResolutionFor(key).url;
}

/** Starts or retries exactly one authenticated image fetch for the target. */
export function requestEnvironmentImage(
  connectionKey: string,
  target: RemoteEnvironmentImageTarget,
): void {
  const server = findServer(connectionKey);
  if (!server) return;
  const session = environmentSessionForServer(server);
  if (!session) return;
  if (target.kind === "ref") {
    session.client.imageRefResolution(target.ref);
    return;
  }
  session.client.localImageResolution(target.path);
}

/**
 * Keyed readiness subscription for an environment image consumer. When the
 * request target is supplied, a session rebuild re-requests it automatically,
 * so a mounted consumer never depends on an incidental remount after a real
 * endpoint/token/identity rebuild. A subscriber that arrives before the child
 * session can exist (parent offline) is retained and bound when the session is
 * created rather than silently becoming a no-op.
 */
export function subscribeEnvironmentImage(
  connectionKey: string,
  key: string,
  listener: () => void,
  target?: RemoteEnvironmentImageTarget,
): () => void {
  const server = findServer(connectionKey);
  if (!server || server.transport?.kind !== "environment") return () => undefined;
  const session = environmentSessionForServer(server);
  const binding = bindImageListener(connectionKey, key, listener, target, session?.client ?? null);
  return () => unbindImageListener(connectionKey, key, binding);
}
