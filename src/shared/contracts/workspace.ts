import { z } from "zod";
import { isHomeProjectId } from "../homeScope";

/**
 * A user-defined grouping of projects (e.g. "Work", "Side Hustle"). Exactly one
 * workspace is active at a time; the sidebar, schedules, and pull-request views
 * only surface projects belonging to it.
 *
 * Distinct from the account/stats "profile" (`./profile.ts`) and from Claude
 * auth profiles (`./agentInstance.ts`) — those describe *who* is running the
 * agent, a workspace describes *which projects* are in view.
 */
export const WORKSPACE_ICON_IDS = [
  "briefcase",
  "rocket",
  "palette",
  "code",
  "building",
  "graduation",
  "heart",
  "sprout",
  "globe",
  "lightbulb",
  "music",
  "gamepad",
] as const;

export const workspaceIconIdSchema = z.enum(WORKSPACE_ICON_IDS);
export type WorkspaceIconId = z.infer<typeof workspaceIconIdSchema>;

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  icon: WorkspaceIconId;
}

const workspaceInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  icon: workspaceIconIdSchema.optional(),
});

function firstAvailableWorkspaceIcon(used: ReadonlySet<WorkspaceIconId>): WorkspaceIconId {
  return WORKSPACE_ICON_IDS.find((icon) => !used.has(icon)) ?? WORKSPACE_ICON_IDS[0];
}

function normalizeWorkspaceIcons(
  workspaces: readonly z.input<typeof workspaceInputSchema>[],
): Workspace[] {
  const used = new Set<WorkspaceIconId>();
  return workspaces.map((workspace) => {
    const icon =
      workspace.icon && !used.has(workspace.icon)
        ? workspace.icon
        : firstAvailableWorkspaceIcon(used);
    used.add(icon);
    return { ...workspace, icon };
  });
}

export const workspaceSchema = workspaceInputSchema.transform(
  (workspace): Workspace => normalizeWorkspaceIcons([workspace])[0]!,
);

export const workspaceListSchema = z.array(workspaceInputSchema).transform(normalizeWorkspaceIcons);

/** Names seeded on first run; the first entry starts active and adopts every existing project. */
export const DEFAULT_WORKSPACE_NAMES = ["Work", "Side Hustle"] as const;
export const DEFAULT_WORKSPACE_ICONS = ["briefcase", "rocket"] as const satisfies readonly [
  WorkspaceIconId,
  WorkspaceIconId,
];

/** Pick a distinct identity for a newly-created workspace whenever the palette has room. */
export function nextWorkspaceIconId(workspaces: readonly Workspace[]): WorkspaceIconId {
  return firstAvailableWorkspaceIcon(new Set(workspaces.map((workspace) => workspace.icon)));
}

/**
 * The single membership rule every workspace-scoped surface goes through — the
 * sidebar, the schedules view, and the pull-request view must agree on what "in
 * this workspace" means, or a project's threads and its PRs disagree about
 * whether it exists.
 *
 * A project whose `workspaceId` is absent or points at a workspace that no
 * longer exists stays visible rather than vanishing — losing track of a project
 * is far worse than showing it in the wrong group, and the Workspaces settings
 * section lets the user file it deliberately. Home is synthetic and never filed,
 * so it belongs to every workspace by the same rule.
 */
export function isProjectInWorkspace(
  project: { id?: string; workspaceId?: string | undefined },
  activeWorkspaceId: string | null,
  knownWorkspaceIds: ReadonlySet<string>,
): boolean {
  if (isHomeProjectId(project.id)) return true;
  const assigned = project.workspaceId;
  if (!assigned || !knownWorkspaceIds.has(assigned)) return true;
  return assigned === activeWorkspaceId;
}
