import type { Project } from "@/shared/contracts";
import { repoIdentityKey } from "@/shared/repoIdentity";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "./projectGroupStore";
import { deriveProjectGroups, type ProjectGroup, type ProjectGroupIndex } from "./projectGroups";

interface IndexCache {
  projects: readonly Project[];
  repoSignature: string;
  manualGroups: Readonly<Record<string, string>>;
  index: ProjectGroupIndex;
}

let cache: IndexCache | null = null;

type GitStatuses = ReturnType<typeof useGitStore.getState>["statuses"];

let signatureCache: { projects: readonly Project[]; statuses: GitStatuses; value: string } | null =
  null;

/**
 * Known origin of every project row, as one comparable string. Cached on the
 * inputs' identity, so the many per-row subscribers of a git status update
 * share one O(N) pass and only re-render when an origin actually changes.
 */
function repoSignatureOf(projects: readonly Project[], statuses: GitStatuses): string {
  if (signatureCache?.projects === projects && signatureCache.statuses === statuses) {
    return signatureCache.value;
  }
  const value = projects
    .map((project) => repoIdentityKey(statuses[project.id]?.remoteInfo) ?? "")
    .join("\n");
  signatureCache = { projects, statuses, value };
  return value;
}

/**
 * Memoized on input identity so every subscriber shares one index and React
 * sees a stable reference until projects, known origins, or overrides change.
 */
function indexFor(
  projects: readonly Project[],
  repoSignature: string,
  manualGroups: Readonly<Record<string, string>>,
): ProjectGroupIndex {
  if (
    cache &&
    cache.projects === projects &&
    cache.repoSignature === repoSignature &&
    cache.manualGroups === manualGroups
  ) {
    return cache.index;
  }
  const repoKeys = repoSignature.split("\n");
  const position = new Map(projects.map((project, index) => [project.id, index]));
  const index = deriveProjectGroups(
    projects,
    (project) => repoKeys[position.get(project.id) ?? -1] || null,
    { manualGroups },
  );
  cache = { projects, repoSignature, manualGroups, index };
  return index;
}

/** Logical projects over every per-host project row this client knows. */
export function useProjectGroupIndex(): ProjectGroupIndex {
  const projects = useAppStore((state) => state.projects);
  const repoSignature = useGitStore((state) => repoSignatureOf(projects, state.statuses));
  const manualGroups = useProjectGroupStore((state) => state.manualGroups);
  return indexFor(projects, repoSignature, manualGroups);
}

/** Non-reactive form for actions. */
export function getProjectGroupIndex(): ProjectGroupIndex {
  const projects = useAppStore.getState().projects;
  return indexFor(
    projects,
    repoSignatureOf(projects, useGitStore.getState().statuses),
    useProjectGroupStore.getState().manualGroups,
  );
}

/** The group holding `projectId`, if that project is known. */
export function useProjectGroup(projectId: string | undefined): ProjectGroup | undefined {
  const index = useProjectGroupIndex();
  return projectId ? index.groupByProjectId.get(projectId) : undefined;
}

/**
 * The environment to open when the user picks a logical project: the usable
 * member this client chose most recently, else the first usable one (in group
 * order: Local, WSL, paired machines). Undefined when no member is usable.
 */
export function pickGroupMember(
  members: readonly Project[],
  isUsable: (project: Project) => boolean,
  lastUsedAt: Readonly<Record<string, number>> = useProjectGroupStore.getState().lastUsedAt,
): Project | undefined {
  let best: Project | undefined;
  let bestAt = -1;
  for (const member of members) {
    if (!isUsable(member)) continue;
    const at = lastUsedAt[member.id] ?? -1;
    if (!best || at > bestAt) {
      best = member;
      bestAt = at;
    }
  }
  return best;
}
