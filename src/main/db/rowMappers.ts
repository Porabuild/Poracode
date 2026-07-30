import type { ProjectLocation, Project, Thread } from "@/shared/contracts";
import * as schema from "../db.schema";

// ── Converters ──────────────────────────────────────────────────────

export function locationToRow(loc: ProjectLocation) {
  return {
    locationKind: loc.kind,
    locationPath: loc.kind !== "wsl" ? loc.path : null,
    locationDistro: loc.kind === "wsl" ? loc.distro : null,
    locationLinuxPath: loc.kind === "wsl" ? loc.linuxPath : null,
    locationUncPath: loc.kind === "wsl" ? loc.uncPath : null,
  };
}

export function projectMutableRow(project: Project) {
  return {
    name: project.name,
    ...locationToRow(project.location),
    lastDraftConfig: project.lastDraftConfig ? JSON.stringify(project.lastDraftConfig) : null,
    scripts: project.scripts ? JSON.stringify(project.scripts) : null,
    searchSettings: project.searchSettings ? JSON.stringify(project.searchSettings) : null,
    worktreeLocation: project.worktreeLocation ? JSON.stringify(project.worktreeLocation) : null,
    mcpServers: project.mcpServers ? JSON.stringify(project.mcpServers) : null,
    workspaceId: project.workspaceId ?? null,
    disabled: !!project.disabled,
  };
}

function rowToLocation(row: {
  locationKind: string;
  locationPath: string | null;
  locationDistro: string | null;
  locationLinuxPath: string | null;
  locationUncPath: string | null;
}): ProjectLocation {
  if (row.locationKind === "wsl") {
    return {
      kind: "wsl",
      distro: row.locationDistro!,
      linuxPath: row.locationLinuxPath!,
      uncPath: row.locationUncPath!,
    };
  }
  if (row.locationKind === "posix") {
    return { kind: "posix", path: row.locationPath! };
  }
  return { kind: "windows", path: row.locationPath! };
}

export function rowToProject(row: typeof schema.projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    location: rowToLocation(row),
    ...(row.lastDraftConfig ? { lastDraftConfig: JSON.parse(row.lastDraftConfig) } : {}),
    ...(row.scripts ? { scripts: JSON.parse(row.scripts) } : {}),
    ...(row.searchSettings ? { searchSettings: JSON.parse(row.searchSettings) } : {}),
    ...(row.worktreeLocation ? { worktreeLocation: JSON.parse(row.worktreeLocation) } : {}),
    ...(row.mcpServers ? { mcpServers: JSON.parse(row.mcpServers) } : {}),
    ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
    ...(row.disabled ? { disabled: true } : {}),
    createdAt: row.createdAt,
  };
}

export function rowToThread(row: typeof schema.threads.$inferSelect): Thread {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    agentKind: row.agentKind as Thread["agentKind"],
    ...(row.agentInstanceId ? { agentInstanceId: row.agentInstanceId } : {}),
    config: JSON.parse(row.config),
    status: row.status as Thread["status"],
    attention: row.attention as Thread["attention"],
    ...(row.threadStatusSource
      ? { threadStatusSource: row.threadStatusSource as Thread["threadStatusSource"] }
      : {}),
    canResumeWithConfig: row.canResumeWithConfig,
    ...(row.sessionRef ? { sessionRef: JSON.parse(row.sessionRef) } : {}),
    ...(row.worktreePath ? { worktreePath: row.worktreePath } : {}),
    ...(row.worktreeBranch ? { worktreeBranch: row.worktreeBranch } : {}),
    ...(row.prNumber != null ? { prNumber: row.prNumber } : {}),
    ...(row.groupId ? { groupId: row.groupId } : {}),
    ...(row.groupName ? { groupName: row.groupName } : {}),
    ...(row.parentThreadId ? { parentThreadId: row.parentThreadId } : {}),
    archived: row.archived,
    done: row.done,
    ...(row.doneAt ? { doneAt: row.doneAt } : {}),
    starred: row.starred,
    presentationMode: (row.presentationMode === "gui"
      ? "gui"
      : "terminal") as Thread["presentationMode"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.activeTurnStartedAt ? { activeTurnStartedAt: row.activeTurnStartedAt } : {}),
    ...(row.lastTurnStartedAt ? { lastTurnStartedAt: row.lastTurnStartedAt } : {}),
    ...(row.lastTurnEndedAt ? { lastTurnEndedAt: row.lastTurnEndedAt } : {}),
  };
}

export function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
