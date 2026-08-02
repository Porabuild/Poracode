import type {
  ProjectLocation,
  ProjectNotes,
  PrWatchInput,
  PrWatchKey,
  StartShellPayload,
} from "@/shared/contracts";
import type { IpcProcedureName, IpcProcedurePayload, IpcProcedureResult } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteProcedureOwner } from "@/shared/remote/procedures";
import {
  isRemoteRoutableProcedure,
  REMOTE_PROCEDURE_ROUTES,
  type RemoteProcedureRouteSpec,
  type RemoteRoutableProcedureName,
} from "./remoteProcedureRoutes";

interface ResolvedRemoteRoute {
  readonly desktopId: string;
  readonly payload: Record<string, unknown>;
  readonly terminalId?: string;
}

export interface RemoteProcedureHost {
  resolveThreadOwner(
    threadId: string,
  ): { readonly desktopId: string; readonly remoteId: string } | undefined;
  resolveProjectOwner(
    projectId: string,
  ): { readonly desktopId: string; readonly remoteId: string } | undefined;
  withClient<Result>(
    desktopId: string,
    invoke: (client: RemoteDesktopClient) => Promise<Result>,
  ): Promise<Result>;
}

export type RemoteRouteDecision<Result = unknown> =
  | { readonly kind: "local" }
  | { readonly kind: "remote"; readonly result: Promise<Result> };

let host: RemoteProcedureHost | undefined;
const remoteTerminalOwners = new Map<string, string>();
const REMOTE_LOCATION_KEYS = [
  "projectLocation",
  "worktreeLocation",
  "sourceProjectLocation",
  "newLocation",
  "location",
] as const;

export function registerRemoteProcedureHost(next: RemoteProcedureHost | undefined): void {
  host = next;
}

export function remoteTerminalOwner(terminalId: string): string | undefined {
  return remoteTerminalOwners.get(terminalId);
}

export function releaseRemoteTerminal(terminalId: string): void {
  remoteTerminalOwners.delete(terminalId);
}

export function releaseRemoteTerminalsForServer(desktopId: string): void {
  for (const [terminalId, owner] of remoteTerminalOwners) {
    if (owner === desktopId) remoteTerminalOwners.delete(terminalId);
  }
}

export function resetRemoteProcedureRouterForTest(): void {
  remoteTerminalOwners.clear();
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
): RemoteRouteDecision<IpcProcedureResult<Name>> {
  if (!isRemoteRoutableProcedure(procedure)) return { kind: "local" };
  const spec = REMOTE_PROCEDURE_ROUTES[procedure] as RemoteProcedureRouteSpec;
  let route: ResolvedRemoteRoute | undefined;
  try {
    route = resolveRemoteRoute(spec.owner, payload, host);
  } catch (error) {
    return {
      kind: "remote",
      result: Promise.reject(error) as Promise<IpcProcedureResult<Name>>,
    };
  }
  if (!route) return { kind: "local" };
  const remoteHost = host;
  if (!remoteHost) {
    return {
      kind: "remote",
      result: Promise.reject(new Error(msg("remote.server.unreachable"))),
    };
  }
  return {
    kind: "remote",
    result: remoteHost.withClient(route.desktopId, (client) =>
      invokeRemoteProcedure(procedure, spec, client, route),
    ) as Promise<IpcProcedureResult<Name>>,
  };
}

async function invokeRemoteProcedure(
  procedure: RemoteRoutableProcedureName,
  spec: RemoteProcedureRouteSpec,
  client: RemoteDesktopClient,
  route: ResolvedRemoteRoute,
): Promise<unknown> {
  switch (spec.handler) {
    case "passthrough":
      return client.callRemoteProcedure(procedure, route.payload);
    case "noop":
      return undefined;
    case "project-notes-read":
      return client.projectNotes(String(route.payload.projectId));
    case "project-notes-write":
      return client.setProjectNotes(route.payload as unknown as ProjectNotes);
    case "pr-watch-read":
      return client.getPrWatch(route.payload as unknown as PrWatchKey);
    case "pr-watch-check":
      return client.checkPrWatch(route.payload as unknown as PrWatchKey);
    case "pr-watch-upsert":
      return client.upsertPrWatch(route.payload as unknown as PrWatchInput);
    case "pr-watch-delete":
      return client.deletePrWatch(route.payload as unknown as PrWatchKey);
    case "runtime-items-page":
      return client.threadRuntimeItemsPage(
        route.payload as unknown as Parameters<RemoteDesktopClient["threadRuntimeItemsPage"]>[0],
      );
    case "shell-start": {
      const input = route.payload as unknown as StartShellPayload;
      remoteTerminalOwners.set(input.shellId, route.desktopId);
      try {
        return await client.startShell(input);
      } catch (error) {
        remoteTerminalOwners.delete(input.shellId);
        throw error;
      }
    }
    case "shell-close":
      if (!route.terminalId) return undefined;
      try {
        return await client.closeShell({ threadId: route.terminalId });
      } finally {
        remoteTerminalOwners.delete(route.terminalId);
      }
    case "terminal-write":
      return route.terminalId
        ? client.writeTerminal({
            threadId: route.terminalId,
            data: String(route.payload.data ?? ""),
          })
        : undefined;
    case "terminal-resize":
      return route.terminalId
        ? client.resizeTerminal({
            threadId: route.terminalId,
            cols: Number(route.payload.cols),
            rows: Number(route.payload.rows),
          })
        : undefined;
  }
}

function resolveRemoteRoute(
  strategy: RemoteProcedureOwner,
  payload: unknown,
  remoteHost: RemoteProcedureHost | undefined,
): ResolvedRemoteRoute | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const input = payload as Record<string, unknown>;
  if (strategy === "none") return undefined;
  if (strategy === "thread") return resolveThreadRoute(input, remoteHost);
  if (strategy === "project") return resolveProjectRoute(input, remoteHost);
  if (strategy === "terminal") return resolveTerminalRoute(input, remoteHost);
  if (strategy === "skillLocations") return resolveSkillLocationsOwner(input);
  const key =
    strategy === "projectLocation" || strategy === "optionalProjectLocation"
      ? "projectLocation"
      : strategy;
  const location = projectLocation(input[key]);
  const owners = remoteLocationOwners(input);
  if (!location?.remoteServerId) {
    if (owners.size > 0) throw new Error(msg("remote.server.unreachable"));
    return undefined;
  }
  assertSingleOwner(input, owners, location.remoteServerId);
  return {
    desktopId: location.remoteServerId,
    payload: unprojectRemotePayload(input) as Record<string, unknown>,
  };
}

function resolveThreadRoute(
  input: Record<string, unknown>,
  remoteHost: RemoteProcedureHost | undefined,
): ResolvedRemoteRoute | undefined {
  if (typeof input.threadId !== "string" || !remoteHost) return undefined;
  const owner = remoteHost.resolveThreadOwner(input.threadId);
  if (!owner) return undefined;
  assertSingleOwner(input, remoteLocationOwners(input), owner.desktopId);
  return {
    desktopId: owner.desktopId,
    payload: {
      ...(unprojectRemotePayload(input) as Record<string, unknown>),
      threadId: owner.remoteId,
    },
  };
}

function resolveProjectRoute(
  input: Record<string, unknown>,
  remoteHost: RemoteProcedureHost | undefined,
): ResolvedRemoteRoute | undefined {
  if (typeof input.projectId !== "string" || !remoteHost) return undefined;
  const owner = remoteHost.resolveProjectOwner(input.projectId);
  if (!owner) return undefined;
  assertSingleOwner(input, remoteLocationOwners(input), owner.desktopId);
  return {
    desktopId: owner.desktopId,
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
  const shellDesktopId = remoteTerminalOwners.get(terminalId);
  if (shellDesktopId) {
    return {
      desktopId: shellDesktopId,
      terminalId,
      payload: unprojectRemotePayload(input) as Record<string, unknown>,
    };
  }
  if (!remoteHost) return undefined;
  const owner = remoteHost.resolveThreadOwner(terminalId);
  if (!owner) return undefined;
  return {
    desktopId: owner.desktopId,
    terminalId: owner.remoteId,
    payload: {
      ...(unprojectRemotePayload(input) as Record<string, unknown>),
      ...(typeof input.threadId === "string" ? { threadId: owner.remoteId } : {}),
    },
  };
}

function resolveSkillLocationsOwner(
  input: Record<string, unknown>,
): ResolvedRemoteRoute | undefined {
  if (!Array.isArray(input.skills)) return undefined;
  const owners = remoteLocationOwners(input);
  if (owners.size === 0) return undefined;
  assertSingleOwner(input, owners);
  const desktopId = [...owners][0]!;
  if (!skillLocationsBelongToHost(input, desktopId)) {
    throw new Error(msg("remote.server.unreachable"));
  }
  return {
    desktopId,
    payload: unprojectRemotePayload(input) as Record<string, unknown>,
  };
}

function skillLocationsBelongToHost(input: Record<string, unknown>, desktopId: string): boolean {
  if (!Array.isArray(input.skills)) return false;
  return input.skills.every((skill) => {
    if (!skill || typeof skill !== "object" || Array.isArray(skill)) return false;
    const record = skill as Record<string, unknown>;
    return (
      projectLocation(record.projectLocation)?.remoteServerId === desktopId &&
      projectLocation(record.sourceProjectLocation)?.remoteServerId === desktopId
    );
  });
}

function remoteLocationOwners(input: Record<string, unknown>): Set<string> {
  const owners = new Set<string>();
  for (const key of REMOTE_LOCATION_KEYS) {
    const owner = projectLocation(input[key])?.remoteServerId;
    if (owner) owners.add(owner);
  }
  if (Array.isArray(input.skills)) {
    for (const skill of input.skills) {
      if (!skill || typeof skill !== "object" || Array.isArray(skill)) continue;
      for (const owner of remoteLocationOwners(skill as Record<string, unknown>)) owners.add(owner);
    }
  }
  return owners;
}

function assertSingleOwner(
  input: Record<string, unknown>,
  owners: Set<string>,
  expected?: string,
): void {
  if (
    hasLocalLocation(input) ||
    owners.size > 1 ||
    (expected && owners.size === 1 && !owners.has(expected))
  ) {
    throw new Error(msg("remote.server.unreachable"));
  }
}

function hasLocalLocation(input: Record<string, unknown>): boolean {
  for (const key of REMOTE_LOCATION_KEYS) {
    const location = projectLocation(input[key]);
    if (location && !location.remoteServerId) return true;
  }
  if (!Array.isArray(input.skills)) return false;
  return input.skills.some(
    (skill) =>
      skill !== null &&
      typeof skill === "object" &&
      !Array.isArray(skill) &&
      hasLocalLocation(skill as Record<string, unknown>),
  );
}

function projectLocation(value: unknown): ProjectLocation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ProjectLocation>;
  if (candidate.kind !== "windows" && candidate.kind !== "wsl" && candidate.kind !== "posix") {
    return undefined;
  }
  return value as ProjectLocation;
}
