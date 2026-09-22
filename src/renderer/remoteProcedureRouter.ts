import type {
  ProjectLocation,
  StartShellPayload,
  ThreadFollowUpQueueState,
} from "@/shared/contracts";
import type { IpcProcedureName, IpcProcedurePayload, IpcProcedureResult } from "@/shared/ipc";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { msg } from "@/shared/messages";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  invokeRemoteIpcProcedure,
  RemoteTerminalOwnership,
  type RemoteIpcAdapterProcedureName,
  type RemoteProcedureOwner,
} from "@/shared/remote";
import {
  isProjectedRemoteEntityId,
  projectRemoteRuntimeItems,
  projectRemoteFollowUpQueue,
  unprojectRemoteThreadId,
} from "@/renderer/state/remoteProjection";
import { invokeBoundedRuntimeItemsPage } from "@/renderer/state/remoteServers/catalog/boundedHistoryRegistry";
import {
  isRemoteRoutableProcedure,
  REMOTE_PROCEDURE_ROUTES,
  type RemoteProcedureRouteSpec,
  type RemoteRoutableProcedureName,
} from "./remoteProcedureRoutes";

interface ResolvedRemoteRoute {
  readonly desktopId: string;
  readonly payload: Record<string, unknown>;
  readonly projectedProjectId?: string;
  readonly terminalId?: string;
  readonly terminalKind?: "shell" | "thread";
  /**
   * Provenance: the managed loopback leg started this terminal, so only the
   * live managed host may serve the route — never the persisted host, even if
   * a paired desktop's id reads like the internal loopback identity.
   */
  readonly managedLoopback?: boolean;
}

export interface RemoteProcedureHost {
  resolveThreadOwner(
    threadId: string,
  ): { readonly desktopId: string; readonly remoteId: string } | undefined;
  resolveProjectOwner(
    projectId: string,
  ): { readonly desktopId: string; readonly remoteId: string } | undefined;
  /**
   * The desktop-scoped owner for procedures whose subject is the attached
   * host itself (schedules, skill marketplace) rather than a payload-carried
   * project/thread owner. Undefined when this host has no single attached
   * desktop to answer for (V6 B.2).
   */
  resolveDesktopOwner(): { readonly desktopId: string } | undefined;
  withClient<Result>(
    desktopId: string,
    invoke: (client: RemoteDesktopClient) => Promise<Result>,
  ): Promise<Result>;
}

export type RemoteRouteDecision<Result = unknown> =
  | { readonly kind: "local" }
  | { readonly kind: "remote"; readonly result: Promise<Result> };

/**
 * The live managed-loopback procedure owner (the renderer's own co-located
 * HTTP leg).
 *
 * Registered by `hostTransport/loopbackHttpWsTransport` while exactly one
 * loopback activation is serving, and cleared on deactivation. It is a
 * separate slot from the persisted host on purpose:
 *
 * - the identity is opaque and minted by the leg (`managedIdentity.ts`), so a
 *   paired desktop's id — even one reading `"managed-loopback"` — can never
 *   alias a managed-owned route, and vice versa;
 * - a managed-owned route is never silently re-assigned to a persisted host
 *   when the leg is down (it fails truthfully instead), and the registration
 *   holds no client of a retired activation.
 */
export interface ManagedLoopbackProcedureHostRegistration {
  /** Opaque routing identity minted by the managed leg (never a persisted
   * desktop id). Process-stable, so a managed terminal keeps routing to the
   * successor client after a leg reconnect. */
  readonly desktopId: string;
  /** The composed managed procedure host that serves managed-owned routes. */
  readonly host: RemoteProcedureHost;
  /** Activation fence: false once the registration's leg has retired. */
  isCurrent(): boolean;
}

/** Terminal ownership provenance. Persisted owners route through the
 * registered persisted host; managed loopback owners route through the live
 * managed host registration — never through a desktop-id string match. */
type RemoteTerminalOwnerRecord =
  | { readonly kind: "persisted"; readonly desktopId: string }
  | { readonly kind: "managed-loopback"; readonly desktopId: string };

let host: RemoteProcedureHost | undefined;
let managedLoopbackHost: ManagedLoopbackProcedureHostRegistration | null = null;
const remoteTerminals = new RemoteTerminalOwnership<RemoteTerminalOwnerRecord>();
/** One identity-stable record per persisted owner, so batch release keeps
 * matching the same object the terminal entries registered. */
const persistedTerminalOwners = new Map<string, RemoteTerminalOwnerRecord>();
const REMOTE_LOCATION_KEYS = [
  "projectLocation",
  "worktreeLocation",
  "sourceProjectLocation",
  "newLocation",
  "location",
  "parentLocation",
  "runtime",
] as const;

export function registerRemoteProcedureHost(next: RemoteProcedureHost | undefined): void {
  host = next;
}

/** The currently registered persisted-owner host (paired servers / attach
 * owner). Exposed so a derived host can CHAIN to it instead of replacing it —
 * the managed loopback host (V5 plan 2.5 completion) resolves the desktop's
 * own entities only for ids the persisted rows do not own. */
export function readRegisteredRemoteProcedureHost(): RemoteProcedureHost | undefined {
  return host;
}

/** Installs the live managed-loopback host (loopback host lifecycle owns it),
 * or clears it when the leg deactivates. A non-current registration is never
 * used to route: managed-owned routes then fail truthfully. */
export function registerManagedLoopbackProcedureHost(
  registration: ManagedLoopbackProcedureHostRegistration | null,
): void {
  managedLoopbackHost = registration;
}

export function readManagedLoopbackProcedureHost(): ManagedLoopbackProcedureHostRegistration | null {
  return managedLoopbackHost;
}

function persistedTerminalOwner(desktopId: string): RemoteTerminalOwnerRecord {
  const cached = persistedTerminalOwners.get(desktopId);
  if (cached) return cached;
  const record: RemoteTerminalOwnerRecord = { kind: "persisted", desktopId };
  persistedTerminalOwners.set(desktopId, record);
  return record;
}

export function remoteTerminalOwner(terminalId: string): string | undefined {
  const owner = remoteTerminals.owner(terminalId);
  // Managed-loopback terminals belong to the renderer's own feed namespace
  // (`managedTerminalFeedId()`); only persisted owners carry a paired-server
  // desktop id for feed/event routing.
  return owner?.kind === "persisted" ? owner.desktopId : undefined;
}

export function releaseRemoteTerminal(terminalId: string): void {
  remoteTerminals.release(terminalId);
}

export function releaseRemoteTerminalsForServer(desktopId: string): void {
  const record = persistedTerminalOwners.get(desktopId);
  if (!record) return;
  remoteTerminals.releaseOwnedBy(record);
  persistedTerminalOwners.delete(desktopId);
}

export function resetRemoteProcedureRouterForTest(): void {
  remoteTerminals.clear();
  persistedTerminalOwners.clear();
  managedLoopbackHost = null;
}

export function unprojectProjectLocation(location: ProjectLocation): ProjectLocation {
  const { remoteServerId: _, ...hostLocation } = location;
  return hostLocation;
}

export function unprojectRemotePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const input = payload as Record<string, unknown>;
  const output = { ...input };
  for (const key of REMOTE_LOCATION_KEYS) {
    const location = projectLocation(input[key]);
    if (location) output[key] = unprojectProjectLocation(location);
  }
  if (Array.isArray(input.skills)) {
    output.skills = input.skills.map((skill) => unprojectRemotePayload(skill));
  }
  return output;
}

export function routeRemoteProcedure<Name extends IpcProcedureName>(
  procedure: Name,
  payload: IpcProcedurePayload<Name>,
  hostOverride?: RemoteProcedureHost,
): RemoteRouteDecision<IpcProcedureResult<Name>> {
  if (!isRemoteRoutableProcedure(procedure)) return { kind: "local" };
  const spec = REMOTE_PROCEDURE_ROUTES[procedure] as RemoteProcedureRouteSpec;
  const effectiveHost = hostOverride ?? host;
  let route: ResolvedRemoteRoute | undefined;
  try {
    route = resolveRemoteRoute(spec.owner, payload, effectiveHost);
  } catch (error) {
    return {
      kind: "remote",
      result: Promise.reject(error) as Promise<IpcProcedureResult<Name>>,
    };
  }
  if (!route) return { kind: "local" };
  // Managed ownership is decided by provenance + a live registration, never
  // by a desktop-id string: the managed identity is opaque, so a route can
  // only carry it if the managed leg minted it.
  const managed = resolveManagedLoopbackOwner(route, effectiveHost);
  if (route.managedLoopback && !managed) {
    return {
      kind: "remote",
      result: Promise.reject(new Error(msg("remote.server.unreachable"))),
    };
  }
  const remoteHost = managed?.host ?? effectiveHost;
  if (!remoteHost) {
    return {
      kind: "remote",
      result: Promise.reject(new Error(msg("remote.server.unreachable"))),
    };
  }
  const managedLoopback = managed !== undefined;
  return {
    kind: "remote",
    result: remoteHost.withClient(route.desktopId, async (client) =>
      projectOwnedResult(
        await invokeRemoteProcedure(procedure, spec, client, route, managedLoopback),
        route.projectedProjectId,
        route.desktopId,
        procedure,
      ),
    ) as Promise<IpcProcedureResult<Name>>,
  };
}

/** The live managed registration that owns one resolved route, or undefined.
 * Either the route's provenance names the managed leg, or the caller passed
 * the live managed host as its override and the route resolves the managed
 * owner identity. Both checks also require the registration to be current. */
function resolveManagedLoopbackOwner(
  route: ResolvedRemoteRoute,
  effectiveHost: RemoteProcedureHost | undefined,
): ManagedLoopbackProcedureHostRegistration | undefined {
  const registration = managedLoopbackHost;
  if (!registration?.isCurrent()) return undefined;
  if (route.managedLoopback) {
    return registration.desktopId === route.desktopId ? registration : undefined;
  }
  return effectiveHost === registration.host && route.desktopId === registration.desktopId
    ? registration
    : undefined;
}

async function invokeRemoteProcedure(
  procedure: RemoteRoutableProcedureName,
  spec: RemoteProcedureRouteSpec,
  client: RemoteDesktopClient,
  route: ResolvedRemoteRoute,
  managedLoopback: boolean,
): Promise<unknown> {
  switch (spec.handler) {
    case "passthrough":
      return client.callRemoteProcedure(procedure, route.payload);
    case "adapter": {
      // B4: a negotiated bounded connection pages older runtime items through
      // the bounded items route; a genuine older host falls through to the
      // legacy adapter route.
      if (procedure === "dbGetThreadRuntimeItemsPage") {
        const bounded = await invokeBoundedRuntimeItemsPage(
          client,
          route.desktopId,
          route.payload as Parameters<typeof invokeBoundedRuntimeItemsPage>[2],
        );
        if (bounded) return bounded;
      }
      return invokeRemoteIpcProcedure(
        client,
        procedure as RemoteIpcAdapterProcedureName,
        route.payload,
      );
    }
    case "thread-clipboard-image": {
      const input = route.payload as IpcProcedurePayload<"saveClipboardImage">;
      return client.uploadAttachment({
        threadId: input.threadId,
        fileName: `clipboard-${crypto.randomUUID()}.${input.extension}`,
        data: input.data,
      });
    }
    case "thread-handoff-context": {
      const input = route.payload as IpcProcedurePayload<"saveHandoffContext">;
      return client.uploadAttachment({
        threadId: input.threadId,
        // Unique per handoff, like the local `saveHandoffContextFile`: one
        // thread can hand off more than once, and a fixed name would let a
        // later summary clobber the file an earlier user message points at.
        fileName: `handoff-context-${crypto.randomUUID()}.md`,
        data: new TextEncoder().encode(input.content),
      });
    }
    case "shell-start": {
      const input = route.payload as unknown as StartShellPayload;
      const owner: RemoteTerminalOwnerRecord = managedLoopback
        ? { kind: "managed-loopback", desktopId: route.desktopId }
        : persistedTerminalOwner(route.desktopId);
      return remoteTerminals.start(input.shellId, owner, () => client.startShell(input));
    }
    case "shell-close":
      if (!route.terminalId) return undefined;
      if (route.terminalKind === "thread") {
        return client.closeThread(route.terminalId);
      }
      const terminalId = route.terminalId;
      const closed = await remoteTerminals.close(terminalId, () =>
        client.closeShell({ threadId: terminalId }),
      );
      return closed.routed ? closed.result : undefined;
  }
}

function projectOwnedResult(
  result: unknown,
  projectedProjectId: string | undefined,
  remoteServerId: string,
  procedure: IpcProcedureName,
): unknown {
  if (procedure === "getThreadFollowUpQueue") {
    return projectRemoteFollowUpQueue(remoteServerId, result as ThreadFollowUpQueueState | null);
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }
  const record = result as Record<string, unknown>;
  const output =
    projectedProjectId && typeof record.projectId === "string"
      ? { ...record, projectId: projectedProjectId }
      : record;
  if (procedure === "dbGetThreadRuntimeItemsPage" && Array.isArray(record.items)) {
    return {
      ...output,
      items: projectRemoteRuntimeItems(remoteServerId, record.items as PersistedRuntimeItem[]),
    };
  }
  return output;
}

function resolveRemoteRoute(
  strategy: RemoteProcedureOwner,
  payload: unknown,
  remoteHost: RemoteProcedureHost | undefined,
): ResolvedRemoteRoute | undefined {
  if (strategy === "desktop") {
    // Desktop-scoped calls carry no owner in the payload (they may have no
    // payload at all), so resolve the host's own desktop before any payload
    // shape validation — but still forward a well-formed payload through.
    const owner = remoteHost?.resolveDesktopOwner();
    const input =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    return owner ? { desktopId: owner.desktopId, payload: input } : undefined;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const input = payload as Record<string, unknown>;
  if (strategy === "none") return undefined;
  if (strategy === "thread") return resolveThreadRoute(input, remoteHost);
  if (strategy === "project") return resolveProjectRoute(input, remoteHost);
  if (strategy === "terminal") return resolveTerminalRoute(input, remoteHost);
  if (strategy === "skillLocations") {
    return resolveSkillLocationsOwner(input, remoteHost?.resolveDesktopOwner()?.desktopId);
  }
  const key =
    strategy === "projectLocation" || strategy === "optionalProjectLocation"
      ? "projectLocation"
      : strategy;
  const location = projectLocation(input[key]);
  const locations = analyzeRemoteLocations(input);
  if (!location?.remoteServerId) {
    if (locations.owners.size > 0) throw new Error(msg("remote.server.unreachable"));
    return undefined;
  }
  assertSingleOwner(locations, location.remoteServerId);
  return {
    desktopId: location.remoteServerId,
    payload: unprojectRemotePayload(input) as Record<string, unknown>,
  };
}

function resolveThreadRoute(
  input: Record<string, unknown>,
  remoteHost: RemoteProcedureHost | undefined,
): ResolvedRemoteRoute | undefined {
  if (typeof input.threadId !== "string") return undefined;
  const locations = analyzeRemoteLocations(input);
  if (!remoteHost) {
    if (isProjectedRemoteEntityId(input.threadId, "thread") || locations.owners.size > 0) {
      throw new Error(msg("remote.server.unreachable"));
    }
    return undefined;
  }
  const owner = remoteHost.resolveThreadOwner(input.threadId);
  if (!owner) {
    if (isProjectedRemoteEntityId(input.threadId, "thread") || locations.owners.size > 0) {
      throw new Error(msg("remote.server.unreachable"));
    }
    return undefined;
  }
  assertSingleOwner(locations, owner.desktopId);
  const payload = unprojectRemotePayload(input) as Record<string, unknown>;
  if (Array.isArray(input.segments)) {
    payload.segments = input.segments.map((segment) => {
      if (!segment || typeof segment !== "object" || Array.isArray(segment)) return segment;
      const candidate = segment as Record<string, unknown>;
      if (candidate.kind !== "thread" || typeof candidate.threadId !== "string") {
        return segment;
      }
      const mentionedOwner = remoteHost.resolveThreadOwner(candidate.threadId);
      const mentionedRemoteId =
        mentionedOwner?.desktopId === owner.desktopId
          ? mentionedOwner.remoteId
          : unprojectRemoteThreadId(owner.desktopId, candidate.threadId);
      if (mentionedRemoteId) return { ...candidate, threadId: mentionedRemoteId };
      // A mention of a thread this host does not own (local or another
      // desktop's) degrades to plain text: the host's agent could never
      // resolve the id with read_thread.
      return {
        kind: "text",
        content: `@${typeof candidate.title === "string" && candidate.title ? candidate.title : candidate.threadId}`,
      };
    });
  }
  return {
    desktopId: owner.desktopId,
    payload: {
      ...payload,
      threadId: owner.remoteId,
    },
  };
}

function resolveProjectRoute(
  input: Record<string, unknown>,
  remoteHost: RemoteProcedureHost | undefined,
): ResolvedRemoteRoute | undefined {
  if (typeof input.projectId !== "string") return undefined;
  const locations = analyzeRemoteLocations(input);
  if (!remoteHost) {
    if (isProjectedRemoteEntityId(input.projectId, "project") || locations.owners.size > 0) {
      throw new Error(msg("remote.server.unreachable"));
    }
    return undefined;
  }
  const owner = remoteHost.resolveProjectOwner(input.projectId);
  if (!owner) {
    if (isProjectedRemoteEntityId(input.projectId, "project") || locations.owners.size > 0) {
      throw new Error(msg("remote.server.unreachable"));
    }
    return undefined;
  }
  assertSingleOwner(locations, owner.desktopId);
  return {
    desktopId: owner.desktopId,
    projectedProjectId: input.projectId,
    payload: {
      ...(unprojectRemotePayload(input) as Record<string, unknown>),
      projectId: owner.remoteId,
    },
  };
}

function resolveTerminalRoute(
  input: Record<string, unknown>,
  remoteHost: RemoteProcedureHost | undefined,
): ResolvedRemoteRoute | undefined {
  const terminalId =
    typeof input.shellId === "string"
      ? input.shellId
      : typeof input.threadId === "string"
        ? input.threadId
        : undefined;
  if (!terminalId) return undefined;
  const shellOwner = remoteTerminals.owner(terminalId);
  if (shellOwner) {
    return {
      desktopId: shellOwner.desktopId,
      terminalId,
      terminalKind: "shell",
      ...(shellOwner.kind === "managed-loopback" ? { managedLoopback: true } : {}),
      payload: unprojectRemotePayload(input) as Record<string, unknown>,
    };
  }
  if (!remoteHost) {
    if (isProjectedRemoteEntityId(terminalId, "thread")) {
      throw new Error(msg("remote.server.unreachable"));
    }
    return undefined;
  }
  const owner = remoteHost.resolveThreadOwner(terminalId);
  if (!owner) {
    if (isProjectedRemoteEntityId(terminalId, "thread")) {
      throw new Error(msg("remote.server.unreachable"));
    }
    return undefined;
  }
  return {
    desktopId: owner.desktopId,
    terminalId: owner.remoteId,
    terminalKind: "thread",
    payload: {
      ...(unprojectRemotePayload(input) as Record<string, unknown>),
      ...(typeof input.threadId === "string" ? { threadId: owner.remoteId } : {}),
    },
  };
}

function resolveSkillLocationsOwner(
  input: Record<string, unknown>,
  globalOwnerId: string | undefined,
): ResolvedRemoteRoute | undefined {
  if (!Array.isArray(input.skills)) return undefined;
  const locations = analyzeRemoteLocations(input);
  if (locations.owners.size === 0) return undefined;
  assertSingleOwner(locations);
  const desktopId = [...locations.owners][0]!;
  if (!skillLocationsBelongToHost(input, desktopId, globalOwnerId)) {
    throw new Error(msg("remote.server.unreachable"));
  }
  return {
    desktopId,
    payload: unprojectRemotePayload(input) as Record<string, unknown>,
  };
}

/** An omitted location means the caller's known host-global scope. It cannot
 * borrow the owner of another location: the UI may import a local global skill
 * into a paired project. Keep that cross-host case refused rather than reading
 * the same absolute path on a different machine. */
function skillLocationBelongsToHost(
  value: unknown,
  desktopId: string,
  globalOwnerId: string | undefined,
): boolean {
  if (value === undefined) return desktopId === globalOwnerId;
  return projectLocation(value)?.remoteServerId === desktopId;
}

function skillLocationsBelongToHost(
  input: Record<string, unknown>,
  desktopId: string,
  globalOwnerId: string | undefined,
): boolean {
  if (!Array.isArray(input.skills)) return false;
  return input.skills.every((skill) => {
    if (!skill || typeof skill !== "object" || Array.isArray(skill)) return false;
    const record = skill as Record<string, unknown>;
    return (
      skillLocationBelongsToHost(record.projectLocation, desktopId, globalOwnerId) &&
      skillLocationBelongsToHost(record.sourceProjectLocation, desktopId, globalOwnerId)
    );
  });
}

interface RemoteLocationAnalysis {
  readonly owners: Set<string>;
  hasLocal: boolean;
}

function analyzeRemoteLocations(
  input: Record<string, unknown>,
  analysis: RemoteLocationAnalysis = { owners: new Set(), hasLocal: false },
): RemoteLocationAnalysis {
  for (const key of REMOTE_LOCATION_KEYS) {
    const location = projectLocation(input[key]);
    if (!location) continue;
    if (location.remoteServerId) analysis.owners.add(location.remoteServerId);
    else analysis.hasLocal = true;
  }
  if (Array.isArray(input.skills)) {
    for (const skill of input.skills) {
      if (!skill || typeof skill !== "object" || Array.isArray(skill)) continue;
      analyzeRemoteLocations(skill as Record<string, unknown>, analysis);
    }
  }
  return analysis;
}

function assertSingleOwner(locations: RemoteLocationAnalysis, expected?: string): void {
  if (
    locations.hasLocal ||
    locations.owners.size > 1 ||
    (expected && locations.owners.size === 1 && !locations.owners.has(expected))
  ) {
    throw new Error(msg("remote.server.unreachable"));
  }
}

function projectLocation(value: unknown): ProjectLocation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ProjectLocation>;
  if (candidate.kind !== "windows" && candidate.kind !== "wsl" && candidate.kind !== "posix") {
    return undefined;
  }
  return value as ProjectLocation;
}

/**
 * Stamps `remoteServerId` onto every location a payload carries (V5 plan 2.5
 * completion): the managed loopback owner owns this desktop's OWN locations,
 * so location-owned procedures route over the loopback leg through the same
 * `resolveRemoteRoute` machinery attach mode uses for projected rows. The
 * router's `unprojectRemotePayload` strips the stamp again before the wire,
 * so the request the server sees is byte-identical to the local one. Shapes
 * that are not router-recognized locations pass through untouched.
 */
export function stampRemoteOwnerOntoPayload(payload: unknown, remoteServerId: string): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const input = payload as Record<string, unknown>;
  const output = { ...input };
  for (const key of REMOTE_LOCATION_KEYS) {
    const location = projectLocation(output[key]);
    if (location && !location.remoteServerId) {
      output[key] = { ...location, remoteServerId };
    }
  }
  if (Array.isArray(input.skills)) {
    output.skills = input.skills.map((skill) => stampRemoteOwnerOntoPayload(skill, remoteServerId));
  }
  return output;
}
