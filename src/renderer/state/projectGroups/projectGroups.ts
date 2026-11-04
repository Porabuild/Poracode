import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import { machineKeyForLocation } from "@/shared/machines";

/**
 * One logical project as the user sees it: the same repository registered on
 * several environments (this computer, a WSL distro, paired hosts). Each
 * member stays an ordinary per-host project row — the host that owns a row
 * keeps owning it — so a group is purely a client-side presentation.
 */
export interface ProjectGroup {
  /** The anchor member's project id; stable while that member exists. */
  readonly id: string;
  /** First member: the local one when present, otherwise the first in store order. */
  readonly anchor: Project;
  /** Every environment's project row, local first. At most one per environment. */
  readonly members: readonly Project[];
  /**
   * Member id → the key that proves it is the same project as another member:
   * the manual group token, or the known origin repository. Null while only the
   * name matched. Grouping by name is presentation; shared settings are written
   * only between members holding the same non-null key (see {@link syncedMembers}).
   */
  readonly syncKeys: ReadonlyMap<string, string | null>;
}

/** Client-side manual grouping overrides. */
export interface ProjectGroupOverrides {
  /**
   * Project id → group token. Projects that share a token form one group;
   * a token held by a single project keeps it on its own. Projects with a
   * token never join an automatic group.
   */
  readonly manualGroups: Readonly<Record<string, string>>;
}

export interface ProjectGroupIndex {
  readonly groups: readonly ProjectGroup[];
  readonly groupByProjectId: ReadonlyMap<string, ProjectGroup>;
}

/** Environment key of a project row: its owning host plus native/WSL env. */
export function projectEnvironmentKey(project: Project): string {
  return machineKeyForLocation({
    ...project.location,
    remoteServerId: project.remoteServerId ?? project.location.remoteServerId,
  });
}

function nameKey(project: Project): string {
  return project.name.trim().toLocaleLowerCase();
}

/**
 * Machine-list order, as in Settings: Local, local WSL distros, then paired
 * machines (native before their WSL distros). Store order breaks ties.
 */
function memberRank(project: Project): number {
  const remote = project.remoteServerId || project.location.remoteServerId ? 2 : 0;
  return remote + (project.location.kind === "wsl" ? 1 : 0);
}

interface GroupBuilder {
  members: Project[];
  syncKeys: Map<string, string | null>;
  environments: Set<string>;
  names: Set<string>;
  repoKey: string | null;
  manual: boolean;
}

function newBuilder(
  project: Project,
  repoKey: string | null,
  manual: boolean,
  syncKey: string | null = repoKey,
): GroupBuilder {
  return {
    members: [project],
    syncKeys: new Map([[project.id, syncKey]]),
    environments: new Set([projectEnvironmentKey(project)]),
    names: new Set([nameKey(project)]),
    repoKey,
    manual,
  };
}

function addMember(
  builder: GroupBuilder,
  project: Project,
  repoKey: string | null,
  syncKey: string | null = repoKey,
): void {
  builder.members.push(project);
  builder.syncKeys.set(project.id, syncKey);
  builder.environments.add(projectEnvironmentKey(project));
  builder.names.add(nameKey(project));
  builder.repoKey ??= repoKey;
}

/**
 * Whether `project` belongs with `builder` automatically. Two known origins
 * decide on their own — a renamed checkout of the same repository still
 * matches, and two different repositories never do. Without both origins the
 * project name decides. A group never holds two rows from one environment.
 */
function matchesAutomatically(
  builder: GroupBuilder,
  project: Project,
  repoKey: string | null,
): boolean {
  if (builder.manual) return false;
  if (builder.environments.has(projectEnvironmentKey(project))) return false;
  if (builder.repoKey && repoKey) return builder.repoKey === repoKey;
  return builder.names.has(nameKey(project));
}

/**
 * Group per-host project rows into logical projects.
 *
 * Pure and deterministic for its inputs. `repoKeyOf` returns the normalized
 * origin repository of a row, or null while unknown. The Home scope and rows
 * without a usable name always stay on their own.
 */
export function deriveProjectGroups(
  projects: readonly Project[],
  repoKeyOf: (project: Project) => string | null,
  overrides: ProjectGroupOverrides,
): ProjectGroupIndex {
  const ordered = projects
    .map((project, index) => ({ project, index }))
    .sort((a, b) => memberRank(a.project) - memberRank(b.project) || a.index - b.index)
    .map((entry) => entry.project);

  const builders: GroupBuilder[] = [];
  const manualBuilders = new Map<string, GroupBuilder>();
  for (const project of ordered) {
    const repoKey = repoKeyOf(project);
    if (isHomeProject(project) || !nameKey(project)) {
      builders.push(newBuilder(project, repoKey, true));
      continue;
    }
    const token = overrides.manualGroups[project.id];
    if (token !== undefined) {
      const existing = manualBuilders.get(token);
      if (existing && !existing.environments.has(projectEnvironmentKey(project))) {
        addMember(existing, project, repoKey, `manual:${token}`);
        continue;
      }
      const builder = newBuilder(project, repoKey, true, `manual:${token}`);
      builders.push(builder);
      if (!existing) manualBuilders.set(token, builder);
      continue;
    }
    const match = builders.find((builder) => matchesAutomatically(builder, project, repoKey));
    if (match) addMember(match, project, repoKey);
    else builders.push(newBuilder(project, repoKey, false));
  }

  const groupByProjectId = new Map<string, ProjectGroup>();
  // Groups keep the position of their earliest member in the input order, so
  // surfaces that sort projects (sidebar, selectors) keep their order.
  const position = new Map(projects.map((project, index) => [project.id, index]));
  const groups = builders
    .map((builder): ProjectGroup => {
      const anchor = builder.members[0]!;
      return { id: anchor.id, anchor, members: builder.members, syncKeys: builder.syncKeys };
    })
    .sort(
      (a, b) =>
        Math.min(...a.members.map((m) => position.get(m.id)!)) -
        Math.min(...b.members.map((m) => position.get(m.id)!)),
    );
  for (const group of groups) {
    for (const member of group.members) groupByProjectId.set(member.id, group);
  }
  return { groups, groupByProjectId };
}

/** Token that keeps a project in its own group. */
function soloGroupToken(projectId: string): string {
  return `solo:${projectId}`;
}

/**
 * Overrides after splitting `projectId` out of its group. A manually placed
 * row never joins an automatic group, and automatic groups never absorb it,
 * so the remaining members need no pin.
 */
export function separateFromGroup(
  overrides: ProjectGroupOverrides,
  projectId: string,
): ProjectGroupOverrides {
  return { manualGroups: { ...overrides.manualGroups, [projectId]: soloGroupToken(projectId) } };
}

/**
 * Overrides after combining two groups into one. Fails (returns null) when
 * they share an environment — a logical project has one row per environment.
 */
export function combineGroups(
  overrides: ProjectGroupOverrides,
  target: ProjectGroup,
  other: ProjectGroup,
): ProjectGroupOverrides | null {
  if (target.id === other.id) return null;
  const environments = new Set(target.members.map(projectEnvironmentKey));
  if (other.members.some((member) => environments.has(projectEnvironmentKey(member)))) {
    return null;
  }
  return pinTogether(overrides, [...target.members, ...other.members]);
}

/**
 * Overrides that place `members` in one manual group under a fresh token.
 * Tokens are never reused, so a row separated from an earlier manual group
 * (and any row still holding that group's token) can't be pulled back in by
 * a later link.
 */
function pinTogether(
  overrides: ProjectGroupOverrides,
  members: readonly Project[],
): ProjectGroupOverrides {
  const token = `group:${crypto.randomUUID()}`;
  const manualGroups = { ...overrides.manualGroups };
  for (const member of members) manualGroups[member.id] = token;
  return { manualGroups };
}

/**
 * Members that share settings with `projectId`: itself plus every member
 * proven to be the same project (same manual group, or same known origin).
 * A member grouped only by name is shown together but never written to.
 */
export function syncedMembers(group: ProjectGroup, projectId: string): Project[] {
  const key = group.syncKeys.get(projectId) ?? null;
  return group.members.filter(
    (member) => member.id === projectId || (key !== null && group.syncKeys.get(member.id) === key),
  );
}

/** Members shown with `projectId` but not proven to be the same project. */
export function unconfirmedMembers(group: ProjectGroup, projectId: string): Project[] {
  const synced = new Set(syncedMembers(group, projectId).map((member) => member.id));
  return group.members.filter((member) => !synced.has(member.id));
}

/**
 * Overrides that pin every current member of `group` together, confirming
 * that they are one project so shared settings are written to all of them.
 */
export function linkGroupMembers(
  overrides: ProjectGroupOverrides,
  group: ProjectGroup,
): ProjectGroupOverrides {
  return pinTogether(overrides, group.members);
}

/** One row of a list surface: a logical project with the listed members, in group order. */
export interface ProjectGroupRow {
  /** Stable while its first listed member exists: that member's project id. */
  readonly id: string;
  readonly group: ProjectGroup | undefined;
  readonly members: readonly Project[];
}

/**
 * Collapse a list of project rows into one row per logical project, keeping
 * the list's order of first appearance and the group's member order. Shared
 * by the composer switcher, the sidebar filter and the landing page.
 */
export function groupProjectRows(
  projects: readonly Project[],
  index: ProjectGroupIndex,
): ProjectGroupRow[] {
  const buckets = new Map<ProjectGroup | string, Project[]>();
  for (const project of projects) {
    const key = index.groupByProjectId.get(project.id) ?? project.id;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(project);
    else buckets.set(key, [project]);
  }
  return [...buckets].map(([key, listed]) => {
    const group = typeof key === "string" ? undefined : key;
    const order = new Map(group?.members.map((member, position) => [member.id, position]) ?? []);
    const members = listed.toSorted((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return { id: members[0]!.id, group, members };
  });
}
