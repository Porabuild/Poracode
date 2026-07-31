import type { ProjectLocation, StartShellPayload, TerminalSize } from "@/shared/contracts";
import type { RemoteRuntimeItemsPageRequest } from "@/shared/remote";
import {
  isGitRemoteNoopProcedure,
  isGitRemoteProcedure,
  type GitRemoteNoopProcedureName,
  type GitRemoteProcedureName,
} from "@/shared/remote/gitProcedures";

type RemoteOwnerStrategy =
  | "none"
  | "projectLocation"
  | "worktreeLocation"
  | "location"
  | "optionalProjectLocation"
  | "skillLocations"
  | "thread"
  | "project"
  | "terminal";

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
  gitCall(desktopId: string, procedure: GitRemoteProcedureName, payload: unknown): Promise<unknown>;
  loadThreadRuntimeItemsPage(
    desktopId: string,
    input: RemoteRuntimeItemsPageRequest,
  ): Promise<unknown>;
  startRemoteShell(desktopId: string, input: StartShellPayload): Promise<void>;
  closeRemoteTerminal(desktopId: string, terminalId: string): Promise<void>;
  writeThreadTerminal(desktopId: string, terminalId: string, data: string): Promise<void>;
  resizeThreadTerminal(desktopId: string, terminalId: string, size: TerminalSize): Promise<void>;
}

let host: RemoteProcedureHost | undefined;
const remoteTerminalOwners = new Map<string, string>();

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
  for (const key of [
    "projectLocation",
    "worktreeLocation",
    "sourceProjectLocation",
    "newLocation",
    "location",
  ] as const) {
    const location = projectLocation(input[key]);
    if (location) output[key] = unprojectProjectLocation(location);
  }
  if (Array.isArray(input.skills)) {
    output.skills = input.skills.map((skill) => unprojectRemotePayload(skill));
  }
  return output;
}

const REMOTE_GIT_ROUTE_TABLE = {
  rollbackThreadConversation: "thread",
  createFileCheckpoint: "thread",
  finalizeFileCheckpoint: "thread",
  listFileCheckpoints: "thread",
  restoreFileCheckpoint: "thread",
  subagentSubscribe: "thread",
  subagentUnsubscribe: "thread",
  workflowGetRun: "location",
  workflowAgentChat: "location",
  scanSkills: "optionalProjectLocation",
  listSkillMarketplace: "none",
  setSkillEnabled: "optionalProjectLocation",
  deleteSkill: "optionalProjectLocation",
  importSkills: "skillLocations",
  installMarketplaceSkill: "optionalProjectLocation",
  discoverExternalMcpServers: "optionalProjectLocation",
  probeMcpServer: "optionalProjectLocation",
  searchProjectFiles: "projectLocation",
  listProjectTree: "projectLocation",
  browseHostDirectory: "none",
  searchProjectTree: "projectLocation",
  readProjectFile: "projectLocation",
  readAbsoluteFile: "projectLocation",
  writeProjectFile: "projectLocation",
  createProjectEntry: "projectLocation",
  renameProjectEntry: "projectLocation",
  moveProjectEntry: "projectLocation",
  deleteProjectEntry: "projectLocation",
  getGitStatus: "projectLocation",
  getGitDiff: "projectLocation",
  getGitDiffBatch: "projectLocation",
  getGitFileContent: "projectLocation",
  gitListBranches: "projectLocation",
  gitListWorktrees: "projectLocation",
  gitProjectSnapshot: "projectLocation",
  gitWorktreeStatusBatch: "projectLocation",
  gitGetWorktreeSourceBranch: "projectLocation",
  ghCheckAvailable: "projectLocation",
  ghGetPrForBranch: "projectLocation",
  ghListPrs: "projectLocation",
  ghListPullRequests: "projectLocation",
  ghGetPrChecks: "projectLocation",
  ghGetPrFiles: "projectLocation",
  ghGetPrDiff: "projectLocation",
  ghGetPrDetails: "projectLocation",
  ghListWorkflows: "projectLocation",
  ghListWorkflowRuns: "projectLocation",
  ghGetWorkflowRun: "projectLocation",
  ghGetWorkflowDefinition: "projectLocation",
  gitStage: "projectLocation",
  gitUnstage: "projectLocation",
  gitRevert: "projectLocation",
  gitStageAll: "projectLocation",
  gitUnstageAll: "projectLocation",
  gitRevertAll: "projectLocation",
  gitCommit: "projectLocation",
  gitInit: "projectLocation",
  gitAddRemote: "projectLocation",
  generateCommitMessage: "projectLocation",
  generateTitle: "projectLocation",
  generatePrSummary: "projectLocation",
  gitFetch: "projectLocation",
  gitPull: "projectLocation",
  gitPullRebase: "projectLocation",
  gitPush: "projectLocation",
  gitSync: "projectLocation",
  gitSyncRebase: "projectLocation",
  gitSwitchBranch: "projectLocation",
  gitDeleteBranch: "projectLocation",
  gitAddWorktree: "projectLocation",
  gitRemoveWorktree: "projectLocation",
  gitPruneWorktrees: "projectLocation",
  gitMergeToSource: "projectLocation",
  gitPullFromSource: "worktreeLocation",
  gitAbortMerge: "worktreeLocation",
  gitFinishMerge: "worktreeLocation",
  ghCreatePr: "projectLocation",
  ghMergePr: "projectLocation",
  ghClosePr: "projectLocation",
  ghReopenPr: "projectLocation",
  ghMarkPrReady: "projectLocation",
  ghSubmitPrReview: "projectLocation",
  ghUpdatePrBranch: "projectLocation",
  ghPostPrComment: "projectLocation",
  ghDispatchWorkflow: "projectLocation",
  ghRerunWorkflowRun: "projectLocation",
  ghDeleteWorkflowRun: "projectLocation",
} as const satisfies Record<GitRemoteProcedureName, RemoteOwnerStrategy>;

const REMOTE_NOOP_ROUTE_TABLE = {
  gitWatchProject: "projectLocation",
  gitWatchWorktrees: "project",
  gitUnwatchProject: "project",
} as const satisfies Record<GitRemoteNoopProcedureName, RemoteOwnerStrategy>;

type SpecialProcedureName =
  | "dbGetThreadRuntimeItemsPage"
  | "dbTruncateThreadRuntimeAfter"
  | "startShell"
  | "closeThread"
  | "writeTerminal"
  | "resizeTerminal";

interface SpecialRouteSpec {
  readonly owner: RemoteOwnerStrategy;
  invoke(remoteHost: RemoteProcedureHost, route: ResolvedRemoteRoute): Promise<unknown>;
}

const SPECIAL_ROUTE_TABLE = {
  dbGetThreadRuntimeItemsPage: {
    owner: "thread",
    invoke: (remoteHost, route) =>
      remoteHost.loadThreadRuntimeItemsPage(
        route.desktopId,
        route.payload as unknown as RemoteRuntimeItemsPageRequest,
      ),
  },
  dbTruncateThreadRuntimeAfter: {
    owner: "thread",
    invoke: async () => undefined,
  },
  startShell: {
    owner: "projectLocation",
    invoke: async (remoteHost, route) => {
      const input = route.payload as unknown as StartShellPayload;
      remoteTerminalOwners.set(input.shellId, route.desktopId);
      try {
        await remoteHost.startRemoteShell(route.desktopId, input);
      } catch (error) {
        remoteTerminalOwners.delete(input.shellId);
        throw error;
      }
    },
  },
  closeThread: {
    owner: "terminal",
    invoke: async (remoteHost, route) => {
      if (!route.terminalId) return;
      try {
        await remoteHost.closeRemoteTerminal(route.desktopId, route.terminalId);
      } finally {
        remoteTerminalOwners.delete(route.terminalId);
      }
    },
  },
  writeTerminal: {
    owner: "terminal",
    invoke: (remoteHost, route) =>
      route.terminalId
        ? remoteHost.writeThreadTerminal(
            route.desktopId,
            route.terminalId,
            String(route.payload.data ?? ""),
          )
        : Promise.resolve(),
  },
  resizeTerminal: {
    owner: "terminal",
    invoke: (remoteHost, route) =>
      route.terminalId
        ? remoteHost.resizeThreadTerminal(route.desktopId, route.terminalId, {
            cols: Number(route.payload.cols),
            rows: Number(route.payload.rows),
          })
        : Promise.resolve(),
  },
} as const satisfies Record<SpecialProcedureName, SpecialRouteSpec>;

export function isRemoteRoutableProcedure(procedure: string): boolean {
  return (
    isGitRemoteProcedure(procedure) ||
    isGitRemoteNoopProcedure(procedure) ||
    Object.hasOwn(SPECIAL_ROUTE_TABLE, procedure)
  );
}

export function routeRemoteProcedure(
  procedure: string,
  payload: unknown,
): Promise<unknown> | undefined {
  const remoteHost = host;
  if (!remoteHost) return undefined;
  if (isGitRemoteProcedure(procedure)) {
    const route = resolveRemoteRoute(REMOTE_GIT_ROUTE_TABLE[procedure], payload, remoteHost);
    return route ? remoteHost.gitCall(route.desktopId, procedure, route.payload) : undefined;
  }
  if (isGitRemoteNoopProcedure(procedure)) {
    const route = resolveRemoteRoute(REMOTE_NOOP_ROUTE_TABLE[procedure], payload, remoteHost);
    return route ? Promise.resolve(undefined) : undefined;
  }
  if (!Object.hasOwn(SPECIAL_ROUTE_TABLE, procedure)) return undefined;
  const name = procedure as SpecialProcedureName;
  const spec = SPECIAL_ROUTE_TABLE[name];
  const route = resolveRemoteRoute(spec.owner, payload, remoteHost);
  return route ? spec.invoke(remoteHost, route) : undefined;
}

function resolveRemoteRoute(
  strategy: RemoteOwnerStrategy,
  payload: unknown,
  remoteHost: RemoteProcedureHost,
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
  if (!location?.remoteServerId) return undefined;
  return {
    desktopId: location.remoteServerId,
    payload: unprojectRemotePayload(input) as Record<string, unknown>,
  };
}

function resolveThreadRoute(
  input: Record<string, unknown>,
  remoteHost: RemoteProcedureHost,
): ResolvedRemoteRoute | undefined {
  if (typeof input.threadId !== "string") return undefined;
  const owner = remoteHost.resolveThreadOwner(input.threadId);
  if (!owner) return undefined;
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
  remoteHost: RemoteProcedureHost,
): ResolvedRemoteRoute | undefined {
  if (typeof input.projectId !== "string") return undefined;
  const owner = remoteHost.resolveProjectOwner(input.projectId);
  if (!owner) return undefined;
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
  remoteHost: RemoteProcedureHost,
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
  const owners = new Set<string>();
  for (const skill of input.skills) {
    if (!skill || typeof skill !== "object") continue;
    const record = skill as Record<string, unknown>;
    for (const key of ["projectLocation", "sourceProjectLocation"] as const) {
      const owner = projectLocation(record[key])?.remoteServerId;
      if (owner) owners.add(owner);
    }
  }
  if (owners.size !== 1) return undefined;
  return {
    desktopId: [...owners][0]!,
    payload: unprojectRemotePayload(input) as Record<string, unknown>,
  };
}

function projectLocation(value: unknown): ProjectLocation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ProjectLocation>;
  if (candidate.kind !== "windows" && candidate.kind !== "wsl" && candidate.kind !== "posix") {
    return undefined;
  }
  return value as ProjectLocation;
}
