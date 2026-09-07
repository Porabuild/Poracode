import type { ProjectLocation, Project, Thread } from "@/shared/contracts";

// ── Row shapes (snake_case, as returned by better-sqlite3) ──────────

/** SQLite has no boolean type; flags are stored as INTEGER 0/1. */
export type SqliteBool = 0 | 1;

export interface ProjectRow {
  id: string;
  name: string;
  icon: string | null;
  location_kind: string;
  location_path: string | null;
  location_distro: string | null;
  location_linux_path: string | null;
  location_unc_path: string | null;
  last_draft_config: string | null;
  scripts: string | null;
  search_settings: string | null;
  worktree_location: string | null;
  mcp_servers: string | null;
  gh_account: string | null;
  workspace_id: string | null;
  disabled: number;
  sort_order: number;
  created_at: string;
}

export interface ThreadRow {
  id: string;
  project_id: string;
  workspace_id: string | null;
  title: string;
  agent_kind: string;
  agent_instance_id: string | null;
  config: string;
  status: string;
  attention: string;
  thread_status_source: string | null;
  can_resume_with_config: number;
  session_ref: string | null;
  terminal_prompt: string | null;
  worktree_path: string | null;
  worktree_branch: string | null;
  pr_number: number | null;
  group_id: string | null;
  group_name: string | null;
  parent_thread_id: string | null;
  archived: number;
  archived_at: string | null;
  done: number;
  done_at: string | null;
  starred: number;
  presentation_mode: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  active_turn_started_at: string | null;
  last_turn_started_at: string | null;
  last_turn_ended_at: string | null;
}

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

/** Named bind parameters (`@camelCase`) for the mutable `projects` columns. */
export function projectMutableRow(project: Project) {
  return {
    name: project.name,
    icon: project.icon ?? null,
    ...locationToRow(project.location),
    lastDraftConfig: project.lastDraftConfig ? JSON.stringify(project.lastDraftConfig) : null,
    scripts: project.scripts ? JSON.stringify(project.scripts) : null,
    searchSettings: project.searchSettings ? JSON.stringify(project.searchSettings) : null,
    worktreeLocation: project.worktreeLocation ? JSON.stringify(project.worktreeLocation) : null,
    mcpServers: project.mcpServers ? JSON.stringify(project.mcpServers) : null,
    ghAccount: project.ghAccount ? JSON.stringify(project.ghAccount) : null,
    workspaceId: project.workspaceId ?? null,
    disabled: (project.disabled ? 1 : 0) as SqliteBool,
  };
}

function rowToLocation(row: ProjectRow): ProjectLocation {
  if (row.location_kind === "wsl") {
    return {
      kind: "wsl",
      distro: row.location_distro!,
      linuxPath: row.location_linux_path!,
      uncPath: row.location_unc_path!,
    };
  }
  if (row.location_kind === "posix") {
    return { kind: "posix", path: row.location_path! };
  }
  return { kind: "windows", path: row.location_path! };
}

export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    ...(row.icon ? { icon: row.icon } : {}),
    location: rowToLocation(row),
    ...(row.last_draft_config ? { lastDraftConfig: JSON.parse(row.last_draft_config) } : {}),
    ...(row.scripts ? { scripts: JSON.parse(row.scripts) } : {}),
    ...(row.search_settings ? { searchSettings: JSON.parse(row.search_settings) } : {}),
    ...(row.worktree_location ? { worktreeLocation: JSON.parse(row.worktree_location) } : {}),
    ...(row.mcp_servers ? { mcpServers: JSON.parse(row.mcp_servers) } : {}),
    ...(row.gh_account ? { ghAccount: JSON.parse(row.gh_account) } : {}),
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.disabled ? { disabled: true } : {}),
    createdAt: row.created_at,
  };
}

export function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    projectId: row.project_id,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    title: row.title,
    agentKind: row.agent_kind as Thread["agentKind"],
    ...(row.agent_instance_id ? { agentInstanceId: row.agent_instance_id } : {}),
    config: JSON.parse(row.config),
    status: row.status as Thread["status"],
    attention: row.attention as Thread["attention"],
    ...(row.thread_status_source
      ? { threadStatusSource: row.thread_status_source as Thread["threadStatusSource"] }
      : {}),
    canResumeWithConfig: row.can_resume_with_config === 1,
    ...(row.session_ref ? { sessionRef: JSON.parse(row.session_ref) } : {}),
    ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
    ...(row.worktree_branch ? { worktreeBranch: row.worktree_branch } : {}),
    ...(row.pr_number != null ? { prNumber: row.pr_number } : {}),
    ...(row.group_id ? { groupId: row.group_id } : {}),
    ...(row.group_name ? { groupName: row.group_name } : {}),
    ...(row.parent_thread_id ? { parentThreadId: row.parent_thread_id } : {}),
    archived: row.archived === 1,
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    done: row.done === 1,
    ...(row.done_at ? { doneAt: row.done_at } : {}),
    starred: row.starred === 1,
    presentationMode: (row.presentation_mode === "gui"
      ? "gui"
      : "terminal") as Thread["presentationMode"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.active_turn_started_at ? { activeTurnStartedAt: row.active_turn_started_at } : {}),
    ...(row.last_turn_started_at ? { lastTurnStartedAt: row.last_turn_started_at } : {}),
    ...(row.last_turn_ended_at ? { lastTurnEndedAt: row.last_turn_ended_at } : {}),
  };
}

export function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
