import type { ProjectLocation, StartShellPayload } from "@/shared/contracts";
import type { IpcProcedureName, IpcProcedurePayload, IpcProcedureResult } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  invokeRemoteIpcProcedure,
  RemoteTerminalOwnership,
  type RemoteIpcAdapterProcedureName,
  type RemoteProcedureOwner,
} from "@/shared/remote";
import { isProjectedRemoteEntityId } from "@/renderer/state/remoteProjection";
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
const remoteTerminals = new RemoteTerminalOwnership<string>();
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

export function remoteTerminalOwner(terminalId: string): string | undefined {
  return remoteTerminals.owner(terminalId);
}

export function releaseRemoteTerminal(terminalId: string): void {
  remoteTerminals.release(terminalId);
}

export function releaseRemoteTerminalsForServer(desktopId: string): void {
  remoteTerminals.releaseOwnedBy(desktopId);
}

export function resetRemoteProcedureRouterForTest(): void {
  remoteTerminals.clear();
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
    result: remoteHost.withClient(route.desktopId, async (client) =>
      projectOwnedResult(
        await invokeRemoteProcedure(procedure, spec, client, route),
        route.projectedProjectId,
      ),
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
    case "adapter":
      return invokeRemoteIpcProcedure(
        client,
        procedure as RemoteIpcAdapterProcedureName,
        route.payload,
      );
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
      return remoteTerminals.start(input.shellId, route.desktopId, () => client.startShell(input));
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

function projectOwnedResult(result: unknown, projectedProjectId: string | undefined): unknown {
  if (!projectedProjectId || !result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }
  const record = result as Record<string, unknown>;
  return typeof record.projectId === "string"
    ? { ...record, projectId: projectedProjectId }
    : result;
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
  const shellDesktopId = remoteTerminals.owner(terminalId);
  if (shellDesktopId) {
    return {
      desktopId: shellDesktopId,
      terminalId,
      terminalKind: "shell",
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
): ResolvedRemoteRoute | undefined {
  if (!Array.isArray(input.skills)) return undefined;
  const locations = analyzeRemoteLocations(input);
  if (locations.owners.size === 0) return undefined;
  assertSingleOwner(locations);
  const desktopId = [...locations.owners][0]!;
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
